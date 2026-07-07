import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { CRAFTABLE_ITEMS, ITEMS, facilitySlug } from './data/items'
import { FacilityPanel } from './components/FacilityPanel'
import {
  buildChain,
  computeCosts,
  isBought,
  leafLines,
  totalQuantities,
  type Order,
} from './lib/cost'
import { layoutPositions } from './lib/layout'
import { fmtCr, fmtPct, fmtQty } from './lib/fmt'
import { ItemNode, type ItemFlowNode } from './components/ItemNode'
import { NumberField } from './components/NumberField'
import { Palette } from './components/Palette'
import { SegClock } from './components/SegClock'
import { WelcomeGate, welcomeAcknowledged } from './components/WelcomeGate'
import { WorthModal } from './components/WorthModal'

const STORAGE_KEY = 'shc-state-v2'

interface AppState {
  orders: Order[]
  /** User price assumptions, by item id */
  prices: Record<string, number>
  /** Craftable items the user buys instead of crafts */
  buyList: string[]
  /** Target sale price per product id */
  targets: Record<string, number>
  /** Facility mode: flag chain steps whose facility isn't built */
  facilityMode: boolean
  /** Facility slugs the player has built */
  builtFacilities: string[]
}

const DEFAULT_STATE: AppState = {
  orders: [{ itemId: 'rifle', qty: 1 }],
  prices: {},
  buyList: ['fibers'],
  targets: {},
  facilityMode: false,
  builtFacilities: [],
}

/** Any known item can sit on the board: craftables expand, the rest are market-priced cards. */
function boardable(id: string): boolean {
  return !!ITEMS[id]
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<AppState>
    const orders = (parsed.orders ?? DEFAULT_STATE.orders).filter((o) => boardable(o.itemId))
    return { ...DEFAULT_STATE, ...parsed, orders }
  } catch {
    return DEFAULT_STATE
  }
}

