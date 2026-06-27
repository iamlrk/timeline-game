# Timeline Game — Project Overview

Browser-based multiplayer card game where players place historical events in chronological order on a shared timeline.

## What it is

Players receive a hand of cards, each showing a historical event (label only — no date visible). On your turn, you drag one card from your hand onto the shared timeline, placing it between two existing cards where you think it belongs chronologically. The date is revealed after placement.

## Current Status

**Checkpoint 1** — GUI prototype with draggable placeholder cards and a working timeline drop zone. No real event data yet, no backend, no multiplayer.

## Planned Game Modes

| Mode | Description |
|---|---|
| **Classic** | Turn-based, shared timeline, play until deck runs out |
| **Endless** | No deck limit — play until error threshold or time runs out |
| **Time Trial** | Race against the clock |

## Planned Multiplayer Styles

| Style | Description |
|---|---|
| **Turn-based competitive** | Players alternate turns placing cards (initial focus) |
| **Real-time competitive** | Both players place simultaneously, race for speed |
| **Cooperative** | Players work together to build a correct timeline |

## Key Design Decisions

- Dates are **hidden** on cards — revealed only after placement
- Cards with the **same year** can be stacked for bonus points
- Wrong placements go to a **personal discard pile** (negative score)
- Deck sizes: **20 / 40 / 60 cards** (small / medium / large)
