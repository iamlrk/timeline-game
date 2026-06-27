export type CardCategory =
  | 'science-technology'
  | 'war-politics'
  | 'art-culture-religion'
  | 'exploration-disasters';

export type GameMode    = 'classic' | 'endless' | 'daily';
export type ScoringMode = 'classic';
export type Difficulty  = 'easy' | 'medium' | 'hard';
export type DeckSize    = 20 | 40 | 60;
export type GamePhase   = 'lobby' | 'playing' | 'ended';

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
}

export interface Card extends EventCard {
  label: string;
  revealed: boolean;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  hand: Card[];
  discardPile: Card[];
}

export interface GameConfig {
  mode: GameMode;
  scoring: ScoringMode;
  difficulty: Difficulty;
  deckSize: DeckSize;
  maxPlayers: number;
  categories?: CardCategory[];
  /** ISO date string YYYY-MM-DD — used to seed the daily deck */
  dailyDate?: string;
}

/** One placement attempt in daily mode */
export interface AttemptResult {
  cardId: string;
  correct: boolean;
  /** How close the wrong guess was — only meaningful when !correct */
  proximity: 'exact' | 'close' | 'far';
  /** Where in the partial timeline the player tried to insert (wrong only) */
  insertIndex?: number;
}

export interface GameState {
  roomCode: string;
  config: GameConfig;
  players: Player[];
  currentPlayerIndex: number;
  deck: Card[];
  timeline: Card[];
  phase: GamePhase;
  turn: number;
  /** Daily mode: remaining lives (starts at 6) */
  lives?: number;
  /** Daily mode: ordered log of all placement attempts */
  attemptLog?: AttemptResult[];
}

// ── Socket event payloads ────────────────────────────────────────────────────

export interface C2S_CreateRoom {
  playerName: string;
  config: GameConfig;
}

export interface C2S_JoinRoom {
  roomCode: string;
  playerName: string;
}

export interface C2S_PlaceCard {
  cardId: string;
  insertIndex: number;
}

export interface S2C_RoomCreated {
  roomCode: string;
  playerId: string;
}

export interface S2C_StateUpdate {
  state: GameState;
  lastPlacedCardId: string | null;
  correct: boolean | null;
}

export interface S2C_Error {
  message: string;
}
