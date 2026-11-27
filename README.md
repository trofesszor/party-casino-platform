# Party Casino – local party platform (starter)

A minimal local-network platform foundation. It intentionally has no accounts, passwords, profiles, wallet, physical token logic or casino games yet.

## Stack
- Vue 3 + Vite + TypeScript
- NestJS + Socket.IO
- SQLite (`node:sqlite`) + Drizzle connection
- One backend process; SQLite file stored in `backend/data/party-casino.sqlite`

## Requirements
- Node.js 24 recommended
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

## Build and database startup

Run `npm run build` from the repository root to compile both workspaces. For the backend alone, run `npm run build --workspace backend`.

The backend runs SQLite migrations on startup, using the database in `backend/data/`. Start both development servers with `npm run dev`, or start the compiled backend with `npm run start --workspace backend`. The Admin casino reset clears player data and starts a new casino session.

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

## House party credit presets

| Item | Default |
| --- | ---: |
| Starting balance | 100,000 CR |
| Roulette | 1 CR minimum bet, up to the player’s available credits (all-in) |
| Slot | 500 CR minimum, 7,500 CR maximum per paid spin |
| Blackjack | 1,000 / 2,000 / 3,500 / 5,000 CR initial stake, up to 10,000 CR when doubled |
| Lucky Wheel | 2,500 CR per spin |
| Duel win | 5,000 CR |
| Scratch ticket / quest skip | 5,000 / 7,500 CR |
| House party coupons | 5,000–15,000 CR |
| Community goals | 60,000–180,000 CR |
| Low-balance photo | +7,500 CR per verified upload below 15,000 CR, up to two sessions per 24 hours with a 30-minute cooldown |

The default scratch schedule is 62% no prize, 22% at 5,000 CR, 11% at 12,500 CR, 4% at 25,000 CR and 1% at 50,000 CR. The minimum scratch prize returns the ticket price at default settings. Roulette retains the standard European wheel and blackjack retains its card rules. In the slot, Grand and Major start at 600,000 and 100,000 CR after a payout. Paid stakes fund Grand at 3% and Major at 6%.

On first startup after upgrading, the older 100 CR economy is converted at 1:1,000. Player balances, stored game credits and pending prizes are converted once. Standard shop prices and the game and photo settings listed above move to the new presets. Review these presets in Admin if you previously customized them.

## Audio credits
- Slot dog bark: [Single Dog Bark](https://freesound.org/people/kwahmah_02/sounds/277058/) by kwahmah_02 (CC0 1.0). Converted to mono MP3, processed for clarity and trimmed to the audible bark.
