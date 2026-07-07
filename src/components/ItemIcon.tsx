import { useState } from 'react'
import { CATEGORY_META, ITEMS, iconUrl } from '../data/items'

/** Game item icon with a category-colored dot as fallback while icons are missing. */
export function ItemIcon({ id, size = 20 }: { id: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    const color = CATEGORY_META[ITEMS[id].category].color
    return <span className="palette-dot" style={{ background: color, width: 7, height: 7 }} />
  }
  return (
    <img
      className="item-icon"
      src={iconUrl(id)}
      width={size}
      height={size}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
