import { useEffect, useMemo } from 'react'
import { CATEGORY_META, ITEMS } from '../data/items'
import { materialWorth } from '../lib/worth'
import type { PriceMap } from '../lib/cost'
import { fmtCr, fmtQty } from '../lib/fmt'
import { ItemIcon } from './ItemIcon'

interface WorthModalProps {
  materialId: string
  prices: PriceMap
  buySet: ReadonlySet<string>
  onClose: () => void
}

export function WorthModal({ materialId, prices, buySet, onClose }: WorthModalProps) {
  const { unitCost, lines } = useMemo(
    () => materialWorth(materialId, prices, buySet),
    [materialId, prices, buySet],
  )
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const item = ITEMS[materialId]
  const cat = CATEGORY_META[item.category]

  return (
    <div className="worth-overlay" onClick={onClose}>
      <div className="worth-modal" role="dialog" aria-label={`Material worth: ${item.name}`} onClick={(ev) => ev.stopPropagation()}>
        <button className="node-remove nodrag" data-tip="Close" onClick={onClose}>
          ✕
        </button>
        <div className="panel-eyebrow" style={{ color: cat.color }}>
          material worth · best use
        </div>
        <div className="worth-head">
          <ItemIcon id={materialId} size={28} />
          <span className="worth-name">{item.name}</span>
          <span className="mono amber">{fmtCr(unitCost)} cr/unit now</span>
        </div>
        {lines.length === 0 ? (
          <p className="hint">
            {item.notes ??
              'No production chain consumes this item, so its worth is simply whatever traders will pay for it.'}
          </p>
        ) : (
          <>
            <p className="hint">
              Imputed value of 1 unit through each product it feeds: sell the product at trade value, hold
              every other price at your current assumptions, and the leftover value lands on this material.
            </p>
            <table className="leaf-table worth-table">
              <thead>
                <tr>
                  <th></th>
                  <th>through</th>
                  <th className="num">uses /unit</th>
                  <th className="num">worth /unit</th>
                  <th className="num">vs now</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.productId} className={i === 0 ? 'best' : undefined}>
                    <td className="dim mono">{i + 1}</td>
                    <td>
                      {ITEMS[l.productId].name}
                      {i === 0 && <span className="best-tag">best use</span>}
                    </td>
                    <td className="num mono">{fmtQty(l.qtyPerUnit)}</td>
                    <td className="num mono amber strong">{fmtCr(l.imputed)}</td>
                    <td className="num mono dim">{unitCost > 0 ? `×${(l.imputed / unitCost).toFixed(1)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              These are ceilings, not offers. They ignore crafting time, crew labor and how much traders
              will actually buy. A worth far above the market price means the material is the cheap part of
              the chain, not that you should pay that much.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
