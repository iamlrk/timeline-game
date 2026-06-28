// ── Single-player entry point — no Socket.IO ─────────────────────────────────
// Built with: npm run build:sp  |  Dev: npm run dev:sp
import { renderTimeline } from './components/Timeline';
import { renderPlayerHand, getDraggedCardId, getSelectedCardId, clearSelectedCard } from './components/PlayerHand';
import { createCardElement } from './components/Card';
import { getFinalScore } from './game/GameState';
import { loadCards, buildDeck, buildDailyDeck } from './data/cardLoader';
import type { GameState, GameConfig, Card, Player } from './types';
import './styles/main.css';

// ── Constants ─────────────────────────────────────────────────────────────────
const MY_ID           = 'player-0';
const HAND_SIZE       = 5;
const DAILY_DECK_SIZE = 6;
const DAILY_LIVES     = 6;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const lobbyEl          = document.getElementById('lobby')!;
const appEl            = document.getElementById('app')!;
const gameOverEl       = document.getElementById('game-over')!;

const nameInput        = document.getElementById('lobby-name') as HTMLInputElement;
const btnSolo          = document.getElementById('btn-solo')!;
const lobbyStatus      = document.getElementById('lobby-status')!;

const playersHudEl     = document.getElementById('players-hud')!;
const turnIndicator    = document.getElementById('turn-indicator')!;
const turnEl           = document.getElementById('turn')!;
const deckCountEl      = document.getElementById('deck-count')!;
const handCountEl      = document.getElementById('hand-count')!;
const timelineEl       = document.getElementById('timeline')!;
const handEl           = document.getElementById('player-hand')!;
const handSectionEl    = document.getElementById('hand-section')!;
const discardSectionEl = document.getElementById('discard-section')!;
const discardPileEl    = document.getElementById('discard-pile')!;
const discardCountEl   = document.getElementById('discard-count')!;
const finalScoresEl    = document.getElementById('final-scores')!;
const restartBtn       = document.getElementById('restart-btn')!;
const exitBtn          = document.getElementById('btn-exit')!;

const handPillEl       = document.getElementById('hand-pill')!;
const pillHandBtn      = document.getElementById('pill-hand')!;
const pillDiscardBtn   = document.getElementById('pill-discard')!;
const pillHandCount    = document.getElementById('pill-hand-count')!;
const pillDiscardCount = document.getElementById('pill-discard-count')!;

// ── Hide multiplayer-only elements ────────────────────────────────────────────
const _hide = (el: Element | null) => { if (el) (el as HTMLElement).style.display = 'none'; };
_hide(document.getElementById('btn-create'));
_hide(document.getElementById('btn-join'));
_hide(document.getElementById('lobby-code'));
_hide(document.querySelector('.lobby-join-row'));
document.querySelectorAll<HTMLElement>('.lobby-or-row').forEach(el => {
  if (el.textContent?.toLowerCase().includes('multiplayer')) el.style.display = 'none';
});

// ── Session state ─────────────────────────────────────────────────────────────
let lastPlacedCardId: string | null = null;
let gameState: GameState | null     = null;
let activeTab: 'hand' | 'discard'  = 'hand';
let isDailyMode                     = false;
let dailyDifficulty: 'easy' | 'medium' | 'hard' = 'easy';

// ── Daily localStorage store ──────────────────────────────────────────────────
const DAILY_KEY = 'timeline-daily-v1';

interface DailyEntry  { score: number; won: boolean; ts: number; shareText: string; }
interface DailyStreak { current: number; best: number; last: string; }
interface DailyStore  { results: Record<string, DailyEntry>; streaks: Record<string, DailyStreak>; }

function getTodayStr(): string { return new Date().toISOString().slice(0, 10); }

function loadDailyStore(): DailyStore {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) return JSON.parse(raw) as DailyStore;
  } catch { /* ignore */ }
  return { results: {}, streaks: {} };
}

function saveDailyStore(store: DailyStore): void {
  localStorage.setItem(DAILY_KEY, JSON.stringify(store));
}

function getDailyEntry(diff: string): DailyEntry | null {
  return loadDailyStore().results[`${getTodayStr()}-${diff}`] ?? null;
}

function recordDailyResult(diff: string, score: number, won: boolean, shareText: string): DailyStreak {
  const store   = loadDailyStore();
  const key     = `${getTodayStr()}-${diff}`;
  const today   = getTodayStr();
  store.results[key] = { score, won, ts: Date.now(), shareText };
  const prev: DailyStreak = store.streaks[diff] ?? { current: 0, best: 0, last: '' };
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const current = prev.last === yesterday ? prev.current + 1
                : prev.last === today     ? prev.current
                : 1;
  const best = Math.max(prev.best, current);
  store.streaks[diff] = { current, best, last: today };
  saveDailyStore(store);
  return store.streaks[diff];
}

