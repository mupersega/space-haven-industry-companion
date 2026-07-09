// Web worker: paints the backdrop layers off the main thread. It owns three
// OffscreenCanvases, renders each layer, and posts back a transferable
// ImageBitmap per layer for the component to blit onto the visible canvases.
import { loadBrushes, renderLayer, type Brushes, type LayerKey, type SceneParams } from '../lib/spaceRender'

// `self` is typed as a window here (no WebWorker lib); narrow to what we use.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

type RenderMsg = {
  type: 'render'
  params: SceneParams
  w: number
  h: number
  layers: LayerKey[]
  scale: number
}

let brushes: Brushes | null = null
let pending: RenderMsg | null = null

function render(msg: RenderMsg) {
  if (!brushes) return
  const { params, w, h, layers, scale } = msg
  // render at the requested scale (a low-res preview while dragging); the
  // component upscales the smaller bitmap back to `w`×`h` on blit
  const rw = Math.max(1, Math.round(w * scale))
  const rh = Math.max(1, Math.round(h * scale))
  const bitmaps = {} as Partial<Record<LayerKey, ImageBitmap>>
  const transfer: Transferable[] = []
  try {
    for (const key of layers) {
      // a fresh canvas each render: reusing one after transferToImageBitmap()
      // (which detaches its bitmap) can hand back a stale/blank frame
      const cv = new OffscreenCanvas(rw, rh)
      renderLayer(cv, key, brushes, params)
      const bmp = cv.transferToImageBitmap()
      bitmaps[key] = bmp
      transfer.push(bmp)
    }
  } catch {
    // never wedge the main thread's busy flag: report an empty result so the
    // coalescing gate reopens even if a paint throws
    ctx.postMessage({ type: 'rendered', bitmaps: {}, w, h })
    return
  }
  // echo the display size so the component knows the target blit dimensions
  ctx.postMessage({ type: 'rendered', bitmaps, w, h }, transfer)
}

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data
  if (msg?.type === 'init') {
    void loadBrushes(msg.base as string).then((b) => {
      brushes = b
      if (pending) {
        const p = pending
        pending = null
        render(p)
      }
    })
  } else if (msg?.type === 'render') {
    if (!brushes) {
      pending = msg as RenderMsg
      return
    }
    render(msg as RenderMsg)
  }
}
