/** Quantities: trim to at most 3 decimals (0.7, 0.14, 0.066, 2) */
export function fmtQty(n: number): string {
  return Number(n.toFixed(3)).toString()
}

/** Credits: thousands separators, at most 1 decimal */
export function fmtCr(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

export function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`
}
