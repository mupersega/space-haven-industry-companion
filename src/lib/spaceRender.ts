// Pure procedural render logic for the landing-page backdrop — no React and no
// DOM component. It runs on the main thread (fallback) OR inside a web worker
// via OffscreenCanvas, so it must never touch `document`/`window` directly.

/** Either canvas kind: a real <canvas> on the main thread, or an OffscreenCanvas
 * in the worker. Both expose the same 2D drawing API we use. */
type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
/** 2D context of either kind — structurally identical for our subset of calls. */
type Ctx2D = CanvasRenderingContext2D
const get2d = (cv: AnyCanvas): Ctx2D => (cv as HTMLCanvasElement).getContext('2d') as Ctx2D
/** A scratch canvas: OffscreenCanvas where available (worker + modern main
 * thread), else a detached <canvas> for ancient browsers on the main thread. */
function makeScratch(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/**
 * The game's own space backdrop technique, replicated: Space Haven renders
 * its space as black void + nebula painted by stamping a soft cloud brush
 * + thousands of tiny star brushes (1px dots, 3px cross dots) — all
 * extracted from library/gp. We stamp the same brushes onto separate
 * canvases so nebula, stars and planet can parallax independently.
 */

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A loaded brush: something drawable, its intrinsic size, and a cache key. */
export interface Brush {
  img: CanvasImageSource
  w: number
  h: number
  key: string
}
async function loadBrush(url: string): Promise<Brush> {
  // createImageBitmap works on the main thread AND in the worker, and yields a
  // transferable bitmap — the preferred path wherever it exists
  if (typeof createImageBitmap !== 'undefined') {
    const bmp = await createImageBitmap(await (await fetch(url)).blob())
    return { img: bmp, w: bmp.width, h: bmp.height, key: url }
  }
  // ancient main-thread fallback: decode via an <img>
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = url
  })
  return { img, w: img.naturalWidth, h: img.naturalHeight, key: url }
}
export async function loadBrushes(base: string): Promise<Brushes> {
  const [cloud, small] = await Promise.all([
    loadBrush(`${base}scene/brush-ballCloud1.png`),
    loadBrush(`${base}scene/brush-bgStarSmall1.png`),
  ])
  return { cloud, small }
}

/** brush tinted to a color, cached (game does colors[] per stamp op) */
const tintCache = new Map<string, AnyCanvas>()
function tinted(brush: Brush, color: string): AnyCanvas {
  const key = `${brush.key}|${color}`
  const hit = tintCache.get(key)
  if (hit) return hit
  const c = makeScratch(brush.w, brush.h)
  const g = get2d(c)
  g.drawImage(brush.img, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, brush.w, brush.h)
  tintCache.set(key, c)
  return c
}


/** The game's cloud brush is an accumulation brush — peak alpha ~14% — so a
 * single stamp has no body. A dense puff is the brush stacked on itself. */
const puffCache = new Map<string, AnyCanvas>()
function densePuff(brush: Brush, color: string): AnyCanvas {
  const key = `${brush.key}|puff|${color}`
  const hit = puffCache.get(key)
  if (hit) return hit
  const t = tinted(brush, color)
  const c = makeScratch(t.width, t.height)
  const g = get2d(c)
  const cx = t.width / 2
  const cy = t.height / 2
  const jr = mulberry32(77)
  for (let i = 0; i < 9; i++) {
    const s = 0.55 + jr() * 0.45
    const jx = (jr() - 0.5) * t.width * 0.3
    const jy = (jr() - 0.5) * t.height * 0.3
    g.drawImage(t, cx - (t.width * s) / 2 + jx, cy - (t.height * s) / 2 + jy, t.width * s, t.height * s)
  }
  puffCache.set(key, c)
  return c
}

export interface Brushes {
  cloud: Brush
  small: Brush
}

/** Tunable scene parameters (the landing-page widget edits these live) */
export interface SceneParams {
  sunX: number
  sunY: number
  planetX: number
  planetY: number
  planetR: number
  crescent: number
  terrain: number
  terrainScale: number
  clouds: number
  cloudSize: number
  cloudAlpha: number
  rim: number
  halo: number
  dark: number
  /** world reroll: offsets the terrain noise and re-scatters the clouds */
  seed: number
  /** world palette index (erff, ferrous, ice, hyper, quant, molten) */
  palette: number
  /** exodus fleet anchor — the flagship position everything forms up on */
  fleetX: number
  fleetY: number
  // GPU shader-planet only — wind / cloud-system tunables (the canvas renderer
  // ignores these). Edited live from the scene tuner's wind-system section.
  /** base cloud-deck rotation rate */
  windSpin: number
  /** FIXED zonal-band shear amplitude (radians): stretches the deck into stable
   * gas-giant streaks. 0 = chunky/no banding; high = strongly banded. Fixed (not
   * multiplied by the ever-growing spin phase) so the bands hold a steady stretch
   * and rotate rigidly instead of shearing into wisps over time. */
  windShear: number
  /** how fast the cloud warp churns + weather systems evolve */
  windEvolve: number
  /** swirl warp strength */
  windSwirl: number
  /** swirl warp scale */
  windSwirlScale: number
  /** weather-system frequency (how many discrete systems) */
  cloudSystems: number
  /** clump frequency within a system (clump size) */
  cloudClump: number
  /** per-clump self-shading strength */
  cloudBump: number
  /** global weather structure: latitude belts x pressure systems (0 = uniform) */
  windOrganize: number
  /** shader-planet cloud colour, '#rrggbb' (lit face; shadow face derived darker) */
  cloudColor: string
}

