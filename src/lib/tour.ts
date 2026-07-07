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
export function startTour(opts: { guided?: boolean } = {}) {
  const guided = opts.guided ?? false
  // seen = it started once — set up front, not in driver's destroy hook,
  // whose firing proved timing-sensitive when steps are clicked quickly
  try {
    localStorage.setItem(TOUR_KEY, 'done')
  } catch {
    /* private browsing */
  }
  const onRifleClick = (ev: MouseEvent) => {
    if (!(ev.target as HTMLElement).closest?.('[data-item="rifle"]')) return
    document.removeEventListener('click', onRifleClick, true)
    // let the chain assemble and the layout settle before highlighting it
    setTimeout(() => {
      if (d.isActive() && d.getActiveIndex() === 0) d.moveNext()
    }, 700)
  }
  const d = driver({
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Fly safe',
    overlayOpacity: 0.6,
    stagePadding: 6,
    onDestroyed: () => document.removeEventListener('click', onRifleClick, true),
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
            'Its production chain expands leftward to base materials. The crafted cost rolls up the whole chain — compare it against the base trade value to see if the thing is worth making.',
          side: 'left',
        },
      },
      {
        element: '.toggle-buy',
        popover: {
          title: 'Buy or craft?',
          description:
            'Any intermediate can be bought at market instead of crafted. Its subtree collapses and your buy price flows into the cost — handy when a trader is selling below your production cost.',
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
            'Base materials to buy across all orders, with quantities — and the ceiling price you can pay for each before the product stops being worth crafting.',
          side: 'left',
        },
      },
      {
        element: '.fac-controls',
        popover: {
          title: 'Facility mode',
          description:
            'The factory toggle shows which facilities the current chains need — red means not built yet. The hammer edits what your ship actually has.',
          side: 'top',
        },
      },
      {
        element: '.brand .seg-clock',
        popover: {
          title: 'Ship time',
          description:
            'Brisbane time, bridge style. Click the bell to set a quick alarm — three chiptune jingles, gentle fade-in. Fly safe out there.',
          side: 'left',
        },
      },
    ],
  })
  if (guided) document.addEventListener('click', onRifleClick, true)
  d.drive()
}
