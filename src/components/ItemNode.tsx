import { useState } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { CATEGORY_META, ITEMS, iconUrl } from '../data/items'
import { fmtCr, fmtQty } from '../lib/fmt'
import { NumberField } from './NumberField'

/** Oversized corner icon, radially faded so card text stays readable. */
function Hero({ id }: { id: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div className="node-hero" aria-hidden>
      <img src={iconUrl(id)} alt="" draggable={false} onError={() => setFailed(true)} />
    </div>
  )
}

export interface ItemNodeData extends Record<string, unknown> {
  itemId: string
  isRoot: boolean
  /** Cost comes from a price, not a recipe */
  bought: boolean
  hasRecipe: boolean
  hasConsumers: boolean
  /** Node is the target of any edge (recipe inputs or salvage yields) */
  hasInputs: boolean
  /** Collapsed salvage yield — market priced, craft toggle hidden */
  marketForced: boolean
  /** Facility mode: this step's facility isn't built yet */
  facilityMissing: boolean
  /** Total demand across all orders */
  totalQty: number
  /** Units produced by recycling pinned scrap */
  salvageYield: number
  unitCost: number
  /** Roots only */
  orderQty?: number
  targetPrice?: number
  /** Scrap roots only: value of outputs from recycling 1 unit */
  yieldPerUnit?: number
  onPrice: (id: string, value: number) => void
  onToggleBuy: (id: string) => void
  onOrderQty: (id: string, qty: number) => void
  onRemove: (id: string) => void
  onWorth: (id: string) => void
}

export type ItemFlowNode = Node<ItemNodeData, 'item'>

