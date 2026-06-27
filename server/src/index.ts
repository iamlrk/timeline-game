import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameRoom } from './GameRoom';
import type {
  C2S_CreateRoom,
  C2S_JoinRoom,
  C2S_PlaceCard,
  S2C_RoomCreated,
  S2C_StateUpdate,
  S2C_Error,
} from './types';
import https from 'https';
import fs from 'fs';
import path from 'path';

const app  = express();
const http = createServer(app);

const io = new Server(http, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:4173'],
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/csv', limit: '10mb' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Cards CRUD ───────────────────────────────────────────────────────────────
const CARDS_PATH = path.resolve(__dirname, '../../src/data/cards.json');

function readCards(): any[] {
  return JSON.parse(fs.readFileSync(CARDS_PATH, 'utf-8'));
}
function writeCards(cards: any[]): void {
  fs.writeFileSync(CARDS_PATH, JSON.stringify(cards, null, 2), 'utf-8');
}
function slugify(event: string, year: number): string {
  return event.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '')
    + '-' + Math.abs(year) + (year < 0 ? 'bc' : '');
}

app.get('/api/cards', (_req, res) => {
  res.json(readCards());
});

app.post('/api/cards', (req, res) => {
  const cards = readCards();
  const card = req.body;
  if (!card.id) card.id = slugify(card.event, card.year);
  if (cards.find((c: any) => c.id === card.id)) {
    res.status(409).json({ error: 'Card with this id already exists' }); return;
  }
  cards.push(card);
  writeCards(cards);
  res.status(201).json(card);
});

app.put('/api/cards/:id', (req, res) => {
  const cards = readCards();
  const idx = cards.findIndex((c: any) => c.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }
  cards[idx] = { ...cards[idx], ...req.body, id: req.params.id };
  writeCards(cards);
  res.json(cards[idx]);
});

app.delete('/api/cards/:id', (req, res) => {
  const cards = readCards();
  const idx = cards.findIndex((c: any) => c.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }
  cards.splice(idx, 1);
  writeCards(cards);
  res.json({ ok: true });
});

// CSV import: POST /api/cards/import
// Expected columns (header row required):
//   event, year, category, description, difficulty, region, tags, source, wikipediaSlug
// Optional: id, month, day, imageUrl, imageCaption
app.post('/api/cards/import', (req, res) => {
  const csv = typeof req.body === 'string' ? req.body : '';
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { res.status(400).json({ error: 'CSV must have header + at least 1 row' }); return; }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const cards = readCards();
  const added: any[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    // simple CSV split (no quoted commas support — use semicolons in tags)
    const vals = lines[i].split(',').map(v => v.trim());
    const row: any = {};
    headers.forEach((h, j) => { row[h] = vals[j] ?? ''; });

    if (!row.event || !row.year) { errors.push(`Row ${i}: missing event or year`); continue; }

    const year = parseInt(row.year, 10);
    if (isNaN(year)) { errors.push(`Row ${i}: invalid year "${row.year}"`); continue; }

    const card: any = {
      id: row.id || slugify(row.event, year),
      event: row.event,
      year,
      description: row.description || '',
      category: row.category || 'war-politics',
      difficulty: parseInt(row.difficulty, 10) || 1,
      tags: row.tags ? row.tags.split(';').map((t: string) => t.trim()).filter(Boolean) : [],
    };
    if (row.month)          card.month          = parseInt(row.month, 10);
    if (row.day)            card.day            = parseInt(row.day, 10);
    if (row.region)         card.region         = row.region;
    if (row.source)         card.source         = row.source;
    if (row.wikipediaslug)  card.wikipediaSlug  = row.wikipediaslug;
    if (row.imageurl)       card.imageUrl       = row.imageurl;
    if (row.imagecaption)   card.imageCaption   = row.imagecaption;

    if (cards.find((c: any) => c.id === card.id)) {
      skipped.push(card.id); continue;
    }
    cards.push(card);
    added.push(card);
  }

  writeCards(cards);
  res.json({ added: added.length, skipped, errors });
});

// ── Image proxy ──────────────────────────────────────────────────────────────
// 1. Fetch Wikipedia page summary to get the canonical thumbnail URL
// 2. Pipe that image back to the client
// Using the REST API avoids Wikimedia hotlink blocks on direct Commons URLs.
// In-memory cache so the same slug is only fetched once per server run.
const imageCache = new Map<string, string>(); // slug → thumbnail URL

