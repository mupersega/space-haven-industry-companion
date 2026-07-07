import { delegate } from 'tippy.js'
import 'tippy.js/dist/tippy.css'

/** One event-delegated tippy for the whole app: any element with a
 * `data-tip` attribute gets a themed tooltip — no per-component wiring.
 * Content is re-read on every trigger so dynamic tips (alarm state,
 * facility built/not-built) stay current without re-mounting. */
export function initTooltips() {
  delegate(document.body, {
    target: '[data-tip]',
    theme: 'bridge',
    delay: [350, 40],
    duration: [120, 80],
    offset: [0, 8],
    maxWidth: 260,
    allowHTML: false,
    content: (ref) => ref.getAttribute('data-tip') ?? '',
    onTrigger: (instance, event) => {
      const el = (event.currentTarget as Element | null)?.closest?.('[data-tip]')
      const tip = el?.getAttribute('data-tip')
      if (tip) instance.setContent(tip)
    },
  })
}
