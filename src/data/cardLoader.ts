import type { Card, EventCard, GameConfig } from '../types';
import rawCards from './cards.json';

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ── Seeded PRNG (ported from server) ─────────────────────────────────────────

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

function shuffleArr<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sample cards spread evenly across the full timeline (easy mode). */
function sampleBySpread(cards: EventCard[], count: number, rng: Rng): EventCard[] {
  if (cards.length <= count) return shuffleArr([...cards], rng);
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
  const remaining = shuffleArr(cards.filter(c => !used.has(c.id)), rng);
  while (result.length < count && remaining.length > 0) result.push(remaining.pop()!);
  return result;
}

/** Sample cards from a tight year window (medium/hard mode). */
function sampleFromWindow(
  cards: EventCard[], count: number, windowYears: number, maxWindow: number, rng: Rng
): EventCard[] {
  const sorted  = [...cards].sort((a, b) => a.year - b.year);
  const anchors = shuffleArr([...cards], rng).slice(0, 40);
  for (let w = windowYears; w <= maxWindow; w = Math.ceil(w * 1.5)) {
    for (const anchor of anchors) {
      const half = w / 2;
      const win  = sorted.filter(c => c.year >= anchor.year - half && c.year <= anchor.year + half);
      if (win.length >= count) return shuffleArr(win, rng).slice(0, count);
    }
  }
  let bestWin: EventCard[] = [];
  for (const anchor of anchors) {
    const half = maxWindow / 2;
    const win  = sorted.filter(c => c.year >= anchor.year - half && c.year <= anchor.year + half);
    if (win.length > bestWin.length) bestWin = win;
  }
  if (bestWin.length >= count) return shuffleArr(bestWin, rng).slice(0, count);
  return sampleBySpread(cards, count, rng);
}

function applyConfig(cards: EventCard[], config: GameConfig, rng: Rng): Card[] {
  const pool = (config.categories && config.categories.length > 0)
    ? cards.filter(c => config.categories!.includes(c.category as any))
    : cards;
  const size = config.deckSize;
  const selected = config.difficulty === 'easy'
    ? sampleBySpread(pool, size, rng)
    : config.difficulty === 'medium'
      ? sampleFromWindow(pool, size, 150, 400, rng)
      : sampleFromWindow(pool, size, 40, 120, rng);
  return shuffleArr(selected, rng).map((card, i) => ({
    ...card,
    label: LABELS[i % LABELS.length],
    revealed: false,
  }));
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns all event cards from the data file, sorted by year ascending. */
export function loadCards(): EventCard[] {
  return (rawCards as EventCard[]).slice().sort((a, b) => a.year - b.year);
}

/** Builds a shuffled, labelled game deck using difficulty-aware sampling. */
export function buildDeck(cards: EventCard[], config: GameConfig): Card[] {
  return applyConfig(cards, config, Math.random);
}

/**
 * Daily deck — deterministic for a given date + difficulty.
 * Always 6 cards; same seed = same deck for all players on the same day.
 */
export function buildDailyDeck(config: GameConfig): Card[] {
  const dateStr = config.dailyDate ?? new Date().toISOString().slice(0, 10);
  const seed    = strToSeed(`${dateStr}:${config.difficulty}`);
  const rng     = mulberry32(seed);
  // Daily mode always uses 6 cards regardless of config.deckSize
  return applyConfig(loadCards(), { ...config, deckSize: 6 as GameConfig['deckSize'] }, rng);
}

/** Format a year number for display: negative = BC, positive = AD */
export function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BC`;
  return `${year} AD`;
}