// the shipped scene: the storm-wrapped ice world (palette 2, the default world)
// low in the frame, the fleet crossing its dark face. Its cloud/wind fields
// match PLANET_PRESETS[2], so opening the scene and clicking "ice" land the same.
export const DEFAULT_SCENE: SceneParams = {
  sunX: 0.81,
  sunY: 0.3,
  planetX: 0.19,
  planetY: 0.77,
  planetR: 0.58,
  crescent: 1.05,
  terrain: 0.8,
  terrainScale: 1.8,
  clouds: 5.5,
  cloudSize: 0.5,
  cloudAlpha: 2.15,
  rim: 0.95,
  halo: 1.2,
  dark: 1,
  seed: 1154347057,
  palette: 2,
  fleetX: 0.45,
  fleetY: 0.41,
  windSpin: 0.001,
  windShear: 0, // ice is chunky, no banding
  windEvolve: 0.02, // fixed (no slider)
  windSwirl: 0.03, // fixed (no slider)
  windSwirlScale: 3, // fixed (no slider)
  cloudSystems: 12,
  cloudClump: 15,
  cloudBump: 4, // fixed (no slider)
  windOrganize: 0,
  cloudColor: '#ffffff',
}

/** A per-world preset — the cloud/wind system PLUS the world's terrain feel
 * (contrast, relief) and atmosphere (rim glow, halo). Selecting a world merges
 * these over the current scene; everything else (position, sun, crescent, seed,
 * fleet…) stays whatever the visitor has. The terrain/atmosphere fields are
 * optional so worlds can adopt the extended pattern one at a time. */
export type WorldPreset = Pick<
  SceneParams,
  | 'clouds'
  | 'cloudSize'
  | 'cloudAlpha'
  | 'cloudColor'
  | 'cloudSystems'
  | 'cloudClump'
  | 'cloudBump'
  | 'windSpin'
  | 'windShear'
  | 'windEvolve'
  | 'windSwirl'
  | 'windSwirlScale'
  | 'windOrganize'
> &
  Partial<Pick<SceneParams, 'terrain' | 'terrainScale' | 'rim' | 'halo'>>

// Per-world presets, indexed to PALETTES. Selecting a world merges its preset
// over the current scene; null keeps the current settings. Authored with the
// tuner (dial it in -> "copy values" -> paste the preset fields here).
export const PLANET_PRESETS: (WorldPreset | null)[] = [
  null, // 0 erff
  {
    // ferrous: rusted world, subtle orange-brown haze, no banding
    clouds: 20,
    cloudSize: 1.65,
    cloudAlpha: 0.4,
    cloudColor: '#bd6500',
    cloudSystems: 2,
    cloudClump: 8,
    cloudBump: 4,
    windSpin: 0.0055,
    windShear: 0,
    windEvolve: 0.02,
    windSwirl: 0.03,
    windSwirlScale: 3,
    windOrganize: 0,
    terrain: 0,
    terrainScale: 2.2,
    rim: 1.1,
    halo: 0,
  },
  {
    // ice: crisp world, many tight white cloud systems, cool thin air
    clouds: 5.5,
    cloudSize: 0.5,
    cloudAlpha: 2.15,
    cloudColor: '#ffffff',
    cloudSystems: 12,
    cloudClump: 15,
    cloudBump: 4,
    windSpin: 0.001,
    windShear: 0,
    windEvolve: 0.02,
    windSwirl: 0.03,
    windSwirlScale: 3,
    windOrganize: 0,
    terrain: 0.8,
    terrainScale: 1.8,
    rim: 0.95,
    halo: 1.2,
  }, // 2 ice
  {
    // hyper: broad acid-green haze, few big soft systems, still air
    clouds: 20,
    cloudSize: 2.5,
    cloudAlpha: 0.8,
    cloudColor: '#9ff500',
    cloudSystems: 2,
    cloudClump: 11,
    cloudBump: 4,
    windSpin: 0,
    windShear: 0,
    windEvolve: 0.02,
    windSwirl: 0.03,
    windSwirlScale: 3,
    windOrganize: 0.44,
    terrain: 1,
    terrainScale: 1.4,
    rim: 2,
    halo: 0.5,
  }, // 3 hyper
  {
    // quant: banded gas-giant — broad soft cover, strong zonal streaking, dark violet
    clouds: 14.5,
    cloudSize: 2.5,
    cloudAlpha: 1,
    cloudColor: '#140042',
    cloudSystems: 9.5,
    cloudClump: 8,
    cloudBump: 4,
    windSpin: 0.01,
    windShear: 4,
    windEvolve: 0.02,
    windSwirl: 0.03,
    windSwirlScale: 3,
    windOrganize: 0,
    terrain: 1.8,
    terrainScale: 0.4,
    rim: 0.4,
    halo: 0,
  }, // 4 quant
  {
    // molten: near-black ash shell, heavy cover, lava glowing through the gaps
    clouds: 20,
    cloudSize: 1.95,
    cloudAlpha: 2.45,
    cloudColor: '#333333',
    cloudSystems: 12,
    cloudClump: 20,
    cloudBump: 4,
    windSpin: 0.0055,
    windShear: 0.1,
    windEvolve: 0.02,
    windSwirl: 0.03,
    windSwirlScale: 3,
    windOrganize: 0,
    terrain: 0.8,
    terrainScale: 1.85,
    rim: 0.1,
    halo: 0.5,
  }, // 5 molten
]

