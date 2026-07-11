// Quiet tip jar, shared by the sidebar footer and the landing page. Points at
// the Ko-fi page (Ko-fi takes no cut on one-time tips; supporters pay by card
// or PayPal without an account). One place to change the handle.
export const KOFI_URL = 'https://ko-fi.com/mupersega'

// a small stroked coffee mug with two steam wisps — the tip-jar mark. Inherits
// currentColor like the app's other chrome icons, so it sits muted until hovered.
export function CoffeeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 8h10v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8z" />
      <path d="M15 9h1.8a2.4 2.4 0 0 1 0 4.8H15" />
      <path d="M8 2.6c-.7.8-.7 1.9 0 2.7" />
      <path d="M11.5 2.6c-.7.8-.7 1.9 0 2.7" />
    </svg>
  )
}

/** The tip-jar link: a muted mug that warms to amber, opening Ko-fi in a new
 * tab. `tip` sets the hover tooltip; `className` layers on context styling. */
export function KofiLink({ tip = 'Enjoying the ledger? Buy me a coffee', className }: { tip?: string; className?: string }) {
  return (
    <a
      className={`kofi-link${className ? ` ${className}` : ''}`}
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-tip={tip}
      aria-label="Support this project on Ko-fi"
    >
      <CoffeeIcon />
    </a>
  )
}
