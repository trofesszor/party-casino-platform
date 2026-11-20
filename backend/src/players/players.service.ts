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

  getSideQuests(playerId: number) {
    const player = this.database.sqlite.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
    if (!player) throw new BadRequestException('A játékos nem található.');
    return this.database.sqlite.prepare(`
      SELECT id, title, description, status, assigned_at AS assignedAt, completed_at AS completedAt
      FROM player_side_quests WHERE player_id = ? ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, id DESC
    `).all(playerId);
  }

  assignSideQuest(playerId: number) {
    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const player = sqlite.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
      if (!player) throw new BadRequestException('A játékos nem található.');
      const active = sqlite.prepare("SELECT COUNT(*) AS count FROM player_side_quests WHERE player_id = ? AND status = 'ACTIVE'").get(playerId) as { count: number };
      if (active.count >= 2) throw new BadRequestException('Már van 2 aktív side quested.');
      const quest = sqlite.prepare(`
        SELECT id, title, description FROM side_quest_pool
        WHERE enabled = 1 AND NOT EXISTS (
          SELECT 1 FROM player_side_quests assigned
          WHERE assigned.player_id = ? AND assigned.pool_quest_id = side_quest_pool.id
        )
        ORDER BY RANDOM() LIMIT 1
      `).get(playerId) as { id: number; title: string; description: string } | undefined;
      if (!quest) throw new BadRequestException('Nincs több kiosztható side quest a poolban.');
      const result = sqlite.prepare("INSERT INTO player_side_quests (player_id, pool_quest_id, title, description) VALUES (?, ?, ?, ?)").run(playerId, quest.id, quest.title, quest.description);
      sqlite.exec('COMMIT');
      return sqlite.prepare("SELECT id, title, description, status, assigned_at AS assignedAt, completed_at AS completedAt FROM player_side_quests WHERE id = ?").get(result.lastInsertRowid);
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  completeSideQuest(playerId: number, questId: number) {
    const result = this.database.sqlite.prepare("UPDATE player_side_quests SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND player_id = ? AND status = 'ACTIVE'").run(questId, playerId);
    if (!result.changes) throw new BadRequestException('Az aktív side quest nem található.');
    return this.database.sqlite.prepare('SELECT id, title, description, status, assigned_at AS assignedAt, completed_at AS completedAt FROM player_side_quests WHERE id = ?').get(questId);
  }

  getSideQuestPool() {
    return this.database.sqlite.prepare('SELECT id, title, description, enabled, created_at AS createdAt FROM side_quest_pool ORDER BY id DESC').all();
  }

  addSideQuestToPool(titleInput: string, descriptionInput: string) {
    const title = String(titleInput ?? '').trim();
    const description = String(descriptionInput ?? '').trim();
    if (!title || title.length > 120) throw new BadRequestException('A side quest címe 1–120 karakter legyen.');
    if (description.length > 500) throw new BadRequestException('A leírás legfeljebb 500 karakter lehet.');
    const result = this.database.sqlite.prepare('INSERT INTO side_quest_pool (title, description) VALUES (?, ?)').run(title, description);
    return this.database.sqlite.prepare('SELECT id, title, description, enabled FROM side_quest_pool WHERE id = ?').get(result.lastInsertRowid);
  }

  deleteSideQuestFromPool(questId: number) {
    const result = this.database.sqlite.prepare('DELETE FROM side_quest_pool WHERE id = ?').run(questId);
    if (!result.changes) throw new BadRequestException('A side quest nem található.');
    return { success: true };
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