// ---- 3D value noise + fBm, sampled on the sphere's surface normals so the
// terrain wraps the globe and foreshortens naturally at the limb
const NOISE_SIZE = 256
const noisePerm = new Uint16Array(NOISE_SIZE * 2)
const noiseVals = new Float32Array(NOISE_SIZE)
{
  const nr = mulberry32(931)
  for (let i = 0; i < NOISE_SIZE; i++) {
    noisePerm[i] = i
    noiseVals[i] = nr()
  }
  for (let i = NOISE_SIZE - 1; i > 0; i--) {
    const j = (nr() * (i + 1)) | 0
    const t = noisePerm[i]
    noisePerm[i] = noisePerm[j]
    noisePerm[j] = t
  }
  for (let i = 0; i < NOISE_SIZE; i++) noisePerm[NOISE_SIZE + i] = noisePerm[i]
}
const latVal = (x: number, y: number, z: number) =>
  noiseVals[noisePerm[(noisePerm[(noisePerm[x & 255] + y) & 255] + z) & 255]]
const smootherstep = (t: number) => t * t * (3 - 2 * t)

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = smootherstep(xf)
  const v = smootherstep(yf)
  const w = smootherstep(zf)
  const x0 = xi & 255
  const y0 = yi & 255
  const z0 = zi & 255
  const n000 = latVal(x0, y0, z0)
  const n100 = latVal(x0 + 1, y0, z0)
  const n010 = latVal(x0, y0 + 1, z0)
  const n110 = latVal(x0 + 1, y0 + 1, z0)
  const n001 = latVal(x0, y0, z0 + 1)
  const n101 = latVal(x0 + 1, y0, z0 + 1)
  const n011 = latVal(x0, y0 + 1, z0 + 1)
  const n111 = latVal(x0 + 1, y0 + 1, z0 + 1)
  const nx00 = n000 + (n100 - n000) * u
  const nx10 = n010 + (n110 - n010) * u
  const nx01 = n001 + (n101 - n001) * u
  const nx11 = n011 + (n111 - n011) * u
  const nxy0 = nx00 + (nx10 - nx00) * v
  const nxy1 = nx01 + (nx11 - nx01) * v
  return nxy0 + (nxy1 - nxy0) * w
}

function fbm3(x: number, y: number, z: number, octaves: number): number {
  let sum = 0
  let amp = 0.5
  let f = 1
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * f, y * f, z * f)
    amp *= 0.5
    f *= 2.03
  }
  return sum / (1 - 0.5 ** octaves)
}

