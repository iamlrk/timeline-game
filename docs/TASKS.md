# Timeline Game — Task List

## Checkpoint 1: Card GUI + Drag & Drop ✅
All tasks complete. Cards render with placeholder letters, drag-and-drop onto a shared timeline works, correct/wrong placement detection, Classic scoring, discard pile, card flip animation, player HUD, game-over screen.

## Checkpoint 2: Core Game Logic ✅
All tasks complete. Turn-based play for 2 players, deck building, draw after place, end-of-game detection.

## Checkpoint 3 (Checkpoint 4 in design doc): Card Data ✅
All tasks complete. EventCard schema, 28 seed events in `src/data/cards.json`, Wikimedia image URLs (note: images show emoji fallback in browser — deferred bug), cardLoader utility, rich card display with category colours.

## Checkpoint 4 (originally Checkpoint 3): Multiplayer Backend ✅
| # | Task | Status |
|---|---|---|
| 23 | Set up Node.js + Socket.io backend server | ✅ |
| 24 | Implement GameRoom and socket event handlers | ✅ |
| 25 | Build lobby screen on client | ✅ |
| 26 | Replace client-side game logic with socket calls | ✅ |
| 27 | Configure Vite proxy | ✅ |

## Known Issues / Deferred
- Card images showing emoji fallback (📅) instead of Wikimedia photos. URL hashes were corrected and `referrerpolicy="no-referrer"` added; root cause still unknown. Next step: check browser devtools Network tab for actual HTTP status of image requests.

## Checkpoint 5: Polish (upcoming)
- Endless / Time Trial mode
- Sound effects
- Mobile / touch support
- Expand card dataset to ~100 events
- Accessibility improvements