const nodeTypes = { item: ItemNode }

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [worthId, setWorthId] = useState<string | null>(null)
  const [welcomed, setWelcomed] = useState(welcomeAcknowledged)
  const [gateGone, setGateGone] = useState(welcomed)
  const enterApp = () => {
    setWelcomed(true)
    // the gate fades for 650ms over the freshly mounted calculator
    setTimeout(() => setGateGone(true), 700)
  }
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const { orders, prices } = state
  const buySet = useMemo(() => new Set(state.buyList), [state.buyList])
  const rootIds = useMemo(() => orders.map((o) => o.itemId), [orders])
  const rootSet = useMemo(() => new Set(rootIds), [rootIds])

  const chain = useMemo(() => buildChain(rootIds, buySet), [rootIds, buySet])
  const salvageSet = useMemo(() => new Set(chain.salvageOnly), [chain])
  const costs = useMemo(
    () => computeCosts(rootIds, prices, buySet, salvageSet),
    [rootIds, prices, buySet, salvageSet],
  )
  const qtys = useMemo(() => totalQuantities(orders, buySet), [orders, buySet])
  /** Units of each item produced by recycling the pinned scrap orders */
  const yields = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of orders) {
      for (const y of ITEMS[o.itemId].salvage ?? []) {
        m.set(y.itemId, (m.get(y.itemId) ?? 0) + y.qty * o.qty)
      }
    }
    return m
  }, [orders])

  const totalCost = orders.reduce((sum, o) => sum + (costs.get(o.itemId) ?? 0) * o.qty, 0)
  const allTargets = orders.length > 0 && orders.every((o) => state.targets[o.itemId] !== undefined)
  const totalSale = allTargets
    ? orders.reduce((sum, o) => sum + state.targets[o.itemId] * o.qty, 0)
    : undefined
  const lines = useMemo(
    () => leafLines(chain, costs, qtys, totalCost, totalSale),
    [chain, costs, qtys, totalCost, totalSale],
  )

  // ---- Actions ----
  const setPrice = useCallback((id: string, value: number) => {
    setState((s) => ({ ...s, prices: { ...s.prices, [id]: value } }))
  }, [])

  const toggleBuy = useCallback((id: string) => {
    setState((s) => {
      if (s.buyList.includes(id)) return { ...s, buyList: s.buyList.filter((b) => b !== id) }
      // Prefill the buy price with the current crafted cost so the number
      // doesn't jump to an unrelated default.
      const crafted = computeCosts([id], s.prices, new Set(s.buyList)).get(id) ?? 0
      const prices = s.prices[id] !== undefined ? s.prices : { ...s.prices, [id]: Number(crafted.toFixed(1)) }
      return { ...s, prices, buyList: [...s.buyList, id] }
    })
  }, [])

  const addOrder = useCallback((id: string) => {
    if (!boardable(id)) return
    setState((s) => {
      const existing = s.orders.find((o) => o.itemId === id)
      const orders = existing
        ? s.orders.map((o) => (o.itemId === id ? { ...o, qty: o.qty + 1 } : o))
        : [...s.orders, { itemId: id, qty: 1 }]
      return { ...s, orders }
    })
  }, [])

  const removeOrder = useCallback((id: string) => {
    setState((s) => ({ ...s, orders: s.orders.filter((o) => o.itemId !== id) }))
  }, [])

  const decrementOrder = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      orders: s.orders
        .map((o) => (o.itemId === id ? { ...o, qty: o.qty - 1 } : o))
        .filter((o) => o.qty > 0),
    }))
  }, [])

  const setOrderQty = useCallback((id: string, qty: number) => {
    setState((s) => ({ ...s, orders: s.orders.map((o) => (o.itemId === id ? { ...o, qty } : o)) }))
  }, [])

  const builtSet = useMemo(() => new Set(state.builtFacilities), [state.builtFacilities])
  /** Facilities behind every crafted/salvaged step on the board, with the items they handle */
  const flowFacilities = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const id of chain.nodeIds) {
      const item = ITEMS[id]
      if (!item.facility) continue
      const isRoot = rootSet.has(id)
      const crafted =
        !!item.recipe && !salvageSet.has(id) && (isRoot || !isBought(item, buySet, rootSet))
      const salvaging = isRoot && !!item.salvage
      if (!crafted && !salvaging) continue
      map.set(item.facility, [...(map.get(item.facility) ?? []), item.name])
    }
    return [...map.entries()].map(([facility, items]) => ({ facility, items }))
  }, [chain, rootSet, buySet, salvageSet])

  const toggleBuilt = useCallback((slug: string) => {
    setState((s) => ({
      ...s,
      builtFacilities: s.builtFacilities.includes(slug)
        ? s.builtFacilities.filter((f) => f !== slug)
        : [...s.builtFacilities, slug],
    }))
  }, [])

  const setTarget = useCallback((id: string, value: string) => {
    setState((s) => {
      const targets = { ...s.targets }
      if (value === '') delete targets[id]
      else targets[id] = Math.max(0, Number(value) || 0)
      return { ...s, targets }
    })
  }, [])

  // ---- Build React Flow nodes/edges ----
  const built = useMemo(() => {
    const consumers = new Set(chain.edges.map((e) => e.source))
    const inputTargets = new Set(chain.edges.map((e) => e.target))
    const orderQtyById = new Map(orders.map((o) => [o.itemId, o.qty]))
    const yieldPerUnit = (id: string) =>
      (ITEMS[id].salvage ?? []).reduce((sum, y) => sum + y.qty * (costs.get(y.itemId) ?? 0), 0)
    const sized = chain.nodeIds.map((id) => {
      const isRoot = rootSet.has(id)
      const bought = isBought(ITEMS[id], buySet, rootSet) || salvageSet.has(id)
      return {
        id,
        width: isRoot ? 300 : 236,
        height: isRoot
          ? ITEMS[id].salvage
            ? 286 // scrap roots: buy-price row + recycle verdict
            : ITEMS[id].recipe
              ? 232
              : 254 + (ITEMS[id].notes ? 62 : 0) // market roots: buy-price row, plus usage notes
          : (bought && ITEMS[id].recipe ? 196 : bought ? 164 : 184) + (yields.has(id) ? 20 : 0),
      }
    })
    const pos = layoutPositions(sized, chain.edges)
    const nodes: ItemFlowNode[] = chain.nodeIds.map((id) => {
      const isRoot = rootSet.has(id)
      const bought = isBought(ITEMS[id], buySet, rootSet) || salvageSet.has(id)
      const item = ITEMS[id]
      const producing = (!!item.recipe && !bought) || (isRoot && !!item.salvage)
      const facilityMissing =
        state.facilityMode && producing && !!item.facility && !builtSet.has(facilitySlug(item.facility))
      return {
        id,
        type: 'item',
        position: pos.get(id)!,
        data: {
          itemId: id,
          isRoot,
          bought,
          hasRecipe: !!ITEMS[id].recipe && !isRoot,
          hasConsumers: consumers.has(id),
          hasInputs: inputTargets.has(id),
          marketForced: salvageSet.has(id),
          facilityMissing,
          totalQty: qtys.get(id) ?? 0,
          salvageYield: yields.get(id) ?? 0,
          unitCost: costs.get(id) ?? 0,
          orderQty: isRoot ? orderQtyById.get(id) : undefined,
          targetPrice: isRoot ? state.targets[id] : undefined,
          yieldPerUnit: isRoot && ITEMS[id].salvage ? yieldPerUnit(id) : undefined,
          onPrice: setPrice,
          onToggleBuy: toggleBuy,
          onOrderQty: setOrderQty,
          onRemove: removeOrder,
          onWorth: setWorthId,
        },
      }
    })
    const edges: Edge[] = chain.edges.map((e) => {
      const key = `${e.source}->${e.target}`
      const salvage = chain.salvageEdges.has(key)
      return {
        id: key,
        source: e.source,
        target: e.target,
        animated: !salvage && rootSet.has(e.target),
        label: salvage ? `+${fmtQty(e.qty)}×` : `${fmtQty(e.qty)}×`,
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        className: salvage ? 'salvage-edge' : 'chain-edge',
      }
    })
    return { nodes, edges }
  }, [chain, rootSet, buySet, salvageSet, orders, qtys, yields, costs, state.targets, state.facilityMode, builtSet, setPrice, toggleBuy, setOrderQty, removeOrder])

  // Preserve manual drag positions across data-only updates; relayout when
  // the chain structure changes. On relayout, surviving nodes glide to their
  // new positions (CSS transform transition) and the viewport pans smoothly.
  const structureKey = [...rootIds].sort().join(',') + '|' + [...state.buyList].sort().join(',')
  const prevStructure = useRef('')
  const rfInstance = useRef<ReactFlowInstance<ItemFlowNode, Edge> | null>(null)
  const [rfNodes, setRfNodes] = useState<ItemFlowNode[]>(built.nodes)
  useEffect(() => {
    const keepPositions = prevStructure.current === structureKey
    prevStructure.current = structureKey
    setRfNodes((prev) =>
      built.nodes.map((n) => {
        if (!keepPositions) return n
        const existing = prev.find((p) => p.id === n.id)
        return existing ? { ...n, position: existing.position } : n
      }),
    )
    if (!keepPositions) {
      // let the new nodes mount/measure, then ease the viewport over
      const t = setTimeout(
        () => rfInstance.current?.fitView({ padding: 0.15, maxZoom: 1, duration: 450 }),
        60,
      )
      return () => clearTimeout(t)
    }
  }, [built, structureKey])
  const onNodesChange = useCallback(
    (changes: NodeChange<ItemFlowNode>[]) => setRfNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  )

  const totalProfit = totalSale !== undefined ? totalSale - totalCost : undefined
  const multiplier = totalSale !== undefined && totalCost > 0 ? totalSale / totalCost : undefined

  const orderQtys = useMemo(() => new Map(orders.map((o) => [o.itemId, o.qty])), [orders])
  const boardIds = useMemo(() => new Set(chain.nodeIds), [chain])

  // Return on cost for every craftable at current price assumptions:
  // (trade value − crafted cost) / crafted cost. The catalogue's
  // value-for-money signal.
  const roiById = useMemo(() => {
    const ids = CRAFTABLE_ITEMS.map((i) => i.id)
    const all = computeCosts(ids, prices, buySet)
    const m = new Map<string, number>()
    for (const item of CRAFTABLE_ITEMS) {
      const cost = all.get(item.id) ?? 0
      if (cost > 0 && item.defaultPrice !== undefined) {
        m.set(item.id, (item.defaultPrice - cost) / cost)
      }
    }
    return m
  }, [prices, buySet])

  // First visit: the gate alone. Mounting the calculator beneath it burns
  // CPU behind an opaque overlay (React Flow's animated edges repaint every
  // frame). The calculator mounts the moment "board" is clicked so the
  // gate's exit fade reveals it — a crossfade, not a pop.
  return (
    <div className="app">
      {welcomed && (
        <>
      {hoverId && boardIds.has(hoverId) && (
        <style>{`.react-flow__node[data-id="${CSS.escape(hoverId)}"] .node{border-color:var(--teal);box-shadow:0 0 0 1px var(--teal),0 0 22px rgba(69,213,194,.35)}`}</style>
      )}
      <Palette
        onAdd={addOrder}
        onRemoveOne={decrementOrder}
        onHover={setHoverId}
        orderQtys={orderQtys}
        boardIds={boardIds}
        roiById={roiById}
      />

      <main
        className="canvas"
        onDragOver={(ev) => {
          if (ev.dataTransfer.types.includes('application/spacehaven-item')) {
            ev.preventDefault()
            ev.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={(ev) => {
          const id = ev.dataTransfer.getData('application/spacehaven-item')
          if (id) {
            ev.preventDefault()
            addOrder(id)
          }
        }}
      >
        {orders.length === 0 ? (
          <div className="empty-canvas">
            <div className="empty-title">No orders on the manifest</div>
            <p>Drag an item in from the catalogue to chart its production chain.</p>
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={built.edges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            onInit={(inst) => (rfInstance.current = inst)}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            minZoom={0.2}
            nodesConnectable={false}
            deleteKeyCode={null}
          >
            <Background variant={BackgroundVariant.Dots} gap={26} size={1.5} color="#1c2b46" />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
        <FacilityPanel
          mode={state.facilityMode}
          onMode={(on) => setState((s) => ({ ...s, facilityMode: on }))}
          flowNames={flowFacilities.map((f) => f.facility)}
          builtSet={builtSet}
          onToggleBuilt={toggleBuilt}
        />
      </main>

      <aside className="sidebar">
        <header className="brand">
          <img
            className="brand-bg"
            src={`${import.meta.env.BASE_URL}exodus-fleet.png`}
            alt=""
            draggable={false}
            aria-hidden
          />
          <div>
            <div className="brand-eyebrow">space haven</div>
            <h1 className="brand-title">Production Ledger</h1>
          </div>
          <SegClock />
        </header>

        <section className="panel">
          <div className="panel-eyebrow">orders · target sale prices</div>
          {orders.length === 0 && <p className="hint">The manifest is empty.</p>}
          {orders.map((o) => {
            const unit = costs.get(o.itemId) ?? 0
            const target = state.targets[o.itemId]
            const margin = target !== undefined ? target - unit : undefined
            return (
              <div key={o.itemId} className="order-row">
                <div className="order-head">
                  <span className="order-name">
                    {o.qty}× {ITEMS[o.itemId].name}
                  </span>
                  <span className="mono amber">{fmtCr(unit * o.qty)} cr</span>
                </div>
                <div className="order-target">
                  <label>sells @</label>
                  <NumberField
                    min={0}
                    step={1}
                    placeholder="cr / unit"
                    value={target ?? ''}
                    onChange={(v) => setTarget(o.itemId, v === null ? '' : String(v))}
                  />
                  {target === undefined && ITEMS[o.itemId].defaultPrice !== undefined && (
                    <button
                      className="use-default"
                      title="Use the game's trade value as the sale price"
                      onClick={() => setTarget(o.itemId, String(ITEMS[o.itemId].defaultPrice))}
                    >
                      @{fmtCr(ITEMS[o.itemId].defaultPrice!)}
                    </button>
                  )}
                  {margin !== undefined && (
                    <span className={`mono ${margin >= 0 ? 'good' : 'bad'}`}>
                      {margin >= 0 ? '+' : '−'}
                      {fmtCr(Math.abs(margin))}/u
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          <div className="totals-row">
            <span>total crafted cost</span>
            <span className="mono amber strong">{fmtCr(totalCost)} cr</span>
          </div>
          {totalSale !== undefined && (
            <div className="totals-row">
              <span>total sale value</span>
              <span className="mono strong">{fmtCr(totalSale)} cr</span>
            </div>
          )}
          {totalProfit !== undefined && (
            <div className={`verdict ${totalProfit >= 0 ? 'good' : 'bad'}`}>
              {totalProfit >= 0
                ? `Worth crafting — ${fmtCr(totalProfit)} cr margin (${totalSale! > 0 ? fmtPct(totalProfit / totalSale!) : '—'})`
                : `Not worth it — ${fmtCr(-totalProfit)} cr under water`}
            </div>
          )}
          {multiplier !== undefined && (
            <p className="hint">
              Break-even: you can pay up to <strong className="mono">{multiplier.toFixed(2)}×</strong> your
              assumed prices for all inputs before crafting stops paying.
            </p>
          )}
          {!allTargets && orders.length > 0 && (
            <p className="hint">Set a sale price on every order to unlock buy ceilings.</p>
          )}
        </section>

        <section className="panel grow">
          <div className="panel-eyebrow">shopping list · all orders</div>
          <table className="leaf-table">
            <thead>
              <tr>
                <th>input</th>
                <th className="num">qty</th>
                <th className="num">price</th>
                <th className="num">share</th>
                {totalSale !== undefined && <th className="num">max buy</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td className="num mono">{fmtQty(l.totalQty)}</td>
                  <td className="num mono amber">{fmtCr(l.price)}</td>
                  <td className="num mono dim">{fmtPct(l.share)}</td>
                  {totalSale !== undefined && (
                    <td className={`num mono ${l.ceiling! >= l.price ? 'good' : 'bad'}`}>
                      {l.ceiling! > 0 ? fmtCr(l.ceiling!) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {totalSale !== undefined && (
            <p className="hint">
              Max buy = highest unit price for that input — with every other price as assumed — before total
              crafted cost exceeds total sale value.
            </p>
          )}
        </section>

        <footer className="panel foot">
          <p className="hint">
            Default prices are the game's own trade values (wiki Trading data). In-game buy offers usually
            run 5–6× sell value, so edit any amber price to what traders actually quote you. Everything
            stays in your browser.
          </p>
          <button
            className="reset-btn"
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY)
              setState(DEFAULT_STATE)
            }}
          >
            Reset prices &amp; orders
          </button>
        </footer>
      </aside>

      {worthId && (
        <WorthModal materialId={worthId} prices={prices} buySet={buySet} onClose={() => setWorthId(null)} />
      )}
        </>
      )}
      {!gateGone && <WelcomeGate onEnter={enterApp} />}
    </div>
  )
}
