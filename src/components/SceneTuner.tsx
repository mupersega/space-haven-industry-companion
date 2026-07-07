import { useState } from 'react'
import { DEFAULT_SCENE, PALETTES, type SceneParams } from './SpaceBackdrop'

function SlidersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M1 4h8v1.5H1zM12.5 4H15v1.5h-2.5zM9.5 2.5h3v4.5h-3zM1 10.5h2.5V12H1zM6.5 10.5H15V12H6.5zM3.5 9h3v4.5h-3z" />
    </svg>
  )
}

interface Row {
  key: keyof SceneParams
  label: string
  min: number
  max: number
  step: number
}

const ROWS: Row[] = [
  { key: 'planetX', label: 'planet x', min: 0, max: 1.2, step: 0.01 },
  { key: 'planetY', label: 'planet y', min: 0, max: 1.4, step: 0.01 },
  { key: 'planetR', label: 'planet size', min: 0.1, max: 1.2, step: 0.01 },
  { key: 'crescent', label: 'crescent', min: 0, max: 2, step: 0.05 },
  { key: 'dark', label: 'dark side', min: 0, max: 1.2, step: 0.05 },
  { key: 'terrain', label: 'terrain contrast', min: 0, max: 2, step: 0.05 },
  { key: 'terrainScale', label: 'terrain scale', min: 0.3, max: 2.5, step: 0.05 },
  { key: 'clouds', label: 'cloud cover', min: 0, max: 16, step: 0.1 },
  { key: 'cloudSize', label: 'cloud size', min: 0.3, max: 2.5, step: 0.05 },
  { key: 'cloudAlpha', label: 'cloud opacity', min: 0, max: 3, step: 0.05 },
  { key: 'rim', label: 'rim glow', min: 0, max: 2, step: 0.05 },
  { key: 'halo', label: 'atmosphere', min: 0, max: 2.5, step: 0.05 },
  { key: 'sunX', label: 'sun x', min: 0, max: 1, step: 0.01 },
  { key: 'sunY', label: 'sun y', min: 0, max: 1, step: 0.01 },
  { key: 'fleetX', label: 'fleet x', min: 0, max: 1, step: 0.01 },
  { key: 'fleetY', label: 'fleet y', min: 0, max: 1, step: 0.01 },
]

interface SceneTunerProps {
  params: SceneParams
  onChange: (next: SceneParams) => void
}

/** Landing-page scene tuner: edit the backdrop live, copy the numbers out. */
export function SceneTuner({ params, onChange }: SceneTunerProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  return (
    <div className="scene-tuner">
      <button className="tuner-toggle" title="Tune the scene" onClick={() => setOpen((o) => !o)}>
        <SlidersIcon />
      </button>
      {open && (
        <div className="tuner-panel">
          <div className="panel-eyebrow">scene tuner</div>
          <div className="tuner-worlds">
            {PALETTES.map((pal, i) => (
              <button
                key={pal.name}
                className={`pal-chip${params.palette === i ? ' sel' : ''}`}
                onClick={() => onChange({ ...params, palette: i })}
              >
                {pal.name}
              </button>
            ))}
          </div>
          {ROWS.map((r) => (
            <label key={r.key} className="tuner-row">
              <span className="tuner-label">{r.label}</span>
              <input
                type="range"
                min={r.min}
                max={r.max}
                step={r.step}
                value={params[r.key]}
                onChange={(ev) => onChange({ ...params, [r.key]: Number(ev.target.value) })}
              />
              <span className="tuner-value mono">{params[r.key].toFixed(2)}</span>
            </label>
          ))}
          <div className="tuner-actions">
            <button
              className="use-default"
              title="Roll a brand-new world: fresh continents and cloud layout"
              onClick={() => onChange({ ...params, seed: (Math.random() * 0x7fffffff) | 0 })}
            >
              new seed
            </button>
            <button
              className="use-default"
              onClick={() => {
                void navigator.clipboard.writeText(JSON.stringify(params, null, 2)).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
              }}
            >
              {copied ? 'copied' : 'copy values'}
            </button>
            <button className="use-default" onClick={() => onChange({ ...DEFAULT_SCENE })}>
              reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