function getDailyStreak(diff: string): DailyStreak {
  return loadDailyStore().streaks[diff] ?? { current: 0, best: 0, last: '' };
}

function countTotalPlayed(): number {
  return Object.keys(loadDailyStore().results).length;
}

// ── Build shareable emoji text ────────────────────────────────────────────────
function buildShareText(state: GameState): string {
  const log      = state.attemptLog ?? [];
  const allCards = [...state.timeline, ...(state.players[0]?.hand ?? [])]
    .sort((a, b) => a.year - b.year);
  const N        = allCards.length || 6;
  const finalPos = new Map<string, number>();
  allCards.forEach((c, i) => finalPos.set(c.id, i));

  const placed     = new Array<boolean>(N).fill(false);
  const partialIds: string[] = [];
  const rows: string[] = [];

  for (const attempt of log) {
    const correctSlot = finalPos.get(attempt.cardId) ?? 0;
    if (attempt.correct) {
      placed[correctSlot] = true;
      const insertAt = partialIds.findIndex(id => (finalPos.get(id) ?? 0) > correctSlot);
      if (insertAt === -1) partialIds.push(attempt.cardId);
      else partialIds.splice(insertAt, 0, attempt.cardId);
      rows.push(placed.map(p => p ? '🟩' : '⬜').join(''));
    } else {
      const insertIdx  = attempt.insertIndex ?? partialIds.length;
      const posLeft    = insertIdx === 0 ? -1 : (finalPos.get(partialIds[insertIdx - 1]) ?? -1);
      const posRight   = insertIdx >= partialIds.length ? N : (finalPos.get(partialIds[insertIdx]) ?? N);
      const triedSlot  = Math.min(N - 1, Math.max(0, Math.round((posLeft + posRight) / 2)));
      const wrongEmoji = attempt.proximity === 'close' ? '🟨' : '🟥';
      rows.push(placed.map((p, i) => {
        if (i === correctSlot) return '🟦';
        if (i === triedSlot)   return wrongEmoji;
        return p ? '🟩' : '⬜';
      }).join(''));
    }
  }

  const d         = new Date(getTodayStr() + 'T12:00:00');
  const dateStr   = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const diffLabel = dailyDifficulty.charAt(0).toUpperCase() + dailyDifficulty.slice(1);
  return [
    `Timeline Daily — ${dateStr} (${diffLabel})`,
    `${state.timeline.length}/6`,
    '',
    ...rows,
    '',
    `🔥 ${getDailyStreak(dailyDifficulty).current} day streak`,
  ].join('\n');
}

// ── Refresh daily lobby buttons ───────────────────────────────────────────────
function refreshDailyUI(): void {
  const today = getTodayStr();
  const label = document.getElementById('daily-date-label');
  if (label) {
    const d = new Date(today + 'T12:00:00');
    label.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  (['easy', 'medium', 'hard'] as const).forEach(diff => {
    const btn      = document.getElementById(`daily-btn-${diff}`);
    const statusEl = document.getElementById(`daily-status-${diff}`);
    const streakEl = document.getElementById(`daily-streak-${diff}`);
    if (!btn || !statusEl || !streakEl) return;
    const entry  = getDailyEntry(diff);
    const streak = getDailyStreak(diff);
    streakEl.textContent = `🔥 ${streak.current}`;
    if (entry) {
      btn.classList.add('daily-btn--done');
      btn.classList.toggle('daily-btn--won',  entry.won);
      btn.classList.toggle('daily-btn--lost', !entry.won);
      statusEl.textContent = entry.won ? `✓ ${entry.score}/6` : `✗ ${entry.score}/6`;
    } else {
      btn.classList.remove('daily-btn--done', 'daily-btn--won', 'daily-btn--lost');
      statusEl.textContent = 'Play';
    }
  });
}

// ── Config helpers ────────────────────────────────────────────────────────────
const DEFAULT_CONFIG: GameConfig = {
  mode: 'classic', scoring: 'classic', difficulty: 'easy', deckSize: 20, maxPlayers: 1,
};

const diffBtns = document.querySelectorAll<HTMLButtonElement>('.diff-btn');
let selectedDifficulty: 'easy' | 'medium' | 'hard' = 'easy';

diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    diffBtns.forEach(b => b.classList.remove('diff-btn--active'));
    btn.classList.add('diff-btn--active');
    selectedDifficulty = btn.dataset.diff as 'easy' | 'medium' | 'hard';
  });
});

