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
          WHERE assigned.player_id = ? AND assigned.pool_quest_id = side_quest_pool.id AND assigned.status <> 'SKIPPED'
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


  private duelView(duelId: number) {
    return this.database.sqlite.prepare(`
      SELECT d.id, d.challenger_id AS challengerId, a.name AS challengerName,
        d.opponent_id AS opponentId, b.name AS opponentName, d.status,
        d.duel_type AS duelType, d.challenger_winner_id AS challengerWinnerId,
        d.opponent_winner_id AS opponentWinnerId, d.winner_id AS winnerId,
        d.loser_id AS loserId, d.reward_amount AS rewardAmount,
        d.created_at AS createdAt, d.completed_at AS completedAt
      FROM duels d JOIN players a ON a.id=d.challenger_id JOIN players b ON b.id=d.opponent_id
      WHERE d.id=?
    `).get(duelId);
  }

  getDuels(playerId: number) {
    if (!this.database.sqlite.prepare('SELECT id FROM players WHERE id=?').get(playerId)) throw new BadRequestException('A játékos nem található.');
    return this.database.sqlite.prepare(`
      SELECT d.id, d.challenger_id AS challengerId, a.name AS challengerName,
        d.opponent_id AS opponentId, b.name AS opponentName, d.status,
        d.duel_type AS duelType, d.challenger_winner_id AS challengerWinnerId,
        d.opponent_winner_id AS opponentWinnerId, d.winner_id AS winnerId,
        d.loser_id AS loserId, d.reward_amount AS rewardAmount,
        d.created_at AS createdAt, d.completed_at AS completedAt
      FROM duels d JOIN players a ON a.id=d.challenger_id JOIN players b ON b.id=d.opponent_id
      WHERE d.challenger_id=? OR d.opponent_id=? ORDER BY d.id DESC LIMIT 100
    `).all(playerId, playerId);
  }

  createDuel(challengerId: number, opponentId: number) {
    if (!Number.isSafeInteger(challengerId) || !Number.isSafeInteger(opponentId) || challengerId<=0 || opponentId<=0 || challengerId===opponentId) throw new BadRequestException('Érvénytelen párbajkihívás.');
    const sqlite=this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      if (!sqlite.prepare('SELECT id FROM players WHERE id=?').get(challengerId) || !sqlite.prepare('SELECT id FROM players WHERE id=?').get(opponentId)) throw new BadRequestException('A játékos nem található.');
      const busy=sqlite.prepare("SELECT id FROM duels WHERE status IN ('PENDING','CHOOSE_TYPE','IN_PROGRESS','AWAITING_CONFIRMATION') AND (challenger_id IN (?,?) OR opponent_id IN (?,?)) LIMIT 1").get(challengerId,opponentId,challengerId,opponentId);
      if (busy) throw new BadRequestException('Az egyik játékosnak már van folyamatban lévő párbaja.');
      const result=sqlite.prepare("INSERT INTO duels (challenger_id,opponent_id,status) VALUES (?,?,'PENDING')").run(challengerId,opponentId);
      sqlite.exec('COMMIT');
      return this.duelView(Number(result.lastInsertRowid));
    } catch(e) { sqlite.exec('ROLLBACK'); throw e; }
  }

  private getDuelForAction(duelId:number) {
    const duel=this.duelView(duelId);
    if (!duel) throw new BadRequestException('A párbaj nem található.');
    return duel;
  }

  respondToDuel(duelId:number, playerId:number, accept:boolean) {
    const duel=this.getDuelForAction(duelId);
    if (duel.opponentId!==playerId || duel.status!=='PENDING') throw new BadRequestException('Ezt a kihívást nem fogadhatod el vagy már lezárult.');
    this.database.sqlite.prepare("UPDATE duels SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(accept?'CHOOSE_TYPE':'REFUSED',duelId);
    return this.duelView(duelId);
  }

  chooseDuelType(duelId:number, playerId:number, duelTypeInput:string) {
    const types=['SZKANDER','ROCK_PAPER_SCISSORS','PLANK','PUSH_UPS','DICE'];
    const duel=this.getDuelForAction(duelId);
    if (duel.opponentId!==playerId || duel.status!=='CHOOSE_TYPE') throw new BadRequestException('A párbajt elfogadó játékos választhat típust.');
    const duelType=String(duelTypeInput??'').toUpperCase();
    if (!types.includes(duelType)) throw new BadRequestException('Érvénytelen párbajtípus.');
    this.database.sqlite.prepare("UPDATE duels SET duel_type=?, status='IN_PROGRESS', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(duelType,duelId);
    return this.duelView(duelId);
  }

  submitDuelWinner(duelId:number, playerId:number, winnerId:number) {
    const sqlite=this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const duel=this.getDuelForAction(duelId);
      if (![duel.challengerId,duel.opponentId].includes(playerId) || ![duel.challengerId,duel.opponentId].includes(winnerId)) throw new BadRequestException('Csak a párbaj résztvevői szavazhatnak a győztesre.');
      if (!['IN_PROGRESS','AWAITING_CONFIRMATION'].includes(duel.status)) throw new BadRequestException('Ez a párbaj most nem vár eredményre.');
      const voteColumn=playerId===duel.challengerId?'challenger_winner_id':'opponent_winner_id';
      sqlite.prepare(`UPDATE duels SET ${voteColumn}=?, status='AWAITING_CONFIRMATION', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(winnerId,duelId);
      const updated=this.duelView(duelId);
      if (updated.challengerWinnerId && updated.opponentWinnerId && updated.challengerWinnerId===updated.opponentWinnerId) {
        const winnerId=updated.challengerWinnerId;
        const loserId=winnerId===updated.challengerId?updated.opponentId:updated.challengerId;
        const reward=updated.rewardAmount;
        sqlite.prepare('UPDATE players SET token_balance=token_balance+? WHERE id=?').run(reward,winnerId);
        const balance=sqlite.prepare('SELECT token_balance AS balance FROM players WHERE id=?').get(winnerId) as {balance:number};
        const opponentName = winnerId===updated.challengerId ? updated.opponentName : updated.challengerName;
        const duelTypeLabels: Record<string, string> = {
          SZKANDER: 'Szkander',
          ROCK_PAPER_SCISSORS: 'Kő-papír-olló · best of 3',
          PLANK: 'Plank',
          PUSH_UPS: 'Fekvő',
          DICE: 'Kockadobás',
        };
        const duelTypeLabel = duelTypeLabels[updated.duelType ?? ''] ?? updated.duelType ?? 'Ismeretlen';
        const description = `Párbaj győzelem · Ellenfél: ${opponentName} · Típus: ${duelTypeLabel}`;
        sqlite.prepare("INSERT INTO token_transactions (player_id,amount,balance_after,type,description) VALUES (?, ?, ?, 'DUEL_WIN', ?)").run(winnerId,reward,balance.balance,description);
        sqlite.prepare("UPDATE duels SET status='COMPLETED',winner_id=?,loser_id=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(winnerId,loserId,duelId);
      }
      sqlite.exec('COMMIT');
      return this.duelView(duelId);
    } catch(e) { sqlite.exec('ROLLBACK'); throw e; }
  }

  getShop(playerId: number) {
    const player = this.database.sqlite.prepare('SELECT id FROM players WHERE id=?').get(playerId);
    if (!player) throw new BadRequestException('A játékos nem található.');
    return this.database.sqlite.prepare(`
      SELECT s.item_key AS itemKey, s.name, s.description, s.price,
        COALESCE(i.quantity,0) AS quantity
      FROM shop_items s
      LEFT JOIN player_inventory i ON i.item_key=s.item_key AND i.player_id=?
      WHERE s.enabled=1 ORDER BY s.price ASC, s.name ASC
    `).all(playerId);
  }

  buyShopItem(playerId: number, itemKeyInput: string) {
    const itemKey=String(itemKeyInput ?? '').trim().toUpperCase();
    const sqlite=this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const player=sqlite.prepare('SELECT token_balance AS balance FROM players WHERE id=?').get(playerId) as {balance:number}|undefined;
      if (!player) throw new BadRequestException('A játékos nem található.');
      const item=sqlite.prepare('SELECT item_key AS itemKey,name,price FROM shop_items WHERE item_key=? AND enabled=1').get(itemKey) as {itemKey:string;name:string;price:number}|undefined;
      if (!item) throw new BadRequestException('Ez a termék jelenleg nem elérhető.');
      if (player.balance < item.price) throw new BadRequestException('Nincs elég CR az egyenlegeden.');
      sqlite.prepare('UPDATE players SET token_balance=token_balance-? WHERE id=?').run(item.price,playerId);
      sqlite.prepare(`INSERT INTO player_inventory (player_id,item_key,quantity) VALUES (?,?,1)
        ON CONFLICT(player_id,item_key) DO UPDATE SET quantity=quantity+1,updated_at=CURRENT_TIMESTAMP`).run(playerId,item.itemKey);
      const balance=player.balance-item.price;
      sqlite.prepare("INSERT INTO token_transactions (player_id,amount,balance_after,type,description) VALUES (?,?,?,'SHOP_PURCHASE',?)").run(playerId,-item.price,balance,`Shop vásárlás · ${item.name}`);
      sqlite.exec('COMMIT');
      return {success:true,itemKey:item.itemKey,quantity:sqlite.prepare('SELECT quantity FROM player_inventory WHERE player_id=? AND item_key=?').get(playerId,item.itemKey).quantity,tokenBalance:balance};
    } catch(error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  useShopItem(playerId: number, itemKeyInput: string, questId: number) {
    const itemKey=String(itemKeyInput ?? '').trim().toUpperCase();
    if (itemKey !== 'QUEST_SKIP') throw new BadRequestException('Ez a termék nem használható.');
    if (!Number.isSafeInteger(questId) || questId<=0) throw new BadRequestException('Érvénytelen side quest.');
    const sqlite=this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const player=sqlite.prepare('SELECT id FROM players WHERE id=?').get(playerId);
      if (!player) throw new BadRequestException('A játékos nem található.');
      const inventory=sqlite.prepare('SELECT quantity FROM player_inventory WHERE player_id=? AND item_key=?').get(playerId,itemKey) as {quantity:number}|undefined;
      if (!inventory || inventory.quantity<1) throw new BadRequestException('Nincs ilyen tárgy a készletedben.');
      const quest=sqlite.prepare("SELECT id,title FROM player_side_quests WHERE id=? AND player_id=? AND status='ACTIVE'").get(questId,playerId) as {id:number;title:string}|undefined;
      if (!quest) throw new BadRequestException('Az aktív side quest nem található.');
      sqlite.prepare("UPDATE player_side_quests SET status='SKIPPED',skipped_at=CURRENT_TIMESTAMP WHERE id=?").run(questId);
      sqlite.prepare('UPDATE player_inventory SET quantity=quantity-1,updated_at=CURRENT_TIMESTAMP WHERE player_id=? AND item_key=?').run(playerId,itemKey);
      sqlite.exec('COMMIT');
      return {success:true,skippedQuestId:quest.id,inventoryQuantity:inventory.quantity-1};
    } catch(error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
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
