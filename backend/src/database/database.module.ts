import { Global, Module } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export const DATABASE = Symbol('DATABASE');

@Global()
@Module({
  providers: [{
    provide: DATABASE,
    useFactory: () => {
      const dataDir = join(process.cwd(), 'data');
      mkdirSync(dataDir, { recursive: true });
      const sqlite = new DatabaseSync(join(dataDir, 'party-casino.sqlite'));
      sqlite.exec('PRAGMA journal_mode = WAL');
      sqlite.exec('PRAGMA foreign_keys = ON');
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS casino_roulette_rounds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          round_number INTEGER NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'BETTING' CHECK(status IN ('BETTING','COMPLETED')),
          result_number INTEGER,
          betting_ends_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS casino_roulette_bets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          round_id INTEGER NOT NULL REFERENCES casino_roulette_rounds(id) ON DELETE CASCADE,
          player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          bet_type TEXT NOT NULL,
          bet_value TEXT NOT NULL,
          amount INTEGER NOT NULL DEFAULT 1 CHECK(amount BETWEEN 1 AND 100),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Migrate the first prototype's one-bet-per-player table to a multi-bet table.
      const columns = sqlite.prepare('PRAGMA table_info(casino_roulette_bets)').all() as Array<{ name: string }>;
      if (!columns.some(column => column.name === 'amount')) {
        sqlite.exec(`
          ALTER TABLE casino_roulette_bets RENAME TO casino_roulette_bets_old;
          CREATE TABLE casino_roulette_bets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id INTEGER NOT NULL REFERENCES casino_roulette_rounds(id) ON DELETE CASCADE,
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            bet_type TEXT NOT NULL,
            bet_value TEXT NOT NULL,
            amount INTEGER NOT NULL DEFAULT 1 CHECK(amount BETWEEN 1 AND 100),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO casino_roulette_bets (id, round_id, player_id, bet_type, bet_value, amount, created_at)
            SELECT id, round_id, player_id, bet_type, bet_value, 1, created_at FROM casino_roulette_bets_old;
          DROP TABLE casino_roulette_bets_old;
        `);
      }
      return { sqlite, db: drizzle({ client: sqlite }) };
    },
  }],
  exports: [DATABASE],
})
export class DatabaseModule {}
