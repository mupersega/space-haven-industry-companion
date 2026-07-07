import { useEffect, useRef, useState } from 'react'
import { BLEND_CSS, type ThrusterGlow } from './GlowEditor'

/**
 * A fleet ship lit by the scene, without 3D. Two effects, both derived from
 * the sprite itself so nothing is a blanket gradient:
 *
 * 1. Luminance-keyed bloom — pixels that are already bright in the asset
 *    (engine flares, windows, running lights) are extracted, keeping their
 *    own color, and stacked additively in a small ring: the ship's own
 *    lights glow. Dark hull stays dark.
 * 2. Sun-facing rim light — the ship's silhouette tinted cold blue-white, minus
 *    the same silhouette shifted away from the sun: what survives is a thin
 *    fringe only on edges that geometrically face the sun (interior cutouts
 *    included).
 *
 * The base sprite is dimmed in the same pass (replacing the old CSS
 * brightness filter) so the added light is NOT dimmed with the hull.
 * Everything is computed once per (sprite, sun direction) on a canvas —
 * the light never moves at runtime, so a live shader would buy nothing.
 */

const PAD = 8 // room for glow bleed past the sprite bounds
// rim-light color: cold star-light blue-white, deliberately NOT the warm
// tint of the sun disc — hulls catch hard cold light in the game's key art
const RIM_TINT: [number, number, number] = [188, 216, 255]
const BLOOM_THRESHOLD = 138
const RIM_ALPHA = 0.5
const BLOOM_CORE = 0.5
const BLOOM_RING = 0.09

const imgCache = new Map<string, Promise<HTMLImageElement>>()
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imgCache.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
    imgCache.set(src, p)
  }
  return p
}

function hueSat(r: number, g: number, b: number): [number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const c = max - min
  const sat = max ? c / max : 0
  let h = 0
  if (c) {
    if (max === r) h = ((g - b) / c) % 6
    else if (max === g) h = (b - r) / c + 2
    else h = (r - g) / c + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, sat]
}

/** Saturate + brighten the sprite's own pixels that match the boost's hue,
 * within its region. Greys and other hues pass through untouched — this is
 * "make the green more green", not a light laid on top. Runs on the source
 * pixels so boosted color also feeds the bloom pass naturally. */
function applyBoosts(d: Uint8ClampedArray, W: number, H: number, boosts: ThrusterGlow[]) {
  for (const bo of boosts) {
    const tr = parseInt(bo.color.slice(1, 3), 16)
    const tg = parseInt(bo.color.slice(3, 5), 16)
    const tb = parseInt(bo.color.slice(5, 7), 16)
    const [th] = hueSat(tr, tg, tb)
    const cx = bo.x * W
    const cy = bo.y * H
    const rad = Math.max(2, bo.size * W)
    const k = bo.opacity ?? 0.9
    const x0 = Math.max(0, Math.floor(cx - rad))
    const x1 = Math.min(W - 1, Math.ceil(cx + rad))
    const y0 = Math.max(0, Math.floor(cy - rad))
    const y1 = Math.min(H - 1, Math.ceil(cy + rad))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4
        if (!d[i + 3]) continue
        const dist = Math.hypot(x - cx, y - cy)
        if (dist > rad) continue
        const r = d[i]
        const g = d[i + 1]
        const b = d[i + 2]
        const [h, sat] = hueSat(r, g, b)
        if (sat < 0.12) continue // greys stay grey
        const dh = Math.abs(h - th)
        const hueW = Math.max(0, 1 - Math.min(dh, 360 - dh) / 70)
        if (!hueW) continue
        const fall = 1 - dist / rad
        const boost = k * hueW * fall * (2 - fall) // smooth radial falloff
        if (boost <= 0) continue
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        // saturate + brighten, then pull toward the vivid target — already-
        // saturated pixels can't saturate further, so the pull carries them
        const satPush = 1 + 2.2 * boost
        const bright = 1 + 0.55 * boost
        const pull = 0.5 * boost
        const tLum = 0.45 + lum / 150 // target scaled by the pixel's own light
        d[i] = Math.min(255, (lum + (r - lum) * satPush) * bright * (1 - pull) + tr * tLum * pull)
        d[i + 1] = Math.min(255, (lum + (g - lum) * satPush) * bright * (1 - pull) + tg * tLum * pull)
        d[i + 2] = Math.min(255, (lum + (b - lum) * satPush) * bright * (1 - pull) + tb * tLum * pull)
      }
    }
  }
}

const dimChannel = (c: number, lum: number) => (c * 0.9 + lum * 0.1) * 0.78

