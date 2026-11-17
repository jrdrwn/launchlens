// LaunchLens's value model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks the protocols that record no token, strongest implied
// value first. The watchlist is the floor: every one of its 40 slugs is
// ranked, and the radar adds every other pre-token protocol that is a real
// launch candidate — never a wrapped, staked or bridged product of a token
// that already trades, never an exchange, never a versioned pool.
//
// Implied value follows only from the snapshot's own figures, through a
// comparable multiple the snapshot itself supplies:
//
//   multiple   = the category's median mcap/TVL among protocols whose token
//                already trades (shrunk toward the global median when the
//                category has few comparables), clamped to [0.03, 1.20]
//   growth     = clamp(change_7d, -60, +120) per cent; null growth counts as 0
//   growthMult = 1 + 0.45 * tanh(growth / 50)
//                a concave curve: a +25% week lifts the value ~20%, a +120%
//                week ~44%, and a +4,448% week no more than a +120% one,
//                so one-week spikes cannot carry the board
//   maturity   = 0.6 + 0.4 * (1 - exp(-age_days / 540))
//                age is the days since DefiLlama first listed the protocol,
//                the record of how long it has run with no token; an
//                unknown age counts as 365 days. Longevity helps, with
//                diminishing returns: a five-year protocol is not three
//                times a one-year one.
//   implied    = max(1, round(tvl_usd * multiple * growthMult * maturity))
//
// No protocol name is ever special-cased: the same function scores every
// row, and the dashboard shows each row's multiple, growth and maturity
// beside its implied value, so the number can be checked from the figures.

import type { Snapshot, SnapshotProtocol } from './snapshot.ts';
import { finite } from './snapshot.ts';

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** The multiple's clamp, low and high. */
  multiple_floor: number;
  multiple_cap: number;
  /** The growth curve's weight and scale, in per cent. */
  growth_weight: number;
  growth_scale: number;
  /** The growth clamp, in per cent. */
  growth_floor: number;
  growth_cap: number;
  /** The maturity curve's floor, range and scale in days. */
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  /** The age an unlisted protocol counts as, in days. */
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  multiple_floor: 0.03,
  multiple_cap: 1.2,
  growth_weight: 0.45,
  growth_scale: 50,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 540,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'launchlens-1';

const DAY_MS = 86_400_000;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking, in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** The exchanges whose products are not launches. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
/** The categories that are a wrapped, staked or bridged product of a token that trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a wrapped, staked or bridged product of a token that
 * already trades, by the watchlist's own rule: its category, its name's
 * version marker or wrapped/staked wording, or an exchange's name at its
 * start. (The snapshot carries no parentProtocol field, so that part of the
 * house's rule cannot be re-checked here; the watchlist it ships is read
 * as given, and every slug on it passes this test too.)
 */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return true;
  return false;
}

/** Whether a protocol is one the board may rank: pre-token and a real launch candidate. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isWrappedProduct(p);
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The comparable multiples: for each category, the median mcap/TVL of the
 * protocols in it whose token already trades. A category with at least three
 * comparables takes its own median, shrunk toward the global median
 * (weight n/(n+3)); a category with fewer takes the global median outright,
 * because one or two ratios are a single noisy observation, not a
 * comparable. The result is clamped. The table is built from the snapshot
 * alone, so a new snapshot re-calibrates it; no multiple is ever typed in
 * by hand.
 */
export interface ComparableTable {
  global_median: number;
  by_category: Record<string, number>;
}

export function comparables(snapshot: Snapshot, model: ModelConstants = MODEL): ComparableTable {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const global = all.length > 0 ? median(all) : 0.2;
  const by_category: Record<string, number> = {};
  for (const [category, values] of byCategory) {
    const n = values.length;
    if (n < 3) continue;
    const cat = median(values);
    const shrunk = (n * cat + 3 * global) / (n + 3);
    by_category[category] = Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk));
  }
  return { global_median: Math.min(model.multiple_cap, Math.max(model.multiple_floor, global)), by_category };
}

/** The multiple one category gets: its comparable, or the global median. */
export function multipleFor(category: string | null, table: ComparableTable, model: ModelConstants = MODEL): number {
  const key = category ?? 'Other';
  const m = table.by_category[key] ?? table.global_median;
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, m));
}

/** One row's model breakdown: every input the dashboard shows. */
export interface ModelBreakdown {
  multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  table: ComparableTable,
  model: ModelConstants = MODEL,
): { implied: number; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + model.growth_weight * Math.tanh(growthPct / model.growth_scale);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(ageForModel, 0) / model.maturity_days));
  const multiple = multipleFor(protocol.category, table, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return {
    implied,
    // The multiple is kept at full precision: the dashboard recomputes this
    // row from it, and a rounded multiple would make its recompute differ
    // from the board by a dollar. The growth and maturity multipliers are
    // rounded for display only; the page recomputes them from the exact
    // growth and age figures.
    breakdown: {
      multiple,
      growth_pct: round4(growthPct),
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      age_days: age,
    },
  };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * The protocols the board ranks, strongest first, with ranks 1..N. The
 * watchlist is the floor: every slug, even one the snapshot no longer
 * carries (it cannot, but the board's coverage is the gate's row and is
 * never gambled on a missing record). The early radar is every other
 * rankable pre-token protocol, not a capped sample: the radar exists to
 * find them early, and the board's size is the field's, not a round number.
 */
export function buildBoard(
  snapshot: Snapshot,
  table: ComparableTable,
  farmStepsFor: (p: SnapshotProtocol, age: number | null) => string[],
  model: ModelConstants = MODEL,
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, breakdown } = impliedValue(p, snapshot.as_of, table, model);
    return { p, implied, breakdown };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watch.has(s.p.slug),
    age_days: s.breakdown.age_days,
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm_steps: farmStepsFor(s.p, s.breakdown.age_days),
  }));
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100 to 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}
