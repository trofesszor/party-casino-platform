
import { Global, Module } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export const DATABASE = Symbol('DATABASE');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: () => {
        const dataDir = join(process.cwd(), 'data');
        mkdirSync(dataDir, { recursive: true });

        const sqlite = new DatabaseSync(
          join(dataDir, 'party-casino.sqlite'),
        );

        sqlite.exec('PRAGMA journal_mode = WAL');
        sqlite.exec('PRAGMA foreign_keys = ON');

        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            event_type TEXT NOT NULL DEFAULT 'CUSTOM',
            status TEXT NOT NULL DEFAULT 'OPEN'
              CHECK(status IN ('OPEN','RUNNING','COMPLETED')),
            max_players INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            started_at TEXT,
            completed_at TEXT
          );

          CREATE TABLE IF NOT EXISTS event_participants (
            event_id INTEGER NOT NULL
              REFERENCES events(id) ON DELETE CASCADE,
            player_id INTEGER NOT NULL
              REFERENCES players(id) ON DELETE CASCADE,
            joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(event_id, player_id)
          );
        `);

        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS roulette_rounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            round_number INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','COMPLETED')),
            result_number INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT,
            UNIQUE(event_id, round_number)
          );

          CREATE UNIQUE INDEX IF NOT EXISTS idx_roulette_one_open_round
            ON roulette_rounds(event_id) WHERE status = 'OPEN';

          CREATE TABLE IF NOT EXISTS roulette_bets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id INTEGER NOT NULL REFERENCES roulette_rounds(id) ON DELETE CASCADE,
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            bet_type TEXT NOT NULL CHECK(bet_type IN ('NUMBER','COLOR')),
            bet_value TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(round_id, player_id)
          );
        `);

        const db = drizzle({ client: sqlite });

        return { sqlite, db };
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
