import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '../database/database.module';
import { PlayerPresenceGateway } from '../players/player-presence.gateway';

type EventInput = {
  title?: string; description?: string; targetAmount?: number; repeatMode?: 'ONCE'|'REPEATABLE'|'COOLDOWN';
  cooldownMinutes?: number; minContribution?: number; maxContribution?: number|null; isSecret?: boolean; active?: boolean;
};

@Injectable()
export class CommunityEventsService {
  constructor(@Inject(DATABASE) private readonly database: any, private readonly presence: PlayerPresenceGateway) {
    const sqlite = this.database.sqlite;
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS community_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        target_amount INTEGER NOT NULL CHECK(target_amount > 0),
        current_amount INTEGER NOT NULL DEFAULT 0 CHECK(current_amount >= 0),
        repeat_mode TEXT NOT NULL DEFAULT 'ONCE' CHECK(repeat_mode IN ('ONCE','REPEATABLE','COOLDOWN')),
        cooldown_minutes INTEGER NOT NULL DEFAULT 0,
        min_contribution INTEGER NOT NULL DEFAULT 1,
        max_contribution INTEGER,
        is_secret INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_completed INTEGER NOT NULL DEFAULT 0,
        next_available_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS community_event_contributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL CHECK(amount > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS community_event_activations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        total_contributions INTEGER NOT NULL,
        participant_count INTEGER NOT NULL,
        activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        trigger_type TEXT NOT NULL DEFAULT 'TARGET'
      );
      CREATE INDEX IF NOT EXISTS idx_community_contributions_event ON community_event_contributions(event_id,id DESC);
      CREATE INDEX IF NOT EXISTS idx_community_activations_event ON community_event_activations(event_id,id DESC);
    `);
    const existing = sqlite.prepare('SELECT COUNT(*) AS count FROM community_events').get() as {count:number};
    if (Number(existing.count) === 0) {
      const insert = sqlite.prepare(`INSERT INTO community_events
        (title,description,target_amount,repeat_mode,cooldown_minutes,min_contribution,is_secret,is_active)
        VALUES (?,?,?,?,?,?,?,?)`);
      insert.run('Everybody Drinks','Közös koccintás: mindenki választhat egy italt, alkoholmenteset is.',500,'REPEATABLE',0,1,0,1);
      insert.run('Random Victim','A közösség felold egy véletlenszerű, önkéntes party kihívást.',750,'COOLDOWN',30,1,0,1);
      insert.run('Forbidden Word','Válasszatok egy tiltott szót, amit 10 percig senki nem mondhat ki.',1000,'ONCE',0,1,0,1);
      insert.run('??? Secret Afterparty','Egy rejtett meglepetés esemény. Az admin bármikor aktiválhatja.',1500,'ONCE',0,1,1,0);
    }
  }

  private get sqlite() { return this.database.sqlite; }
  private event(id: number) {
    const row = this.sqlite.prepare(`SELECT id,title,description,target_amount AS targetAmount,current_amount AS currentAmount,
      repeat_mode AS repeatMode,cooldown_minutes AS cooldownMinutes,min_contribution AS minContribution,
      max_contribution AS maxContribution,is_secret AS isSecret,is_active AS active,is_completed AS completed,
      next_available_at AS nextAvailableAt,created_at AS createdAt
      FROM community_events WHERE id=?`).get(id) as any;
    if (!row) throw new NotFoundException('A közösségi esemény nem található.');
    return row;
  }

  private publish() { this.presence.server?.emit('community-events:updated'); }

  private validate(input: EventInput, partial = false) {
    const title = input.title === undefined && partial ? undefined : String(input.title ?? '').trim();
    const description = input.description === undefined && partial ? undefined : String(input.description ?? '').trim();
    const target = input.targetAmount === undefined && partial ? undefined : Number(input.targetAmount);
    const min = input.minContribution === undefined && partial ? undefined : Number(input.minContribution ?? 1);
    const max = input.maxContribution === undefined && partial ? undefined : input.maxContribution === null || input.maxContribution === undefined ? null : Number(input.maxContribution);
    const mode = input.repeatMode;
    const cooldown = input.cooldownMinutes === undefined && partial ? undefined : Number(input.cooldownMinutes ?? 0);
    if (title !== undefined && (!title || title.length > 80)) throw new BadRequestException('Az esemény neve 1–80 karakter legyen.');
    if (description !== undefined && description.length > 500) throw new BadRequestException('A leírás legfeljebb 500 karakter lehet.');
    if (target !== undefined && (!Number.isSafeInteger(target) || target < 1 || target > 2000000000)) throw new BadRequestException('A célösszeg 1 és 2 000 000 000 token között lehet.');
    if (min !== undefined && (!Number.isSafeInteger(min) || min < 1 || min > 2000000000)) throw new BadRequestException('A minimum hozzájárulás legalább 1 token legyen.');
    if (max !== undefined && max !== null && (!Number.isSafeInteger(max) || max < 1 || (min !== undefined && max < min))) throw new BadRequestException('Érvénytelen maximális hozzájárulás.');
    if (mode !== undefined && !['ONCE','REPEATABLE','COOLDOWN'].includes(mode)) throw new BadRequestException('Érvénytelen ismétlődési mód.');
    if (cooldown !== undefined && (!Number.isSafeInteger(cooldown) || cooldown < 0 || cooldown > 10080)) throw new BadRequestException('A cooldown 0 és 10 080 perc között lehet.');
    return { title, description, target, min, max, mode, cooldown };
  }

  listPublic() {
    const rows = this.sqlite.prepare(`SELECT e.id,e.title,e.description,e.target_amount AS targetAmount,
      e.current_amount AS currentAmount,e.repeat_mode AS repeatMode,e.is_secret AS isSecret,
      e.next_available_at AS nextAvailableAt,e.created_at AS createdAt,
      (SELECT COUNT(DISTINCT player_id) FROM community_event_contributions c WHERE c.event_id=e.id) AS contributorCount
      ,EXISTS(SELECT 1 FROM community_event_activations a WHERE a.event_id=e.id) AS unlocked
      FROM community_events e
      WHERE (
        (e.is_secret=0 AND e.is_active=1 AND e.is_completed=0
          AND (e.next_available_at IS NULL OR datetime(e.next_available_at)<=CURRENT_TIMESTAMP))
        OR
        (e.is_secret=1 AND EXISTS(SELECT 1 FROM community_event_activations a WHERE a.event_id=e.id))
      )
      ORDER BY CASE WHEN e.is_secret=1 THEN 0 ELSE 1 END,e.created_at DESC`).all() as any[];
    const recent = this.sqlite.prepare(`SELECT id,title,description,total_contributions AS totalContributions,
      participant_count AS participantCount,activated_at AS activatedAt,trigger_type AS triggerType
      FROM community_event_activations ORDER BY id DESC LIMIT 20`).all() as any[];
    return { events: rows, recentActivations: recent };
  }

  listAdmin() {
    return this.sqlite.prepare(`SELECT e.id,e.title,e.description,e.target_amount AS targetAmount,e.current_amount AS currentAmount,
      e.repeat_mode AS repeatMode,e.cooldown_minutes AS cooldownMinutes,e.min_contribution AS minContribution,
      e.max_contribution AS maxContribution,e.is_secret AS isSecret,e.is_active AS active,e.is_completed AS completed,
      e.next_available_at AS nextAvailableAt,e.created_at AS createdAt,
      (SELECT COUNT(DISTINCT player_id) FROM community_event_contributions c WHERE c.event_id=e.id) AS contributorCount,
      (SELECT COUNT(*) FROM community_event_activations a WHERE a.event_id=e.id) AS activationCount
      FROM community_events e ORDER BY e.created_at DESC`).all();
  }

  getHistory(id: number) {
    const event = this.event(id);
    if (event.isSecret) {
      const unlocked = this.sqlite.prepare('SELECT id FROM community_event_activations WHERE event_id=? LIMIT 1').get(id);
      if (!unlocked) throw new NotFoundException('A közösségi esemény nem található.');
    }
    const activations = this.sqlite.prepare(`SELECT id,title,description,total_contributions AS totalContributions,
      participant_count AS participantCount,activated_at AS activatedAt,trigger_type AS triggerType
      FROM community_event_activations WHERE event_id=? ORDER BY id DESC LIMIT 30`).all(id);
    const contributions = this.sqlite.prepare(`SELECT c.id,c.amount,c.created_at AS createdAt,p.name AS playerName
      FROM community_event_contributions c JOIN players p ON p.id=c.player_id
      WHERE c.event_id=? ORDER BY c.id DESC LIMIT 50`).all(id);
    const leaderboard = this.sqlite.prepare(`SELECT p.name AS playerName,SUM(c.amount) AS totalAmount,COUNT(*) AS contributions
      FROM community_event_contributions c JOIN players p ON p.id=c.player_id
      WHERE c.event_id=? GROUP BY p.id ORDER BY totalAmount DESC,contributions DESC LIMIT 10`).all(id);
    return { activations, contributions, leaderboard };
  }

  create(input: EventInput) {
    const v = this.validate(input);
    const result = this.sqlite.prepare(`INSERT INTO community_events
      (title,description,target_amount,repeat_mode,cooldown_minutes,min_contribution,max_contribution,is_secret,is_active)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(v.title,v.description,v.target,v.mode??'ONCE',v.cooldown??0,v.min,v.max,
      input.isSecret===true?1:0,input.active===false?0:1);
    this.publish();
    return this.event(Number(result.lastInsertRowid));
  }

