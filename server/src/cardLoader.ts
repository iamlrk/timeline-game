import fs from 'fs';
import path from 'path';
import type { EventCard, Card, GameConfig } from './types';

type Rng = () => number;

/** Mulberry32 — fast, good-quality seeded PRNG */
function mulberry32(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string → u32 hash (djb2 variant) */
function strToSeed(s: string): number {
  let h = 0x12345678;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return h >>> 0;
}

function loadRawCards(): EventCard[] {
  const p = path.resolve(__dirname, '../../src/data/cards.json');
  const raw = fs.readFileSync(p, 'utf-8');
  const cards: EventCard[] = JSON.parse(raw);
  return cards.sort((a, b) => a.year - b.year);
}

function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * EASY — sample cards spread evenly across the full timeline.
 * Divides the year range into `count` equal buckets and picks one card
 * per bucket, so consecutive cards are millennia or centuries apart.
 */
function sampleBySpread(cards: EventCard[], count: number, rng: Rng = Math.random): EventCard[] {
  if (cards.length <= count) return shuffle([...cards], rng);

  const sorted = [...cards].sort((a, b) => a.year - b.year);
  const min    = sorted[0].year;
  const max    = sorted[sorted.length - 1].year;
  const span   = max - min || 1;
  const bucket = span / count;

  const result: EventCard[] = [];
  const used   = new Set<string>();

  for (let i = 0; i < count; i++) {
    const lo   = min + i * bucket;
    const hi   = lo  + bucket;
    const pool = sorted.filter(c => c.year >= lo && c.year < hi && !used.has(c.id));
    if (pool.length > 0) {
      const pick = pool[Math.floor(rng() * pool.length)];
      result.push(pick);
      used.add(pick.id);
    }
  }

  // Fill sparse buckets with nearest unused cards
  const remaining = shuffle(cards.filter(c => !used.has(c.id)), rng);
  while (result.length < count && remaining.length > 0) {
    result.push(remaining.pop()!);
  }

  return result;
}

/**
 * MEDIUM / HARD — sample cards from the tightest window of `windowYears`
 * that contains at least `count` cards.  Tries up to 40 random anchor
 * points; if none yields enough cards, widens the window by 50 % up to
 * a cap, then falls back to sampleBySpread.
 */
function sampleFromWindow(
  cards: EventCard[],
  count: number,
  windowYears: number,
  maxWindow: number,
  rng: Rng = Math.random,
): EventCard[] {
  const sorted  = [...cards].sort((a, b) => a.year - b.year);
  const anchors = shuffle([...cards], rng).slice(0, 40);

  // Try requested window size first, then grow
  for (let w = windowYears; w <= maxWindow; w = Math.ceil(w * 1.5)) {
    for (const anchor of anchors) {
      const half = w / 2;
      const win  = sorted.filter(c => c.year >= anchor.year - half && c.year <= anchor.year + half);
      if (win.length >= count) {
        return shuffle(win, rng).slice(0, count);
      }
    }
  }

  // Last resort: best window we can find
  let bestWin: EventCard[] = [];
  for (const anchor of anchors) {
    const half = maxWindow / 2;
    const win  = sorted.filter(c => c.year >= anchor.year - half && c.year <= anchor.year + half);
    if (win.length > bestWin.length) bestWin = win;
  }

  if (bestWin.length >= count) {
    return shuffle(bestWin, rng).slice(0, count);
  }

  // Truly not enough cards in any window — fall back to spread
  return sampleBySpread(cards, count, rng);
}

function applyConfig(config: GameConfig, rng: Rng): Card[] {
  const loaded = loadRawCards();
  const all = (config.categories && config.categories.length > 0)
    ? loaded.filter(c => config.categories!.includes(c.category as any))
    : loaded;
  const size = config.deckSize;

  let pool: EventCard[];
  if (config.difficulty === 'easy') {
    pool = sampleBySpread(all, size, rng);
  } else if (config.difficulty === 'medium') {
    pool = sampleFromWindow(all, size, 150, 400, rng);
  } else {
    pool = sampleFromWindow(all, size, 40, 120, rng);
  }

  return shuffle(pool, rng).map((card, i) => ({
    ...card,
    label: String.fromCharCode(65 + (i % 26)),
    revealed: false,
  }));
}

export function buildDeck(config: GameConfig): Card[] {
  return applyConfig(config, Math.random);
}

/**
 * Daily deck — deterministic for a given date + difficulty.
 * Everyone gets the same 20 cards in the same order on the same day.
 */
export function buildDailyDeck(config: GameConfig): Card[] {
  const dateStr = config.dailyDate ?? new Date().toISOString().slice(0, 10);
  const seed    = strToSeed(`${dateStr}:${config.difficulty}`);
  const rng     = mulberry32(seed);
  return applyConfig(config, rng);
}

export function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BC` : `${year} AD`;
}
