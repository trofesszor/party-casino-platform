
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

        const db = drizzle({ client: sqlite });

        return { sqlite, db };
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