const catBtns = document.querySelectorAll<HTMLButtonElement>('.lobby-cat[data-cat]');
const ALL_CATS = ['science-technology', 'war-politics', 'exploration-disasters', 'art-culture-religion'] as const;
let selectedCats = new Set<string>(ALL_CATS);

catBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.cat!;
    if (cat === 'all') {
      const allOn = ALL_CATS.every(c => selectedCats.has(c));
      if (allOn) selectedCats.clear(); else ALL_CATS.forEach(c => selectedCats.add(c));
    } else {
      if (selectedCats.has(cat)) selectedCats.delete(cat); else selectedCats.add(cat);
      if (selectedCats.size === 0) selectedCats.add(cat);
    }
    syncCatUI();
  });
});

function syncCatUI(): void {
  const allOn = ALL_CATS.every(c => selectedCats.has(c));
  catBtns.forEach(btn => {
    const cat = btn.dataset.cat!;
    btn.classList.toggle('lobby-cat--active', cat === 'all' ? allOn : selectedCats.has(cat));
  });
}

function getConfig(): GameConfig {
  const categories = selectedCats.size === ALL_CATS.length ? undefined : [...selectedCats] as any[];
  return { ...DEFAULT_CONFIG, difficulty: selectedDifficulty, categories };
}

function getDailyConfig(diff: 'easy' | 'medium' | 'hard'): GameConfig {
  return { ...DEFAULT_CONFIG, mode: 'daily', difficulty: diff, dailyDate: getTodayStr() };
}

// ── Daily buttons ─────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.daily-btn[data-diff]').forEach(btn => {
  btn.addEventListener('click', () => {
    const diff = btn.dataset.diff as 'easy' | 'medium' | 'hard';
    if (getDailyEntry(diff)) return;
    isDailyMode     = true;
    dailyDifficulty = diff;
    startLocalGame(getDailyConfig(diff), nameInput.value.trim() || 'Player');
  });
});

refreshDailyUI();

// ── Daily copy button ─────────────────────────────────────────────────────────
document.getElementById('daily-copy-btn')?.addEventListener('click', () => {
  const pre  = document.getElementById('daily-share-pre') as HTMLPreElement | null;
  const text = pre?.textContent ?? '';
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('daily-copy-btn')!;
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy Result'; }, 2000);
  });
});

// ── Pill toggle ───────────────────────────────────────────────────────────────
function setActiveTab(tab: 'hand' | 'discard'): void {
  activeTab = tab;
  const onHand = tab === 'hand';
  pillHandBtn.classList.toggle('hand-pill-btn--active', onHand);
  pillDiscardBtn.classList.toggle('hand-pill-btn--active', !onHand);
  const pillVisible = getComputedStyle(handPillEl).display !== 'none';
  if (pillVisible) {
    handSectionEl.hidden    = !onHand;
    discardSectionEl.hidden = onHand;
  } else {
    handSectionEl.hidden    = false;
    discardSectionEl.hidden = false;
  }
}
pillHandBtn.addEventListener('click',    () => setActiveTab('hand'));
pillDiscardBtn.addEventListener('click', () => setActiveTab('discard'));

// ── Lobby buttons ─────────────────────────────────────────────────────────────
btnSolo.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) { setStatus('Enter your name first.'); return; }
  isDailyMode = false;
  startLocalGame(getConfig(), name);
});

restartBtn.addEventListener('click', () => {
  gameOverEl.setAttribute('hidden', '');
  isDailyMode = false;
  showLobby();
});

exitBtn.addEventListener('click', () => {
  gameOverEl.setAttribute('hidden', '');
  gameState = null;
  showLobby();
});

// ── Local game logic ──────────────────────────────────────────────────────────
function isCorrectPlacement(timeline: Card[], card: Card, insertIndex: number): boolean {
  const left  = timeline[insertIndex - 1];
  const right = timeline[insertIndex];
  return (!left || left.year <= card.year) && (!right || card.year <= right.year);
}

function getDailyProximity(timeline: Card[], card: Card, insertIndex: number): 'close' | 'far' {
  let correctIdx = 0;
  while (correctIdx < timeline.length && timeline[correctIdx].year <= card.year) correctIdx++;
  return Math.abs(correctIdx - insertIndex) <= 1 ? 'close' : 'far';
}

