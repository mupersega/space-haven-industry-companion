import { useEffect, useRef, useState } from 'react'
import { FACILITIES, facilitySlug, facilityUrl } from '../data/items'

function FactoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 21V9.5l5 3.2V9.5l5 3.2V9.5l5 3.2V4h1.5a.5.5 0 0 1 .5.5V21H3zm3-2h2.5v-3H6v3zm5 0h2.5v-3H11v3zm5 0h2.5v-3H16v3z" />
    </svg>
  )
}

function HammerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.2 2.6c2.1-.9 4.6-.4 6.3 1.3l2.9 2.9-1.6 1.6-.8-.2-1 1L21.4 11l-2.1 2.1-2.4-2.4-1-1-.7.7-11 11-2.6-2.6 11-11 .7-.7-1.3-1.3 1.2-3.2z" />
    </svg>
  )
}

export function FacilityImage({ name }: { name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    const initials = name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    return <span className="fac-tile-initials">{initials}</span>
  }
  return <img src={facilityUrl(name)} alt="" draggable={false} onError={() => setFailed(true)} />
}

interface FacilityPanelProps {
  mode: boolean
  onMode: (on: boolean) => void
  /** Facility names referenced by the current board's crafted steps */
  flowNames: string[]
  builtSet: ReadonlySet<string>
  onToggleBuilt: (slug: string) => void
}

/**
 * Bottom-right of the canvas. Edit mode: every facility, click to toggle
 * built. Otherwise: just the facilities the current board relies on —
 * image only, red backing when not built, name on hover.
 */
const STAGGER = 40
const TILE_ANIM = 220

export function FacilityPanel({ mode, onMode, flowNames, builtSet, onToggleBuilt }: FacilityPanelProps) {
  /** which set is on screen right now (lags the hammer while waving out) */
  const [shownEditing, setShownEditing] = useState(false)
  /** tiles waving out (edit swap or close) */
  const [leaving, setLeaving] = useState(false)
  /** strip open (lags mode on close so the exit wave can play) */
  const [shown, setShown] = useState(mode)
  const timer = useRef<number | null>(null)

  const names = shownEditing ? FACILITIES : flowNames
  const waveOutMs = names.length * STAGGER + TILE_ANIM
  /** facilities the current board actually relies on (for edit-mode emphasis) */
  const relevant = new Set(flowNames.map(facilitySlug))

  // State machine across mode / edit / board:
  // - open (mode on):   cancel any in-flight close, always land in flow view
  // - close (mode off): wave current set out (flow OR edit), then collapse;
  //                     edit state resets so the next open starts clean
  // - reopen mid-close: timer cancelled, tiles re-run their entrance
  // - empty board:      flow set is empty — strip is just controls; edit
  //                     still works (wave-out of nothing is instant-ish)
  useEffect(() => {
    if (mode) {
      if (timer.current) clearTimeout(timer.current)
      setLeaving(false)
      setShownEditing(false) // fresh open always starts in flow view
      setShown(true)
      return
    }
    if (!shown) return
    // wave the tiles out, then slide the strip down
    setLeaving(true)
    timer.current = window.setTimeout(() => {
      setLeaving(false)
      setShown(false)
      setShownEditing(false)
    }, waveOutMs)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const swapEditing = () => {
    if (leaving) return
    // wave the current set out, then swap and wave the new set in
    setLeaving(true)
    timer.current = window.setTimeout(() => {
      setShownEditing((e) => !e)
      setLeaving(false)
    }, waveOutMs)
  }

  return (
    <div className={`facility-panel${mode ? '' : ' off'}`}>
      <div className={`fac-reveal${shown && (mode || leaving) ? ' open' : ''}${shownEditing ? ' edit-bg' : ''}`}>
        <div className="fac-reveal-inner">
          <div className="fac-strip">
            {names.map((name, i) => {
              const slug = facilitySlug(name)
              const built = builtSet.has(slug)
              const inChain = relevant.has(slug)
              return (
                <button
                  key={`${shown}-${shownEditing}-${slug}`}
                  className={`fac-tilebtn${built ? '' : ' need'}${shownEditing ? ` editing ${inChain ? 'relevant' : 'irrelevant'}` : ''}${leaving ? ' leaving' : ''}`}
                  style={{
                    animationDelay: leaving
                      ? `${(names.length - 1 - i) * STAGGER}ms`
                      : `${i * STAGGER}ms`,
                  }}
                  title={shownEditing ? undefined : `${name} — ${built ? 'built' : 'not built'}`}
                  disabled={!shownEditing || leaving}
                  onClick={shownEditing ? () => onToggleBuilt(slug) : undefined}
                >
                  {shownEditing && (
                    <span className="fac-label">
                      {inChain && <span className="fac-tag">in chain</span>}
                      {name}
                    </span>
                  )}
                  <FacilityImage name={name} />
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="fac-controls">
        <button
          className={`fac-iconbtn fac-factory${mode ? ' active-good' : ' inactive'}`}
          title={mode ? 'Facility mode on — click to turn off' : 'Facility mode off — click to turn on'}
          onClick={() => onMode(!mode)}
        >
          <FactoryIcon />
        </button>
        <button
          className={`fac-iconbtn fac-hammer${shownEditing ? ' active-edit' : ''}`}
          title={shownEditing ? 'Done editing' : 'Edit built facilities'}
          disabled={!mode || leaving}
          onClick={swapEditing}
        >
          <HammerIcon />
        </button>
      </div>
    </div>
  )
}
