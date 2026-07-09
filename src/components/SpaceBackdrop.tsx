import { useEffect, useRef } from 'react'
import {
  DEFAULT_SCENE,
  LAYER_KEYS,
  loadBrushes,
  renderLayer,
  type Brushes,
  type LayerKey,
  type SceneParams,
} from '../lib/spaceRender'

const BASE = import.meta.env.BASE_URL

// Off-thread rendering needs Worker + OffscreenCanvas + createImageBitmap. Every
// current browser has them; anything older falls back to main-thread painting.
const CAN_WORKER =
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof createImageBitmap !== 'undefined'

// Which layers each parameter touches, so a change only repaints what moved.
// The star field never changes with params; the nebula only tracks the sun; the
// planet responds to nearly everything. Params touching only fleetX/fleetY move
// the ships (handled elsewhere), not the backdrop — so they repaint nothing.
const NEBULA_KEYS: (keyof SceneParams)[] = ['sunX', 'sunY']
const PLANET_KEYS: (keyof SceneParams)[] = [
  'sunX', 'sunY', 'planetX', 'planetY', 'planetR', 'crescent', 'terrain', 'terrainScale',
  'clouds', 'cloudSize', 'cloudAlpha', 'rim', 'halo', 'dark', 'seed', 'palette',
]
function changedLayers(a: SceneParams, b: SceneParams): LayerKey[] {
  const out: LayerKey[] = []
  if (NEBULA_KEYS.some((k) => a[k] !== b[k])) out.push('nebula')
  if (PLANET_KEYS.some((k) => a[k] !== b[k])) out.push('planet')
  return out
}

// While a slider is dragged we paint a cheap low-res preview; ~this long after
// the last change we spend one crisp full-resolution render.
const LOW_SCALE = 0.5
const SETTLE_MS = 170

// ---- ONE shared worker for the whole app ----
// React StrictMode mounts → unmounts → remounts, and a per-mount worker would
// leave rival workers each holding their own in-flight busy/pending state, so a
// render could queue behind a worker that was already torn down. A single
// module-level worker with one coalescing gate makes remounts harmless: the
// currently-mounted backdrop just registers where finished bitmaps should land.
type BitmapSink = (bitmaps: Partial<Record<LayerKey, ImageBitmap>>, w: number, h: number) => void
type RenderSpec = { params: SceneParams; w: number; h: number; layers: Set<LayerKey>; scale: number }
let sharedWorker: Worker | null = null
let workerBusy = false
let workerPending: RenderSpec | null = null
let bitmapSink: BitmapSink | null = null

function ensureWorker(): Worker {
  if (sharedWorker) return sharedWorker
  const wk = new Worker(new URL('./spaceBackdrop.worker.ts', import.meta.url), { type: 'module' })
  wk.onmessage = (e: MessageEvent) => {
    if (e.data?.type !== 'rendered') return
    bitmapSink?.(e.data.bitmaps, e.data.w, e.data.h)
    workerBusy = false
    if (workerPending) {
      const p = workerPending
      workerPending = null
      workerBusy = true
      wk.postMessage({ type: 'render', params: p.params, w: p.w, h: p.h, layers: [...p.layers], scale: p.scale })
    }
  }
  wk.postMessage({ type: 'init', base: BASE })
  sharedWorker = wk
  return wk
}
function requestWorkerRender(params: SceneParams, w: number, h: number, layers: LayerKey[], scale: number) {
  if (layers.length === 0) return
  const wk = ensureWorker()
  if (workerBusy) {
    // coalesce: keep only the latest render, unioning the layers that need it
    if (!workerPending) workerPending = { params, w, h, layers: new Set(layers), scale }
    else {
      layers.forEach((l) => workerPending!.layers.add(l))
      workerPending.params = params
      workerPending.w = w
      workerPending.h = h
      workerPending.scale = scale
    }
    return
  }
  workerBusy = true
  wk.postMessage({ type: 'render', params, w, h, layers, scale })
}

/**
 * The nebula / stars / planet backdrop. The heavy per-pixel planet render runs
 * in a shared web worker (OffscreenCanvas) and returns an ImageBitmap we blit in
 * one drawImage — compute never blocks the main thread. To keep the compute
 * itself gentle, a change only repaints the layers it affects, and while you
 * drag it paints a quarter-res preview, sharpening to full-res once you stop.
 */