/** One boost mark rendered to its own overlay canvas — each canvas breathes
 * on its own CSS phase, so separate boosts pulse independently. */
function renderBoostOverlay(cv: HTMLCanvasElement, img: HTMLImageElement, boost: ThrusterGlow) {
  const W = img.naturalWidth
  const H = img.naturalHeight
  cv.width = W + PAD * 2
  cv.height = H + PAD * 2
  const scratch = document.createElement('canvas')
  scratch.width = W
  scratch.height = H
  const sg = scratch.getContext('2d')!
  sg.drawImage(img, 0, 0)
  const src = sg.getImageData(0, 0, W, H)
  const d = src.data
  const boosted = new Uint8ClampedArray(d)
  applyBoosts(boosted, W, H, [boost])
  const overlay = sg.createImageData(W, H)
  for (let i = 0; i < d.length; i += 4) {
    if (boosted[i] === d[i] && boosted[i + 1] === d[i + 1] && boosted[i + 2] === d[i + 2]) continue
    const lum = 0.2126 * boosted[i] + 0.7152 * boosted[i + 1] + 0.0722 * boosted[i + 2]
    overlay.data[i] = dimChannel(boosted[i], lum)
    overlay.data[i + 1] = dimChannel(boosted[i + 1], lum)
    overlay.data[i + 2] = dimChannel(boosted[i + 2], lum)
    overlay.data[i + 3] = d[i + 3]
  }
  const oc = document.createElement('canvas')
  oc.width = W
  oc.height = H
  oc.getContext('2d')!.putImageData(overlay, 0, 0)
  const g = cv.getContext('2d')!
  g.clearRect(0, 0, cv.width, cv.height)
  g.drawImage(oc, PAD, PAD)
}

function renderShip(cv: HTMLCanvasElement, img: HTMLImageElement, sdx: number, sdy: number) {
  const W = img.naturalWidth
  const H = img.naturalHeight
  cv.width = W + PAD * 2
  cv.height = H + PAD * 2
  const g = cv.getContext('2d')!
  g.clearRect(0, 0, cv.width, cv.height)

  const scratch = document.createElement('canvas')
  scratch.width = W
  scratch.height = H
  const sg = scratch.getContext('2d')!
  sg.drawImage(img, 0, 0)
  const src = sg.getImageData(0, 0, W, H)
  const d = src.data
  const dim = sg.createImageData(W, H)
  const glow = sg.createImageData(W, H)
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    if (!a) continue
    const r = d[i]
    const gr = d[i + 1]
    const b = d[i + 2]
    const lum = 0.2126 * r + 0.7152 * gr + 0.0722 * b
    // silhouette dim + slight desaturation (was the CSS brightness filter)
    dim.data[i] = (r * 0.9 + lum * 0.1) * 0.78
    dim.data[i + 1] = (gr * 0.9 + lum * 0.1) * 0.78
    dim.data[i + 2] = (b * 0.9 + lum * 0.1) * 0.78
    dim.data[i + 3] = a
    // bright pixels keep their own color; weight rises with luminance
    const w = Math.min(1, Math.max(0, (lum - BLOOM_THRESHOLD) / (255 - BLOOM_THRESHOLD)) ** 1.35)
    if (w > 0) {
      glow.data[i] = r
      glow.data[i + 1] = gr
      glow.data[i + 2] = b
      glow.data[i + 3] = a * w
    }
  }

  const baseC = document.createElement('canvas')
  baseC.width = W
  baseC.height = H
  baseC.getContext('2d')!.putImageData(dim, 0, 0)
  g.drawImage(baseC, PAD, PAD)

  // --- bloom: the bright mask stacked additively in a small ring
  const glowC = document.createElement('canvas')
  glowC.width = W
  glowC.height = H
  glowC.getContext('2d')!.putImageData(glow, 0, 0)
  g.globalCompositeOperation = 'lighter'
  for (const rad of [1.6, 3.4]) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      g.globalAlpha = BLOOM_RING
      g.drawImage(glowC, PAD + Math.cos(a) * rad, PAD + Math.sin(a) * rad)
    }
  }
  g.globalAlpha = BLOOM_CORE
  g.drawImage(glowC, PAD, PAD)

  // --- rim light: silhouette minus itself shifted anti-sunward
  const sil = document.createElement('canvas')
  sil.width = W
  sil.height = H
  const lg = sil.getContext('2d')!
  lg.drawImage(img, 0, 0)
  lg.globalCompositeOperation = 'source-in'
  lg.fillStyle = `rgb(${RIM_TINT[0]}, ${RIM_TINT[1]}, ${RIM_TINT[2]})`
  lg.fillRect(0, 0, W, H)
  const rim = document.createElement('canvas')
  rim.width = W
  rim.height = H
  const rg = rim.getContext('2d')!
  const rw = Math.max(1.3, Math.min(2.8, W * 0.005))
  rg.drawImage(sil, 0, 0)
  rg.globalCompositeOperation = 'destination-out'
  rg.drawImage(sil, -sdx * rw, -sdy * rw)
  g.globalAlpha = RIM_ALPHA
  g.drawImage(rim, PAD, PAD)
  // a soft second pass just behind the crisp fringe
  g.globalAlpha = RIM_ALPHA * 0.35
  g.drawImage(rim, PAD + sdx * 0.8, PAD + sdy * 0.8)

  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
}

