import type { Card, EventCard, GameConfig, GameState, Player } from '../types';
import { buildDeck } from '../data/cardLoader';

const HAND_SIZE = 5;

function createPlayer(id: string, name: string, hand: Card[]): Player {
  return { id, name, score: 0, hand, discardPile: [] };
}

export function createInitialGameState(
  config: GameConfig,
  playerNames: string[],
  cardPool: EventCard[]
): GameState {
  const deck = buildDeck(cardPool, config);

  const players: Player[] = playerNames.map((name, i) => {
    const hand = deck.splice(0, HAND_SIZE);
    return createPlayer(`player-${i}`, name, hand);
  });

  return { config, players, currentPlayerIndex: 0, deck, timeline: [], phase: 'playing', turn: 1 };
}

export function getCurrentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

function isCorrectPlacement(timeline: Card[], card: Card, insertIndex: number): boolean {
  const left  = timeline[insertIndex - 1];
  const right = timeline[insertIndex];
  return (!left || left.year <= card.year) && (!right || card.year <= right.year);
}

export function placeCard(
  state: GameState,
  cardId: string,
  insertIndex: number
): { correct: boolean; state: GameState } {
  const player = getCurrentPlayer(state);
  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return { correct: false, state };

  const [card] = player.hand.splice(cardIdx, 1);
  const correct = isCorrectPlacement(state.timeline, card, insertIndex);

  if (correct) {
    const left  = state.timeline[insertIndex - 1];
    const right = state.timeline[insertIndex];
    const isStack = (left && left.year === card.year) || (right && right.year === card.year);
    player.score += isStack ? 2 : 1;
    card.revealed = true;
    state.timeline.splice(insertIndex, 0, card);
  } else {
    card.revealed = true;
    player.discardPile.push(card);
  }

  return { correct, state };
}

export function advanceTurn(state: GameState): GameState {
  const n = state.players.length;
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % n;
  if (state.currentPlayerIndex === 0) state.turn += 1;
  return state;
}

export function drawCard(state: GameState, player: Player): void {
  if (state.deck.length > 0) {
    const [card] = state.deck.splice(0, 1);
    player.hand.push(card);
  }
}

export function isGameOver(state: GameState): boolean {
  if (state.deck.length > 0) return false;
  return state.players.every((p) => p.hand.length === 0);
}

export function getFinalScore(player: Player): number {
  return player.score - player.discardPile.length;
}
