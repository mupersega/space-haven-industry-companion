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

/** The first-run walkthrough: one lap around the ledger's workflow.
 * driver.js highlights live elements, so it runs against the default
 * rifle example that ships on a fresh board. */
export function startTour() {
  // seen = it started once — set up front, not in driver's destroy hook,
  // whose firing proved timing-sensitive when steps are clicked quickly
  try {
    localStorage.setItem(TOUR_KEY, 'done')
  } catch {
    /* private browsing */
  }
  const d = driver({
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Fly safe',
    overlayOpacity: 0.6,
    stagePadding: 6,
    steps: [
      {
        element: '.palette',
        popover: {
          title: 'The catalogue',
          description:
            'Every item in the game, with real trade values. Left-click adds one to the board, right-click removes one, or drag it straight onto the canvas. The % badge is return on cost at base prices.',
          side: 'right',
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
  d.drive()
}
