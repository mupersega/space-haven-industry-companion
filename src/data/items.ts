// Space Haven production data.
// Quantities are inputs consumed per 1 unit of output.
// Source: bugbyte.fi official wiki (Item Fabricator/Recipes, refinery/assembler
// facility pages, Resources) — researched 2026-07-06.
// Default prices are the game's own trade values from the wiki Trading page
// (XML maxPrice data). In-game buy offers usually run 5–6× sell prices, so
// treat these as a baseline and edit to what traders actually quote you.

export type Category = 'raw' | 'grown' | 'trade' | 'refined' | 'component' | 'product' | 'scrap'

export interface Ingredient {
  itemId: string
  qty: number
}

export interface ItemDef {
  id: string
  name: string
  category: Category
  /** Facility that crafts it, when it has a recipe */
  facility?: string
  /** Industry skill level required */
  industry?: number
  /** Inputs per 1 unit of output. Absent = base item (mined, grown or traded). */
  recipe?: Ingredient[]
  /** Recycler outputs per 1 unit salvaged (scrap items). */
  salvage?: Ingredient[]
  /** Game trade value in credits (wiki Trading page) — an editable assumption. */
  defaultPrice?: number
  /** What this is for, when it has no per-unit chain (flow processes, construction, etc.) */
  notes?: string
}

export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  raw: { label: 'Asteroid raw', color: '#d9a05b' },
  grown: { label: 'Grown', color: '#7ed491' },
  trade: { label: 'Trade only', color: '#a78bfa' },
  refined: { label: 'Refined', color: '#45d5c2' },
  component: { label: 'Component', color: '#5ba8ff' },
  product: { label: 'Fabricator item', color: '#ffb454' },
  scrap: { label: 'Salvage', color: '#c9856b' },
}

