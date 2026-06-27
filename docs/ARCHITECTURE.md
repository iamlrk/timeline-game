# Architecture

## Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | TypeScript + Vite | Type safety for game state; fast dev server |
| Styling | Vanilla CSS (no framework) | Full control, no build overhead |
| Multiplayer backend | Node.js + Socket.io (planned) | Real-time bidirectional events; clean server-side game state |
| Room/lobby | Server-generated room codes | Simple, shareable, no auth required |

## Folder Structure

```
Timeline Game/
├── index.html                 # Entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
│
├── src/
│   ├── main.ts                # Bootstrap, top-level render loop
│   ├── types/
│   │   └── index.ts           # All shared TypeScript interfaces
│   ├── game/
│   │   └── GameState.ts       # Game logic: create state, place cards, score, advance turn
│   ├── components/
│   │   ├── Card.ts            # Card DOM element factory
│   │   ├── Timeline.ts        # Timeline renderer + drop zones
│   │   └── PlayerHand.ts      # Hand renderer + drag event management
│   └── styles/
│       └── main.css           # Global styles, design tokens (CSS variables)
│
├── docs/                      # Project documentation (you are here)
│   ├── OVERVIEW.md
│   ├── GAME_DESIGN.md
│   ├── ARCHITECTURE.md        ← this file
│   └── TASKS.md
│
└── server/                    # (planned) Node.js + Socket.io backend
    ├── index.ts
    ├── GameRoom.ts
    └── events.ts
```

## Data Flow (current — client only)

```
user drags card
  → dragstart fires → getDraggedCardId() stores card ID
  → drop fires on drop zone → handleDrop(cardId, insertIndex)
    → placeCard() mutates gameState
    → advanceTurn() increments currentPlayerIndex
    → render() re-renders timeline + hand
```

## Data Flow (planned — multiplayer)

```
user drags card
  → client emits socket event: PLACE_CARD { cardId, insertIndex, playerId }
  → server validates placement (is it this player's turn? is card in their hand?)
  → server updates authoritative GameState
  → server broadcasts STATE_UPDATE to all clients in the room
  → all clients re-render from received state
```

## Key Design Constraints

- **Server is authoritative** — clients never mutate game state; they send intents, receive state
- **No client-side scoring** — scoring logic lives server-side only (cheat prevention)
- **Types are shared** — `src/types/index.ts` types will be copied/symlinked to `server/` when backend is added
- **Stateless render functions** — `renderTimeline()` and `renderPlayerHand()` are pure: same input → same DOM output

## Getting Started (local dev)

```bash
cd "Timeline Game"
npm install
npm run dev
# Opens http://localhost:3000
```

## Planned Next Steps (backend)

1. Add `server/` directory with `package.json` (separate from frontend)
2. Install `socket.io`, `express`, `typescript`
3. Implement `GameRoom` class: holds authoritative `GameState`, handles `PLACE_CARD` events
4. Implement room codes (6-char alphanumeric)
5. Add lobby screen to frontend (create/join room)
6. Replace client-side `placeCard()` call with socket emit
