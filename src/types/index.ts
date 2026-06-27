// ─── Categories ──────────────────────────────────────────────────────────────

export type CardCategory =
  | 'science-technology'
  | 'war-politics'
  | 'art-culture-religion'
  | 'exploration-disasters';

// ─── EventCard ───────────────────────────────────────────────────────────────

export interface EventCard {
  id: string;
  event: string;
  year: number;
  month?: number;
  day?: number;
  description: string;
  category: CardCategory;
  tags: string[];
  difficulty: 1 | 2 | 3;
  imageUrl?: string;
  imageCaption?: string;
  source?: string;
  region?: string;
  wikipediaSlug?: string;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export interface Card extends EventCard {
  label: string;
  revealed: boolean;
}

// ─── Player ──────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  score: number;
  hand: Card[];
  discardPile: Card[];
}

// ─── Config & Modes ──────────────────────────────────────────────────────────

export type GameMode     = 'classic' | 'endless' | 'time-trial' | 'daily';
export type ScoringMode  = 'classic' | 'advanced';
export type Difficulty   = 'easy' | 'medium' | 'hard';
export type DeckSize     = 20 | 40 | 60;

export interface GameConfig {
  mode:        GameMode;
  scoring:     ScoringMode;
  difficulty:  Difficulty;
  deckSize:    DeckSize;
  maxPlayers:  number;
  categories?: CardCategory[];
  dailyDate?:  string;
}

// ─── Daily attempt tracking ───────────────────────────────────────────────────

export interface AttemptResult {
  cardId: string;
  correct: boolean;
  proximity: 'exact' | 'close' | 'far';
  /** Where in the partial timeline the player tried to insert (wrong only) */
  insertIndex?: number;
}

// ─── Game State ──────────────────────────────────────────────────────────────

export type GamePhase = 'lobby' | 'playing' | 'round-end' | 'ended';

export interface GameState {
  config:               GameConfig;
  players:              Player[];
  currentPlayerIndex:   number;
  deck:                 Card[];
  timeline:             Card[];
  phase:                GamePhase;
  turn:                 number;
  /** Daily mode: lives remaining */
  lives?:               number;
  /** Daily mode: ordered placement attempt log */
  attemptLog?:          AttemptResult[];
}
