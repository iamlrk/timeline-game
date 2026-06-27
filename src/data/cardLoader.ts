import type { Card, EventCard, GameConfig } from '../types';
import rawCards from './cards.json';

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Returns all event cards from the data file, sorted by year ascending. */
export function loadCards(): EventCard[] {
  return (rawCards as EventCard[]).slice().sort((a, b) => a.year - b.year);
}

/**
 * Builds a shuffled, labelled game deck from the event card pool.
 * Filters by difficulty if config.difficulty is not 'easy'.
 * Caps at config.deckSize cards.
 */
export function buildDeck(cards: EventCard[], config: GameConfig): Card[] {
  let pool = [...cards];

  // Difficulty filter: easy = all, medium = 1+2, hard = all (3 included)
  if (config.difficulty === 'medium') {
    pool = pool.filter((c) => c.difficulty <= 2);
  }

  // Shuffle pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Take up to deckSize, assign labels, mark unrevealed
  return pool.slice(0, config.deckSize).map((eventCard, i) => ({
    ...eventCard,
    label: LABELS[i % LABELS.length],
    revealed: false,
  }));
}

/** Format a year number for display: negative = BC, positive = AD */
export function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BC`;
  return `${year} AD`;
}
