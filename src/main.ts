import { io, Socket } from 'socket.io-client';
import { renderTimeline } from './components/Timeline';
import { renderPlayerHand, getDraggedCardId, getSelectedCardId, clearSelectedCard } from './components/PlayerHand';
import { createCardElement } from './components/Card';
import { getFinalScore } from './game/GameState';
import type { GameState, GameConfig, Card } from './types';
import './styles/main.css';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const lobbyEl          = document.getElementById('lobby')!;
const waitingEl        = document.getElementById('waiting')!;
const waitingCodeEl    = document.getElementById('waiting-code')!;
const waitingPlayers   = document.getElementById('waiting-players')!;
const appEl            = document.getElementById('app')!;
const gameOverEl       = document.getElementById('game-over')!;

const nameInput        = document.getElementById('lobby-name') as HTMLInputElement;
const codeInput        = document.getElementById('lobby-code') as HTMLInputElement;
const btnSolo          = document.getElementById('btn-solo')!;
const btnCreate        = document.getElementById('btn-create')!;
const btnJoin          = document.getElementById('btn-join')!;
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

// ── Session state ─────────────────────────────────────────────────────────────
let socket: Socket;
let mySocketId: string              = '';
let lastPlacedCardId: string | null = null;
let gameState: GameState | null     = null;
let activeTab: 'hand' | 'discard'   = 'hand';
let isDailyMode: boolean            = false;
let dailyDifficulty: 'easy' | 'medium' | 'hard' = 'easy';

// ── Daily localStorage store ──────────────────────────────────────────────────

const DAILY_KEY = 'timeline-daily-v1';

interface DailyEntry {
  score: number;
  won: boolean;
  ts: number;
  shareText: string;
}

interface DailyStreak {
  current: number;
  best: number;
  last: string;
}

interface DailyStore {
  results: Record<string, DailyEntry>;
  streaks: Record<string, DailyStreak>;
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  const store     = loadDailyStore();
  const key       = `${getTodayStr()}-${diff}`;
  const today     = getTodayStr();
  store.results[key] = { score, won, ts: Date.now(), shareText };