const defs: ItemDef[] = [
  // ---- Asteroid raw materials (mined or bought) ----
  { id: 'energium', name: 'Energium', category: 'raw', defaultPrice: 300 },
  { id: 'hyperium', name: 'Hyperium', category: 'raw', defaultPrice: 400 },
  { id: 'ice', name: 'Ice', category: 'raw', defaultPrice: 50 },
  { id: 'carbon', name: 'Carbon', category: 'raw', defaultPrice: 100 },
  { id: 'base-metals', name: 'Base Metals', category: 'raw', defaultPrice: 75 },
  { id: 'noble-metals', name: 'Noble Metals', category: 'raw', defaultPrice: 100 },
  { id: 'raw-chemicals', name: 'Raw Chemicals', category: 'raw', defaultPrice: 100 },

  // ---- Grown / organic ----
  {
    id: 'fibers', name: 'Fibers', category: 'grown',
    facility: 'Grow Bed', industry: 1,
    recipe: [
      { itemId: 'water', qty: 0.7 },
      { itemId: 'fertilizer', qty: 0.1 },
    ],
    defaultPrice: 200,
  },
  { id: 'fruits', name: 'Fruits', category: 'grown', defaultPrice: 250 },
  { id: 'alien-organs', name: 'Alien Organs', category: 'grown', defaultPrice: 50 },
  {
    id: 'bio-matter', name: 'Bio Matter', category: 'grown', defaultPrice: 50,
    notes:
      'No crafting use. Composter turns 1 into a trickle of Water (~0.1) + Fertilizer + Carbon (~0.017 each, ~11 cr of goods) — for closing the farm loop, not profit. Also feeds Algae Dispensers (low-grade food) and builds lawn tiles. Selling at 50 cr is usually its best use.',
  },

  // ---- Trade / loot only (no crafting recipe in game) ----
  {
    id: 'quantronics', name: 'Quantronics Component', category: 'trade', defaultPrice: 750,
    notes: 'No use in the current game version — loot it from robot ships, sell it, or stockpile for a future update.',
  },
  {
    id: 'superblock', name: 'Superblock', category: 'trade', defaultPrice: 700,
    notes: 'Not craftable yet — game files hint at a future recipe (0.5 Techblock + 0.33 Energy Block + 1 Quantronics).',
  },
  {
    id: 'csp', name: 'CSP', category: 'trade', defaultPrice: 1100,
    notes: 'Cloud Substance Pills — contraband to the Military Alliance. Pure trade good; buy low from outlaws, sell high where it is legal.',
  },

  // ---- Salvage (derelict loot, recycled at the Recycler; outputs per 1 unit) ----
  {
    id: 'rubble', name: 'Rubble', category: 'scrap',
    facility: 'Recycler', industry: 1,
    salvage: [{ itemId: 'steel-plates', qty: 0.1 }],
    defaultPrice: 11,
  },
  {
    id: 'soft-scrap', name: 'Soft Scrap', category: 'scrap',
    facility: 'Recycler', industry: 1,
    salvage: [{ itemId: 'soft-block', qty: 0.5 }],
    defaultPrice: 30,
  },
  {
    id: 'infra-scrap', name: 'Infra Scrap', category: 'scrap',
    facility: 'Recycler', industry: 1,
    salvage: [
      { itemId: 'electronics', qty: 0.05 },
      { itemId: 'infrablock', qty: 0.5 },
    ],
    defaultPrice: 25,
  },
  {
    id: 'hull-scrap', name: 'Hull Scrap', category: 'scrap',
    facility: 'Recycler', industry: 1,
    salvage: [
      { itemId: 'hull-block', qty: 0.25 },
      { itemId: 'steel-plates', qty: 0.1 },
    ],
    defaultPrice: 30,
  },
  {
    id: 'energy-scrap', name: 'Energy Scrap', category: 'scrap',
    facility: 'Recycler', industry: 1,
    salvage: [
      { itemId: 'energium', qty: 0.17 },
      { itemId: 'energy-block', qty: 0.2 },
      { itemId: 'infrablock', qty: 0.14 },
    ],
    defaultPrice: 55,
  },
  {
    id: 'tech-scrap', name: 'Tech Scrap', category: 'scrap',
    facility: 'Recycler', industry: 1,
    salvage: [
      { itemId: 'infrablock', qty: 0.1 },
      { itemId: 'optronics', qty: 0.06 },
      { itemId: 'techblock', qty: 0.11 },
    ],
    defaultPrice: 50,
  },
  { id: 'human-organs', name: 'Human Organs', category: 'trade', defaultPrice: 50 },
  { id: 'mild-alcohol', name: 'Mild Alcohol', category: 'trade', defaultPrice: 25 },
  { id: 'painkillers', name: 'Painkillers', category: 'trade', defaultPrice: 20 },
  { id: 'bandage', name: 'Bandage', category: 'trade', defaultPrice: 20 },

  // ---- Refined materials ----
  {
    id: 'water', name: 'Water', category: 'refined',
    facility: 'Water Purifier', industry: 1,
    recipe: [{ itemId: 'ice', qty: 0.2 }],
    defaultPrice: 70,
  },
  {
    id: 'steel-plates', name: 'Steel Plates', category: 'refined',
    facility: 'Metal Refinery', industry: 1,
    recipe: [
      { itemId: 'base-metals', qty: 0.2 },
      { itemId: 'carbon', qty: 0.2 },
    ],
    defaultPrice: 150,
  },
  {
    id: 'electronics', name: 'Electronics Component', category: 'refined',
    facility: 'Metal Refinery', industry: 3,
    recipe: [
      { itemId: 'base-metals', qty: 0.2 },
      { itemId: 'noble-metals', qty: 0.2 },
    ],
    defaultPrice: 250,
  },
  {
    id: 'chemicals', name: 'Chemicals', category: 'refined',
    facility: 'Chemical Refinery', industry: 4,
    recipe: [{ itemId: 'raw-chemicals', qty: 0.5 }],
    defaultPrice: 170,
  },
  {
    id: 'plastics', name: 'Plastics', category: 'refined',
    facility: 'Chemical Refinery', industry: 3,
    recipe: [
      { itemId: 'carbon', qty: 1 },
      { itemId: 'chemicals', qty: 0.2 },
    ],
    defaultPrice: 200,
  },
  {
    id: 'fabrics', name: 'Fabrics', category: 'refined',
    facility: 'Micro-Weaver', industry: 1,
    recipe: [{ itemId: 'fibers', qty: 0.2 }],
    defaultPrice: 70,
  },
  {
    id: 'fertilizer', name: 'Fertilizer', category: 'refined',
    facility: 'Chemical Refinery', industry: 3,
    recipe: [{ itemId: 'raw-chemicals', qty: 0.5 }],
    defaultPrice: 125,
  },
  {
    id: 'energy-rod', name: 'Energy Rod', category: 'refined',
    facility: 'Energy Refinery', industry: 4,
    recipe: [{ itemId: 'energium', qty: 0.5 }],
    defaultPrice: 190,
  },
  {
    id: 'hyperfuel', name: 'Hyperfuel', category: 'refined',
    facility: 'Energy Refinery', industry: 5,
    recipe: [{ itemId: 'hyperium', qty: 0.5 }],
    defaultPrice: 400,
  },
  {
    id: 'medical-supplies', name: 'Medical Supplies', category: 'refined',
    facility: 'Chemical Refinery', industry: 3,
    recipe: [
      { itemId: 'fabrics', qty: 0.5 },
      { itemId: 'plastics', qty: 0.5 },
      { itemId: 'raw-chemicals', qty: 0.25 },
    ],
    defaultPrice: 200,
  },
  {
    id: 'iv-fluid', name: 'IV Fluid', category: 'refined',
    facility: 'Chemical Refinery', industry: 3,
    recipe: [
      { itemId: 'fruits', qty: 0.5 },
      { itemId: 'raw-chemicals', qty: 0.1 },
      { itemId: 'water', qty: 0.25 },
    ],
    defaultPrice: 250,
  },
  {
    id: 'explosive-ammo', name: 'Explosive Ammunition', category: 'refined',
    facility: 'Chemical Refinery', industry: 3,
    recipe: [
      { itemId: 'steel-plates', qty: 0.5 },
      { itemId: 'raw-chemicals', qty: 0.5 },
    ],
    defaultPrice: 200,
  },
  {
    id: 'alien-enzyme', name: 'Alien Enzyme', category: 'refined',
    facility: 'Chemical Refinery', industry: 5,
    recipe: [{ itemId: 'alien-organs', qty: 0.5 }],
    defaultPrice: 600,
  },

  // ---- Components & construction blocks ----
  {
    id: 'optronics', name: 'Optronics Component', category: 'component',
    facility: 'Optronics Fabricator', industry: 6,
    recipe: [
      { itemId: 'chemicals', qty: 2 },
      { itemId: 'electronics', qty: 1 },
    ],
    defaultPrice: 500,
  },
  {
    id: 'energy-cell', name: 'Energy Cell', category: 'component',
    facility: 'Optronics Fabricator', industry: 5,
    recipe: [
      { itemId: 'electronics', qty: 1 },
      { itemId: 'energy-rod', qty: 0.33 },
    ],
    defaultPrice: 350,
  },
  {
    id: 'augmentation-parts', name: 'Augmentation Parts', category: 'component',
    facility: 'Optronics Fabricator', industry: 5,
    recipe: [
      { itemId: 'chemicals', qty: 0.5 },
      { itemId: 'electronics', qty: 1 },
      { itemId: 'plastics', qty: 1 },
    ],
    defaultPrice: 500,
  },
  {
    id: 'infrablock', name: 'Infrablock', category: 'component',
    facility: 'Assembler', industry: 1,
    recipe: [
      { itemId: 'electronics', qty: 0.2 },
      { itemId: 'steel-plates', qty: 0.2 },
    ],
    defaultPrice: 190,
  },
  {
    id: 'hull-block', name: 'Hull Block', category: 'component',
    facility: 'Assembler', industry: 2,
    recipe: [{ itemId: 'steel-plates', qty: 0.5 }],
    defaultPrice: 170,
  },
  {
    id: 'soft-block', name: 'Soft Block', category: 'component',
    facility: 'Assembler', industry: 1,
    recipe: [
      { itemId: 'fabrics', qty: 0.5 },
      { itemId: 'steel-plates', qty: 0.5 },
    ],
    defaultPrice: 150,
  },
  {
    id: 'techblock', name: 'Techblock', category: 'component',
    facility: 'Advanced Assembler', industry: 6,
    recipe: [
      { itemId: 'electronics', qty: 0.33 },
      { itemId: 'optronics', qty: 1 },
      { itemId: 'steel-plates', qty: 0.33 },
    ],
    defaultPrice: 320,
  },
  {
    id: 'energy-block', name: 'Energy Block', category: 'component',
    facility: 'Advanced Assembler', industry: 5,
    recipe: [
      { itemId: 'electronics', qty: 0.33 },
      { itemId: 'energy-cell', qty: 1 },
      { itemId: 'steel-plates', qty: 0.33 },
    ],
    defaultPrice: 400,
  },

  // ---- Item Fabricator products ----
  ...fab('pistol', 'Pistol', 1, [s(0.3), p(1)], 300),
  ...fab('smg', 'SMG', 1, [s(0.5), p(1)], 400),
  ...fab('shotgun', 'Shotgun', 2, [s(1), p(1)], 500),
  ...fab('rifle', 'Rifle', 3, [s(0.7), p(1)], 600),
  ...fab('stun-pistol', 'Stun Pistol', 1, [s(0.3), p(1)], 400),
  ...fab('stun-rifle', 'Stun Rifle', 3, [s(0.7), p(1)], 700),
  ...fab('laser-pistol', 'Laser Pistol', 3, [s(1), p(1), e(1)], 500),
  ...fab('laser-rifle', 'Laser Rifle', 3, [s(0.3), p(1), e(1)], 800),
  ...fab('plasma-clustergun', 'Plasma Clustergun', 5, [s(1), p(1), e(1)], 1000),
  ...fab('plasma-rifle', 'Plasma Rifle', 5, [s(1), p(1), e(1)], 1200),
  ...fab('tactical-grip', 'Tactical Grip', 3, [s(0.3), c(0.5)], 150),
  ...fab('basic-scope', 'Basic Scope', 3, [s(0.3), c(0.5)], 200),
  ...fab('shotgun-autoloader', 'Shotgun Autoloader', 3, [s(0.3), c(0.5)], 300),
  ...fab('explosive-grenade-launcher', 'Explosive Grenade Launcher', 3, [s(0.3), c(0.5)], 550),
  ...fab('incendiary-grenade-launcher', 'Incendiary Grenade Launcher', 3, [s(0.3), c(0.5)], 600),
  ...fab('flamethrower', 'Flamethrower', 3, [s(0.3), c(0.5)], 600),
  ...fab('small-breaching-charge', 'Small Breaching Charge', 3, [c(0.2), p(0.5)], 550),
  ...fab('remote-control', 'Remote Control', 3, [s(1), { itemId: 'electronics', qty: 1 }, e(1)], 500),
  ...fab('sentry-gun-x1', 'Sentry Gun X1', 1, [s(0.5), { itemId: 'electronics', qty: 0.5 }, e(0.5)], 550),
  ...fab('oxygen-tank', 'Oxygen Tank', 1, [s(1), { itemId: 'water', qty: 0.1 }], 250),
  ...fab('suit-oxygen-extender', 'Space Suit Oxygen Extender', 3, [s(0.2), p(0.1), f(0.5)], 400),
  ...fab('bulletproof-vest', 'Bulletproof Vest', 3, [p(0.3), f(0.5)], 500),
  ...fab('armored-vest', 'Armored Vest', 5, [s(0.5), p(0.3), f(0.5)], 800),
  ...fab('slave-collar', 'Slave Collar', 3, [p(1), f(1)], 500),
  ...fab('combat-stimulant', 'Combat Stimulant', 3, [p(0.1), c(0.2)], 200),
  ...fab('mood-stimulant', 'Mood Stimulant', 3, [p(0.1), c(0.2)], 250),
  ...fab('sedative-syringe', 'Sedative Syringe', 2, [p(0.1), c(0.2)], 300),
  ...fab('nano-wound-dressing', 'Nano Wound Dressing', 4, [p(0.2), c(0.2)], 200),
]

