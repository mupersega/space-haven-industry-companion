import { useEffect, useState } from 'react'

/** A thruster/engine glow authored onto a ship sprite. Coordinates are
 * fractions of the unflipped sprite box; size is a fraction of ship width. */
export interface ThrusterGlow {
  x: number
  y: number
  color: string
  size: number
  /** round/jet are overlaid glows; boost saturates the sprite's own pixels
   * matching the chosen hue within the region — "make the green more green" */
  shape: 'round' | 'jet' | 'boost'
  layer: 'below' | 'above'
  /** exhaust vector in degrees — 0 points right, 90 points down */
  angle: number
  /** base opacity 0..1 — the flicker animation multiplies onto this */
  opacity: number
  /** how the glow composites over what's beneath it — additive modes let
   * hull detail read through instead of being painted over */
  blend: 'normal' | 'screen' | 'add' | 'dodge'
}

export const BLEND_CSS: Record<ThrusterGlow['blend'], string> = {
  normal: 'normal',
  screen: 'screen',
  add: 'plus-lighter',
  dodge: 'color-dodge',
}
export type GlowMap = Record<string, ThrusterGlow[]>

export const SHIP_SRCS = ['ship-colony', 'ship-hf1', 'ship-hf2', 'ship-fs2', 'ship-fs3']
const SWATCHES = ['#14e8cf', '#66ff21', '#ffa514', '#ff7a14', '#2979ff', '#ff3d55', '#f5f9ff']
const BASE = import.meta.env.BASE_URL

function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1c.4 2.2-.6 3.4-1.7 4.6C5.2 6.8 4 8.1 4 10a4 4 0 0 0 8 0c0-1.3-.5-2.3-1.1-3.2-.3.7-.7 1.2-1.3 1.6.2-2.4-.5-5.2-1.6-7.4ZM8 13.4A2.4 2.4 0 0 1 5.6 11c0-1 .5-1.7 1.2-2.4.5.9 1.4 1.1 2.2.7.6.5 1.4 1 1.4 1.7A2.4 2.4 0 0 1 8 13.4Z" />
    </svg>
  )
}

interface GlowEditorProps {
  glows: GlowMap
  onChange: (next: GlowMap) => void
}

const TYPES = ['jet', 'round', 'boost'] as const

/** Landing-page glow author: pick a ship asset, click to mark thruster and
 * light glows, choose color / shape / layer, copy the JSON out. Marks
 * appear on the scene's ships live. Click a mark to remove it; hold Ctrl to
 * stack a new effect on top of existing marks. The left rail filters which
 * mark types are visible (and clickable) in the preview. */