  const prev: DailyStreak = store.streaks[diff] ?? { current: 0, best: 0, last: '' };
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const current   = prev.last === yesterday ? prev.current + 1
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

// ── Build the shareable emoji text ────────────────────────────────────────────
function buildShareText(state: GameState): string {
  const log = state.attemptLog ?? [];

  // All 6 cards sorted by year — index = final timeline position (0–5)
  const allCards = [
    ...state.timeline,
    ...(state.players[0]?.hand ?? []),
  ].sort((a, b) => a.year - b.year);

  const N = allCards.length || 6;
  const finalPos = new Map<string, number>();
  allCards.forEach((c, i) => finalPos.set(c.id, i));

  // Replay the game to reconstruct the partial timeline at each step.
  // Each attempt = one row. Columns = the 6 final sorted positions.
  //   🟩 = correctly placed (accumulates)
  //   🟦 = this card's correct slot (on a wrong attempt — "it belongs here")
  //   🟨 = wrong attempt, close (at the slot the player tried)
  //   🟥 = wrong attempt, far   (at the slot the player tried)
  //   ⬜ = unplayed
  const placed = new Array<boolean>(N).fill(false);
  const partialIds: string[] = []; // cardIds in partial timeline order
  const rows: string[] = [];

  for (const attempt of log) {
    const correctSlot = finalPos.get(attempt.cardId) ?? 0;

    if (attempt.correct) {
      placed[correctSlot] = true;
      // Maintain partial timeline for future wrong-attempt mapping
      const insertAt = partialIds.findIndex(id => (finalPos.get(id) ?? 0) > correctSlot);
      if (insertAt === -1) partialIds.push(attempt.cardId);
      else partialIds.splice(insertAt, 0, attempt.cardId);

      rows.push(placed.map(p => p ? '🟩' : '⬜').join(''));
    } else {
      // Map player's insertIndex in the partial timeline → final slot
      const insertIdx  = attempt.insertIndex ?? partialIds.length;
      const posLeft    = insertIdx === 0 ? -1 : (finalPos.get(partialIds[insertIdx - 1]) ?? -1);
      const posRight   = insertIdx >= partialIds.length ? N : (finalPos.get(partialIds[insertIdx]) ?? N);
      const triedSlot  = Math.min(N - 1, Math.max(0, Math.round((posLeft + posRight) / 2)));
      const wrongEmoji = attempt.proximity === 'close' ? '🟨' : '🟥';

      rows.push(placed.map((p, i) => {
        if (i === correctSlot) return '🟦';        // where it belongs
        if (i === triedSlot)   return wrongEmoji;  // where player put it
        return p ? '🟩' : '⬜';
      }).join(''));
      // Card not placed — partialIds unchanged
    }
  }

  const today     = getTodayStr();
  const d         = new Date(today + 'T12:00:00');
  const dateStr   = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const diffLabel = dailyDifficulty.charAt(0).toUpperCase() + dailyDifficulty.slice(1);
  const score     = state.timeline.length;
  const streak    = getDailyStreak(dailyDifficulty).current;

  return [
    `Timeline Daily — ${dateStr} (${diffLabel})`,
    `${score}/6`,
    '',
    ...rows,
    '',
    `🔥 ${streak} day streak`,
  ].join('\n');
}

// ── Refresh daily buttons in lobby ────────────────────────────────────────────
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
  mode: 'classic',
  scoring: 'classic',
  difficulty: 'easy',
  deckSize: 20,
  maxPlayers: 2,
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

function getConfig(maxPlayers: number): GameConfig {
  const categories = selectedCats.size === ALL_CATS.length ? undefined : [...selectedCats] as any[];
  return { ...DEFAULT_CONFIG, difficulty: selectedDifficulty, maxPlayers, categories };
}

function getDailyConfig(diff: 'easy' | 'medium' | 'hard'): GameConfig {
  return {
    ...DEFAULT_CONFIG,
    mode: 'daily',
    difficulty: diff,
    maxPlayers: 1,
    deckSize: 20, // server overrides to 6
    dailyDate: getTodayStr(),
  };
}

// ── Daily buttons ─────────────────────────────────────────────────────────────
const dailyBtns = document.querySelectorAll<HTMLButtonElement>('.daily-btn[data-diff]');
dailyBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const diff = btn.dataset.diff as 'easy' | 'medium' | 'hard';
    if (getDailyEntry(diff)) return;
    const name = nameInput.value.trim() || 'Player';
    isDailyMode     = true;
    dailyDifficulty = diff;
    connectAndEmit(() => socket.emit('create_room', { playerName: name, config: getDailyConfig(diff) }));
  });
});

refreshDailyUI();

// ── Copy button ───────────────────────────────────────────────────────────────
const dailyCopyBtn = document.getElementById('daily-copy-btn');
if (dailyCopyBtn) {
  dailyCopyBtn.addEventListener('click', () => {
    const pre = document.getElementById('daily-share-pre') as HTMLPreElement | null;
    const text = pre?.textContent ?? '';
    navigator.clipboard.writeText(text).then(() => {
      dailyCopyBtn.textContent = '✓ Copied!';
      setTimeout(() => { dailyCopyBtn.textContent = '📋 Copy Result'; }, 2000);
    });
  });
}

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
  connectAndEmit(() => socket.emit('create_room', { playerName: name, config: getConfig(1) }));
});

btnCreate.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) { setStatus('Enter your name first.'); return; }
  connectAndEmit(() => socket.emit('create_room', { playerName: name, config: getConfig(2) }));
});

btnJoin.addEventListener('click', () => {
  const name = nameInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();
  if (!name) { setStatus('Enter your name first.'); return; }
  if (!code) { setStatus('Enter a room code.');     return; }
  connectAndEmit(() => socket.emit('join_room', { roomCode: code, playerName: name }));
});

