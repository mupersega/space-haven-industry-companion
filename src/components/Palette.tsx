import { useMemo, useState } from 'react'
import { CATEGORY_META, PALETTE_ITEMS, type Category } from '../data/items'
import { fmtCr } from '../lib/fmt'
import { ItemIcon } from './ItemIcon'

const GROUP_ORDER: Category[] = ['product', 'component', 'refined', 'grown', 'food', 'raw', 'scrap', 'corpse', 'trade']

interface PaletteProps {
  onAdd: (id: string) => void
  /** Right-click: drop the ordered quantity by one */
  onRemoveOne: (id: string) => void
  onHover: (id: string | null) => void
  /** Ordered quantity per item id */
  orderQtys: ReadonlyMap<string, number>
  /** Every item currently visible on the board (roots and intermediates) */
  boardIds: ReadonlySet<string>
  /** Return on cost per craftable: (trade value − crafted cost) / crafted cost */
  roiById: ReadonlyMap<string, number>
}

export function Palette({ onAdd, onRemoveOne, onHover, orderQtys, boardIds, roiById }: PaletteProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GROUP_ORDER.map((cat) => ({
      cat,
      items: PALETTE_ITEMS.filter(
        (i) => i.category === cat && (q === '' || i.name.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.items.length > 0)
  }, [query])

  return (
    <aside className="palette">
      <div className="panel-eyebrow">catalogue</div>
      <input
        className="palette-search"
        type="search"
        placeholder="Search items…"
        value={query}
        onChange={(ev) => setQuery(ev.target.value)}
      />
      <div className="palette-list">
        {groups.map((g) => (
          <div key={g.cat} className="palette-group">
            <div className="palette-group-label" style={{ color: CATEGORY_META[g.cat].color }}>
              {CATEGORY_META[g.cat].label}
            </div>
            {g.items.map((item) => {
              const ordered = orderQtys.get(item.id) ?? 0
              const roi = item.category === 'product' ? roiById.get(item.id) : undefined
              return (
                <div
                  key={item.id}
                  data-item={item.id}
                  className={`palette-item${boardIds.has(item.id) ? ' on-board' : ''}`}
                  draggable
                  data-tip={
                    (roi !== undefined
                      ? `Sells ${fmtCr(item.defaultPrice ?? 0)} cr · ${roi >= 0 ? '+' : ''}${Math.round(roi * 100)}% on crafting cost. `
                      : '') + 'Click / drag adds one · right-click removes one'
                  }
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData('application/spacehaven-item', item.id)
                    ev.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => onAdd(item.id)}
                  onContextMenu={(ev) => {
                    ev.preventDefault()
                    onRemoveOne(item.id)
                  }}
                  onMouseEnter={() => onHover(item.id)}
                  onMouseLeave={() => onHover(null)}
                >
                  <ItemIcon id={item.id} size={18} />
                  <span className="palette-name">{item.name}</span>
                  {ordered > 0 ? (
                    <button
                      type="button"
                      className="qty-badge"
                      data-tip="Remove one"
                      aria-label={`Remove one ${item.name}`}
                      onClick={(ev) => {
                        // the badge decrements; the row's own click still adds.
                        // stop here so a badge tap doesn't also bubble to add one.
                        ev.stopPropagation()
                        onRemoveOne(item.id)
                      }}
                    >
                      ×{ordered}
                    </button>
                  ) : (
                    <span className="palette-price mono">{fmtCr(item.defaultPrice ?? 0)}</span>
                  )}
                  {roi !== undefined && (
                    <span className={`palette-roi mono ${roi >= 0 ? 'good' : 'bad'}`}>
                      {roi >= 0 ? '+' : ''}
                      {Math.round(roi * 100)}%
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        {groups.length === 0 && <p className="hint">Nothing matches “{query}”.</p>}
      </div>
      <p className="hint palette-hint">Click or drag in to add one · right-click to remove one.</p>
    </aside>
  )
}
