# Space Haven · Production Ledger

A local-only React tool for the game [Space Haven](https://bugbyte.fi/spacehaven/). Drag any craftable
item onto the canvas to chart its full production chain — final product on the right, base asteroid
resources on the left — then assign prices to the things you buy and read off whether crafting pays.

## Attribution

This is an unofficial fan project, not affiliated with or endorsed by [Bugbyte Ltd.](https://bugbyte.fi/)
Space Haven and all artwork and game assets used here (ship sprites, the logo, star and nebula
brushes, planet art) are the property of Bugbyte Ltd. This project is free, carries no ads or
monetization, and exists to enhance the enjoyment of the game.

## Run it

```
npm install
npm run dev     # http://localhost:5173
```

No backend. All prices, orders and buy/craft choices persist in your browser's localStorage.

## How to use

- **Catalogue (left):** every craftable item, grouped. Drag one onto the canvas (or click it) to add an
  order. Dropping the same item again raises its quantity.
- **Canvas (middle):** the merged production chain of everything ordered. Shared inputs merge into one
  node and their demand sums. Edge labels are input units per 1 unit of the consumer.
  - Amber price boxes on leaf nodes are editable — these are your assumed market prices.
  - Any intermediate can be flipped with **⇄ buy it instead** (e.g. you'd rather buy Plastics than
    refine them). Its subtree collapses and it becomes a priced input. **⟲ craft it instead** flips back.
- **Ledger (right):** per-order crafted cost and a target sale price each; total crafted cost; a
  worth-it verdict; and the shopping list of all bought inputs with quantity, price, cost share and —
  once every order has a sale price — a **max buy** ceiling: the most you can pay for that input
  (others held at your assumptions) before crafting stops beating the sale price. The break-even
  multiplier says how much *all* prices could rise together.

## First visit

New arrivals get a full-screen spoiler gate rendered the way Space Haven itself renders space: the
game's own star and nebula brushes (extracted from its particle definitions) stamped onto layered
canvases, a runtime-drawn giant planet limb like the in-game system view, real planet sprites, the
official logo, and the background-fleet ship sprites in their in-game formation — all with mouse
parallax. It warns that seeing exact recipes and trade values can dim the wonder for new players,
and only proceeds on an explicit "I know what I'm doing." Boarding covers the rest of the browser
session (refreshes don't re-gate); the gate asks again in a new session unless "Remember for next
time" was checked, which stores the acknowledgment permanently.

## Data

Recipes were transcribed from the official Space Haven wiki (Item Fabricator, Metal/Chemical/Energy
Refinery, Assembler, Advanced Assembler, Optronics Fabricator, Micro-Weaver, Water Purifier, Grow
Beds). See `src/data/items.ts` — quantities are inputs per 1 output unit. Default prices are
placeholder assumptions, meant to be edited in the UI.

Notes:
- Quantronics Components and Superblocks are trade/loot only in the current game — they appear as
  priced base items.
- Fibers default to "bought" since they're grown; flip them to crafted to see the grow-bed chain
  (water + fertilizer).

## Stack

Vite · React 19 · TypeScript · @xyflow/react (React Flow) · dagre layout
