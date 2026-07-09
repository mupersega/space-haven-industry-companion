import { useEffect, useRef } from 'react'
import { createPlanetGL, type PlanetGLHandle } from '../lib/planetGL'
import type { SceneParams } from '../lib/spaceRender'

// Start the sim pre-warmed so a world opens already in motion instead of from
// its cold t=0 base state. The rotation seed scales with wind speed, so slow
// worlds barely pre-roll and fast ones (quant/hyper) open well into their spin.
const PREROLL_S = 100

/**
 * The GPU planet as a drop-in layer, sized and placed exactly like the CPU
 * planet canvas so it can be overlaid for a like-for-like comparison. Its cloud
 * deck drifts via an rAF loop that advances a longitude phase; when the visitor
 * prefers reduced motion the loop is skipped and a single static frame renders.
 */
export function PlanetGL({ params, onReady }: { params: SceneParams; onReady?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<PlanetGLHandle | null>(null)
  const paramsRef = useRef(params)
  paramsRef.current = params
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  // set while a static (reduced-motion) build is mounted; null while animating
  const staticRenderRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const gl = createPlanetGL(cv)
    glRef.current = gl
    if (!gl) {
      console.warn('[PlanetGL] WebGL2 unavailable — the CPU renderer stays in charge')
      onReadyRef.current?.() // don't hold the load gate on a planet that won't draw
      return
    }
    const measure = () => {
      // clientWidth/Height = layout size, immune to the .wg-materialise scale
      // transform (getBoundingClientRect would fold it in and mis-size the
      // buffer during the arrival). No DPR multiply — the heavy cloud shader
      // isn't worth paying 4x for on hi-DPI; the atmosphere is radius-normalised.
      gl.resize(Math.max(1, cv.clientWidth), Math.max(1, cv.clientHeight))
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf = 0
    let start = 0
    let last = -1e9
    let lastT = 0
    let spinPhase = 0
    let initialized = false
    let lastPalette = -1
    let firstDone = false
    const signalReady = () => {
      if (firstDone) return
      firstDone = true
      onReadyRef.current?.()
    }
    if (reduce) {
      // static: one pre-warmed frame (fresh per world), repainted on resize /
      // param change — no carryover, no motion
      const draw = () => {
        measure()
        gl.render(paramsRef.current, PREROLL_S, PREROLL_S * paramsRef.current.windSpin)
        signalReady()
      }
      staticRenderRef.current = draw
      draw()
    } else {
      // ~30fps (the wind field is slow). `time` (elapsed s) drives weather
      // evolution; the rotation phase is INTEGRATED so a wind-speed tweak only
      // changes the rate, never lurches. On mount AND every planet switch we
      // re-seed both, pre-warmed — so a world opens already in motion and never
      // inherits the previous world's accumulated spin.
      const frame = (t: number) => {
        const p = paramsRef.current
        if (!initialized || p.palette !== lastPalette) {
          initialized = true
          lastPalette = p.palette
          start = t - PREROLL_S * 1000
          lastT = t
          spinPhase = PREROLL_S * p.windSpin
        }
        spinPhase += ((t - lastT) / 1000) * p.windSpin
        lastT = t
        if (t - last >= 33) {
          gl.render(p, (t - start) / 1000, spinPhase)
          last = t
          signalReady()
        }
        raf = requestAnimationFrame(frame)
      }
      measure()
      raf = requestAnimationFrame(frame)
    }

    const onResize = () => {
      measure()
      // the animating loop re-renders on its own; the static build needs a nudge
      staticRenderRef.current?.()
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      staticRenderRef.current = null
      gl.dispose()
      glRef.current = null
    }
  }, [])

  // param changes: the animating loop already reads paramsRef every frame, so
  // this only needs to repaint the static (reduced-motion) build
  useEffect(() => {
    staticRenderRef.current?.()
  }, [params])

  return (
    <div className="wg-layer" style={{ '--d': 0 } as React.CSSProperties}>
      <canvas ref={ref} className="wg-canvas" data-space-layer="planet-gl" />
    </div>
  )
}
