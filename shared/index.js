// Single source of truth shared by backend + both apps.
// Money is always whole rupees (integers).

export const DEFAULT_LOCATION = { lat: 17.4486, lng: 78.3908, label: 'Madhapur, Hyderabad' };
export const DISPATCH_RADIUS_KM = 3;
export const MAX_WORKERS = 15;
export const HANDSHAKE_MAX_FAILS = 5;

export const SKILL_TIERS = {
  TIER_1: { id: 'TIER_1', rank: 1, label: 'General Helper', rate2h: 299, icon: '🧰', blurb: 'Loading, cleaning, shifting, helping' },
  TIER_2: { id: 'TIER_2', rank: 2, label: 'Semi-Skilled', rate2h: 399, icon: '🧱', blurb: 'Masonry help, painting, tiling' },
  TIER_3: { id: 'TIER_3', rank: 3, label: 'Skilled Trade', rate2h: 599, icon: '🛠️', blurb: 'Electrician, plumber, carpenter' },
};

// Task icons. Workers read pictures, not words.
export const TRADE_TAGS = {
  HELPER: { tier: 'TIER_1', icon: '🧰', label: 'General help' },
  LOADING: { tier: 'TIER_1', icon: '📦', label: 'Loading / shifting' },
  CLEANING: { tier: 'TIER_1', icon: '🧹', label: 'Cleaning' },
  GARDEN: { tier: 'TIER_1', icon: '🌱', label: 'Garden work' },
  MASON: { tier: 'TIER_2', icon: '🧱', label: 'Mason help' },
  PAINTER: { tier: 'TIER_2', icon: '🎨', label: 'Painting' },
  PLUMBER: { tier: 'TIER_3', icon: '🔧', label: 'Plumbing' },
  ELECTRICIAN: { tier: 'TIER_3', icon: '⚡', label: 'Electrical' },
  CARPENTER: { tier: 'TIER_3', icon: '🪚', label: 'Carpentry' },
};
export const tradesForTier = (tier) => Object.keys(TRADE_TAGS).filter((k) => TRADE_TAGS[k].tier === tier);

export const DURATIONS = {
  '2H': { id: '2H', hours: 2 },
  '4H': { id: '4H', hours: 4 },
  '8H': { id: '8H', hours: 8 },
};

export const ADDONS = {
  TOOLKIT: { id: 'TOOLKIT', label: 'Toolkit', price: 50, icon: '🧰' },
  LADDER: { id: 'LADDER', label: 'Ladder', price: 100, icon: '🪜' },
};

export const PLATFORM_FEE_PCT = 0.1;
export const PLATFORM_FEE_MIN = 29;
export const GST_PCT = 0.18; // charged on the platform fee only; worker wage is passed through untouched
export const INSURANCE_FEE = 19;

export const SLOTS = {
  MORNING: { id: 'MORNING', label: 'Morning', time: '09:00' },
  AFTERNOON: { id: 'AFTERNOON', label: 'Afternoon', time: '14:00' },
};

export const COLOR_TAGS = {
  ORANGE: { id: 'ORANGE', emoji: '🟠', hex: '#f97316' },
  BLUE: { id: 'BLUE', emoji: '🔵', hex: '#3b82f6' },
  GREEN: { id: 'GREEN', emoji: '🟢', hex: '#22c55e' },
};

export const BOOKING_STATUS = {
  SEARCHING: 'SEARCHING',
  ASSIGNED: 'ASSIGNED',
  ARRIVED: 'ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  PAID_OUT: 'PAID_OUT',
  CANCELLED: 'CANCELLED',
};

// ASSIGNED -> SEARCHING is the worker saying "I can't come": the job goes back to the pool.
export const TRANSITIONS = {
  SEARCHING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ARRIVED', 'SEARCHING', 'CANCELLED'],
  ARRIVED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: ['PAID_OUT'],
  PAID_OUT: [],
  CANCELLED: [],
};
export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);
export const ACTIVE_STATUSES = ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];

export const ESCROW_STATUS = { HELD: 'HELD', RELEASED_UPI: 'RELEASED_UPI', REFUNDED: 'REFUNDED' };

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const UPI_RE = /^[\w.-]{2,}@[a-zA-Z]{2,}$/;

export function quotePrice({ skill_tier, duration, worker_count = 1, addons = [], insurance = false }) {
  const tier = SKILL_TIERS[skill_tier];
  const dur = DURATIONS[duration];
  if (!tier) throw new Error('Invalid skill tier');
  if (!dur) throw new Error('Invalid duration');
  if (!Number.isInteger(worker_count) || worker_count < 1 || worker_count > MAX_WORKERS) throw new Error(`Worker count must be 1-${MAX_WORKERS}`);
  const uniq = [...new Set(addons)];
  for (const a of uniq) if (!ADDONS[a]) throw new Error(`Unknown add-on ${a}`);

  const base_wage = (tier.rate2h * dur.hours) / 2;
  const addons_total = uniq.reduce((s, a) => s + ADDONS[a].price, 0);
  const platform_fee = Math.max(PLATFORM_FEE_MIN, Math.round(base_wage * PLATFORM_FEE_PCT));
  const gst_amount = Math.round(platform_fee * GST_PCT);
  const insurance_fee = insurance ? INSURANCE_FEE : 0;
  const worker_payout = base_wage + addons_total;
  const escrow_total = worker_payout + platform_fee + gst_amount + insurance_fee;
  const per_worker = { base_wage, addons_total, platform_fee, gst_amount, insurance_fee, worker_payout, escrow_total };
  const total = Object.fromEntries(Object.entries(per_worker).map(([k, v]) => [k, v * worker_count]));
  return { per_worker, total, worker_count, addons: uniq };
}

export function haversineKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const DURATION_HOURS = (d) => DURATIONS[d]?.hours ?? 0;
export const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
