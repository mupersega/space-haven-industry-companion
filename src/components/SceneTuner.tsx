import { useState } from 'react'
import { DEFAULT_SCENE, PALETTES, PLANET_PRESETS, type SceneParams } from '../lib/spaceRender'

function SlidersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M1 4h8v1.5H1zM12.5 4H15v1.5h-2.5zM9.5 2.5h3v4.5h-3zM1 10.5h2.5V12H1zM6.5 10.5H15V12H6.5zM3.5 9h3v4.5h-3z" />
    </svg>
  )
}

// only the numeric SceneParams keys can back a slider (excludes cloudColor etc.)
type NumericKey = { [K in keyof SceneParams]: SceneParams[K] extends number ? K : never }[keyof SceneParams]

interface Row {
  key: NumericKey
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
  { key: 'terrain', label: 'contrast', min: 0, max: 2, step: 0.05 },
  { key: 'terrainScale', label: 'relief', min: 0.3, max: 2.5, step: 0.05 },
  { key: 'rim', label: 'rim glow', min: 0, max: 2, step: 0.05 },
  { key: 'halo', label: 'atmosphere', min: 0, max: 2.5, step: 0.05 },
  { key: 'sunX', label: 'sun x', min: 0, max: 1, step: 0.01 },
  { key: 'sunY', label: 'sun y', min: 0, max: 1, step: 0.01 },
  { key: 'fleetX', label: 'fleet x', min: 0, max: 1, step: 0.01 },
  { key: 'fleetY', label: 'fleet y', min: 0, max: 1, step: 0.01 },
]

// Shader-planet only: the wind / cloud-system knobs. Shown when the shader
// planet is live so the wind can be dialled in without editing shader constants.
const WIND_ROWS: Row[] = [
  { key: 'clouds', label: 'cloud cover', min: 0, max: 20, step: 0.5 },
  { key: 'cloudSize', label: 'cloud size', min: 0.5, max: 2.5, step: 0.05 },
  { key: 'cloudAlpha', label: 'opacity', min: 0, max: 3, step: 0.05 },
  { key: 'windOrganize', label: 'structure', min: 0, max: 1, step: 0.02 },
  { key: 'cloudSystems', label: 'systems', min: 2, max: 12, step: 0.5 },
  { key: 'cloudClump', label: 'clump size', min: 8, max: 40, step: 1 },
  { key: 'windSpin', label: 'wind speed', min: 0, max: 0.01, step: 0.0005 },
  { key: 'windShear', label: 'banding', min: 0, max: 4, step: 0.1 },
]

// readout precision from the slider's step, so fine sliders (wind speed) don't
// collapse to "0.00"
const decimalsFor = (step: number) => Math.min(4, Math.max(0, Math.ceil(-Math.log10(step))))

interface SceneTunerProps {
  params: SceneParams
  onChange: (next: SceneParams) => void
  /** which planet renderer is live: false = hand-drawn (canvas), true = GPU shader */
  glPlanet: boolean
  onGlPlanetChange: (next: boolean) => void
}

/** Landing-page scene tuner: edit the backdrop live. */
export function SceneTuner({ params, onChange, glPlanet, onGlPlanetChange }: SceneTunerProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="scene-tuner">
      <button className="tuner-toggle" data-tip="Tune the scene" onClick={() => setOpen((o) => !o)}>
        <SlidersIcon />
      </button>
      {open && (
        <div className="tuner-panel">
          <div className="panel-eyebrow">scene tuner</div>
          {/* dev-only: prod always uses the shader planet, no drawn fallback toggle */}
          {import.meta.env.DEV && (
            <button
              className={`pal-chip${glPlanet ? ' sel' : ''}`}
              data-tip="Switch between the hand-drawn planet and the GPU shader planet (dev only)"
              onClick={() => onGlPlanetChange(!glPlanet)}
              style={{ marginBottom: 8 }}
            >
              planet: {glPlanet ? 'shader' : 'drawn'}
            </button>
          )}
          <div className="tuner-worlds">
            {PALETTES.map((pal, i) =>
              // erff (index 0) is dropped as a world — kept in PALETTES only so
              // the other worlds' indices and presets don't shift
              i === 0 ? null : (
                <button
                  key={pal.name}
                  className={`pal-chip${params.palette === i ? ' sel' : ''}`}
                  // switch world + merge its cloud/wind preset (if any); position,
                  // sun, seed, etc. stay as the visitor has them
                  onClick={() => onChange({ ...params, palette: i, ...(PLANET_PRESETS[i] ?? {}) })}
                >
                  {pal.name}
                </button>
              ),
            )}
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
              <span className="tuner-value mono">{params[r.key].toFixed(decimalsFor(r.step))}</span>
            </label>
          ))}
          {/* dev-only: the wind/cloud system is baked into per-world presets;
              visitors don't get these raw knobs */}
          {import.meta.env.DEV && glPlanet && (
            <>
              <div className="panel-eyebrow" style={{ marginTop: 6 }}>
                wind system
              </div>
              {WIND_ROWS.map((r) => (
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
                  <span className="tuner-value mono">{params[r.key].toFixed(decimalsFor(r.step))}</span>
                </label>
              ))}
              <label className="tuner-row">
                <span className="tuner-label">cloud color</span>
                <input
                  type="color"
                  value={params.cloudColor}
                  onChange={(ev) => onChange({ ...params, cloudColor: ev.target.value })}
                  style={{ flex: 1, height: 18, padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
                />
                <span className="tuner-value mono">{params.cloudColor}</span>
              </label>
            </>
          )}
          <div className="tuner-actions">
            <button
              className="use-default"
              data-tip="Roll a fresh seed: new continents and cloud layout"
              onClick={() => onChange({ ...params, seed: (Math.random() * 0x7fffffff) | 0 })}
            >
              new seed
            </button>
            <button
              className="use-default"
              data-tip="Return to the default scene"
              onClick={() => onChange({ ...DEFAULT_SCENE })}
            >
              reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
