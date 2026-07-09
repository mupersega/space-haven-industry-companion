import { useEffect, useRef, useState } from 'react'

// Seven-segment layout: a top, b top-right, c bottom-right, d bottom,
// e bottom-left, f top-left, g middle.
const SEGMENTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  a: { x: 4, y: 0, w: 14, h: 4 },
  b: { x: 18, y: 3, w: 4, h: 15 },
  c: { x: 18, y: 22, w: 4, h: 15 },
  d: { x: 4, y: 36, w: 14, h: 4 },
  e: { x: 0, y: 22, w: 4, h: 15 },
  f: { x: 0, y: 3, w: 4, h: 15 },
  g: { x: 4, y: 18, w: 14, h: 4 },
}

const DIGIT_SEGS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcfgd',
}

function BellIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1.5A4.5 4.5 0 0 0 3.5 6v2.6L2.2 11a.8.8 0 0 0 .7 1.2h10.2a.8.8 0 0 0 .7-1.2l-1.3-2.4V6A4.5 4.5 0 0 0 8 1.5zM6.5 13.5a1.5 1.5 0 0 0 3 0z" />
    </svg>
  )
}

function Digit({ value }: { value: string }) {
  const lit = DIGIT_SEGS[value] ?? ''
  return (
    <svg className="seg-digit" viewBox="0 0 22 40" width="16" height="29" aria-hidden>
      {Object.entries(SEGMENTS).map(([name, s]) => (
        <rect
          key={name}
          className={lit.includes(name) ? 'seg on' : 'seg'}
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          rx="1.5"
        />
      ))}
    </svg>
  )
}

interface ClockTime {
  hh: string
  mm: string
  ss: string
  tick: boolean
}

/** The viewer's own local wall-clock time. */
function localParts(date = new Date()): ClockTime {
  const pad = (n: number) => String(n).padStart(2, '0')
  const s = date.getSeconds()
  return { hh: pad(date.getHours()), mm: pad(date.getMinutes()), ss: pad(s), tick: s % 2 === 0 }
}

/** Epoch ms of the next occurrence of HH:MM on the local wall clock. */
function nextLocal(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  const target = new Date()
  target.setHours(h, m, 0, 0)
  if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1)
  return target.getTime()
}

const ALARM_KEY = 'shc-alarm-v1'

/** The alarm sound: a local sample, looped and faded in when the alarm fires. */
const ALARM_SRC = `${import.meta.env.BASE_URL}audio/alarmbell.mp3`

/** Max ring volume: the 5s fade-in lands here, not at full scale. */
const RING_PLATEAU = 0.55

function loadAlarm(): number | null {
  const raw = localStorage.getItem(ALARM_KEY)
  const at = raw ? Number(raw) : NaN
  return Number.isFinite(at) && at > Date.now() ? at : null
}