// height → terrain color. Smoothly interpolated within the low and high
// ramps so there are no topo-map contour rings — the only crisp break is
// the "coastline" at SEA_LEVEL. Each world palette brings its own ramps,
// lit sheen, atmosphere colors and cloud tints — not every world is Earth.
const SEA_LEVEL = 0.555
type Ramp = Array<[number, number, number, number]>
type RGB = [number, number, number]
interface WorldPalette {
  name: string
  ocean: Ramp
  land: Ramp
  sheen: RGB // lit-side atmosphere sheen over the terrain
  atmo: RGB // atmosphere band mid color
  atmoDeep: RGB // atmosphere band toward the night side
  cloudTints: [string, string, string]
  /** crevasse strength 0..1 — thin dark fractures veining the surface */
  cracks?: number
  /** if set, the `cracks` veins run EMISSIVE in this color (glowing magma)
   * instead of darkening — and, unlike lit terrain, they are not dimmed on
   * the night side, so the molten network glows right across the globe */
  moltenColor?: RGB
  /** emissive intensity for the molten veins (default 1) */
  moltenGlow?: number
  /** snow/ice caps blend in toward the poles (0..1) — an Earth-like world */
  iceCaps?: number
}
export const PALETTES: WorldPalette[] = [
  {
    name: 'erff',
    // Blue-Marble Earth: deep navy oceans, vivid green lowlands drying to tan
    // and brown highlands, a crisp coastline from the strong colour contrast
    ocean: [
      [0.3, 5, 18, 54], // abyssal navy
      [0.48, 11, 40, 96], // deep ocean blue
      [0.555, 26, 70, 138], // shallows brightening to the shore
    ],
    land: [
      [0.555, 40, 108, 54], // vivid coastal green
      [0.65, 66, 120, 58], // forest green
      [0.74, 120, 130, 72], // savanna / yellow-green
      [0.83, 158, 132, 88], // tan
      [1.05, 180, 142, 98], // brown highlands
    ],
    sheen: [150, 198, 232],
    atmo: [120, 200, 242],
    atmoDeep: [28, 76, 152],
    cloudTints: ['#eaf1f7', '#d2e0ea', '#f5f9fd'],
    iceCaps: 0.85,
  },
  {
    name: 'ferrous',
    ocean: [
      [0.3, 26, 14, 12],
      [0.48, 46, 24, 18],
      [0.555, 70, 36, 24],
    ],
    land: [
      [0.555, 118, 56, 34],
      [0.65, 146, 78, 44],
      [0.74, 172, 102, 58],
      [0.83, 194, 128, 82],
      [1.05, 214, 158, 110],
    ],
    sheen: [230, 160, 110],
    atmo: [232, 158, 116],
    atmoDeep: [110, 52, 40],
    cloudTints: ['#e8d8c4', '#d4bfa4', '#f4ece0'],
  },
  {
    // one solid ice shell, pole to pole — no open ocean. The "low" ramp is
    // older compressed blue-grey ice, the "high" ramp fresh snow pack; the
    // whole body stays monotone and the crevasse veins carry the detail.
    name: 'ice',
    ocean: [
      [0.3, 88, 124, 166],
      [0.48, 112, 150, 190],
      [0.555, 134, 172, 210],
    ],
    land: [
      [0.555, 150, 188, 222],
      [0.65, 172, 206, 234],
      [0.74, 192, 222, 242],
      [0.83, 210, 234, 250],
      [1.05, 234, 246, 254],
    ],
    sheen: [175, 218, 245],
    atmo: [150, 208, 248],
    atmoDeep: [44, 84, 158],
    cloudTints: ['#dcecf8', '#c6dcf0', '#eef7fd'],
    cracks: 0.42,
  },
  {
    name: 'hyper',
    ocean: [
      [0.3, 16, 26, 12],
      [0.48, 30, 48, 20],
      [0.555, 52, 80, 32],
    ],
    land: [
      [0.555, 92, 120, 38],
      [0.65, 126, 148, 46],
      [0.74, 162, 174, 56],
      [0.83, 194, 194, 70],
      [1.05, 220, 212, 96],
    ],
    sheen: [190, 220, 120],
    atmo: [172, 224, 128],
    atmoDeep: [64, 102, 44],
    cloudTints: ['#dce8c8', '#c8d8b0', '#eef4e0'],
  },
  {
    name: 'quant',
    ocean: [
      [0.3, 20, 14, 40],
      [0.48, 36, 26, 66],
      [0.555, 58, 44, 98],
    ],
    land: [
      [0.555, 100, 72, 138],
      [0.65, 128, 96, 160],
      [0.74, 156, 122, 180],
      [0.83, 182, 150, 198],
      [1.05, 208, 180, 216],
    ],
    sheen: [200, 170, 230],
    atmo: [190, 156, 236],
    atmoDeep: [78, 52, 120],
    cloudTints: ['#e2d8ec', '#cfc2de', '#f0eaf6'],
  },
  {
    // a cooled-basalt world cracked open by magma: no water, the whole crust
    // is dark rock and all the light lives in the emissive fracture veins.
    // Ash-grey cloud decks drift over the molten channels.
    name: 'molten',
    ocean: [
      [0.3, 16, 11, 9],
      [0.48, 26, 18, 14],
      [0.555, 38, 26, 20],
    ],
    land: [
      [0.555, 46, 33, 27],
      [0.65, 58, 42, 34],
      [0.74, 52, 37, 30],
      [0.83, 40, 28, 23],
      [1.05, 28, 19, 15],
    ],
    sheen: [235, 138, 68],
    atmo: [240, 138, 72],
    atmoDeep: [120, 40, 24],
    cloudTints: ['#5a4a42', '#43332c', '#6a564c'],
    cracks: 0.62,
    moltenColor: [255, 92, 22],
    moltenGlow: 2.8,
  },
]
function rampColor(ramp: Ramp, h: number): [number, number, number] {
  if (h <= ramp[0][0]) return [ramp[0][1], ramp[0][2], ramp[0][3]]
  for (let i = 1; i < ramp.length; i++) {
    if (h < ramp[i][0]) {
      const t = (h - ramp[i - 1][0]) / (ramp[i][0] - ramp[i - 1][0])
      return [
        ramp[i - 1][1] + (ramp[i][1] - ramp[i - 1][1]) * t,
        ramp[i - 1][2] + (ramp[i][2] - ramp[i - 1][2]) * t,
        ramp[i - 1][3] + (ramp[i][3] - ramp[i - 1][3]) * t,
      ]
    }
  }
  const last = ramp[ramp.length - 1]
  return [last[1], last[2], last[3]]
}
// the coastline is a blend, not a cut — from orbit the shore dissolves into
// shallows and haze; a hard switch reads as vector art
const COAST_BLEND = 0.016
export function terrainColor(pal: WorldPalette, h: number): [number, number, number] {
  if (h <= SEA_LEVEL - COAST_BLEND) return rampColor(pal.ocean, h)
  if (h >= SEA_LEVEL + COAST_BLEND) return rampColor(pal.land, h)
  const t = (h - (SEA_LEVEL - COAST_BLEND)) / (COAST_BLEND * 2)
  const a = rampColor(pal.ocean, SEA_LEVEL)
  const b = rampColor(pal.land, SEA_LEVEL)
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const u = clamp01(t)
  return `${Math.round(a[0] + (b[0] - a[0]) * u)}, ${Math.round(a[1] + (b[1] - a[1]) * u)}, ${Math.round(
    a[2] + (b[2] - a[2]) * u,
  )}`
}

