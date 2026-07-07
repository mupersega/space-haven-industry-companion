import { useEffect, useRef, useState } from 'react'
import { DEFAULT_GLOWS } from '../data/defaultGlows'
import { GlowEditor, type GlowMap } from './GlowEditor'
import { SceneTuner } from './SceneTuner'
import { ShipSprite } from './ShipSprite'
import { DEFAULT_SCENE, SpaceBackdrop, type SceneParams } from './SpaceBackdrop'

const WELCOME_KEY = 'shc-welcome-v1'
const SCENE_KEY = 'shc-scene-v1'
const GLOW_KEY = 'shc-glows-v1'

function loadGlows(): GlowMap {
  try {
    const raw = localStorage.getItem(GLOW_KEY)
    // the shipped fleet dressing unless this browser has authored its own
    const map = raw ? (JSON.parse(raw) as GlowMap) : structuredClone(DEFAULT_GLOWS)
    // marks authored with the old washed-out swatches pick up the saturated
    // colors without re-authoring
    const RECOLOR: Record<string, string> = {
      '#7de0d0': '#28e2cc',
      '#14e8cf': '#28e2cc',
      '#8dff57': '#66ff21',
      '#ffb454': '#ffa514',
      '#ff9a54': '#ff7a14',
      '#7aa7ff': '#2979ff',
      '#ff6b7a': '#ff3d55',
    }
    for (const marks of Object.values(map)) {
      for (const m of marks) m.color = RECOLOR[m.color] ?? m.color
    }
    return map
  } catch {
    return {}
  }
}

function loadScene(): SceneParams {
  try {
    const raw = localStorage.getItem(SCENE_KEY)
    return raw ? { ...DEFAULT_SCENE, ...JSON.parse(raw) } : { ...DEFAULT_SCENE }
  } catch {
    return { ...DEFAULT_SCENE }
  }
}

export function welcomeAcknowledged(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === 'ack'
  } catch {
    return true
  }
}

const BASE = import.meta.env.BASE_URL

/** A ship in the scene: sprite, offset (%) from the fleet anchor, width (px),
 * parallax depth, float timing */
interface ShipSpec {
  src: string
  dx: number
  dy: number
  width: number
  depth: number
  drift: number // seconds per float cycle
  delay: number
  /** mirror horizontally */
  flip?: boolean
}

// formation matched to the game's main-menu key art: the flagship vast and
// nearest, spanning the frame center-left; a freighter running high above;
// strays scattered off the port side; two escorts trailing low; a distant
// pair silhouetted against the planet's limb. All offsets from the fleet
// anchor so fleetX/fleetY still moves the whole scene.
// the key-art arrangement, shifted a third of the frame right so the fleet
// clears the logo and warning copy on the left
const SHIPS: ShipSpec[] = [
  // freighter riding the planet's lit limb
  { src: 'ship-hf1', dx: 18, dy: 1, width: 190, depth: 28, drift: 13, delay: 3.0, flip: true },
  // tiny scout running point, front and centre of the fleet
  { src: 'ship-fs3', dx: 12, dy: 16, width: 46, depth: 12, drift: 11, delay: 0.5 },
  // small stray off the port beam
  { src: 'ship-fs2', dx: -21, dy: 19, width: 56, depth: 14, drift: 13, delay: 2.1 },
  // escort below the flagship's engines, on the dark face
  { src: 'ship-hf2', dx: -5, dy: 23, width: 90, depth: 22, drift: 12, delay: 4.2, flip: true },
  // chunky escort, bottom left of the group
  { src: 'ship-hf1', dx: -14, dy: 30, width: 140, depth: 30, drift: 14, delay: 5.5, flip: true },
  // trailing escort, bottom middle
  { src: 'ship-hf2', dx: 14, dy: 35, width: 120, depth: 26, drift: 12, delay: 1.6, flip: true },
  // distant pair, small against the far side
  { src: 'ship-fs3', dx: 24, dy: 18, width: 44, depth: 10, drift: 10, delay: 2.8 },
  { src: 'ship-fs2', dx: 28, dy: 24, width: 40, depth: 10, drift: 11, delay: 4.9 },
  // the flagship — vast and nearest, crossing in front of the planet
  { src: 'ship-colony', dx: -17, dy: -14, width: 900, depth: 46, drift: 16, delay: 0 },
]

/**
 * First-visit spoiler gate, built from the game's own assets: the main-menu
 * skybox, the official logo, and the background-fleet sprites, layered with
 * a gentle mouse parallax. The ledger strips the economy of its mystery —
 * new players deserve one chance to keep it.
 */
