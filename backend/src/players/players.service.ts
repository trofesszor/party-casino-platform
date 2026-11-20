import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../database/database.module';

@Injectable()
export class PlayersService {
  constructor(@Inject(DATABASE) private readonly database: any) {}

  join(nameInput: string) {
    const name = String(nameInput ?? '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > 24) throw new BadRequestException('A név 1–24 karakter legyen.');
    const existing = this.database.sqlite.prepare('SELECT id, name, joined_at AS joinedAt, token_balance AS tokenBalance FROM players WHERE name = ?').get(name);
    if (existing) return existing;
    const result = this.database.sqlite.prepare('INSERT INTO players (name) VALUES (?)').run(name);
    return this.database.sqlite.prepare('SELECT id, name, joined_at AS joinedAt, token_balance AS tokenBalance FROM players WHERE id = ?').get(result.lastInsertRowid);
  }

  findAll() {
    return this.database.sqlite.prepare('SELECT id, name, joined_at AS joinedAt, token_balance AS tokenBalance FROM players ORDER BY name COLLATE NOCASE').all();
  }

  getLeaderboard() {
    return this.database.sqlite.prepare('SELECT id, name, token_balance AS tokenBalance FROM players ORDER BY token_balance DESC, name COLLATE NOCASE ASC').all();
  }

  getBalance(playerId: number) {
    const player = this.database.sqlite.prepare('SELECT token_balance AS tokenBalance FROM players WHERE id = ?').get(playerId) as { tokenBalance: number } | undefined;
    if (!player) throw new BadRequestException('A játékos nem található.');
    return player;
  }

  getTransactions(playerId: number) {
    return this.database.sqlite.prepare('SELECT id, amount, balance_after AS balanceAfter, type, description, created_at AS createdAt FROM token_transactions WHERE player_id = ? ORDER BY id DESC LIMIT 100').all(playerId);
  }

  setBalance(playerId: number, balance: number) {
    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const player = sqlite.prepare('SELECT token_balance AS tokenBalance FROM players WHERE id = ?').get(playerId) as { tokenBalance: number } | undefined;
      if (!player) throw new BadRequestException('A játékos nem található.');
      const delta = balance - player.tokenBalance;
      if (delta !== 0) {
        sqlite.prepare('UPDATE players SET token_balance = ? WHERE id = ?').run(balance, playerId);
        sqlite.prepare("INSERT INTO token_transactions (player_id, amount, balance_after, type, description) VALUES (?, ?, ?, 'ADMIN_ADJUSTMENT', 'Admin által beállított egyenleg')").run(playerId, delta, balance);
      }
      sqlite.exec('COMMIT');
      return { tokenBalance: balance };
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}