function placeCardClassic(
  state: GameState, player: Player, cardIdx: number, insertIndex: number
): { correct: boolean } {
  const [card]  = player.hand.splice(cardIdx, 1);
  const correct = isCorrectPlacement(state.timeline, card, insertIndex);

  if (correct) {
    const left    = state.timeline[insertIndex - 1];
    const right   = state.timeline[insertIndex];
    const isStack = (left && left.year === card.year) || (right && right.year === card.year);
    player.score += isStack ? 2 : 1;
    card.revealed = true;
    state.timeline.splice(insertIndex, 0, card);
  } else {
    card.revealed = true;
    player.discardPile.push(card);
  }

  if (state.deck.length > 0) {
    player.hand.push(state.deck.splice(0, 1)[0]);
  }

  if (state.deck.length === 0 && player.hand.length === 0) {
    state.phase = 'ended';
  } else {
    state.turn += 1;
  }

  return { correct };
}

function placeCardDaily(
  state: GameState, player: Player, cardIdx: number, cardId: string, insertIndex: number
): { correct: boolean } {
  const [card]  = player.hand.splice(cardIdx, 1);
  const correct = isCorrectPlacement(state.timeline, card, insertIndex);

  if (correct) {
    card.revealed = true;
    player.score += 1;
    state.timeline.splice(insertIndex, 0, card);
    state.attemptLog!.push({ cardId, correct: true, proximity: 'exact' });
    if (state.timeline.length === DAILY_DECK_SIZE) state.phase = 'ended';
  } else {
    const proximity = getDailyProximity(state.timeline, card, insertIndex);
    state.attemptLog!.push({ cardId, correct: false, proximity, insertIndex });
    state.lives! -= 1;
    player.hand.push(card);
    if (state.lives! <= 0) {
      player.hand.forEach(c => { c.revealed = true; });
      state.phase = 'ended';
    }
  }

  return { correct };
}

function placeCardLocal(state: GameState, cardId: string, insertIndex: number): { correct: boolean } {
  const player  = state.players[0];
  if (!player) return { correct: false };
  const cardIdx = player.hand.findIndex(c => c.id === cardId);
  if (cardIdx === -1) return { correct: false };
  return state.config.mode === 'daily'
    ? placeCardDaily(state, player, cardIdx, cardId, insertIndex)
    : placeCardClassic(state, player, cardIdx, insertIndex);
}

function startLocalGame(config: GameConfig, playerName: string): void {
  if (config.mode === 'daily') {
    const deck = buildDailyDeck(config);
    gameState  = {
      config,
      players: [{ id: MY_ID, name: playerName, score: 0, hand: [...deck], discardPile: [] }],
      currentPlayerIndex: 0,
      deck:      [],
      timeline:  [],
      phase:     'playing',
      turn:      1,
      lives:     DAILY_LIVES,
      attemptLog: [],
    };
  } else {
    const deck = buildDeck(loadCards(), config);
    const hand = deck.splice(0, HAND_SIZE);
    gameState  = {
      config,
      players: [{ id: MY_ID, name: playerName, score: 0, hand, discardPile: [] }],
      currentPlayerIndex: 0,
      deck,
      timeline:  [],
      phase:     'playing',
      turn:      1,
    };
  }
  showGame();
  render(gameState);
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function render(state: GameState): void {
  const me = state.players.find(p => p.id === MY_ID);
  if (!me) return;

  renderPlayersHud(state);
  turnEl.textContent      = String(state.turn);
  deckCountEl.textContent = String(state.deck.length);
  handCountEl.textContent = String(me.hand.length);

  if (isDailyMode && state.lives !== undefined) {
    const lives = state.lives;
    turnIndicator.textContent    = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, 6 - lives));
    turnIndicator.style.color    = lives <= 2 ? 'var(--wrong)' : 'var(--text-primary)';
    turnIndicator.style.fontSize = '0.7rem';
  } else {
    turnIndicator.textContent    = 'Your turn';
    turnIndicator.style.color    = 'var(--accent)';
    turnIndicator.style.fontSize = '';
  }

  renderTimeline(timelineEl, state.timeline, getDraggedCardId, handleDrop, lastPlacedCardId, getSelectedCardId);
  renderPlayerHand(handEl, me.hand, true, () => {
    renderTimeline(timelineEl, state.timeline, getDraggedCardId, handleDrop, null, getSelectedCardId);
  }, handleDrop);

  if (isDailyMode) {
    handPillEl.hidden            = true;
    discardSectionEl.hidden      = true;
    handSectionEl.hidden         = false;
    pillHandCount.textContent    = String(me.hand.length);
    pillDiscardCount.textContent = '0';
  } else {
    renderDiscardPile(me.discardPile, me.hand.length);
  }
}