  update(id: number, input: EventInput) {
    const current = this.event(id);
    const v = this.validate(input, true);
    this.sqlite.prepare(`UPDATE community_events SET title=?,description=?,target_amount=?,repeat_mode=?,cooldown_minutes=?,
      min_contribution=?,max_contribution=?,is_secret=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      v.title??current.title,v.description??current.description,v.target??current.targetAmount,
      v.mode??current.repeatMode,v.cooldown??current.cooldownMinutes,v.min??current.minContribution,
      v.max===undefined?current.maxContribution:v.max,input.isSecret===undefined?current.isSecret:(input.isSecret?1:0),input.active===undefined?current.active:(input.active?1:0),id);
    this.publish();
    return this.event(id);
  }

  setActive(id: number, active: boolean) {
    this.event(id);
    if(active) {
      this.sqlite.prepare("UPDATE community_events SET is_active=1,is_completed=0,current_amount=CASE WHEN repeat_mode='ONCE' THEN 0 ELSE current_amount END,next_available_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
    } else {
      this.sqlite.prepare('UPDATE community_events SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    }
    this.publish();
    return this.event(id);
  }

  private activateInTransaction(id: number, triggerType: 'TARGET'|'ADMIN') {
    const row = this.event(id);
    const stats = this.sqlite.prepare('SELECT COUNT(DISTINCT player_id) AS participants,COALESCE(SUM(amount),0) AS total FROM community_event_contributions WHERE event_id=?').get(id) as any;
    this.sqlite.prepare(`INSERT INTO community_event_activations (event_id,title,description,total_contributions,participant_count,trigger_type)
      VALUES (?,?,?,?,?,?)`).run(id,row.title,row.description,Number(stats.total),Number(stats.participants),triggerType);
    if (row.repeatMode === 'ONCE') {
      this.sqlite.prepare('UPDATE community_events SET is_completed=1,is_active=0,current_amount=target_amount,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    } else {
      const next = row.repeatMode === 'COOLDOWN' && row.cooldownMinutes > 0
        ? new Date(Date.now()+row.cooldownMinutes*60000).toISOString().replace('T',' ').slice(0,19) : null;
      this.sqlite.prepare('UPDATE community_events SET current_amount=0,next_available_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next,id);
    }
    return { id, title:row.title, description:row.description, totalContributions:Number(stats.total), participantCount:Number(stats.participants), triggerType };
  }

  contribute(id: number, playerId: number, amount: number) {
    if (!Number.isSafeInteger(playerId) || playerId <= 0 || !Number.isSafeInteger(amount) || amount <= 0 || amount > 2000000000) throw new BadRequestException('Érvénytelen játékos vagy tokenmennyiség.');
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const event = this.event(id);
      if (!event.active || event.completed || (event.nextAvailableAt && new Date(event.nextAvailableAt).getTime()>Date.now())) throw new BadRequestException('Ez a közösségi esemény jelenleg nem fogad hozzájárulást.');
      if (event.isSecret) throw new BadRequestException('A titkos eseményhez jelenleg nem lehet közvetlenül hozzájárulni.');
      const player = this.sqlite.prepare('SELECT id,token_balance AS balance FROM players WHERE id=?').get(playerId) as any;
      if (!player) throw new BadRequestException('A játékos nem található.');
      if (amount < event.minContribution) throw new BadRequestException(`A minimum hozzájárulás ${event.minContribution} token.`);
      if (event.maxContribution !== null && amount > event.maxContribution) throw new BadRequestException(`A maximum hozzájárulás ${event.maxContribution} token.`);
      const remaining = Math.max(0,event.targetAmount-event.currentAmount);
      const charged = Math.min(amount,remaining);
      if (charged < 1) throw new BadRequestException('A célösszeg már teljesült.');
      if (player.balance < charged) throw new BadRequestException('Nincs elegendő tokened.');
      const newBalance = player.balance-charged;
      this.sqlite.prepare('UPDATE players SET token_balance=? WHERE id=?').run(newBalance,playerId);
      this.sqlite.prepare("INSERT INTO token_transactions (player_id,amount,balance_after,type,description) VALUES (?, ?, ?, 'COMMUNITY_CONTRIBUTION', ?)").run(playerId,-charged,newBalance,`Közösségi esemény: ${event.title}`);
      this.sqlite.prepare('INSERT INTO community_event_contributions (event_id,player_id,amount) VALUES (?,?,?)').run(id,playerId,charged);
      this.sqlite.prepare('UPDATE community_events SET current_amount=current_amount+?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(charged,id);
      const updated = this.event(id);
      let activation:any=null;
      if (updated.currentAmount >= updated.targetAmount) activation=this.activateInTransaction(id,'TARGET');
      this.sqlite.exec('COMMIT');
      this.publish();
      return { success:true, contributed:charged, tokenBalance:newBalance, event:updated, activation };
    } catch(error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  activateManually(id: number) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const row = this.event(id);
      if (row.completed) throw new BadRequestException('Ez az egyszeri esemény már teljesült.');
      const activation = this.activateInTransaction(id,'ADMIN');
      this.sqlite.exec('COMMIT');
      this.publish();
      return activation;
    } catch(error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }

  remove(id: number) {
    this.event(id);
    this.sqlite.prepare('DELETE FROM community_events WHERE id=?').run(id);
    this.publish();
    return { success:true };
  }
}
