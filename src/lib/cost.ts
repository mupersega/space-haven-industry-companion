import { ITEMS, type ItemDef } from '../data/items'

export interface ChainEdge {
  source: string
  target: string
  qty: number
}

export interface Chain {
  rootIds: string[]
  nodeIds: string[]
  edges: ChainEdge[]
  /** Visible leaves: nodes whose cost comes from a price, not a recipe */
  leafIds: string[]
  /** Nodes present only as salvage yields — valued at market, never expanded */
  salvageOnly: string[]
  /** Edge keys (source->target) that are salvage yields, not consumption */
  salvageEdges: Set<string>
}

/** An order: craft `qty` units of `itemId` */
export interface Order {
  itemId: string
  qty: number
}

/**
 * A node is "bought" (priced directly) if it has no recipe, or the user chose
 * to buy it. Ordered products are always crafted — that is the point of the
 * exercise — so roots override the buy list.
 */
export function isBought(
  item: ItemDef,
  buySet: ReadonlySet<string>,
  rootSet: ReadonlySet<string>,
): boolean {
  if (rootSet.has(item.id)) return false
  return !item.recipe || buySet.has(item.id)
}

/**
 * Expand the production chains of all ordered products into one DAG.
 * Shared inputs (e.g. Base Metals feeding both Steel Plates and
 * Electronics, or two orders sharing Plastics) merge into one node.
 * Bought nodes are not expanded.
 */
export function buildChain(rootIds: string[], buySet: ReadonlySet<string>): Chain {
  const rootSet = new Set(rootIds)
  const nodeIds = new Set<string>()
  const edges: ChainEdge[] = []

  const visit = (id: string) => {
    if (nodeIds.has(id)) return
    nodeIds.add(id)
    const item = ITEMS[id]
    if (!item?.recipe) return
    if (isBought(item, buySet, rootSet)) return
    for (const ing of item.recipe) {
      edges.push({ source: ing.itemId, target: id, qty: ing.qty })
      visit(ing.itemId)
    }
  }
  rootIds.forEach(visit)

  // Salvage yields fan out of pinned scrap roots. Outputs that no other
  // chain needs stay collapsed at their market price; craft chains were
  // walked first, so shared nodes keep their crafted expansion.
  const salvageOnly = new Set<string>()
  const salvageEdges = new Set<string>()
  for (const rootId of rootIds) {
    const item = ITEMS[rootId]
    if (!item?.salvage) continue
    for (const out of item.salvage) {
      edges.push({ source: rootId, target: out.itemId, qty: out.qty })
      salvageEdges.add(`${rootId}->${out.itemId}`)
      if (!nodeIds.has(out.itemId)) {
        nodeIds.add(out.itemId)
        salvageOnly.add(out.itemId)
      }
    }
  }

  const leafIds = [...nodeIds].filter(
    (id) => isBought(ITEMS[id], buySet, rootSet) && !salvageOnly.has(id),
  )
  return { rootIds, nodeIds: [...nodeIds], edges, leafIds, salvageOnly: [...salvageOnly], salvageEdges }
}

export type PriceMap = Readonly<Record<string, number>>

export function priceOf(id: string, prices: PriceMap): number {
  return prices[id] ?? ITEMS[id]?.defaultPrice ?? 0
}

/**
 * Unit cost of every node in the chain. Bought nodes cost their price;
 * crafted nodes cost the sum of their inputs.
 */
export function computeCosts(
  rootIds: string[],
  prices: PriceMap,
  buySet: ReadonlySet<string>,
  /** Nodes forced to market price (collapsed salvage yields) */
  marketSet: ReadonlySet<string> = new Set(),
): Map<string, number> {
  const rootSet = new Set(rootIds)
  const memo = new Map<string, number>()
  const cost = (id: string): number => {
    const hit = memo.get(id)
    if (hit !== undefined) return hit
    const item = ITEMS[id]
    let v: number
    if (!item?.recipe || marketSet.has(id) || isBought(item, buySet, rootSet)) {
      v = priceOf(id, prices)
    } else {
      v = item.recipe.reduce((sum, ing) => sum + ing.qty * cost(ing.itemId), 0)
    }
    memo.set(id, v)
    return v
  }
  rootIds.forEach(cost)
  // salvage outputs may not be reachable via root costing — cost them too
  for (const id of marketSet) cost(id)
  return memo
}

/**
 * Total quantity of each chain node consumed across all orders,
 * accumulated over every path in the DAG. Ordered products themselves
 * count their ordered quantity (plus any demand from other chains that
 * consume them).
 */
export function totalQuantities(
  orders: Order[],
  buySet: ReadonlySet<string>,
): Map<string, number> {
  const rootSet = new Set(orders.map((o) => o.itemId))
  const qty = new Map<string, number>()
  const walk = (id: string, mult: number) => {
    qty.set(id, (qty.get(id) ?? 0) + mult)
    const item = ITEMS[id]
    if (!item?.recipe) return
    if (isBought(item, buySet, rootSet)) return
    for (const ing of item.recipe) walk(ing.itemId, mult * ing.qty)
  }
  for (const o of orders) walk(o.itemId, o.qty)
  return qty
}

export interface LeafLine {
  id: string
  name: string
  totalQty: number
  price: number
  lineCost: number
  /** Share of the total crafted cost, 0..1 (0 when cost is 0) */
  share: number
  /**
   * Max unit price for this input — holding every other price fixed —
   * before total crafted cost exceeds total sale value. Only when all
   * ordered products have target prices.
   */
  ceiling?: number
}

export function leafLines(
  chain: Chain,
  costs: Map<string, number>,
  qtys: Map<string, number>,
  totalCost: number,
  totalSale?: number,
): LeafLine[] {
  return chain.leafIds
    .map((id) => {
      const price = costs.get(id) ?? 0
      const totalQty = qtys.get(id) ?? 0
      const lineCost = price * totalQty
      const line: LeafLine = {
        id,
        name: ITEMS[id].name,
        totalQty,
        price,
        lineCost,
        share: totalCost > 0 ? lineCost / totalCost : 0,
      }
      if (totalSale !== undefined && totalQty > 0) {
        line.ceiling = price + (totalSale - totalCost) / totalQty
      }
      return line
    })
    .sort((a, b) => b.lineCost - a.lineCost)
}