app.get('/api/image/:slug', (req, res) => {
  const slug = req.params.slug;
  if (!slug) { res.status(400).send('Missing slug'); return; }

  const serve = (imgUrl: string) => {
    https.get(imgUrl, {
      headers: {
        'User-Agent': 'TimelineGame/1.0 (educational; contact via github)',
        'Referer': 'https://en.wikipedia.org/',
      },
    }, (upstream) => {
      res.setHeader('Content-Type', upstream.headers['content-type'] ?? 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      upstream.pipe(res);
    }).on('error', (e) => { console.error('img fetch error', e.message); res.status(502).send('Upstream error'); });
  };

  if (imageCache.has(slug)) {
    serve(imageCache.get(slug)!);
    return;
  }

  // Fetch Wikipedia summary to resolve the thumbnail
  const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
  https.get(apiUrl, {
    headers: { 'User-Agent': 'TimelineGame/1.0 (educational; contact via github)' },
  }, (apiRes) => {
    let body = '';
    apiRes.on('data', (chunk) => body += chunk);
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(body);
        const imgUrl = json?.thumbnail?.source ?? json?.originalimage?.source;
        if (!imgUrl) { res.status(404).send('No image found'); return; }
        imageCache.set(slug, imgUrl);
        serve(imgUrl);
      } catch {
        res.status(502).send('Bad response from Wikipedia');
      }
    });
  }).on('error', (e) => { console.error('wiki api error', e.message); res.status(502).send('Wikipedia API error'); });
});

// ── Room registry ────────────────────────────────────────────────────────────
const rooms = new Map<string, GameRoom>();

// Map socket → room code so we can clean up on disconnect
const socketRoom = new Map<string, string>();

// ── Socket handlers ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`+ ${socket.id}`);

  // Create a new room
  socket.on('create_room', (payload: C2S_CreateRoom) => {
    const room = new GameRoom(socket.id, payload.config);
    rooms.set(room.code, room);
    socketRoom.set(socket.id, room.code);

    room.addPlayer(socket.id, payload.playerName);
    socket.join(room.code);

    const res: S2C_RoomCreated = { roomCode: room.code, playerId: socket.id };
    socket.emit('room_created', res);

    // If single-player or already full, start immediately
    if (room.isFull) {
      room.startGame();
      broadcastState(room, null, null);
    } else {
      broadcastState(room, null, null);
    }
    console.log(`Room ${room.code} created by ${payload.playerName}`);
  });

  // Join an existing room
  socket.on('join_room', (payload: C2S_JoinRoom) => {
    const room = rooms.get(payload.roomCode.toUpperCase());
    if (!room) {
      const err: S2C_Error = { message: `Room "${payload.roomCode}" not found.` };
      return socket.emit('error', err);
    }
    if (room.phase !== 'lobby') {
      const err: S2C_Error = { message: 'Game already in progress.' };
      return socket.emit('error', err);
    }
    const ok = room.addPlayer(socket.id, payload.playerName);
    if (!ok) {
      const err: S2C_Error = { message: 'Room is full.' };
      return socket.emit('error', err);
    }

    socketRoom.set(socket.id, room.code);
    socket.join(room.code);
    socket.emit('room_joined', { roomCode: room.code, playerId: socket.id });

    if (room.isFull) {
      room.startGame();
    }
    broadcastState(room, null, null);
    console.log(`${payload.playerName} joined room ${room.code}`);
  });

  // Place a card (only the current player's move is accepted)
  socket.on('place_card', (payload: C2S_PlaceCard) => {
    const roomCode = socketRoom.get(socket.id);
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.phase !== 'playing') return;

    if (room.getCurrentPlayerId() !== socket.id) {
      const err: S2C_Error = { message: 'Not your turn.' };
      return socket.emit('error', err);
    }

    const { correct, lastPlacedCardId } = room.placeCard(
      socket.id,
      payload.cardId,
      payload.insertIndex,
    );

    broadcastState(room, lastPlacedCardId, correct);
  });

  // Disconnect — remove player from room, clean up empty rooms
  socket.on('disconnect', () => {
    const roomCode = socketRoom.get(socket.id);
    socketRoom.delete(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    room.removePlayer(socket.id);
    console.log(`- ${socket.id} left room ${roomCode} (${room.playerCount} left)`);

    if (room.playerCount === 0) {
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} closed`);
    } else {
      broadcastState(room, null, null);
    }
  });
});

function broadcastState(
  room: GameRoom,
  lastPlacedCardId: string | null,
  correct: boolean | null,
): void {
  const payload: S2C_StateUpdate = {
    state: room.getState(),
    lastPlacedCardId,
    correct,
  };
  io.to(room.code).emit('state_update', payload);
}

const PORT = process.env.PORT ?? 3001;
http.listen(PORT, () => console.log(`Timeline Game server → http://localhost:${PORT}`));