export function SpaceBackdrop({
  params = DEFAULT_SCENE,
  onReady,
}: {
  params?: SceneParams
  /** fired once the first full-res frame has been blitted (for the load gate) */
  onReady?: () => void
}) {
  const nebRef = useRef<HTMLCanvasElement>(null)
  const farRef = useRef<HTMLCanvasElement>(null)
  const limbRef = useRef<HTMLCanvasElement>(null)
  const paramsRef = useRef(params)
  paramsRef.current = params
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const firstBlitRef = useRef(false)
  const prevParamsRef = useRef(params)
  const doRenderRef = useRef<((layers: LayerKey[], scale: number) => void) | null>(null)
  const dirtyRef = useRef<Set<LayerKey>>(new Set())
  const settleRef = useRef<number | null>(null)

  useEffect(() => {
    const canvasFor = (key: LayerKey) =>
      key === 'nebula' ? nebRef.current : key === 'far-stars' ? farRef.current : limbRef.current
    const measure = () => {
      const cv = limbRef.current
      if (!cv) return null
      // clientWidth/Height is the layout size, immune to the .wg-materialise
      // scale transform on the wrapper (getBoundingClientRect would fold it in
      // and paint the backdrop at the wrong size during the arrival)
      return { w: Math.max(1, cv.clientWidth), h: Math.max(1, cv.clientHeight) }
    }

    let cancelled = false
    let raf = 0

    if (CAN_WORKER) {
      const sink: BitmapSink = (bitmaps, w, h) => {
        if (cancelled) return
        for (const key of LAYER_KEYS) {
          const bmp = bitmaps[key]
          const cv = canvasFor(key)
          if (!bmp || !cv) continue
          if (cv.width !== w) cv.width = w
          if (cv.height !== h) cv.height = h
          const g = cv.getContext('2d')
          if (g) {
            // clear first: the layer bitmaps carry transparency, so a bare
            // drawImage composites over the previous frame (the sun would pile
            // up brighter each pass). dw/dh upscale a low-res preview to full.
            g.clearRect(0, 0, w, h)
            g.drawImage(bmp, 0, 0, w, h)
          }
          bmp.close()
        }
        // the first blit is the initial full-res frame — signal the load gate
        if (!firstBlitRef.current) {
          firstBlitRef.current = true
          onReadyRef.current?.()
        }
      }
      bitmapSink = sink
      doRenderRef.current = (layers, scale) => {
        const size = measure()
        if (size) requestWorkerRender(paramsRef.current, size.w, size.h, layers, scale)
      }
      // first paint: straight to full-res (the load gate holds the scene hidden
      // until this lands, so a low-res preview would just be a blur flash we
      // never want seen). Deferred one frame so layout is settled and the first
      // measure is the true size — no sun-resize pop on reveal.
      raf = requestAnimationFrame(() => doRenderRef.current?.([...LAYER_KEYS], 1))
      const onResize = () => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => doRenderRef.current?.([...LAYER_KEYS], 1))
      }
      window.addEventListener('resize', onResize)
      return () => {
        cancelled = true
        cancelAnimationFrame(raf)
        if (settleRef.current) clearTimeout(settleRef.current)
        window.removeEventListener('resize', onResize)
        doRenderRef.current = null
        if (bitmapSink === sink) bitmapSink = null // stop blitting; keep the worker
      }
    }

    // ---- main-thread fallback: repaint only changed layers, always full-res ----
    let brushes: Brushes | null = null
    const renderLayers = (layers: LayerKey[]) => {
      if (!brushes) return
      const size = measure()
      if (!size) return
      for (const key of layers) {
        const cv = canvasFor(key)
        if (!cv) continue
        cv.width = size.w
        cv.height = size.h
        renderLayer(cv, key, brushes, paramsRef.current)
      }
    }
    void loadBrushes(BASE).then((b) => {
      if (cancelled) return
      brushes = b
      renderLayers([...LAYER_KEYS])
      if (!firstBlitRef.current) {
        firstBlitRef.current = true
        onReadyRef.current?.()
      }
    })
    doRenderRef.current = (layers) => renderLayers(layers)
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => renderLayers([...LAYER_KEYS]))
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (settleRef.current) clearTimeout(settleRef.current)
      window.removeEventListener('resize', onResize)
      doRenderRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On a param change, repaint just the affected layers. A full-res planet
  // render is ~0.8s of compute, so ALWAYS show a cheap quarter-res preview
  // first (snappy feedback, a quarter of the work) and sharpen to full-res once
  // the changes settle — whether it's a single click or a slider drag.
  useEffect(() => {
    const changed = changedLayers(prevParamsRef.current, paramsRef.current)
    prevParamsRef.current = paramsRef.current
    if (changed.length === 0) return // e.g. a fleet-only move — backdrop unaffected

    changed.forEach((l) => dirtyRef.current.add(l))
    doRenderRef.current?.(changed, LOW_SCALE) // quick preview
    if (settleRef.current) clearTimeout(settleRef.current)
    settleRef.current = window.setTimeout(() => {
      const dirty = [...dirtyRef.current]
      dirtyRef.current = new Set()
      doRenderRef.current?.(dirty, 1) // sharpen everything the changes touched
    }, SETTLE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return (
    <>
      {/* depth 0: the nebula, stars and planet are vast and impossibly far —
          they do not parallax with the mouse. Only the fleet (near objects)
          moves against them. */}
      <div className="wg-layer" style={{ '--d': 0 } as React.CSSProperties}>
        <canvas ref={nebRef} className="wg-canvas wg-ambient" data-space-layer="nebula" />
      </div>
      <div className="wg-layer" style={{ '--d': 0 } as React.CSSProperties}>
        <canvas ref={farRef} className="wg-canvas" data-space-layer="far-stars" />
      </div>
      <div className="wg-layer" style={{ '--d': 0 } as React.CSSProperties}>
        <canvas ref={limbRef} className="wg-canvas" data-space-layer="planet" />
      </div>
    </>
  )
}