export function WelcomeGate({ onEnter }: { onEnter: () => void }) {
  const [exiting, setExiting] = useState(false)
  const [scene, setScene] = useState<SceneParams>(loadScene)
  const [glows, setGlows] = useState<GlowMap>(loadGlows)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(SCENE_KEY, JSON.stringify(scene))
  }, [scene])
  useEffect(() => {
    localStorage.setItem(GLOW_KEY, JSON.stringify(glows))
  }, [glows])

  // the shimmer ticker: engine flicker and boost breathing at ~12Hz from a
  // single loop. Ambient FX don't need 60fps — and a second concurrent CSS
  // animation family alongside the drift forces Chromium off the compositor
  // fast path into main-thread frames, which is what spins laptop fans.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // setInterval, NOT a requestAnimationFrame loop: an rAF loop forces the
    // browser to produce a full frame every vsync even when the callback
    // does nothing — the frames themselves were the CPU cost. This way the
    // page only renders ~12 frames/s for the shimmer.
    const tick = () => {
      const t = performance.now() / 1000
      const cores = document.querySelectorAll<HTMLElement>('.wg-glow-core')
      for (let i = 0; i < cores.length; i++) {
        // uneven two-sine flicker, phase-scattered per element
        const s = i * 2.399
        const v = 0.86 + 0.13 * Math.sin(t * 3.7 + s) * Math.sin(t * 7.3 + s * 1.7)
        cores[i].style.opacity = v.toFixed(3)
      }
      const boosts = document.querySelectorAll<HTMLElement>('.wg-ship-boost')
      for (let i = 0; i < boosts.length; i++) {
        // slow independent breathe per boost
        const s = i * 1.618
        const v = 0.7 + 0.3 * Math.sin(t * (0.9 + (i % 5) * 0.13) + s)
        boosts[i].style.opacity = v.toFixed(3)
      }
    }
    const timer = setInterval(tick, 84)
    return () => clearInterval(timer)
  }, [])

  // mouse parallax: lerped CSS vars, layers translate by var * depth
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0
    const tick = () => {
      cx += (tx - cx) * 0.055
      cy += (ty - cy) * 0.055
      el.style.setProperty('--mx', cx.toFixed(4))
      el.style.setProperty('--my', cy.toFixed(4))
      raf =
        Math.abs(tx - cx) > 0.0005 || Math.abs(ty - cy) > 0.0005 ? requestAnimationFrame(tick) : 0
    }
    const onMove = (ev: MouseEvent) => {
      tx = (ev.clientX / window.innerWidth) * 2 - 1
      ty = (ev.clientY / window.innerHeight) * 2 - 1
      if (!raf) raf = requestAnimationFrame(tick)
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  const accept = () => {
    localStorage.setItem(WELCOME_KEY, 'ack')
    setExiting(true)
    // fire immediately: the app mounts beneath and the exit fade reveals it
    onEnter()
  }

  return (
    <div
      ref={ref}
      className={`welcome-gate${exiting ? ' exiting' : ''}`}
      role="dialog"
      aria-label="Spoiler warning"
    >
      <SpaceBackdrop params={scene} />
      <SceneTuner params={scene} onChange={setScene} />
      <GlowEditor glows={glows} onChange={setGlows} />
      {SHIPS.map((s, i) => {
        const left = scene.fleetX * 100 + s.dx
        const top = scene.fleetY * 100 + s.dy
        // unit vector from the ship toward the sun, in rough screen space
        // (viewport is wider than tall; weight x accordingly)
        const dx = (scene.sunX * 100 - left) * 1.7
        const dy = scene.sunY * 100 - top
        const len = Math.hypot(dx, dy) || 1
        return (
          <div key={`${s.src}-${i}`} className="wg-layer" style={{ '--d': s.depth } as React.CSSProperties}>
            <ShipSprite
              src={`${BASE}scene/${s.src}.png`}
              width={s.width}
              flip={s.flip}
              drift={s.drift}
              delay={s.delay}
              left={left}
              top={top}
              sunDx={dx / len}
              sunDy={dy / len}
              glows={glows[s.src] ?? []}
            />
          </div>
        )
      })}
      <div className="welcome-content">
        <img className="welcome-logo" src={`${BASE}scene/logo.png`} alt="Space Haven" draggable={false} />
        <div className="welcome-sub">Production Ledger</div>
        <p className="welcome-warning">
          <strong>Fair warning: numbers ahead.</strong> This tool lays the game's economy bare — exact
          recipes, true trade values, and the margin on every rifle you'll ever fabricate. That knowledge
          is discovery Space Haven means you to earn out in the black, and seeing it here first can dim
          the wonder of it.
        </p>
        <p className="welcome-warning welcome-soft">
          New to the game? Consider holding off and finding out the hard way — it's worth it.
        </p>
        <div className="welcome-actions">
          <button className="welcome-enter" onClick={accept}>
            I know what I'm doing — board
          </button>
        </div>
      </div>
    </div>
  )
}
