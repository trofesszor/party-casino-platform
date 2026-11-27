# Party Casino – local party platform (starter)

A minimal local-network platform foundation. It intentionally has no accounts, passwords, profiles, wallet, physical token logic or casino games yet.

## Stack
- Vue 3 + Vite + TypeScript
- NestJS + Socket.IO
- SQLite (`better-sqlite3`) + Drizzle connection
- One backend process; SQLite file stored in `backend/data/party-casino.sqlite`

## Requirements
- Node.js 20+
- npm 10+

## Run locally
From this directory:

```bash
npm install
npm run dev
```

Open:
- Player app: http://localhost:5173
- Admin: http://localhost:5173/admin
- TV display: http://localhost:5173/display
- API: http://localhost:3002/api/events

For phones on the same Wi-Fi, open `http://<HOST-LAN-IP>:5173`. The Vite dev server is configured to listen on `0.0.0.0`; make sure the host firewall allows ports 5173 and 3002. For the eventual party build, serve the compiled frontend from NestJS or a small local reverse proxy so one LAN URL is enough.

## Current functionality
- Players join by entering a name. Names are case-insensitive and unique for this party database; returning with the same name reuses the same player record.
- Admin can create an event, start it and complete it.
- Players can join open events.
- TV page and player/admin pages receive event updates over Socket.IO.
- Events and players persist in SQLite.

## Notes / current limitations
- This is a starter scaffold, not a production-ready application.
- `/admin` is intentionally unauthenticated for a trusted private LAN prototype. Anyone who can access it can manage events.
- Player identity is name-based, with a small internal integer ID only to connect event participation records. There is no profile system.
- No game-specific logic or scoring has been added yet.
- Google Fonts are currently referenced for visual styling; remove the import if the party network must be fully internet-independent.
- Browser access to the Vite dev server is suitable for development. For camera features later, mobile browser security requirements may require local HTTPS.

## Audio credits
- Slot dog bark: [Single Dog Bark](https://freesound.org/people/kwahmah_02/sounds/277058/) by kwahmah_02 (CC0 1.0). Converted to mono MP3 and processed for clarity.
