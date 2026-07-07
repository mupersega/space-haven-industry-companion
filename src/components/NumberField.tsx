import { useEffect, useRef } from 'react'

interface NumberFieldProps {
  /** '' renders an empty input (placeholder shows) */
  value: number | ''
  /** null = cleared by the user */
  onChange: (value: number | null) => void
  min?: number
  step?: number
  className?: string
  placeholder?: string
  title?: string
}

/**
 * Number input that also steps on mouse wheel (±step per notch).
 * `nowheel` keeps React Flow from zooming the canvas underneath.
 */
export function NumberField({
  value,
  onChange,
  min = 0,
  step = 1,
  className = '',
  placeholder,
  title,
}: NumberFieldProps) {
  const ref = useRef<HTMLInputElement>(null)
  const latest = useRef({ value, onChange, min, step })
  latest.current = { value, onChange, min, step }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      const { value, onChange, min, step } = latest.current
      // modifier accelerators: ctrl ×10, shift ×5 (preventDefault also stops ctrl+wheel browser zoom)
      const factor = ev.ctrlKey ? 10 : ev.shiftKey ? 5 : 1
      const base = typeof value === 'number' ? value : 0
      const next = Math.max(min, Math.round((base + (ev.deltaY < 0 ? step : -step) * factor) * 100) / 100)
      onChange(next)
    }
    // React's onWheel is passive; preventDefault needs a native non-passive listener
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <input
      ref={ref}
      className={`price-input nowheel nodrag ${className}`}
      type="number"
      min={min}
      step={step}
      value={value}
      placeholder={placeholder}
      title={title}
      onChange={(ev) => {
        const raw = ev.target.value
        if (raw === '') onChange(null)
        else onChange(Math.max(min, Number(raw) || 0))
      }}
    />
  )
}