export function GlowEditor({ glows, onChange }: GlowEditorProps) {
  const [open, setOpen] = useState(false)
  const [ship, setShip] = useState(SHIP_SRCS[0])
  const [color, setColor] = useState('#14e8cf')
  const [size, setSize] = useState(0.05)
  const [shape, setShape] = useState<ThrusterGlow['shape']>('jet')
  const [layer, setLayer] = useState<'below' | 'above'>('below')
  const [angle, setAngle] = useState(0)
  const [opacity, setOpacity] = useState(0.9)
  const [blend, setBlend] = useState<ThrusterGlow['blend']>('screen')
  const [copied, setCopied] = useState(false)
  const [visible, setVisible] = useState<Record<(typeof TYPES)[number], boolean>>({
    jet: true,
    round: true,
    boost: true,
  })
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const marks = glows[ship] ?? []
  const allVisible = TYPES.every((t) => visible[t])

  // Ctrl bypasses the marks so effects can stack on the same spot
  useEffect(() => {
    if (!open) return
    const down = (ev: KeyboardEvent) => ev.key === 'Control' && setCtrlHeld(true)
    const up = (ev: KeyboardEvent) => ev.key === 'Control' && setCtrlHeld(false)
    const blur = () => setCtrlHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [open])

  const addMark = (ev: React.MouseEvent<HTMLDivElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect()
    const x = (ev.clientX - rect.left) / rect.width
    const y = (ev.clientY - rect.top) / rect.height
    onChange({ ...glows, [ship]: [...marks, { x, y, color, size, shape, layer, angle, opacity, blend }] })
  }
  const removeMark = (i: number) => {
    onChange({ ...glows, [ship]: marks.filter((_, k) => k !== i) })
  }

  return (
    <div className="glow-editor">
      <button className="tuner-toggle" title="Author ship glows" onClick={() => setOpen((o) => !o)}>
        <FlameIcon />
      </button>
      {open && (
        <div className="tuner-panel glow-panel">
          <div className="panel-eyebrow">glow author</div>
          <div className="tuner-worlds glow-ships">
            {SHIP_SRCS.map((s) => (
              <button
                key={s}
                className={`pal-chip${ship === s ? ' sel' : ''}`}
                onClick={() => setShip(s)}
              >
                {s.replace('ship-', '')}
              </button>
            ))}
          </div>
          <div className="glow-body">
            <div className="glow-side">
              <button
                className={`pal-chip${allVisible ? ' sel' : ''}`}
                title="show every mark type"
                onClick={() => setVisible({ jet: true, round: true, boost: true })}
              >
                all
              </button>
              {TYPES.map((t) => (
                <button
                  key={t}
                  className={`pal-chip${visible[t] ? ' sel' : ''}`}
                  title={`toggle ${t} marks in the preview`}
                  onClick={() => setVisible({ ...visible, [t]: !visible[t] })}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="glow-main">
              <div className={`glow-canvas${ctrlHeld ? ' stacking' : ''}`} onClick={addMark}>
                <img src={`${BASE}scene/${ship}.png`} alt="" draggable={false} />
                {marks.map((m, i) =>
                  !visible[m.shape] ? null : m.shape === 'boost' ? (
                    // boost regions preview as a dashed ring; the effect
                    // itself shows live on the scene's ship
                    <span
                      key={`g${i}`}
                      className="glow-region"
                      style={{
                        left: `${m.x * 100}%`,
                        top: `${m.y * 100}%`,
                        width: `${m.size * 2 * 100}%`,
                        color: m.color,
                      }}
                    />
                  ) : (
                    <span
                      key={`g${i}`}
                      className={`wg-glow ${m.shape}`}
                      style={
                        {
                          left: `${m.x * 100}%`,
                          top: `${m.y * 100}%`,
                          width: `${m.size * 100 * (m.shape === 'jet' ? 2.2 : 1)}%`,
                          zIndex: m.layer === 'below' ? 0 : 2,
                          animationDelay: `${-((i * 0.53) % 1.7).toFixed(2)}s`,
                          mixBlendMode: BLEND_CSS[m.blend ?? 'normal'] as React.CSSProperties['mixBlendMode'],
                          '--glow': m.color,
                          '--ang': `${m.angle ?? 0}deg`,
                          '--gop': m.opacity ?? 1,
                        } as React.CSSProperties
                      }
                    />
                  ),
                )}
                {marks.map((m, i) =>
                  !visible[m.shape] ? null : (
                    <button
                      key={i}
                      className="glow-mark"
                      title={`${m.shape} · ${m.layer} · ${m.angle ?? 0}° — click to remove, Ctrl+click to stack`}
                      style={
                        {
                          left: `${m.x * 100}%`,
                          top: `${m.y * 100}%`,
                          color: m.color,
                          background: m.color,
                          '--ang': `${m.angle ?? 0}deg`,
                        } as React.CSSProperties
                      }
                      onClick={(ev) => {
                        ev.stopPropagation()
                        removeMark(i)
                      }}
                    />
                  ),
                )}
              </div>
          <div className="glow-row">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`glow-swatch${color === c ? ' sel' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
            <input
              type="color"
              className="glow-pick"
              value={color}
              onChange={(ev) => setColor(ev.target.value)}
              title="custom color"
            />
          </div>
          <div className="glow-row">
            {(['jet', 'round', 'boost'] as const).map((s) => (
              <button key={s} className={`pal-chip${shape === s ? ' sel' : ''}`} onClick={() => setShape(s)}>
                {s}
              </button>
            ))}
            {(['below', 'above'] as const).map((l) => (
              <button key={l} className={`pal-chip${layer === l ? ' sel' : ''}`} onClick={() => setLayer(l)}>
                {l}
              </button>
            ))}
          </div>
          <div className="glow-row">
            {(['normal', 'screen', 'add', 'dodge'] as const).map((b) => (
              <button key={b} className={`pal-chip${blend === b ? ' sel' : ''}`} onClick={() => setBlend(b)}>
                {b}
              </button>
            ))}
          </div>
          <label className="tuner-row">
            <span className="tuner-label">size</span>
            <input
              type="range"
              min={0.015}
              max={0.2}
              step={0.005}
              value={size}
              onChange={(ev) => setSize(Number(ev.target.value))}
            />
            <span className="tuner-value mono">{size.toFixed(3)}</span>
          </label>
          <label className="tuner-row">
            <span className="tuner-label">angle</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              value={angle}
              onChange={(ev) => setAngle(Number(ev.target.value))}
            />
            <span className="tuner-value mono">{angle}°</span>
          </label>
          <label className="tuner-row">
            <span className="tuner-label">opacity</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(ev) => setOpacity(Number(ev.target.value))}
            />
            <span className="tuner-value mono">{opacity.toFixed(2)}</span>
          </label>
          <div className="tuner-actions">
            <button
              className="use-default"
              onClick={() => {
                void navigator.clipboard.writeText(JSON.stringify(glows, null, 2)).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
              }}
            >
              {copied ? 'copied' : 'copy values'}
            </button>
            <button className="use-default" onClick={() => onChange({ ...glows, [ship]: [] })}>
              clear ship
            </button>
          </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
