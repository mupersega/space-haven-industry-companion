import { CRAFTABLE_ITEMS } from '../data/items'
import { computeCosts, totalQuantities, type PriceMap } from './cost'

export interface WorthLine {
  productId: string
  /** Units of the material consumed per 1 unit of the product */
  qtyPerUnit: number
  /**
   * Imputed best-use value of 1 unit of the material through this product:
   * current unit cost + (product trade value − product crafted cost) / qty.
   * Equivalent to the max-buy ceiling — the price at which crafting this
   * product stops beating its trade value.
   */
  imputed: number
  productPrice: number
  productCost: number
}

export interface MaterialWorth {
  unitCost: number
  lines: WorthLine[]
}

/**
 * What is 1 unit of `materialId` really worth? Ranked imputed value across
 * every craftable that consumes it (directly or deep in its chain), under
 * the current price assumptions and buy/craft choices.
 */
export function materialWorth(
  materialId: string,
  prices: PriceMap,
  buySet: ReadonlySet<string>,
): MaterialWorth {
  const unitCost = computeCosts([materialId], prices, buySet).get(materialId) ?? 0
  const lines: WorthLine[] = []
  for (const product of CRAFTABLE_ITEMS) {
    if (product.id === materialId || product.defaultPrice === undefined) continue
    const qty = totalQuantities([{ itemId: product.id, qty: 1 }], buySet).get(materialId) ?? 0
    if (qty <= 0) continue
    const cost = computeCosts([product.id], prices, buySet).get(product.id) ?? 0
    lines.push({
      productId: product.id,
      qtyPerUnit: qty,
      imputed: unitCost + (product.defaultPrice - cost) / qty,
      productPrice: product.defaultPrice,
      productCost: cost,
    })
  }
  lines.sort((a, b) => b.imputed - a.imputed)
  return { unitCost, lines }
}