export function ItemNode({ data }: NodeProps<ItemFlowNode>) {
  const item = ITEMS[data.itemId]
  const cat = CATEGORY_META[item.category]

  if (data.isRoot) {
    const qty = data.orderQty ?? 1
    const isMarket = !item.recipe
    const marketEyebrow: Record<string, string> = {
      raw: 'raw resource · mined or bought',
      grown: 'grown · harvested or bought',
      trade: 'trade good · not craftable',
      scrap: 'salvage · recycles at Recycler',
    }
    const profit = data.targetPrice !== undefined ? data.targetPrice - data.unitCost : undefined
    return (
      <div
        className={`node node-root${isMarket ? ' node-root-market' : ''}`}
        style={isMarket ? { borderColor: cat.color } : undefined}
      >
        <Hero id={item.id} />
        {!isMarket && <Handle type="target" position={Position.Left} className="handle" />}
        {data.hasConsumers && <Handle type="source" position={Position.Right} className="handle" />}
        <button className="node-remove nodrag" title="Remove order" onClick={() => data.onRemove(data.itemId)}>
          ✕
        </button>
        {isMarket && (
          <button
            className="node-worth nodrag"
            title="Material worth — best use across all products"
            onClick={() => data.onWorth(data.itemId)}
          >
            ⚖
          </button>
        )}
        <div
          className="node-eyebrow"
          style={data.facilityMissing ? { color: 'var(--rose)' } : isMarket ? { color: cat.color } : undefined}
        >
          {isMarket
            ? (marketEyebrow[item.category] ?? cat.label) + (data.facilityMissing ? ' — not built' : '')
            : `final product · ${item.facility}${data.facilityMissing ? ' — not built' : ''}`}
        </div>
        <div className="node-name node-name-lg">{item.name}</div>
        <div className="root-order-row">
          <label className="root-qty-label">order</label>
          <NumberField
            className="qty-input"
            min={1}
            step={1}
            value={qty}
            onChange={(v) => data.onOrderQty(data.itemId, Math.max(1, Math.round(v ?? 1)))}
          />
          <span className="root-qty-x mono">× {fmtCr(data.unitCost)} cr</span>
        </div>
        {isMarket && (
          <div className="root-order-row">
            <label className="root-qty-label">buy @</label>
            <NumberField
              min={0}
              step={1}
              value={Number(data.unitCost.toFixed(2))}
              onChange={(v) => data.onPrice(data.itemId, v ?? 0)}
            />
          </div>
        )}
        <div className="root-cost">
          <span className="root-cost-value">{fmtCr(data.unitCost * qty)}</span>
          <span className="root-cost-unit">cr total {isMarket ? 'buy' : 'crafted'} cost</span>
        </div>
        {item.defaultPrice !== undefined && (
          <div className="root-basis mono">
            base trade value {fmtCr(item.defaultPrice)} cr / unit
            {!isMarket && data.unitCost > 0 && (
              <span className={(item.defaultPrice - data.unitCost) / data.unitCost >= 0 ? ' good' : ' bad'}>
                {' '}
                · {item.defaultPrice >= data.unitCost ? '+' : ''}
                {Math.round(((item.defaultPrice - data.unitCost) / data.unitCost) * 100)}% on cost
              </span>
            )}
          </div>
        )}
        {isMarket && item.notes && <p className="root-notes">{item.notes}</p>}
        {data.yieldPerUnit !== undefined && (
          <div className={`root-verdict ${data.yieldPerUnit >= data.unitCost ? 'good' : 'bad'}`}>
            ♻ yields {fmtCr(data.yieldPerUnit)} cr/unit —{' '}
            {data.yieldPerUnit >= data.unitCost
              ? `recycle, +${fmtCr(data.yieldPerUnit - data.unitCost)} cr/unit`
              : `${fmtCr(data.unitCost - data.yieldPerUnit)} cr/unit under buy price`}
          </div>
        )}
        {profit !== undefined && (
          <div className={`root-verdict ${profit >= 0 ? 'good' : 'bad'}`}>
            {profit >= 0 ? '▲' : '▼'} {fmtCr(Math.abs(profit))} cr/unit {profit >= 0 ? 'margin' : 'loss'} vs{' '}
            {fmtCr(data.targetPrice!)} cr sale
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="node" style={{ borderLeftColor: cat.color }}>
      <Hero id={item.id} />
      {data.hasInputs && <Handle type="target" position={Position.Left} className="handle" />}
      {data.hasConsumers && <Handle type="source" position={Position.Right} className="handle" />}
      <button
        className="node-worth nodrag"
        title="Material worth — best use across all products"
        onClick={() => data.onWorth(data.itemId)}
      >
        ⚖
      </button>
      <div className="node-head">
        <span className="node-name">{item.name}</span>
      </div>
      <div className="node-meta" style={{ color: data.facilityMissing ? 'var(--rose)' : cat.color }}>
        {data.marketForced
          ? 'salvage yield · valued at market'
          : data.bought && item.recipe
            ? 'bought · priced at market'
            : !item.recipe
              ? cat.label
              : `${item.facility} · Ind ${item.industry}${data.facilityMissing ? ' — not built' : ''}`}
      </div>
      <div className="node-rows">
        {(data.totalQty > 0 || data.salvageYield === 0) && (
          <div className="node-row">
            <span>total need</span>
            <span className="mono">{fmtQty(data.totalQty)}</span>
          </div>
        )}
        {data.salvageYield > 0 && (
          <div className="node-row">
            <span>salvage yield</span>
            <span className="mono good">+{fmtQty(data.salvageYield)}</span>
          </div>
        )}
        {data.bought ? (
          <div className="node-row">
            <span>price</span>
            <NumberField
              min={0}
              step={1}
              value={Number(data.unitCost.toFixed(2))}
              onChange={(v) => data.onPrice(data.itemId, v ?? 0)}
            />
          </div>
        ) : (
          <div className="node-row">
            <span>unit cost</span>
            <span className="mono amber">{fmtCr(data.unitCost)} cr</span>
          </div>
        )}
        {item.defaultPrice !== undefined &&
          (data.bought ? (
            <div className="node-row">
              <span>base value</span>
              <button
                className="use-default nodrag"
                title="Reset price to the game's base trade value"
                onClick={() => data.onPrice(data.itemId, item.defaultPrice!)}
              >
                @{fmtCr(item.defaultPrice)}
              </button>
            </div>
          ) : (
            <div className="node-row">
              <span>base value</span>
              <span className="mono dim">{fmtCr(item.defaultPrice)} cr</span>
            </div>
          ))}
        {data.salvageYield > 0 && data.totalQty === 0 ? (
          <div className="node-row">
            <span>yield value</span>
            <span className="mono good strong">+{fmtCr(data.salvageYield * data.unitCost)} cr</span>
          </div>
        ) : (
          <div className="node-row">
            <span>line total</span>
            <span className="mono amber strong">{fmtCr(data.totalQty * data.unitCost)} cr</span>
          </div>
        )}
      </div>
      {data.hasRecipe && !data.marketForced && (
        <button className="toggle-buy nodrag" onClick={() => data.onToggleBuy(data.itemId)}>
          {data.bought ? '⟲ craft it instead' : '⇄ buy it instead'}
        </button>
      )}
    </div>
  )
}