function paintNebula(cv: AnyCanvas, brushes: Brushes, rnd: () => number, p: SceneParams) {
  const g = get2d(cv)
  const { width: W, height: H } = cv
  g.clearRect(0, 0, W, H)
  // nebula clusters, ballNebula1-style: many low-alpha cloud stamps
  const clusters: Array<[number, number, number, string, number]> = [
    [W * 0.18, H * 0.72, W * 0.15, '#173447', 120], // teal drift, lower left
    [W * 0.44, H * 0.18, W * 0.11, '#121f3d', 80], // deep blue, upper middle
    [W * 0.66, H * 0.86, W * 0.11, '#1d2440', 70], // violet-blue, lower right
    [W * 0.82, H * 0.3, W * 0.14, '#33220f', 100], // warm dust around the sun
  ]
  for (const [cx, cy, spread, color, count] of clusters) {
    const stamp = tinted(brushes.cloud, color)
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2
      const d = (rnd() + rnd()) * 0.5 * spread
      const x = cx + Math.cos(a) * d * 1.6
      const y = cy + Math.sin(a) * d
      const s = 3 + rnd() * 8
      g.save()
      g.translate(x, y)
      g.rotate(rnd() * Math.PI * 2)
      g.globalAlpha = 0.035 + rnd() * 0.06
      g.drawImage(stamp, (-stamp.width * s) / 2, (-stamp.height * s) / 2, stamp.width * s, stamp.height * s)
      g.restore()
    }
  }
  // the sun: one clean bright disc inside one smooth broad halo (the game's
  // sun reads as a crisp core, not layered rings)
  const sx = W * p.sunX
  const sy = H * p.sunY
  const halo = g.createRadialGradient(sx, sy, 0, sx, sy, W * 0.46)
  halo.addColorStop(0, 'rgba(255, 150, 80, 0.72)')
  halo.addColorStop(0.12, 'rgba(246, 130, 66, 0.46)')
  halo.addColorStop(0.34, 'rgba(230, 110, 52, 0.25)')
  halo.addColorStop(0.65, 'rgba(206, 96, 42, 0.12)')
  halo.addColorStop(1, 'rgba(190, 85, 36, 0.04)')
  g.fillStyle = halo
  g.fillRect(0, 0, W, H)
  // the disc itself: near-solid fill with only a hair of edge softness —
  // a clean circle, not a fuzzy bloom
  const coreR = 20
  const core = g.createRadialGradient(sx, sy, 0, sx, sy, coreR)
  core.addColorStop(0, '#fff9e6')
  core.addColorStop(0.82, '#fff3c8')
  core.addColorStop(0.94, 'rgba(255, 224, 150, 0.95)')
  core.addColorStop(1, 'rgba(255, 190, 110, 0)')
  g.fillStyle = core
  g.beginPath()
  g.arc(sx, sy, coreR, 0, Math.PI * 2)
  g.fill()
}

function paintFarStars(cv: AnyCanvas, brushes: Brushes, rnd: () => number, _p: SceneParams) {
  const g = get2d(cv)
  const { width: W, height: H } = cv
  g.clearRect(0, 0, W, H)
  const tints = ['#ffffff', '#dfe8ff', '#ffe9c8', '#c8d8ff']
  const n = Math.round((W * H) / 2600)
  for (let i = 0; i < n; i++) {
    const x = rnd() * W
    const y = rnd() * H
    g.globalAlpha = 0.18 + rnd() * 0.45
    if (rnd() < 0.85) {
      // bgStar1: a single pixel
      g.fillStyle = tints[(rnd() * tints.length) | 0]
      g.fillRect(x, y, 1, 1)
    } else {
      // bgStarSmall1: the 3px cross dot
      g.drawImage(tinted(brushes.small, tints[(rnd() * tints.length) | 0]), x, y)
    }
  }
  g.globalAlpha = 1
}

/** The big backlit world, menu-art style. Two texture layers wrap the whole
 * sphere — earthen terrain below, clouds above — with stamps foreshortened
 * radially near the limb (spherical deformation). Illumination is a thin
 * crescent toward the sun; an anti-sun shadow keeps the visible face dark.
 * The "glow" is atmosphere catching light: a soft inner band plus a thin
 * crisp rim line, not thick strokes. */