restartBtn.addEventListener('click', () => {
  gameOverEl.setAttribute('hidden', '');
  isDailyMode = false;
  showLobby();
});

exitBtn.addEventListener('click', () => {
  if (socket?.connected) socket.disconnect();
  gameOverEl.setAttribute('hidden', '');
  showLobby();
});

// ── Socket bootstrap ──────────────────────────────────────────────────────────
function connectAndEmit(callback: () => void): void {
  if (socket?.connected) { callback(); return; }
  socket     = io({ path: '/socket.io' });
  mySocketId = '';

  socket.on('connect', () => { mySocketId = socket.id ?? ''; callback(); });

  socket.on('room_created', ({ playerId }: { roomCode: string; playerId: string }) => {
    mySocketId = playerId;
  });

  socket.on('room_joined', ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
    mySocketId = playerId;
    showWaiting(roomCode);
  });

  socket.on('state_update', ({ state, lastPlacedCardId: lp, correct }: {
    state: GameState; lastPlacedCardId: string | null; correct: boolean | null;
  }) => {
    gameState        = state;
    lastPlacedCardId = lp;

    if (state.phase === 'lobby') { renderWaitingPlayers(state); return; }

    if (state.phase === 'playing') {
      showGame();
      if (correct !== null) {
        timelineEl.classList.add(correct ? 'timeline--correct' : 'timeline--wrong');
        setTimeout(() => timelineEl.classList.remove('timeline--correct', 'timeline--wrong'), 700);
      }
      render(state);
      lastPlacedCardId = null;
      return;
    }

    if (state.phase === 'ended') {
      showGame();
      render(state);
      showGameOver(state);
    }
  });

  socket.on('error', ({ message }: { message: string }) => setStatus(message));
  socket.on('disconnect', () => { setStatus('Disconnected from server.'); showLobby(); });
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function render(state: GameState): void {
  const me = state.players.find(p => p.id === mySocketId);
  if (!me) return;

  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn      = currentPlayer?.id === mySocketId;

  renderPlayersHud(state);
  turnEl.textContent      = String(state.turn);
  deckCountEl.textContent = String(state.deck.length);
  handCountEl.textContent = String(me.hand.length);

  if (isDailyMode && state.lives !== undefined) {
    const lives     = state.lives;
    const filled    = '❤️'.repeat(Math.max(0, lives));
    const empty     = '🖤'.repeat(Math.max(0, 6 - lives));
    turnIndicator.textContent = filled + empty;
    turnIndicator.style.color = lives <= 2 ? 'var(--wrong)' : 'var(--text-primary)';
    turnIndicator.style.fontSize = '0.7rem';
  } else {
    turnIndicator.textContent = isMyTurn ? 'Your turn' : (currentPlayer?.name ?? '...') + "'s turn";
    turnIndicator.style.color    = isMyTurn ? 'var(--accent)' : 'var(--text-muted)';
    turnIndicator.style.fontSize = '';
  }

  renderTimeline(timelineEl, state.timeline, getDraggedCardId, handleDrop, lastPlacedCardId, getSelectedCardId);

  renderPlayerHand(handEl, me.hand, isMyTurn, () => {
    renderTimeline(timelineEl, state.timeline, getDraggedCardId, handleDrop, null, getSelectedCardId);
  }, handleDrop);

  // Daily mode has no discard pile — hide that UI
  if (isDailyMode) {
    handPillEl.hidden       = true;
    discardSectionEl.hidden = true;
    handSectionEl.hidden    = false;
    pillHandCount.textContent    = String(me.hand.length);
    pillDiscardCount.textContent = '0';
  } else {
    renderDiscardPile(me.discardPile, me.hand.length);
  }
}

