// Single source of truth shared by backend + both apps.
// Money is always whole rupees (integers).

export const DEFAULT_LOCATION = { lat: 17.4486, lng: 78.3908, label: 'Madhapur, Hyderabad' };
export const DISPATCH_RADIUS_KM = 3;
export const MAX_WORKERS = 15;
export const HANDSHAKE_MAX_FAILS = 5;     // wrong tries before the code changes
export const HANDSHAKE_LOCK_FAILS = 10;   // wrong tries in total before codes lock until the customer makes a new one
export const FINISH_MIN_MINUTES = 15;     // the FINISH code is refused this soon after START (blocks "pay me now, I'll come back")
export const SCHEDULE_LEAD_HOURS = 2;     // a scheduled job becomes the worker's current job this long before its slot

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

// Customer cancels after the worker has set off: the worker is paid for the trip (100% to the worker).
// Only progress toward the customer counts, so wandering around doesn't raise it.
export const CANCEL_FREE_KM = 0.5;
export const CANCEL_BASE = 20;
export const CANCEL_PER_KM = 10;
export const CANCEL_MAX = 100;
export const cancelFee = (km) => (km < CANCEL_FREE_KM ? 0 : Math.min(CANCEL_MAX, Math.round(CANCEL_BASE + CANCEL_PER_KM * km)));

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

// Standard UPI payment link (NPCI deep-link format); any UPI app scans it as a QR or opens it directly.
export function upiLink({ upi_id, name, amount, note }) {
  if (!UPI_RE.test(upi_id || '')) return null;
  const enc = encodeURIComponent;
  // pa keeps a literal "@" (already validated to safe characters): some UPI apps don't decode %40.
  let link = `upi://pay?pa=${upi_id}&pn=${enc(String(name || '').slice(0, 40))}&cu=INR`;
  if (amount) link += `&am=${Number(amount).toFixed(2)}`;
  if (note) link += `&tn=${enc(String(note).slice(0, 50))}`;
  return link;
}

// Krewzo Business subscription. Prices are per 30 days, before 18% GST.
export const BUSINESS_PLANS = {
  STARTER: { id: 'STARTER', name: 'Business Starter', price: 999, fee_off: 0.5, credit: 25000, seats: 3, radius_km: 3 },
  PRO: { id: 'PRO', name: 'Business Pro', price: 2499, fee_off: 1, credit: 100000, seats: 10, radius_km: 5 },
};
export const PLAN_DAYS = 30;

// fee_discount: 0..1 off the platform fee (Business plans). Worker wages are never discounted.
export function quotePrice({ skill_tier, duration, worker_count = 1, addons = [], insurance = false, fee_discount = 0 }) {
  const tier = SKILL_TIERS[skill_tier];
  const dur = DURATIONS[duration];
  if (!tier) throw new Error('Invalid skill tier');
  if (!dur) throw new Error('Invalid duration');
  if (!Number.isInteger(worker_count) || worker_count < 1 || worker_count > MAX_WORKERS) throw new Error(`Worker count must be 1-${MAX_WORKERS}`);
  const uniq = [...new Set(addons)];
  for (const a of uniq) if (!ADDONS[a]) throw new Error(`Unknown add-on ${a}`);

  const base_wage = (tier.rate2h * dur.hours) / 2;
  const addons_total = uniq.reduce((s, a) => s + ADDONS[a].price, 0);
  const off = Math.min(1, Math.max(0, Number(fee_discount) || 0));
  const platform_fee = Math.round(Math.max(PLATFORM_FEE_MIN, Math.round(base_wage * PLATFORM_FEE_PCT)) * (1 - off));
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