function paintPlanet(cv: AnyCanvas, brushes: Brushes, _rnd: () => number, p: SceneParams) {
  const g = get2d(cv)
  const { width: W, height: H } = cv
  g.clearRect(0, 0, W, H)
  // the world is seeded: rerolling p.seed re-scatters clouds and shifts the
  // terrain noise to a fresh region of the field — a brand-new planet
  const rnd = mulberry32((158 ^ Math.imul(p.seed | 0, 2654435761)) >>> 0)
  const pal = PALETTES[((p.palette | 0) % PALETTES.length + PALETTES.length) % PALETTES.length]
  const sr = mulberry32((p.seed | 0) * 48271 + 11)
  const ox = 11.7 + sr() * 191
  const oy = 5.3 + sr() * 191
  const oz = 23.1 + sr() * 191
  const cx = W * p.planetX
  const cy = H * p.planetY
  const R = H * p.planetR
  const sunAng = Math.atan2(H * p.sunY - cy, W * p.sunX - cx)

  // crescent geometry, moon-style: light the whole limb, then carve the
  // night with a big shadow circle offset anti-sunward. Its edge is the
  // terminator; the lit crescent wraps the planet and runs deepest at the
  // sun-nearest point.
  const shOff = R * 0.52
  const shx = cx - Math.cos(sunAng) * shOff
  const shy = cy - Math.sin(sunAng) * shOff
  const shR = R * 1.16
  /** 0 = deep night, 1 = fully lit (distance past the terminator edge) */
  const lightAt = (x: number, y: number) => {
    const ds = Math.hypot(x - shx, y - shy)
    return clamp01((ds - shR * 0.9) / (shR * 0.18)) ** 1.25
  }

  // --- per-pixel terrain: fractal noise sampled on the sphere's normals
  // gives coherent continents that wrap the globe; each pixel is lit by the
  // crescent geometry, with a whisper of ambient so the night isn't void
  const size = Math.ceil(R * 2) + 2
  const x0 = Math.round(cx - R) - 1
  const y0 = Math.round(cy - R) - 1
  const off = makeScratch(size, size)
  const og = get2d(off)
  const img = og.createImageData(size, size)
  const data = img.data
  const freq = 3.1 * p.terrainScale
  const detailFreq = freq * 4.7
  const contrast = 0.5 + 0.5 * p.terrain
  const ambient = 0.05
  const sheen = pal.sheen
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = (px + x0 - cx) / R
      const ny = (py + y0 - cy) / R
      const rr = nx * nx + ny * ny
      if (rr > 1) continue
      const nz = Math.sqrt(1 - rr)
      // height field on the sphere
      let h = fbm3(nx * freq + ox, ny * freq + oy, nz * freq + oz, 4)
      h = 0.5 + (h - 0.5) * 1.9 * contrast
      // fray the height with two scales of fine noise so coastlines are
      // ragged fractal edges — a smooth low-freq field alone gives clean
      // vector-looking shores no real terrain has
      const dn = noise3(nx * detailFreq + ox, ny * detailFreq + oy, nz * detailFreq + oz)
      const dn2 = noise3(nx * detailFreq * 2.6 + oy, ny * detailFreq * 2.6 + oz, nz * detailFreq * 2.6 + ox)
      h += (dn - 0.5) * 0.075 + (dn2 - 0.5) * 0.035
      const base = terrainColor(pal, h)
      // crevasses: dark veins along the zero-contours of two noise fields —
      // a coarse net of major fractures plus a fine crackle between them.
      // They darken toward crevasse-shadow blue (red channel dies fastest).
      // fracture veins: dark crevasses on an ice world, glowing magma on a
      // lava one — same geometry, opposite optics. `hot` accumulates the
      // emissive term for the molten case, added below and NOT dimmed by the
      // night side so the lava network lights the whole globe.
      let hot = 0
      if (pal.cracks) {
        // fine lineae — hairline at planet scale, so the veining reads as
        // a vast fracture network rather than doodles on a bauble
        const c1 = Math.abs(fbm3(nx * freq * 4.6 + oz, ny * freq * 4.6 + ox, nz * freq * 4.6 + oy, 3) - 0.5)
        const c2 = Math.abs(noise3(nx * freq * 13 + oy, ny * freq * 13 + oz, nz * freq * 13 + ox) - 0.5)
        const vein = Math.max(
          Math.max(0, 1 - c1 / 0.024) ** 1.6,
          Math.max(0, 1 - c2 / 0.026) ** 1.6 * 0.45,
        )
        if (pal.moltenColor) {
          // sharpen so the glow lives in the fracture cores, not a haze; the
          // additive orange clips R→G→B in turn, so hotter channels read
          // red → orange → yellow → white-hot at the widest rifts
          hot = vein ** 1.25 * pal.cracks * (pal.moltenGlow ?? 1)
        } else {
          // dark crevasses diffuse into the ice around them
          const s = vein * pal.cracks
          base[0] *= 1 - s
          base[1] *= 1 - s * 0.85
          base[2] *= 1 - s * 0.6
        }
      }
      // polar ice: snow packs in toward the disc's top and bottom (the poles),
      // its edge frayed by the detail noise so it isn't a clean latitude line.
      // Earth-like worlds carry caps; most others leave this off.
      if (pal.iceCaps) {
        const lat = Math.abs(ny) + (dn - 0.5) * 0.1
        const cap = clamp01((lat - 0.8) / 0.12) ** 1.5 * pal.iceCaps
        if (cap > 0) {
          base[0] += (236 - base[0]) * cap
          base[1] += (244 - base[1]) * cap
          base[2] += (252 - base[2]) * cap
        }
      }
      // fine surface texture inside each zone
      const detail = 0.86 + 0.28 * dn
      const light = lightAt(px + x0, py + y0)
      const nightMul = Math.max(1 - clamp01((1 - light) * 0.96 * p.dark), ambient)
      const glow = light * p.crescent
      const i = (py * size + px) * 4
      const molten = pal.moltenColor
      for (let c = 0; c < 3; c++) {
        // terrain lit by the crescent, plus an atmosphere sheen; molten veins
        // add their own emissive light on top, day side and night alike
        let v = base[c] * detail * nightMul + sheen[c] * glow * 0.16
        if (molten) v += molten[c] * hot
        data[i + c] = Math.min(255, Math.round(v))
      }
      data[i + 3] = 255
    }
  }
  og.putImageData(img, 0, 0)

  g.save()
  g.beginPath()
  g.arc(cx, cy, R, 0, Math.PI * 2)
  g.clip()
  g.drawImage(off, x0, y0)

  // spherically deformed stamp: compress along the radial axis near the limb
  const stampSphere = (
    stamp: AnyCanvas,
    a: number,
    d: number,
    s: number,
    alpha: number,
    flipSign: number,
    ox = 0,
    oy = 0,
  ) => {
    const x = cx + Math.cos(a) * d + ox
    const y = cy + Math.sin(a) * d + oy
    const fore = Math.max(0.35, Math.sqrt(Math.max(0, 1 - (d / R) ** 2)))
    g.save()
    g.translate(x, y)
    g.rotate(a) // radial axis becomes local x
    g.scale(fore, flipSign)
    g.globalAlpha = alpha
    g.drawImage(stamp, (-stamp.width * s) / 2, (-stamp.height * s) / 2, stamp.width * s, stamp.height * s)
    g.restore()
  }
  // clouds cast shadow anti-sunward onto the terrain below
  const shadowDx = -Math.cos(sunAng)
  const shadowDy = -Math.sin(sunAng)

  // --- cloud layer: weather systems, not uniform sprinkle — elongated
  // cluster fronts, each a swarm of tiny wisps; tops catch the light so
  // clouds carry only a whisper of shadow
  // more cover doesn't just densify the same fronts — new weather systems
  // appear as the slider climbs, so heavy cover actually blankets the globe
  const frontCount = Math.max(8, Math.round(46 * Math.sqrt(Math.max(0.1, p.clouds))))
  // light cover clings to the lit crescent where it reads best; heavy cover
  // is a global weather system and spreads across the night side too
  const litFrac = Math.max(0.35, 0.7 - Math.max(0, p.clouds - 1) * 0.08)
  // global circulation: one seeded prevailing wind per world, bending in
  // zonal bands by latitude — every front flows with its neighbors instead
  // of streaking off in unrelated directions
  const windAng = sr() * Math.PI * 2
  const windPhase = sr() * Math.PI * 2
  const fronts = Array.from({ length: frontCount }, () => {
    const litBiased = rnd() < litFrac
    const a = litBiased ? sunAng + (rnd() - 0.5) * 1.7 : rnd() * Math.PI * 2
    const d = litBiased ? R * (0.45 + rnd() * 0.5) : R * Math.sqrt(rnd()) * 0.92
    const lat = (Math.sin(a) * d) / R // -1..1, disc-vertical as latitude proxy
    return {
      a,
      d,
      dir: windAng + Math.sin(lat * 3.6 + windPhase) * 0.55 + (rnd() - 0.5) * 0.3,
      len: R * (0.08 + rnd() * 0.2),
      wid: R * (0.015 + rnd() * 0.04),
    }
  })
  // cumulus cores: each front carries a mass of larger puffs beneath the
  // wisp texture — these are what read as "clouds" from orbit. Same steep
  // light response: they billow bright at the limb and die into the night.
  const core = densePuff(brushes.cloud, pal.cloudTints[2])
  const coreShadow = densePuff(brushes.cloud, '#06101a')
  for (const f of fronts) {
    const n = 5 + ((rnd() * 9) | 0)
    for (let i = 0; i < n; i++) {
      const t = (rnd() + rnd() - 1) * 0.9
      const u = (rnd() + rnd() - 1) * 0.9
      const x = cx + Math.cos(f.a) * f.d + Math.cos(f.dir) * t * f.len - Math.sin(f.dir) * u * f.wid * 1.6
      const y = cy + Math.sin(f.a) * f.d + Math.sin(f.dir) * t * f.len + Math.cos(f.dir) * u * f.wid * 1.6
      const d = Math.hypot(x - cx, y - cy)
      if (d > R * 0.985) continue
      const ca = Math.atan2(y - cy, x - cx)
      const s = (0.3 + rnd() * 0.45) * p.cloudSize
      const light = lightAt(x, y)
      const alpha = (0.006 + (0.3 + rnd() * 0.22) * light) * p.cloudAlpha
      const flip = rnd() < 0.5 ? 1 : -1
      if (alpha < 0.015) continue
      const off = 2 + s
      stampSphere(coreShadow, ca, d, s, clamp01(alpha * 0.3), flip, shadowDx * off, shadowDy * off)
      stampSphere(core, ca, d, s, clamp01(alpha), flip)
    }
  }
  const cloudLayers: Array<[string, number]> = [
    [pal.cloudTints[0], 950],
    [pal.cloudTints[1], 720],
    [pal.cloudTints[2], 520],
  ]
  for (const [color, count] of cloudLayers) {
    const stamp = tinted(brushes.cloud, color)
    const shadow = tinted(brushes.cloud, '#06101a')
    for (let i = 0; i < Math.round(count * p.clouds); i++) {
      const f = fronts[(rnd() * fronts.length) | 0]
      const t = rnd() + rnd() - 1 // dense middle, thin ends
      const u = rnd() + rnd() - 1
      const x = cx + Math.cos(f.a) * f.d + Math.cos(f.dir) * t * f.len - Math.sin(f.dir) * u * f.wid
      const y = cy + Math.sin(f.a) * f.d + Math.sin(f.dir) * t * f.len + Math.cos(f.dir) * u * f.wid
      const d = Math.hypot(x - cx, y - cy)
      if (d > R * 0.99) continue
      const a = Math.atan2(y - cy, x - cx)
      // tiny wisps — a planet's clouds are specks at this distance
      const s = (0.12 + rnd() * 0.28) * p.cloudSize
      const light = lightAt(x, y)
      // steep light response: lit wisps flare, night wisps barely whisper —
      // the sun has to own the cloud tops or the sphere reads flat. In the
      // deep night the floor sits below the draw threshold: clouds go dark.
      const alpha = (0.007 + (0.35 + rnd() * 0.25) * light) * p.cloudAlpha
      const flip = rnd() < 0.5 ? 1 : -1
      if (alpha < 0.015) continue // invisible in the deep night — skip the draw
      // clouds ride high: their shadow falls onto the terrain below
      const off = 1.4 + s * 0.9
      stampSphere(shadow, a, d, s, clamp01(alpha * 0.32), flip, shadowDx * off, shadowDy * off)
      stampSphere(stamp, a, d, s, clamp01(alpha), flip)
    }
  }

  g.restore()

  // --- atmosphere: each band is ONE continuous arc stroked with a conic
  // gradient — color rides the light (warm white at the sun-nearest point,
  // through cyan, into deep blue toward the night side) and the band
  // breathes via smooth sine modulation baked into the gradient's alpha
  // stops. One stroke per pass means no segment seams: the old abutting-
  // segments approach doubled its alpha at every joint once the band got
  // wide enough to see.
  const WARM: [number, number, number] = [255, 233, 195]
  const atmoColor = (prox: number) =>
    prox > 0.68
      ? lerpColor(pal.atmo, WARM, (prox - 0.68) / 0.32)
      : lerpColor(pal.atmoDeep, pal.atmo, prox / 0.68)
  const wrap = 2.55 // radians each side of the sun point
  const bphase1 = sr() * Math.PI * 2
  const bphase2 = sr() * Math.PI * 2
  const passes: Array<{ r: number; w: number; a: number; jitter: boolean }> = [
    { r: R - 3.5, w: 7, a: 0.11 * p.halo, jitter: true }, // inner scatter, on the disc
    { r: R + 0.4, w: 2, a: 0.7 * p.rim, jitter: false }, // the crisp line — continuous
    { r: R + 3.2, w: 4.2, a: 0.1 * p.halo, jitter: true }, // outer sliver
  ]
  const STOPS = 140
  const span = (wrap * 2) / (Math.PI * 2) // band's share of the full turn
  for (const pass of passes) {
    const grad = g.createConicGradient(sunAng - wrap, cx, cy)
    for (let i = 0; i <= STOPS; i++) {
      const rel = -wrap + (i / STOPS) * wrap * 2
      const prox = Math.max(0, Math.cos(rel * 0.62))
      const breathA = pass.jitter
        ? 0.82 + 0.18 * Math.sin(rel * 7.3 + bphase1) + 0.1 * Math.sin(rel * 16.7 + bphase2)
        : 1
      const a = prox < 0.03 ? 0 : clamp01(pass.a * (0.18 + 0.82 * prox) * breathA)
      grad.addColorStop((i / STOPS) * span, `rgba(${atmoColor(prox)}, ${a})`)
    }
    // the rest of the turn (behind the night side) stays fully transparent
    grad.addColorStop(Math.min(1, span + 0.002), 'rgba(0, 0, 0, 0)')
    g.strokeStyle = grad
    g.lineWidth = pass.w
    g.beginPath()
    g.arc(cx, cy, pass.r, sunAng - wrap, sunAng + wrap)
    g.stroke()
  }
}

export const LAYER_KEYS = ['nebula', 'far-stars', 'planet'] as const
export type LayerKey = (typeof LAYER_KEYS)[number]

const PAINTERS: Record<
  LayerKey,
  { fn: (cv: AnyCanvas, b: Brushes, rnd: () => number, p: SceneParams) => void; seed: number }
> = {
  nebula: { fn: paintNebula, seed: 20260707 },
  'far-stars': { fn: paintFarStars, seed: 977 },
  planet: { fn: paintPlanet, seed: 158 },
}

/** Paint one layer onto a canvas (worker OffscreenCanvas or on-screen) that has
 * already been sized. Seeds match the original per-layer values. */
export function renderLayer(cv: AnyCanvas, key: LayerKey, brushes: Brushes, params: SceneParams) {
  const { fn, seed } = PAINTERS[key]
  fn(cv, brushes, mulberry32(seed), params)
}
