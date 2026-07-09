import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export const TOUR_KEY = 'shc-tour-v1'

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === 'done'
  } catch {
    return true
  }
}

/** One lap around the ledger's workflow.
 *
 * `guided` (the very first run, empty board): step one highlights the Rifle
 * row and has NO next button — the visitor must actually click it. The
 * click assembles the rifle chain, which guarantees every later stop has a
 * real element to point at. Escape and the ✕ stay available as off-ramps.
 * Replays (and boards that already have orders) get the classic tour. */
// step indices, so the click triggers below don't drift if steps move
const STEP_RIFLE = 0
const STEP_BUY = 2

export function startTour(opts: { guided?: boolean } = {}) {
  const guided = opts.guided ?? false
  // seen = it started once — set up front, not in driver's destroy hook,
  // whose firing proved timing-sensitive when steps are clicked quickly
  try {
    localStorage.setItem(TOUR_KEY, 'done')
  } catch {
    /* private browsing */
  }
  // advance the tour once, after `delay`, only if still parked on `from`
  const advance = (from: number, delay: number) => {
    setTimeout(() => {
      if (d.isActive() && d.getActiveIndex() === from) d.moveNext()
    }, delay)
  }
  // steps that teach by doing use the real action as the trigger: clicking
  // the highlighted control advances the tour (the button still does its
  // normal job — assemble the chain, collapse the subtree — as it goes)
  const onStepClick = (ev: MouseEvent) => {
    const t = ev.target as HTMLElement
    const idx = d.getActiveIndex()
    if (guided && idx === STEP_RIFLE && t.closest?.('[data-item="rifle"]')) {
      advance(STEP_RIFLE, 700) // let the chain assemble + settle
    } else if (idx === STEP_BUY && t.closest?.('.toggle-buy')) {
      advance(STEP_BUY, 450) // let the subtree collapse
    }
  }
  const d = driver({
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Fly safe',
    overlayOpacity: 0.6,
    stagePadding: 6,
    // The ✕ is the only exit. allowClose must stay TRUE (false strips the
    // ✕ from every popover in driver's step normalization); instead the
    // actual escape hatches are neutralized: overlay clicks run a no-op
    // instead of closing, and keyboard control (incl. Escape) is off.
    allowClose: true,
    overlayClickBehavior: () => {},
    allowKeyboardControl: false,
    onDestroyed: () => document.removeEventListener('click', onStepClick, true),
    steps: [
      {
        element: '[data-item="rifle"]',
        popover: {
          title: 'The catalogue',
          description: guided
            ? 'Every item in the game, with real trade values. Start your first order: click Rifle to put it on the board.'
            : 'Every item in the game, with real trade values. Left-click adds one to the board, right-click removes one, or drag it straight onto the canvas. The % badge is return on cost at base prices.',
          side: 'right',
          // guided: the only way forward is doing the thing
          ...(guided ? { showButtons: ['close' as const] } : {}),
        },
      },
      {
        element: '.node-root',
        popover: {
          title: 'The final product',
          description:
            'Its production chain expands leftward to base materials. The crafted cost rolls up the whole chain. Compare it against the base trade value to see if the thing is worth making.',
          side: 'left',
        },
      },
      {
        element: '.toggle-buy',
        popover: {
          title: 'Buy or craft?',
          description:
            'Any intermediate can be bought at market instead of crafted. Give it a try: click this toggle and watch the subtree collapse. Your buy price now flows straight into the cost, handy when a trader is selling below what it costs you to make.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour="orders"]',
        popover: {
          title: 'Orders',
          description:
            'Everything on the board, with total crafted cost. Set a target sale price to see the margin per unit.',
          side: 'left',
        },
      },
      {
        element: '[data-tour="shopping"]',
        popover: {
          title: 'The shopping list',
          description:
            'Base materials to buy across all orders, with quantities, plus the ceiling price you can pay for each before the product stops being worth crafting.',
          side: 'left',
        },
      },
      {
        element: '.facility-panel',
        // switch facility mode ON as this step opens, so the strip is
        // actually showing and the hammer is enabled — otherwise the copy
        // points at controls that are hidden or disabled behind the toggle
        onHighlightStarted: () => {
          if (document.querySelector('.facility-panel.off')) {
            ;(document.querySelector('.fac-factory') as HTMLElement | null)?.click()
            // the strip wipes up to full height — re-measure once it settles
            setTimeout(() => {
              if (d.isActive()) d.refresh()
            }, 500)
          }
        },
        popover: {
          title: 'Facility mode',
          description:
            'This strip lists the facilities the current chains rely on. Red means your ship hasn’t built it yet. The factory icon toggles the mode; the hammer lets you mark what you’ve actually built.',
          side: 'left',
        },
      },
      {
        element: '.brand .seg-clock',
        // on mobile the sidebar is a scrollable bottom band; earlier steps
        // leave it scrolled down at the shopping list. Snap it back to the top
        // so the clock (in the masthead) is fully in view with the most room
        // below it, then re-measure so the popover anchors cleanly beneath.
        onHighlightStarted: () => {
          const sidebar = document.querySelector('.sidebar')
          if (sidebar) sidebar.scrollTop = 0
          setTimeout(() => {
            if (d.isActive()) d.refresh()
          }, 250)
        },
        popover: {
          title: 'Ship time',
          description:
            'Your local time. Click the bell to set an alarm, even spacefarers gotta poop!',
          // desktop: sit to the left of the clock. On mobile driver won't honour
          // any side for this low, scroll-contained element, so tour-shiptime
          // pins the popover just above the sidebar band via CSS (see index.css)
          // — keeping the highlighted clock visible instead of covered.
          side: 'left',
          popoverClass: 'tour-shiptime',
        },
      },
    ],
  })
  document.addEventListener('click', onStepClick, true)
  d.drive()
}