export function SegClock() {
  const [time, setTime] = useState(localParts)
  const [alarmAt, setAlarmAt] = useState<number | null>(loadAlarm)
  const [open, setOpen] = useState(false)
  const [ringing, setRinging] = useState(false)
  const [custom, setCustom] = useState('')
  /** 0..1 wobble intensity during the 5s wind-up before the alarm fires */
  const [warm, setWarm] = useState<number | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const alarmRef = useRef(alarmAt)
  alarmRef.current = alarmAt

  useEffect(() => {
    if (alarmAt) localStorage.setItem(ALARM_KEY, String(alarmAt))
    else localStorage.removeItem(ALARM_KEY)
  }, [alarmAt])

  useEffect(() => {
    const t = setInterval(() => {
      setTime(localParts())
      const at = alarmRef.current
      if (at !== null) {
        const left = at - Date.now()
        if (left <= 0) {
          setAlarmAt(null)
          setWarm(null)
          setRinging(true)
        } else {
          // last 5 seconds: wind the wobble up from gentle to frantic
          setWarm(left <= 5200 ? Math.min(1, (5200 - left) / 5000) : null)
        }
      } else {
        setWarm(null)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // ring: the alarm sample on loop, fading in from near-silence to full
  // volume over the first 5 seconds; give up after 90s
  useEffect(() => {
    if (!ringing) return
    const ctx = audioRef.current
    const buffer = bufferRef.current
    if (!ctx || !buffer) return
    const master = ctx.createGain()
    const t = ctx.currentTime
    master.gain.setValueAtTime(0.03, t)
    master.gain.exponentialRampToValueAtTime(RING_PLATEAU, t + 5)
    master.connect(ctx.destination)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.connect(master)
    src.start()
    const stop = setTimeout(() => setRinging(false), 90_000)
    return () => {
      clearTimeout(stop)
      try {
        src.stop()
      } catch {
        // already stopped
      }
      src.disconnect()
      master.disconnect()
    }
  }, [ringing])

  // arm the audio context while we still have a user gesture, and decode the
  // alarm sample now so it's ready to loop the moment the alarm fires
  const ensureAudio = () => {
    const ctx = (audioRef.current ??= new AudioContext())
    void ctx.resume()
    if (!bufferRef.current) {
      fetch(ALARM_SRC)
        .then((r) => r.arrayBuffer())
        .then((raw) => ctx.decodeAudioData(raw))
        .then((decoded) => {
          bufferRef.current = decoded
        })
        .catch(() => {
          // no audio: the overlay still fires, just silently
        })
    }
  }

  const arm = (at: number) => {
    ensureAudio()
    setAlarmAt(at)
    setOpen(false)
    setCustom('')
  }

  const alarmLabel = alarmAt ? localParts(new Date(alarmAt)) : null
  const wobble = ringing ? 1 : warm

  return (
    <div className="seg-clock">
      <div
        className={`seg-row${wobble !== null ? ' wobble' : ''}`}
        style={wobble !== null ? ({ '--wob': `${(0.5 + wobble * 2.5).toFixed(2)}deg` } as React.CSSProperties) : undefined}
        role="timer"
        aria-label={`Local time ${time.hh}:${time.mm}`}
        data-time={`${time.hh}:${time.mm}`}
      >
        <Digit value={time.hh[0]} />
        <Digit value={time.hh[1]} />
        <div className={`seg-colon${time.tick ? ' on' : ''}`} aria-hidden>
          <span />
          <span />
        </div>
        <Digit value={time.mm[0]} />
        <Digit value={time.mm[1]} />
        {alarmLabel ? (
          <button
            className="alarm-chip set nodrag"
            data-tip={`Alarm ${alarmLabel.hh}:${alarmLabel.mm}, click to cancel`}
            onClick={() => setAlarmAt(null)}
          >
            <BellIcon size={8} />
          </button>
        ) : (
          <button className="alarm-chip nodrag" data-tip="Set an alarm" onClick={() => setOpen((o) => !o)}>
            <BellIcon size={8} />
          </button>
        )}
      </div>
      {open && !alarmAt && (
        <div className="alarm-pop">
          <div className="panel-eyebrow">alarm</div>
          <div className="alarm-presets">
            {[5, 10, 15].map((m) => (
              <button key={m} className="use-default" onClick={() => arm(Date.now() + m * 60_000)}>
                +{m}m
              </button>
            ))}
          </div>
          <div className="alarm-custom">
            <input
              className="price-input alarm-time"
              type="time"
              value={custom}
              onChange={(ev) => setCustom(ev.target.value)}
            />
            <button
              className="use-default"
              disabled={!/^\d\d:\d\d$/.test(custom)}
              onClick={() => arm(nextLocal(custom))}
            >
              set
            </button>
          </div>
        </div>
      )}
      {ringing && (
        <div className="alarm-overlay" onClick={() => setRinging(false)}>
          <div className="alarm-box" onClick={(ev) => ev.stopPropagation()}>
            <div className="alarm-title">
              <BellIcon size={13} /> alarm
            </div>
            <div className="alarm-time-big mono">
              {time.hh}:{time.mm}
            </div>
            <button className="reset-btn" onClick={() => setRinging(false)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
