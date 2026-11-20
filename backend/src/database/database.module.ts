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
        CREATE TABLE IF NOT EXISTS slot_player_state (
        player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        free_spins INTEGER NOT NULL DEFAULT 0 CHECK(free_spins >= 0)
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
          payout_amount INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS lucky_wheel_segments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT NOT NULL,
          position INTEGER NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS lucky_wheel_state (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          status TEXT NOT NULL DEFAULT 'IDLE' CHECK(status IN ('IDLE','SPINNING','RESULT')),
          spin_id TEXT,
          winning_segment_id INTEGER,
          started_at INTEGER,
          ends_at INTEGER,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS side_quest_pool (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS player_side_quests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          pool_quest_id INTEGER REFERENCES side_quest_pool(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED')),
          assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_player_side_quests_active ON player_side_quests(player_id, status);
        CREATE TABLE IF NOT EXISTS duels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          challenger_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          opponent_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK(status IN ('PENDING','CHOOSE_TYPE','IN_PROGRESS','AWAITING_CONFIRMATION','COMPLETED','DISPUTED','REFUSED')),
          duel_type TEXT,
          challenger_winner_id INTEGER REFERENCES players(id),
          opponent_winner_id INTEGER REFERENCES players(id),
          winner_id INTEGER REFERENCES players(id),
          loser_id INTEGER REFERENCES players(id),
          reward_amount INTEGER NOT NULL DEFAULT 10,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_duels_players ON duels(challenger_id, opponent_id, status);
        CREATE TABLE IF NOT EXISTS token_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          amount INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          type TEXT NOT NULL,
          description TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const playerColumns = sqlite.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
      if (!playerColumns.some(column => column.name === 'token_balance')) {
        sqlite.exec('ALTER TABLE players ADD COLUMN token_balance INTEGER NOT NULL DEFAULT 0 CHECK(token_balance >= 0)');
      }
      const payoutColumns = sqlite.prepare('PRAGMA table_info(casino_roulette_bets)').all() as Array<{ name: string }>;
      if (!payoutColumns.some(column => column.name === 'payout_amount')) {
        sqlite.exec('ALTER TABLE casino_roulette_bets ADD COLUMN payout_amount INTEGER NOT NULL DEFAULT 0');
      }

      const wheelCount = sqlite.prepare('SELECT COUNT(*) AS count FROM lucky_wheel_segments').get() as { count: number };
      if (wheelCount.count === 0) {
        const defaults = ['Ossz ki 2 italt', 'Te iszol', 'Lányok isznak', 'Fiúk isznak', 'Mindenki iszik', 'Passz', 'Válassz valakit, aki iszik'];
        const insertSegment = sqlite.prepare('INSERT INTO lucky_wheel_segments (label, position, enabled) VALUES (?, ?, 1)');
        defaults.forEach((label, index) => insertSegment.run(label, index));
      }
      sqlite.exec("INSERT OR IGNORE INTO lucky_wheel_state (id, status) VALUES (1, 'IDLE')");

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
            payout_amount INTEGER NOT NULL DEFAULT 0,
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