function renderPlayersHud(state: GameState): void {
  playersHudEl.innerHTML = '';
  state.players.forEach(player => {
    const chip    = document.createElement('div');
    chip.className = 'player-chip' + (state.phase === 'playing' ? ' player-chip--active' : '');
    const final   = getFinalScore(player);
    chip.innerHTML =
      '<span class="pc-dot"></span>' +
      '<span class="pc-name">' + player.name + ' (you)</span>' +
      '<span class="pc-score">' + (final >= 0 ? '+' : '') + final + '</span>' +
      (player.discardPile.length > 0
        ? '<span class="pc-discard">x' + player.discardPile.length + '</span>'
        : '');
    playersHudEl.appendChild(chip);
  });
}

function showGameOver(state: GameState): void {
  finalScoresEl.innerHTML = '';
  const player = state.players[0];
  if (player) {
    const final = getFinalScore(player);
    const row   = document.createElement('div');
    row.className = 'final-score-row final-score-row--winner';
    row.innerHTML =
      '<span class="fs-rank">1st</span>' +
      '<span class="fs-name">' + player.name + ' (you)</span>' +
      '<span class="fs-detail">+' + player.score +
        (isDailyMode ? '' : ' - ' + player.discardPile.length + ' discards') + '</span>' +
      '<span class="fs-total">' + (final >= 0 ? '+' : '') + final + '</span>';
    finalScoresEl.appendChild(row);
  }

  const subtitleEl = document.getElementById('game-over-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = isDailyMode
      ? `Daily ${dailyDifficulty.charAt(0).toUpperCase() + dailyDifficulty.slice(1)} — ${getTodayStr()}`
      : 'Classic Mode — Final Score';
  }

  const dailyResultEl = document.getElementById('daily-result');
  if (isDailyMode && dailyResultEl && player) {
    const score     = state.timeline.length;
    const won       = score === DAILY_DECK_SIZE;
    const shareText = buildShareText(state);
    const streak    = recordDailyResult(dailyDifficulty, score, won, shareText);

    const pre = document.getElementById('daily-share-pre') as HTMLPreElement | null;
    if (pre) pre.textContent = shareText;

    const drStreak = document.getElementById('dr-streak');
    const drBest   = document.getElementById('dr-best');
    const drPlayed = document.getElementById('dr-played');
    if (drStreak) drStreak.textContent = String(streak.current);
    if (drBest)   drBest.textContent   = String(streak.best);
    if (drPlayed) drPlayed.textContent = String(countTotalPlayed());

    dailyResultEl.removeAttribute('hidden');
  } else if (dailyResultEl) {
    dailyResultEl.setAttribute('hidden', '');
  }

  gameOverEl.removeAttribute('hidden');
}

function renderDiscardPile(discards: Card[], handSize: number): void {
  pillHandCount.textContent    = String(handSize);
  pillDiscardCount.textContent = String(discards.length);

  if (discards.length === 0) {
    handPillEl.hidden       = true;
    handSectionEl.hidden    = false;
    discardSectionEl.hidden = true;
    activeTab = 'hand';
    return;
  }

  discardCountEl.textContent = String(discards.length);
  discardPileEl.innerHTML    = '';
  discards.forEach(card => discardPileEl.appendChild(createCardElement(card, { revealed: true })));

  handPillEl.hidden = false;
  setActiveTab(activeTab);

  if (discards.length === 1 && activeTab === 'hand') {
    setActiveTab('discard');
    setTimeout(() => setActiveTab('hand'), 1400);
  }
}

// ── Drop handler ──────────────────────────────────────────────────────────────
function handleDrop(cardId: string, insertIndex: number): void {
  if (!gameState) return;
  const currentPhase = gameState.phase;
  if (currentPhase !== 'playing') return;
  clearSelectedCard();

  const { correct } = placeCardLocal(gameState, cardId, insertIndex);
  lastPlacedCardId  = correct ? cardId : null;

  timelineEl.classList.add(correct ? 'timeline--correct' : 'timeline--wrong');
  setTimeout(() => timelineEl.classList.remove('timeline--correct', 'timeline--wrong'), 700);

  render(gameState);

  if (gameState.phase === 'ended') {
    showGameOver(gameState);
  }

  lastPlacedCardId = null;
}

// ── Screen transitions ────────────────────────────────────────────────────────
function showLobby(): void {
  lobbyEl.removeAttribute('hidden');
  appEl.setAttribute('hidden', '');
  lobbyStatus.textContent      = '';
  isDailyMode                  = false;
  activeTab                    = 'hand';
  turnIndicator.style.fontSize = '';
  refreshDailyUI();
}

function showGame(): void {
  lobbyEl.setAttribute('hidden', '');
  appEl.removeAttribute('hidden');
}

function setStatus(msg: string): void { lobbyStatus.textContent = msg; }
