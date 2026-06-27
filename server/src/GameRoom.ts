import type { Card, GameConfig, GameState, Player, AttemptResult } from './types';
import { buildDeck, buildDailyDeck } from './cardLoader';

const HAND_SIZE      = 5;
const DAILY_DECK_SIZE = 6;
const DAILY_LIVES     = 6;

function makeRoomCode(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function createPlayer(socketId: string, name: string, hand: Card[]): Player {
  return { id: socketId, name, score: 0, hand, discardPile: [] };
}

function isCorrectPlacement(timeline: Card[], card: Card, insertIndex: number): boolean {
  const left  = timeline[insertIndex - 1];
  const right = timeline[insertIndex];
  return (!left || left.year <= card.year) && (!right || card.year <= right.year);
}

/**
 * For a wrong daily placement, find how many slots away the card is from
 * its correct position in the current timeline.
 * ≤ 1 slot = 'close', > 1 slot = 'far'.
 */
function getDailyProximity(timeline: Card[], card: Card, insertIndex: number): 'close' | 'far' {
  let correctIdx = 0;
  while (correctIdx < timeline.length && timeline[correctIdx].year <= card.year) correctIdx++;
  return Math.abs(correctIdx - insertIndex) <= 1 ? 'close' : 'far';
}

export class GameRoom {
  readonly code: string;
  readonly config: GameConfig;
  private state: GameState;
  private hostSocketId: string;

  constructor(hostSocketId: string, config: GameConfig) {
    this.code         = makeRoomCode();
    this.config       = config;
    this.hostSocketId = hostSocketId;

    this.state = {
      roomCode:           this.code,
      config,
      players:            [],
      currentPlayerIndex: 0,
      deck:               [],
      timeline:           [],
      phase:              'lobby',
      turn:               1,
    };
  }

  addPlayer(socketId: string, name: string): boolean {
    if (this.state.phase !== 'lobby') return false;
    if (this.state.players.length >= this.config.maxPlayers) return false;
    if (this.state.players.some(p => p.id === socketId)) return false;
    this.state.players.push(createPlayer(socketId, name, []));
    return true;
  }

  removePlayer(socketId: string): void {
    this.state.players = this.state.players.filter(p => p.id !== socketId);
  }

  get playerCount(): number { return this.state.players.length; }
  get isFull(): boolean     { return this.state.players.length >= this.config.maxPlayers; }
  get phase(): string       { return this.state.phase; }

  startGame(): void {
    const isDaily = this.config.mode === 'daily';

    // Override deckSize for daily mode
    const cfg = isDaily
      ? { ...this.config, deckSize: DAILY_DECK_SIZE as 20 }
      : this.config;

    const deck = isDaily ? buildDailyDeck(cfg) : buildDeck(cfg);

    if (isDaily) {
      // All cards go straight to the one player's hand — no draw pile
      const player = this.state.players[0];
      if (player) player.hand = [...deck];
      this.state.deck       = [];
      this.state.lives      = DAILY_LIVES;
      this.state.attemptLog = [];
    } else {
      for (const player of this.state.players) {
        player.hand = deck.splice(0, HAND_SIZE);
      }
      this.state.deck = deck;
    }

    this.state.phase              = 'playing';
    this.state.currentPlayerIndex = 0;
    this.state.turn               = 1;
  }

  getCurrentPlayerId(): string {
    return this.state.players[this.state.currentPlayerIndex]?.id ?? '';
  }

  placeCard(
    socketId: string,
    cardId: string,
    insertIndex: number,
  ): { correct: boolean; lastPlacedCardId: string | null } {
    if (this.config.mode === 'daily') {
      return this.placeCardDaily(socketId, cardId, insertIndex);
    }
    return this.placeCardClassic(socketId, cardId, insertIndex);
  }

  private placeCardClassic(
    socketId: string,
    cardId: string,
    insertIndex: number,
  ): { correct: boolean; lastPlacedCardId: string | null } {
    const player = this.state.players.find(p => p.id === socketId);
    if (!player) return { correct: false, lastPlacedCardId: null };

    const cardIdx = player.hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return { correct: false, lastPlacedCardId: null };

    const [card]  = player.hand.splice(cardIdx, 1);
    const correct = isCorrectPlacement(this.state.timeline, card, insertIndex);

    if (correct) {
      const left   = this.state.timeline[insertIndex - 1];
      const right  = this.state.timeline[insertIndex];
      const isStack = (left && left.year === card.year) || (right && right.year === card.year);
      player.score += isStack ? 2 : 1;
      card.revealed = true;
      this.state.timeline.splice(insertIndex, 0, card);
    } else {
      card.revealed = true;
      player.discardPile.push(card);
    }

    // Draw replacement
    if (this.state.deck.length > 0) {
      const [drawn] = this.state.deck.splice(0, 1);
      player.hand.push(drawn);
    }

    // Game over
    if (this.state.deck.length === 0 && this.state.players.every(p => p.hand.length === 0)) {
      this.state.phase = 'ended';
      return { correct, lastPlacedCardId: correct ? cardId : null };
    }

    // Advance turn
    const n = this.state.players.length;
    this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % n;
    if (this.state.currentPlayerIndex === 0) this.state.turn += 1;

    return { correct, lastPlacedCardId: correct ? cardId : null };
  }

  private placeCardDaily(
    socketId: string,
    cardId: string,
    insertIndex: number,
  ): { correct: boolean; lastPlacedCardId: string | null } {
    const player = this.state.players.find(p => p.id === socketId);
    if (!player) return { correct: false, lastPlacedCardId: null };

    const cardIdx = player.hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return { correct: false, lastPlacedCardId: null };

    // Remove from hand temporarily
    const [card]  = player.hand.splice(cardIdx, 1);
    const correct = isCorrectPlacement(this.state.timeline, card, insertIndex);

    if (correct) {
      card.revealed = true;
      player.score += 1;
      this.state.timeline.splice(insertIndex, 0, card);
      this.state.attemptLog!.push({ cardId, correct: true, proximity: 'exact' });

      // Win: all cards placed on timeline
      if (this.state.timeline.length === DAILY_DECK_SIZE) {
        this.state.phase = 'ended';
      }
    } else {
      // Wrong: calculate proximity, return card to hand unrevealed
      const proximity = getDailyProximity(this.state.timeline, card, insertIndex);
      this.state.attemptLog!.push({ cardId, correct: false, proximity, insertIndex });
      this.state.lives! -= 1;

      // Put card at the end of hand (unrevealed)
      player.hand.push(card);

      if (this.state.lives! <= 0) {
        // Reveal remaining hand cards so player can see what they missed
        player.hand.forEach(c => { c.revealed = true; });
        this.state.phase = 'ended';
      }
    }

    return { correct, lastPlacedCardId: correct ? cardId : null };
  }

  getState(): GameState {
    return this.state;
  }

  isHost(socketId: string): boolean {
    return socketId === this.hostSocketId;
  }
}