// recipe shorthands for the fabricator table above
function s(qty: number): Ingredient { return { itemId: 'steel-plates', qty } }
function p(qty: number): Ingredient { return { itemId: 'plastics', qty } }
function c(qty: number): Ingredient { return { itemId: 'chemicals', qty } }
function e(qty: number): Ingredient { return { itemId: 'energy-cell', qty } }
function f(qty: number): Ingredient { return { itemId: 'fabrics', qty } }
function fab(id: string, name: string, industry: number, recipe: Ingredient[], defaultPrice: number): ItemDef[] {
  return [{ id, name, category: 'product', facility: 'Item Fabricator', industry, recipe, defaultPrice }]
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(defs.map((d) => [d.id, d]))
export const ALL_ITEMS: ItemDef[] = defs
export const CRAFTABLE_ITEMS: ItemDef[] = defs.filter((d) => d.recipe)

/** Everything addable to the board: craftables plus market-priced goods (raw, grown, trade). */
export const PALETTE_ITEMS: ItemDef[] = [...defs]

/** Icon convention: /icons/<id>.png in public/, present for most items. */
export function iconUrl(id: string): string {
  return `${import.meta.env.BASE_URL}icons/${id}.png`
}

export function facilitySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function facilityUrl(name: string): string {
  return `${import.meta.env.BASE_URL}facilities/${facilitySlug(name)}.png`
}

/** Every facility referenced by a recipe or salvage process. */
export const FACILITIES: string[] = [...new Set(defs.map((d) => d.facility).filter((f): f is string => !!f))]
