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

  getBalance(playerId: number) {
    const player = this.database.sqlite.prepare('SELECT token_balance AS tokenBalance FROM players WHERE id = ?').get(playerId) as { tokenBalance: number } | undefined;
    if (!player) throw new BadRequestException('A játékos nem található.');
    return player;
  }

  changeBalance(playerId: number, delta: number, type: string, description: string) {
    const sqlite = this.database.sqlite;
    const update = sqlite.prepare('UPDATE players SET token_balance = token_balance + ? WHERE id = ? AND token_balance + ? >= 0');
    const transaction = sqlite.transaction((id: number, amount: number) => {
      const result = update.run(amount, id, amount);
      if (Number(result.changes) !== 1) {
        const exists = sqlite.prepare('SELECT id FROM players WHERE id = ?').get(id);
        if (!exists) throw new BadRequestException('A játékos nem található.');
        throw new BadRequestException('Nincs elegendő token.');
      }
      const balance = sqlite.prepare('SELECT token_balance AS tokenBalance FROM players WHERE id = ?').get(id) as { tokenBalance: number };
      sqlite.prepare('INSERT INTO token_transactions (player_id, amount, balance_after, type, description) VALUES (?, ?, ?, ?, ?)').run(id, amount, balance.tokenBalance, type, description);
      return balance;
    });
    return transaction(playerId, delta);
  }

  setBalance(playerId: number, balance: number) {
    const sqlite = this.database.sqlite;
    const transaction = sqlite.transaction((id: number, next: number) => {
      const player = sqlite.prepare('SELECT token_balance AS tokenBalance FROM players WHERE id = ?').get(id) as { tokenBalance: number } | undefined;
      if (!player) throw new BadRequestException('A játékos nem található.');
      const delta = next - player.tokenBalance;
      if (delta !== 0) {
        sqlite.prepare('UPDATE players SET token_balance = ? WHERE id = ?').run(next, id);
        sqlite.prepare("INSERT INTO token_transactions (player_id, amount, balance_after, type, description) VALUES (?, ?, ?, 'ADMIN_ADJUSTMENT', 'Admin által beállított egyenleg')").run(id, delta, next);
      }
      return { tokenBalance: next };
    });
    return transaction(playerId, balance);
  }
}