function renderPlayersHud(state: GameState): void {
  playersHudEl.innerHTML = '';
  state.players.forEach(player => {
    const isActive = player.id === state.players[state.currentPlayerIndex]?.id && state.phase === 'playing';
    const isMe     = player.id === mySocketId;
    const chip     = document.createElement('div');
    chip.className = 'player-chip' + (isActive ? ' player-chip--active' : '');
    const final    = getFinalScore(player);
    chip.innerHTML =
      '<span class="pc-dot"></span>' +
      '<span class="pc-name">' + player.name + (isMe ? ' (you)' : '') + '</span>' +
      '<span class="pc-score">' + (final >= 0 ? '+' : '') + final + '</span>' +
      (player.discardPile.length > 0 ? '<span class="pc-discard">x' + player.discardPile.length + '</span>' : '');
    playersHudEl.appendChild(chip);
  });
}

function showGameOver(state: GameState): void {
  // Final scores
  finalScoresEl.innerHTML = '';
  const sorted = [...state.players].sort((a, b) => getFinalScore(b) - getFinalScore(a));
  sorted.forEach((player, rank) => {
    const final = getFinalScore(player);
    const isMe  = player.id === mySocketId;
    const row   = document.createElement('div');
    row.className = 'final-score-row' + (rank === 0 ? ' final-score-row--winner' : '');
    const medal = ['1st', '2nd', '3rd'][rank] ?? (rank + 1) + '.';
    row.innerHTML =
      '<span class="fs-rank">' + medal + '</span>' +
      '<span class="fs-name">' + player.name + (isMe ? ' (you)' : '') + '</span>' +
      '<span class="fs-detail">+' + player.score + (isDailyMode ? '' : ' - ' + player.discardPile.length + ' discards') + '</span>' +
      '<span class="fs-total">' + (final >= 0 ? '+' : '') + final + '</span>';
    finalScoresEl.appendChild(row);
  });

  const subtitleEl = document.getElementById('game-over-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = isDailyMode
      ? `Daily ${dailyDifficulty.charAt(0).toUpperCase() + dailyDifficulty.slice(1)} — ${getTodayStr()}`
      : 'Classic Mode — Final Scores';
  }

  const dailyResultEl = document.getElementById('daily-result');
  if (isDailyMode && dailyResultEl) {
    const score     = state.timeline.length;
    const won       = score === 6;
    const shareText = buildShareText(state);

    const streak = recordDailyResult(dailyDifficulty, score, won, shareText);

    // Render the share text in the pre
    const pre = document.getElementById('daily-share-pre') as HTMLPreElement | null;
    if (pre) pre.textContent = shareText;

    // Streak stats
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

function handleDrop(cardId: string, insertIndex: number): void {
  if (!socket?.connected) return;
  clearSelectedCard();
  socket.emit('place_card', { cardId, insertIndex });
}

// ── Screen transitions ────────────────────────────────────────────────────────
function showLobby(): void {
  lobbyEl.removeAttribute('hidden');
  waitingEl.setAttribute('hidden', '');
  appEl.setAttribute('hidden', '');
  lobbyStatus.textContent = '';
  codeInput.value = '';
  isDailyMode = false;
  activeTab   = 'hand';
  turnIndicator.style.fontSize = '';
  refreshDailyUI();
}

function showWaiting(code: string): void {
  lobbyEl.setAttribute('hidden', '');
  waitingEl.removeAttribute('hidden');
  appEl.setAttribute('hidden', '');
  waitingCodeEl.textContent = code;
  if (gameState) renderWaitingPlayers(gameState);
}

function showGame(): void {
  lobbyEl.setAttribute('hidden', '');
  waitingEl.setAttribute('hidden', '');
  appEl.removeAttribute('hidden');
}

function renderWaitingPlayers(state: GameState): void {
  waitingPlayers.innerHTML = state.players
    .map(p => '<div class="waiting-player">' + p.name + (p.id === mySocketId ? ' (you)' : '') + '</div>')
    .join('');
}

function setStatus(msg: string): void { lobbyStatus.textContent = msg; }
