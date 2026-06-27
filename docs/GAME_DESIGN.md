# Game Design Specification

## Classic Mode (initial build target)

### Setup
- 2–4 players (turn-based)
- Deck size: 20 / 40 / 60 cards (small / medium / large)
- Each player starts with 5 cards in hand
- One shared timeline, starts empty

### Turn Flow
1. Current player picks a card from their hand
2. Drags it to a position on the shared timeline
3. Card is placed — date revealed
4. Score is calculated (see below)
5. Turn passes to the next player

### Scoring (Classic)

| Outcome | Points |
|---|---|
| Correct placement (right position) | +1 |
| Correct AND same year as adjacent card (stack) | +2 |
| Wrong placement → goes to discard pile | 0 now, −1 at game end per card |

**Game end score = (cards placed correctly × pts) − (discard pile size)**

### Difficulty Variants (future)

| Difficulty | Difference |
|---|---|
| Easy | Standard scoring above |
| Medium | Wrong card goes to discard AND is removed from timeline |
| Hard | Wrong card: discard, no reveal, opponent gets a hint |

### Win Condition — Classic
Play until the deck runs out. Player with the highest score wins. Ties broken by fewer discards.

---

## Endless Mode (future)

- No fixed deck — cards are drawn continuously
- Player sets a mistake budget (e.g. max 3 discards)
- OR: time trial — most cards placed correctly in N minutes
- Individual or shared timeline variant

---

## Card Design

Each card has:
- **Event name** (shown always)
- **Date/Year** (hidden until placed)
- **Category tag** (future: Science, War, Art, etc.) — optional hint on difficulty

### Same-Year Stacking
If a player places a card that shares the exact year with an adjacent card already on the timeline, they can "stack" it on top. Stacking earns +2 instead of +1. Adjacently placed (same year but not stacked) still earns +1.

This mechanic is detected server-side by comparing `card.year` with `timeline[insertIndex - 1].year` or `timeline[insertIndex].year`.

---

## Turn-Based Multiplayer Architecture (design intent)

- One authoritative game state lives on the **server**
- Each client sends a "place card" action: `{ cardId, insertIndex }`
- Server validates, updates state, broadcasts new state to all clients
- Clients are dumb renderers — they never mutate game state directly

---

## Card Data Schema

Cards are stored in `src/data/cards.json` as an array of `EventCard` objects.

### EventCard fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique kebab-case slug, e.g. `"moon-landing-1969"` |
| `event` | string | ✅ | Full event name shown on the card |
| `year` | number | ✅ | Year as integer. **Negative = BC** (e.g. `-44` = 44 BC) |
| `month` | number | — | Month 1–12, used for within-year ordering |
| `day` | number | — | Day 1–31 |
| `description` | string | ✅ | 2–3 sentences shown after card reveal |
| `category` | string | ✅ | See categories below |
| `tags` | string[] | ✅ | Freeform tags for filtering, e.g. `["space", "USA"]` |
| `difficulty` | 1 \| 2 \| 3 | ✅ | 1 = well-known, 2 = medium, 3 = obscure |
| `imageUrl` | string | — | Stable image URL (prefer Wikimedia Commons) |
| `imageCaption` | string | — | Short caption for the image |
| `source` | string | — | Wikipedia article URL for fact-checking |
| `region` | string | — | Geographic region, e.g. `"Europe"`, `"Global"` |

### Categories

| Value | Colour | Examples |
|---|---|---|
| `science-technology` | Blue | Inventions, discoveries, engineering |
| `war-politics` | Red | Wars, revolutions, treaties, elections |
| `art-culture-religion` | Amber | Art, music, literature, religion |
| `exploration-disasters` | Green | Voyages, space, pandemics, shipwrecks |

### Difficulty guide

- **1 — Easy:** Every adult player should know this (Moon Landing, WWII, Titanic)
- **2 — Medium:** Historically literate players will know it (Fall of Constantinople, Penicillin)
- **3 — Hard:** Specialists or trivia enthusiasts only (first steam locomotive exact year, etc.)

### Adding new cards

1. Open `src/data/cards.json`
2. Add a new object to the array following the schema above
3. Use a unique `id` in kebab-case with the year appended: `"battle-of-hastings-1066"`
4. For `imageUrl`: search [Wikimedia Commons](https://commons.wikimedia.org), copy the direct file URL (640px width preferred)
5. Save and the game will pick it up on next `npm run dev`

### Image sourcing guide

Wikimedia Commons URLs are preferred because they are:
- Free to use (public domain or Creative Commons)
- Extremely stable (maintained by the Wikimedia Foundation)
- Available in multiple resolutions

URL format: `https://upload.wikimedia.org/wikipedia/commons/thumb/[hash]/[filename]/640px-[filename]`

Always test that the URL loads in a browser before adding it to the data file.