export interface ShipSpriteProps {
  src: string
  width: number
  flip?: boolean
  drift: number
  delay: number
  left: number
  top: number
  /** unit vector from this ship toward the sun, in screen space */
  sunDx: number
  sunDy: number
  /** authored thruster/light glows, coords relative to the unflipped sprite */
  glows: ThrusterGlow[]
}

export function ShipSprite({ src, width, flip, drift, delay, left, top, sunDx, sunDy, glows }: ShipSpriteProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const boostRefs = useRef<Array<HTMLCanvasElement | null>>([])
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const boosts = glows.filter((g) => g.shape === 'boost')
  const overlays = glows.filter((g) => g.shape !== 'boost')
  const boostKey = JSON.stringify(boosts)

  useEffect(() => {
    let live = true
    void loadImage(src).then((img) => {
      if (!live || !ref.current) return
      // the element is displayed mirrored, so mirror the sun to compensate
      renderShip(ref.current, img, flip ? -sunDx : sunDx, sunDy)
      for (const [i, bo] of (JSON.parse(boostKey) as ThrusterGlow[]).entries()) {
        const cv = boostRefs.current[i]
        if (cv) renderBoostOverlay(cv, img, bo)
      }
      setDims({ w: img.naturalWidth, h: img.naturalHeight })
    })
    return () => {
      live = false
    }
  }, [src, flip, sunDx, sunDy, boostKey])

  // the canvas is padded PAD px around the sprite; map sprite-fraction glow
  // coords into the padded box
  const bw = dims ? dims.w + PAD * 2 : 1
  const bh = dims ? dims.h + PAD * 2 : 1
  const padScale = dims ? bw / dims.w : 1

  return (
    <div
      className="wg-ship"
      style={
        {
          left: `${left}%`,
          top: `${top}%`,
          width: width * padScale,
          maxWidth: `${Math.round((width * padScale) / 14)}vw`,
          animationDuration: `${drift}s`,
          animationDelay: `${delay}s`,
          '--flip': flip ? -1 : 1,
        } as React.CSSProperties
      }
    >
      <canvas ref={ref} className="wg-ship-canvas" />
      {boosts.map((bo, i) => (
        <canvas
          key={`b${i}`}
          ref={(el) => {
            boostRefs.current[i] = el
          }}
          className="wg-ship-boost"
          style={{
            // every boost breathes on its own phase and tempo — desynced by
            // mark index and the ship's position so no two pulse together
            animationDuration: `${(2.6 + ((i * 0.83 + left * 0.11) % 1.6)).toFixed(2)}s`,
            animationDelay: `${(-((i * 1.37 + top * 0.19 + bo.x * 2) % 2.6)).toFixed(2)}s`,
          }}
        />
      ))}
      {dims &&
        overlays.map((gl, i) => (
          <span
            key={i}
            className={`wg-glow ${gl.shape}`}
            style={
              {
                left: `${((PAD + gl.x * dims.w) / bw) * 100}%`,
                top: `${((PAD + gl.y * dims.h) / bh) * 100}%`,
                width: `${gl.size * (dims.w / bw) * 100 * (gl.shape === 'jet' ? 2.2 : 1)}%`,
                zIndex: gl.layer === 'below' ? 0 : 2,
                // stagger the flicker so engines don't pulse in unison
                animationDelay: `${-((i * 0.53) % 1.7).toFixed(2)}s`,
                mixBlendMode: BLEND_CSS[gl.blend ?? 'normal'] as React.CSSProperties['mixBlendMode'],
                '--glow': gl.color,
                '--ang': `${gl.angle ?? 0}deg`,
                '--gop': gl.opacity ?? 1,
              } as React.CSSProperties
            }
          />
        ))}
    </div>
  )
}
