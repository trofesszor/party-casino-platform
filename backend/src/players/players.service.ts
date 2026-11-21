import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { EventsGateway } from '../events/events.gateway';
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { DATABASE } from '../database/database.module';

@Injectable()
export class PlayersService {
  constructor(@Inject(DATABASE) private readonly database: any, @Optional() @Inject(EventsGateway) private readonly gateway?: EventsGateway) {}

  private buildCasinoStats(startedAt:string) {
    const sqlite=this.database.sqlite;
    const one=(sql:string,...args:any[])=>sqlite.prepare(sql).get(...args) as any;
    const all=(sql:string,...args:any[])=>sqlite.prepare(sql).all(...args) as any[];
    const playerCount=Number(one('SELECT COUNT(*) AS n FROM players').n);
    const tx=one('SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN amount<0 THEN -amount ELSE 0 END),0) AS spent, COALESCE(SUM(CASE WHEN amount>0 THEN amount ELSE 0 END),0) AS won FROM token_transactions');
    const topWinner=all(`SELECT p.name, SUM(t.amount) AS amount FROM token_transactions t JOIN players p ON p.id=t.player_id WHERE t.amount>0 GROUP BY p.id ORDER BY amount DESC LIMIT 1`)[0]??null;
    const mostActive=all(`SELECT p.name, COUNT(*) AS actions FROM token_transactions t JOIN players p ON p.id=t.player_id GROUP BY p.id ORDER BY actions DESC LIMIT 1`)[0]??null;
    const topBalance=all('SELECT name,token_balance AS balance FROM players ORDER BY token_balance DESC,name COLLATE NOCASE LIMIT 1')[0]??null;
    const roulette=one("SELECT COUNT(*) AS rounds FROM casino_roulette_rounds WHERE status='COMPLETED'");
    const rouletteBets=one('SELECT COUNT(*) AS bets,COALESCE(SUM(amount),0) AS amount FROM casino_roulette_bets');
    const duels=one("SELECT COUNT(*) AS count FROM duels WHERE status='COMPLETED'");
    const duelChampion=all(`SELECT p.name,COUNT(*) AS wins FROM duels d JOIN players p ON p.id=d.winner_id WHERE d.status='COMPLETED' AND d.winner_id IS NOT NULL GROUP BY p.id ORDER BY wins DESC LIMIT 1`)[0]??null;
    const quests=one("SELECT COUNT(*) AS assigned, SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS completed FROM player_side_quests");
    const scratch=one("SELECT COUNT(*) AS tickets,SUM(CASE WHEN status='REVEALED' THEN 1 ELSE 0 END) AS revealed,SUM(CASE WHEN status='REVEALED' AND prize_amount>0 THEN 1 ELSE 0 END) AS wins,COALESCE(SUM(CASE WHEN status='REVEALED' THEN prize_amount ELSE 0 END),0) AS prizes FROM scratch_tickets");
    const photo=one("SELECT COUNT(*) AS count FROM token_photo_sessions WHERE status='COMPLETED'");
    const biggestWin=all("SELECT p.name,t.amount,t.description FROM token_transactions t JOIN players p ON p.id=t.player_id WHERE t.amount>0 ORDER BY t.amount DESC,t.id LIMIT 1")[0]??null;
    return {
      startedAt,endedAt:null,playerCount,transactionCount:Number(tx.n),tokensSpent:Number(tx.spent),tokensWon:Number(tx.won),
      topWinner:topWinner?{name:topWinner.name,amount:Number(topWinner.amount)}:null,
      mostActive:mostActive?{name:mostActive.name,actions:Number(mostActive.actions)}:null,
      richestPlayer:topBalance?{name:topBalance.name,balance:Number(topBalance.balance)}:null,
      biggestWin:biggestWin?{name:biggestWin.name,amount:Number(biggestWin.amount),description:biggestWin.description}:null,
      rouletteRounds:Number(roulette.rounds),rouletteBets:Number(rouletteBets.bets),rouletteTokens:Number(rouletteBets.amount),
      completedDuels:Number(duels.count),duelChampion:duelChampion?{name:duelChampion.name,wins:Number(duelChampion.wins)}:null,
      questsAssigned:Number(quests.assigned??0),questsCompleted:Number(quests.completed??0),
      scratchTickets:Number(scratch.tickets??0),scratchRevealed:Number(scratch.revealed??0),scratchWins:Number(scratch.wins??0),scratchPrizes:Number(scratch.prizes??0),
      photoRewards:Number(photo.count),
    };
  }

  getCasinoStatistics() {
    const sqlite=this.database.sqlite;
    const active=sqlite.prepare("SELECT id,started_at AS startedAt FROM casino_sessions WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").get() as any;
    const current=active?this.buildCasinoStats(active.startedAt):null;
    const previous=sqlite.prepare("SELECT id,started_at AS startedAt,ended_at AS endedAt,stats_json AS statsJson FROM casino_sessions WHERE status='COMPLETED' ORDER BY id DESC LIMIT 1").get() as any;
    return {current:current?{...current,sessionId:active.id}:null,lastCompleted:previous?{...JSON.parse(previous.statsJson),sessionId:previous.id,endedAt:previous.endedAt}:null};
  }

  resetPlayerData() {
    const sqlite=this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const activeSession=sqlite.prepare("SELECT id,started_at AS startedAt FROM casino_sessions WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").get() as any;
      if(activeSession){
        const snapshot:any=this.buildCasinoStats(activeSession.startedAt);
        const endedAt=new Date().toISOString();
        snapshot.endedAt=endedAt;
        sqlite.prepare("UPDATE casino_sessions SET status='COMPLETED',ended_at=?,stats_json=? WHERE id=? AND status='ACTIVE'").run(endedAt,JSON.stringify(snapshot),activeSession.id);
      }
      sqlite.prepare('DELETE FROM duels').run();
      sqlite.prepare('DELETE FROM casino_roulette_rounds').run();
      const playerCount=(sqlite.prepare('SELECT COUNT(*) AS count FROM players').get() as {count:number}).count;
      sqlite.prepare('DELETE FROM players').run();
      sqlite.prepare("INSERT INTO casino_sessions (status) VALUES ('ACTIVE')").run();
      sqlite.prepare("UPDATE lucky_wheel_state SET status='IDLE',spin_id=NULL,winning_segment_id=NULL,started_at=NULL,ends_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=1").run();
      sqlite.prepare("DELETE FROM sqlite_sequence WHERE name IN ('players','duels','casino_roulette_rounds','casino_roulette_bets','player_side_quests','side_quest_verification_requests','side_quest_pin_attempts','side_quest_photo_sessions','token_transactions','scratch_tickets')").run();
      sqlite.exec('COMMIT');
      return {success:true,deletedPlayers:playerCount};
    } catch(error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  private readonly gameSettingDefaults={wheelSpinCost:5,wheelSpinDurationMs:7000,rouletteBettingSeconds:20,rouletteResultSeconds:5,rouletteMaxBet:100,duelReward:10,maxActiveSideQuests:2,questPinExpirySeconds:90,scratchLossPercent:60,scratch10Percent:25,scratch25Percent:10,scratch50Percent:4,scratch100Percent:1,roulettePayoutNumber:35,roulettePayoutSplit:17,roulettePayoutStreet:11,roulettePayoutCorner:8,roulettePayoutSixLine:5,roulettePayoutDozen:2,roulettePayoutColumn:2,roulettePayoutColor:1,roulettePayoutOddEven:1,roulettePayoutLowHigh:1};
  getCasinoGameSettings(){
    const rows=this.database.sqlite.prepare("SELECT setting_key AS key,setting_value AS value FROM casino_settings").all() as Array<{key:string;value:string}>;
    const values=Object.fromEntries(rows.map(r=>[r.key,Number(r.value)]));
    return {
      wheelSpinCost:values.wheel_spin_cost??5,wheelSpinDurationMs:values.wheel_spin_duration_ms??7000,
      rouletteBettingSeconds:values.roulette_betting_seconds??20,rouletteResultSeconds:values.roulette_result_seconds??5,rouletteMaxBet:values.roulette_max_bet??100,
      duelReward:values.duel_reward??10,maxActiveSideQuests:values.max_active_side_quests??2,questPinExpirySeconds:values.quest_pin_expiry_seconds??90,
      scratchLossPercent:values.scratch_loss_percent??60,scratch10Percent:values.scratch_10_percent??25,scratch25Percent:values.scratch_25_percent??10,scratch50Percent:values.scratch_50_percent??4,scratch100Percent:values.scratch_100_percent??1,
      roulettePayoutNumber:values.roulette_payout_number??35,roulettePayoutSplit:values.roulette_payout_split??17,roulettePayoutStreet:values.roulette_payout_street??11,roulettePayoutCorner:values.roulette_payout_corner??8,roulettePayoutSixLine:values.roulette_payout_six_line??5,roulettePayoutDozen:values.roulette_payout_dozen??2,roulettePayoutColumn:values.roulette_payout_column??2,roulettePayoutColor:values.roulette_payout_color??1,roulettePayoutOddEven:values.roulette_payout_odd_even??1,roulettePayoutLowHigh:values.roulette_payout_low_high??1
    };
  }
  setCasinoGameSettings(input:any){
    const keys=Object.keys(this.gameSettingDefaults) as Array<keyof typeof this.gameSettingDefaults>;
    for(const key of keys){const value=input?.[key];if(!Number.isSafeInteger(value))throw new BadRequestException('Minden játékszabályhoz egész számot adj meg.');}
    const limits:Record<string,[number,number]>={wheelSpinCost:[0,100000],wheelSpinDurationMs:[1000,60000],rouletteBettingSeconds:[5,120],rouletteResultSeconds:[1,30],rouletteMaxBet:[1,100],duelReward:[0,1000000],maxActiveSideQuests:[1,10],questPinExpirySeconds:[15,600],scratchLossPercent:[0,100],scratch10Percent:[0,100],scratch25Percent:[0,100],scratch50Percent:[0,100],scratch100Percent:[0,100],roulettePayoutNumber:[1,1000],roulettePayoutSplit:[1,1000],roulettePayoutStreet:[1,1000],roulettePayoutCorner:[1,1000],roulettePayoutSixLine:[1,1000],roulettePayoutDozen:[1,1000],roulettePayoutColumn:[1,1000],roulettePayoutColor:[1,1000],roulettePayoutOddEven:[1,1000],roulettePayoutLowHigh:[1,1000]};
    for(const key of keys){const [min,max]=limits[key];if(input[key]<min||input[key]>max)throw new BadRequestException('Egy vagy több beállítás kívül esik a megengedett tartományon.');}
    const total=input.scratchLossPercent+input.scratch10Percent+input.scratch25Percent+input.scratch50Percent+input.scratch100Percent;
    if(total!==100)throw new BadRequestException('A kaparós sorsjegy esélyeinek összege pontosan 100% legyen.');
    const map:Record<string,string>={wheelSpinCost:'wheel_spin_cost',wheelSpinDurationMs:'wheel_spin_duration_ms',rouletteBettingSeconds:'roulette_betting_seconds',rouletteResultSeconds:'roulette_result_seconds',rouletteMaxBet:'roulette_max_bet',duelReward:'duel_reward',maxActiveSideQuests:'max_active_side_quests',questPinExpirySeconds:'quest_pin_expiry_seconds',scratchLossPercent:'scratch_loss_percent',scratch10Percent:'scratch_10_percent',scratch25Percent:'scratch_25_percent',scratch50Percent:'scratch_50_percent',scratch100Percent:'scratch_100_percent',roulettePayoutNumber:'roulette_payout_number',roulettePayoutSplit:'roulette_payout_split',roulettePayoutStreet:'roulette_payout_street',roulettePayoutCorner:'roulette_payout_corner',roulettePayoutSixLine:'roulette_payout_six_line',roulettePayoutDozen:'roulette_payout_dozen',roulettePayoutColumn:'roulette_payout_column',roulettePayoutColor:'roulette_payout_color',roulettePayoutOddEven:'roulette_payout_odd_even',roulettePayoutLowHigh:'roulette_payout_low_high'};
    const stmt=this.database.sqlite.prepare("INSERT INTO casino_settings (setting_key,setting_value) VALUES (?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value");
    for(const key of keys)stmt.run(map[key],String(input[key]));
    return this.getCasinoGameSettings();
  }

  getDefaultPlayerTokens() {
    const row=this.database.sqlite.prepare("SELECT setting_value AS value FROM casino_settings WHERE setting_key='default_player_tokens'").get() as {value:string}|undefined;
    return {defaultTokens:Number(row?.value??100)};
  }

  setDefaultPlayerTokens(value:number) {
    if(!Number.isSafeInteger(value)||value<0||value>2000000000) throw new BadRequestException('Az alapértelmezett tokenmennyiség 0 és 2 000 000 000 között lehet.');
    this.database.sqlite.prepare("INSERT INTO casino_settings (setting_key,setting_value) VALUES ('default_player_tokens',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value").run(String(value));
    return this.getDefaultPlayerTokens();
  }

  join(nameInput: string) {
    const name = String(nameInput ?? '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > 24) throw new BadRequestException('A név 1–24 karakter legyen.');
    const existing = this.database.sqlite.prepare('SELECT id, name, joined_at AS joinedAt, token_balance AS tokenBalance FROM players WHERE name = ?').get(name);
    if (existing) return existing;
    const {defaultTokens} = this.getDefaultPlayerTokens();
    const result = this.database.sqlite.prepare('INSERT INTO players (name, token_balance) VALUES (?, ?)').run(name, defaultTokens);
    const player=this.database.sqlite.prepare('SELECT id, name, joined_at AS joinedAt, token_balance AS tokenBalance FROM players WHERE id = ?').get(result.lastInsertRowid) as any;
    if(defaultTokens>0) this.database.sqlite.prepare("INSERT INTO token_transactions (player_id,amount,balance_after,type,description) VALUES (?, ?, ?, 'WELCOME_BONUS', 'Kezdő tokenegyenleg')").run(player.id,defaultTokens,defaultTokens);
    return player;
  }

  findAll() {
    return this.database.sqlite.prepare('SELECT id, name, joined_at AS joinedAt, token_balance AS tokenBalance FROM players ORDER BY name COLLATE NOCASE').all();
  }

  getLeaderboard() {
    const rows = this.database.sqlite.prepare('SELECT id, name, token_balance AS tokenBalance FROM players ORDER BY token_balance DESC, name COLLATE NOCASE ASC').all() as any[];
    const topId = rows[0]?.id ? Number(rows[0].id) : null;
    if (topId && this.gateway) {
      // Compare-and-update in one synchronous SQLite transaction so simultaneous
      // leaderboard requests cannot publish the same takeover more than once.
      const shouldNotify = this.database.sqlite.transaction(() => {
        const previous = this.database.sqlite.prepare("SELECT setting_value AS value FROM casino_settings WHERE setting_key='leaderboard_top_player_id'").get() as {value:string}|undefined;
        const previousId = previous ? Number(previous.value) : null;
        if (topId === previousId) return false;
        this.database.sqlite.prepare("INSERT INTO casino_settings (setting_key,setting_value) VALUES ('leaderboard_top_player_id',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value").run(String(topId));
        // The first read establishes the baseline; it is not a leaderboard takeover.
        return previousId !== null;
      })();
      if (shouldNotify) {
        const name = rows[0].name;
        const lines = [
          `${name} éppen a csúcsra tört! 👑`,
          `Trónfosztás! ${name} mostantól a leaderboard királya.`,
          `${name} felért a hegy tetejére. Ki akarja lelökni?`,
          `Új vezér a fedélzeten: ${name} vezeti a tokenranglistát!`
        ];
        this.gateway.publish('party:notification', { type:'leaderboard', title:'LEADERBOARD · ÚJ VEZETŐ', message:lines[randomInt(lines.length)] });
      }
    }
    return rows;
  }

  getSideQuests(playerId: number) {
    const player = this.database.sqlite.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
    if (!player) throw new BadRequestException('A játékos nem található.');
    return this.database.sqlite.prepare(`
      SELECT q.id, q.title, q.description, q.status, q.assigned_at AS assignedAt,
        q.completed_at AS completedAt, q.photo_enabled AS photoEnabled, q.completion_method AS completionMethod, q.photo_id AS photoId, verifier.name AS approvedByName, v.verified_at AS approvedAt
      FROM player_side_quests q
      LEFT JOIN side_quest_verification_requests v ON v.quest_id=q.id AND v.status='APPROVED'
      LEFT JOIN players verifier ON verifier.id=v.verified_by
      WHERE q.player_id = ?
      ORDER BY CASE q.status WHEN 'ACTIVE' THEN 0 ELSE 1 END, q.id DESC
    `).all(playerId);
  }

  assignSideQuest(playerId: number) {
    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const player = sqlite.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
      if (!player) throw new BadRequestException('A játékos nem található.');
      const active = sqlite.prepare("SELECT COUNT(*) AS count FROM player_side_quests WHERE player_id = ? AND status = 'ACTIVE'").get(playerId) as { count: number };
      const maxActive=this.getCasinoGameSettings().maxActiveSideQuests;
      if (active.count >= maxActive) throw new BadRequestException('Elérted az aktív side questek limitjét ('+maxActive+').');
      const quest = sqlite.prepare(`
        SELECT id, title, description, photo_enabled AS photoEnabled FROM side_quest_pool
        WHERE enabled = 1 AND NOT EXISTS (
          SELECT 1 FROM player_side_quests assigned
          WHERE assigned.player_id = ? AND assigned.pool_quest_id = side_quest_pool.id AND assigned.status <> 'SKIPPED'
        )
        ORDER BY RANDOM() LIMIT 1
      `).get(playerId) as { id: number; title: string; description: string; photoEnabled:number } | undefined;
      if (!quest) throw new BadRequestException('Nincs több kiosztható side quest a poolban.');
      const result = sqlite.prepare("INSERT INTO player_side_quests (player_id, pool_quest_id, title, description, photo_enabled) VALUES (?, ?, ?, ?, ?)").run(playerId, quest.id, quest.title, quest.description, quest.photoEnabled);
      sqlite.exec('COMMIT');
      return sqlite.prepare("SELECT id, title, description, status, assigned_at AS assignedAt, completed_at AS completedAt, photo_enabled AS photoEnabled FROM player_side_quests WHERE id = ?").get(result.lastInsertRowid);
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  requestSideQuestVerification(playerId: number, questId: number) {
    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const quest = sqlite.prepare("SELECT id, photo_enabled AS photoEnabled FROM player_side_quests WHERE id=? AND player_id=? AND status='ACTIVE'").get(questId, playerId) as {id:number;photoEnabled:number}|undefined;
      if (quest?.photoEnabled) throw new BadRequestException('Ehhez a küldetéshez fotófeltöltés szükséges, PIN-kód nem használható.');
      if (!quest) throw new BadRequestException('Az aktív side quest nem található.');
      sqlite.prepare("UPDATE side_quest_verification_requests SET status='EXPIRED' WHERE quest_id=? AND status='PENDING' AND datetime(expires_at)<=CURRENT_TIMESTAMP").run(questId);
      if (sqlite.prepare("SELECT id FROM side_quest_verification_requests WHERE quest_id=? AND status='PENDING'").get(questId)) throw new BadRequestException('Ehhez a küldetéshez már van aktív PIN-kód.');
      let pin = '';
      let pinHash = '';
      for (let attempt=0; attempt<20; attempt++) {
        pin = String(randomInt(0,1000)).padStart(3,'0');
        pinHash = createHash('sha256').update(pin).digest('hex');
        if (!sqlite.prepare("SELECT id FROM side_quest_verification_requests WHERE token_hash=? AND status='PENDING'").get(pinHash)) break;
        pin = '';
      }
      if (!pin) throw new BadRequestException('Nem sikerült PIN-kódot generálni. Próbáld újra.');
      const expiresAt = new Date(Date.now() + this.getCasinoGameSettings().questPinExpirySeconds * 1000).toISOString();
      sqlite.prepare("INSERT INTO side_quest_verification_requests (quest_id,owner_id,token_hash,expires_at) VALUES (?,?,?,?)").run(questId,playerId,pinHash,expiresAt);
      sqlite.exec('COMMIT');
      return { pin, expiresAt };
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }

  getSideQuestVerificationStatus(playerId:number,questId:number) {
    const sqlite=this.database.sqlite;
    const quest=sqlite.prepare("SELECT id FROM player_side_quests WHERE id=? AND player_id=?").get(questId,playerId);
    if(!quest) throw new BadRequestException('A side quest nem található.');
    sqlite.prepare("UPDATE side_quest_verification_requests SET status='EXPIRED' WHERE quest_id=? AND status='PENDING' AND datetime(expires_at)<=CURRENT_TIMESTAMP").run(questId);
    const active=sqlite.prepare("SELECT expires_at AS expiresAt FROM side_quest_verification_requests WHERE quest_id=? AND owner_id=? AND status='PENDING' AND datetime(expires_at)>CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1").get(questId,playerId) as {expiresAt:string}|undefined;
    return {active:!!active,expiresAt:active?.expiresAt??null};
  }

  getSideQuestVerification(pinInput: string, verifierId: number) {
    const pin = String(pinInput ?? '').trim();
    if (!/^\d{3}$/.test(pin) || !Number.isSafeInteger(verifierId) || verifierId<=0) throw new BadRequestException('Adj meg egy érvényes háromjegyű PIN-kódot.');
    const sqlite = this.database.sqlite;
    if (!sqlite.prepare('SELECT id FROM players WHERE id=?').get(verifierId)) throw new BadRequestException('A hitelesítő játékos nem található.');
    sqlite.prepare("DELETE FROM side_quest_pin_attempts WHERE datetime(attempted_at)<datetime('now','-2 minutes')").run();
    const attempts = sqlite.prepare("SELECT COUNT(*) AS count FROM side_quest_pin_attempts WHERE player_id=? AND datetime(attempted_at)>datetime('now','-90 seconds')").get(verifierId) as {count:number};
    if (attempts.count>=5) throw new BadRequestException('Túl sok hibás PIN-kód. Várj egy percet, majd próbáld újra.');
    const pinHash = createHash('sha256').update(pin).digest('hex');
    const request = sqlite.prepare(`
      SELECT r.quest_id AS questId, r.owner_id AS ownerId, r.expires_at AS expiresAt, q.title, q.description, p.name AS ownerName
      FROM side_quest_verification_requests r
      JOIN player_side_quests q ON q.id=r.quest_id JOIN players p ON p.id=r.owner_id
      WHERE r.token_hash=? AND r.status='PENDING' AND datetime(r.expires_at)>CURRENT_TIMESTAMP AND q.status='ACTIVE'
    `).get(pinHash);
    if (!request) {
      sqlite.prepare('INSERT INTO side_quest_pin_attempts (player_id) VALUES (?)').run(verifierId);
      throw new BadRequestException('A PIN-kód hibás, lejárt vagy már felhasználták.');
    }
    return request;
  }

  verifySideQuest(pinInput: string, verifierId: number, approveInput: boolean) {
    if (typeof approveInput !== 'boolean') throw new BadRequestException('Érvénytelen döntés.');
    const pin = String(pinInput ?? '').trim();
    if (!/^\d{3}$/.test(pin) || !Number.isSafeInteger(verifierId) || verifierId <= 0) throw new BadRequestException('Érvénytelen ellenőrzési kérés.');
    const sqlite = this.database.sqlite;
    sqlite.prepare("DELETE FROM side_quest_pin_attempts WHERE datetime(attempted_at)<datetime('now','-2 minutes')").run();
    const recentAttempts = sqlite.prepare("SELECT COUNT(*) AS count FROM side_quest_pin_attempts WHERE player_id=? AND datetime(attempted_at)>datetime('now','-90 seconds')").get(verifierId) as {count:number};
    if (recentAttempts.count>=5) throw new BadRequestException('Túl sok hibás PIN-kód. Várj egy percet, majd próbáld újra.');
    const pinHash = createHash('sha256').update(pin).digest('hex');
    const candidate = sqlite.prepare("SELECT id FROM side_quest_verification_requests WHERE token_hash=? AND status='PENDING' AND datetime(expires_at)>CURRENT_TIMESTAMP").get(pinHash);
    if (!candidate) {
      sqlite.prepare('INSERT INTO side_quest_pin_attempts (player_id) VALUES (?)').run(verifierId);
      throw new BadRequestException('A PIN-kód hibás, lejárt vagy már felhasználták.');
    }
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const request = sqlite.prepare(`SELECT r.id, r.quest_id AS questId, r.owner_id AS ownerId, q.title FROM side_quest_verification_requests r JOIN player_side_quests q ON q.id=r.quest_id WHERE r.token_hash=? AND r.status='PENDING' AND datetime(r.expires_at)>CURRENT_TIMESTAMP AND q.status='ACTIVE'`).get(pinHash) as {id:number;questId:number;ownerId:number;title:string}|undefined;
      if (!request) throw new BadRequestException('A PIN-kód lejárt vagy már felhasználták.');
      if (request.ownerId === verifierId) throw new BadRequestException('A saját küldetésedet nem igazolhatod.');
      if (!sqlite.prepare('SELECT id FROM players WHERE id=?').get(verifierId)) throw new BadRequestException('A hitelesítő játékos nem található.');
      if (sqlite.prepare('SELECT id FROM side_quest_verification_requests WHERE quest_id=? AND verified_by=?').get(request.questId,verifierId)) throw new BadRequestException('Ezt a küldetést már ellenőrizted.');
      const status = approveInput ? 'APPROVED' : 'REJECTED';
      sqlite.prepare('UPDATE side_quest_verification_requests SET status=?,verified_by=?,verified_at=CURRENT_TIMESTAMP WHERE id=?').run(status,verifierId,request.id);
      if (approveInput) sqlite.prepare("UPDATE player_side_quests SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'").run(request.questId);
      sqlite.exec('COMMIT');
      const verifier = sqlite.prepare('SELECT name FROM players WHERE id=?').get(verifierId) as {name:string};
      return {success:true,status,questId:request.questId,questTitle:request.title,verifiedByName:verifier.name};
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }

  private snappinConfig() {
    const baseUrl=String(process.env.SNAPPIN_API_URL??'').trim().replace(/\/$/,'');
    const apiKey=String(process.env.SNAPPIN_API_KEY??'').trim();
    const eventId=String(process.env.SNAPPIN_EVENT_ID??'').trim();
    if(!baseUrl||!apiKey||!eventId) throw new BadRequestException('A Snappin integráció nincs konfigurálva. Állítsd be a SNAPPIN_API_URL, SNAPPIN_API_KEY és SNAPPIN_EVENT_ID értékeket.');
    return {baseUrl,apiKey,eventId};
  }

  private async snappinRequest(path:string, init:RequestInit = {}) {
    const {baseUrl,apiKey}=this.snappinConfig();
    const response=await fetch(baseUrl+path,{...init,signal:init.signal??AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`,...init.headers}});
    const payload:any=await response.json().catch(()=>({}));
    if(!response.ok) throw new BadRequestException(payload.message||'A Snappin szolgáltatás nem érhető el.');
    return payload;
  }

  async createSideQuestPhotoSession(playerId:number,questId:number) {
    const sqlite=this.database.sqlite;
    const quest=sqlite.prepare("SELECT id,photo_enabled AS photoEnabled,status,title FROM player_side_quests WHERE id=? AND player_id=?").get(questId,playerId) as {id:number;photoEnabled:number;status:string;title:string}|undefined;
    if(!quest||quest.status!=='ACTIVE') throw new BadRequestException('Az aktív küldetés nem található.');
    if(!quest.photoEnabled) throw new BadRequestException('Ehhez a küldetéshez PIN-kódos igazolás szükséges.');
    const {eventId}=this.snappinConfig();
    const player=sqlite.prepare('SELECT name FROM players WHERE id=?').get(playerId) as {name:string}|undefined;
    const externalReference=`party-casino:quest:${questId}:player:${playerId}:${randomUUID()}`;
    const payload=await this.snappinRequest('/api/integrations/sessions',{method:'POST',body:JSON.stringify({eventId,externalReference,guest:{externalId:`party-casino-player-${playerId}`,displayName:player?.name??'Party Casino player'},expiresInSeconds:300})});
    const sessionId=String(payload.sessionId??''),cameraUrl=String(payload.cameraUrl??''),expiresAt=String(payload.expiresAt??'');
    if(!sessionId||!cameraUrl||!expiresAt) throw new BadRequestException('A Snappin API válasza hiányos (sessionId, cameraUrl, expiresAt).');
    let parsedUrl:URL; try{parsedUrl=new URL(cameraUrl);}catch{throw new BadRequestException('A Snappin API érvénytelen kamera URL-t adott vissza.');}
    if(parsedUrl.protocol!=='https:'&&!(parsedUrl.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsedUrl.hostname)))throw new BadRequestException('A Snappin kamera URL-nek HTTPS-t kell használnia.');
    sqlite.prepare("UPDATE side_quest_photo_sessions SET status='EXPIRED' WHERE quest_id=? AND status='PENDING'").run(questId);
    sqlite.prepare("INSERT INTO side_quest_photo_sessions (session_id,external_reference,quest_id,player_id,expires_at) VALUES (?,?,?,?,?)").run(sessionId,externalReference,questId,playerId,expiresAt);
    return {sessionId,cameraUrl:parsedUrl.toString(),expiresAt,questTitle:quest.title};
  }

  async checkSideQuestPhotoSession(playerId:number,questId:number,sessionIdInput:string) {
    const sessionId=String(sessionIdInput??'').trim();
    if(!sessionId||sessionId.length>200)throw new BadRequestException('Érvénytelen fotófeltöltési munkamenet.');
    const sqlite=this.database.sqlite;
    const local=sqlite.prepare("SELECT status,photo_id AS photoId,expires_at AS expiresAt,external_reference AS externalReference FROM side_quest_photo_sessions WHERE session_id=? AND quest_id=? AND player_id=?").get(sessionId,questId,playerId) as {status:string;photoId:string|null;expiresAt:string;externalReference:string}|undefined;
    if(!local)throw new BadRequestException('A fotófeltöltési munkamenet nem található.');
    if(local.status==='COMPLETED')return {success:true,completed:true,questId,photoId:local.photoId};
    if(local.status!=='PENDING'||Date.parse(local.expiresAt)<=Date.now()){sqlite.prepare("UPDATE side_quest_photo_sessions SET status='EXPIRED' WHERE session_id=? AND status='PENDING'").run(sessionId);throw new BadRequestException('A fotófeltöltési munkamenet lejárt.');}
    const {eventId}=this.snappinConfig();
    const verify:any=await this.snappinRequest('/api/integrations/sessions/'+encodeURIComponent(sessionId));
    if(String(verify.eventId??'')!==eventId||String(verify.externalReference??'')!==local.externalReference)throw new BadRequestException('A Snappin munkamenet esemény- vagy külső hivatkozása nem egyezik.');
    const photoId=String(verify.photo?.id??''),status=String(verify.status??'').toUpperCase();
    if(status!=='UPLOADED'||!photoId)return {success:true,completed:false,status:status||'PENDING'};
    sqlite.exec('BEGIN IMMEDIATE');
    try{
      const current=sqlite.prepare("SELECT status,photo_enabled FROM player_side_quests WHERE id=? AND player_id=?").get(questId,playerId) as {status:string;photo_enabled:number}|undefined;
      if(!current||current.status!=='ACTIVE'||!current.photo_enabled)throw new BadRequestException('Ez a küldetés már nem teljesíthető fotóval.');
      sqlite.prepare("UPDATE side_quest_photo_sessions SET status='COMPLETED',photo_id=?,completed_at=CURRENT_TIMESTAMP WHERE session_id=? AND status='PENDING'").run(photoId,sessionId);
      sqlite.prepare("UPDATE player_side_quests SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP,completion_method='PHOTO',photo_id=? WHERE id=? AND status='ACTIVE'").run(photoId,questId);
      sqlite.exec('COMMIT');return {success:true,completed:true,questId,photoId,completionMethod:'PHOTO'};
    }catch(error){sqlite.exec('ROLLBACK');throw error;}
  }

  async handleSnappinWebhook(body:any,timestampInput:string|undefined,signatureInput:string|undefined,rawBody:Buffer|undefined) {
    const secret=String(process.env.SNAPPIN_WEBHOOK_SECRET??'').trim();
    if(!secret||!timestampInput||!signatureInput||!rawBody)throw new BadRequestException('Hiányzó Snappin webhook hitelesítési adatok.');
    const timestamp=Number(timestampInput);
    if(!Number.isSafeInteger(timestamp)||Math.abs(Math.floor(Date.now()/1000)-timestamp)>300)throw new BadRequestException('A Snappin webhook időbélyege lejárt.');
    const supplied=signatureInput.replace(/^sha256=/i,'').toLowerCase();
    if(!/^[a-f0-9]{64}$/.test(supplied))throw new BadRequestException('Érvénytelen Snappin webhook aláírás.');
    const expected=createHmac('sha256',secret).update(timestampInput+'.').update(rawBody).digest(),actual=Buffer.from(supplied,'hex');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new BadRequestException('A Snappin webhook aláírása érvénytelen.');
    if(body?.event!=='photo.uploaded'||!body?.sessionId||!body?.photoId)throw new BadRequestException('Érvénytelen Snappin webhook esemény.');
    const local=this.database.sqlite.prepare('SELECT quest_id AS questId,player_id AS playerId,external_reference AS externalReference FROM side_quest_photo_sessions WHERE session_id=?').get(String(body.sessionId)) as {questId:number;playerId:number;externalReference:string}|undefined;
    if(!local||local.externalReference!==String(body.externalReference??''))throw new BadRequestException('A Snappin webhook nem tartozik ismert küldetéshez.');
    return this.checkSideQuestPhotoSession(local.playerId,local.questId,String(body.sessionId));
  }


  private getTokenPhotoSettings() {
    const rows=this.database.sqlite.prepare('SELECT setting_key AS key,setting_value AS value FROM token_photo_settings').all() as Array<{key:string;value:string}>;
    const values=Object.fromEntries(rows.map(row=>[row.key,row.value]));
    return {
      enabled:values.enabled!=='0',
      balanceThreshold:Math.max(0,Number(values.balance_threshold??50)),
      rewardAmount:Math.max(1,Number(values.reward_amount??10)),
      cooldownMinutes:Math.max(0,Number(values.cooldown_minutes??60)),
      dailyLimit:Math.max(1,Number(values.daily_limit??2)),
    };
  }

  getTokenPhotoStatus(playerId:number) {
    const sqlite=this.database.sqlite;
    sqlite.prepare("UPDATE token_photo_sessions SET status='EXPIRED' WHERE player_id=? AND status='PENDING' AND datetime(expires_at)<=CURRENT_TIMESTAMP").run(playerId);
    sqlite.prepare("UPDATE token_photo_sessions SET status='EXPIRED' WHERE player_id=? AND status='CREATING' AND datetime(created_at)<=datetime('now','-2 minutes')").run(playerId);
    const player=sqlite.prepare('SELECT token_balance AS balance FROM players WHERE id=?').get(playerId) as {balance:number}|undefined;
    if(!player) throw new BadRequestException('A játékos nem található.');
    const settings=this.getTokenPhotoSettings();
    const pending=sqlite.prepare("SELECT session_id AS sessionId,expires_at AS expiresAt,status FROM token_photo_sessions WHERE player_id=? AND status IN ('CREATING','PENDING') ORDER BY created_at DESC LIMIT 1").get(playerId) as {sessionId:string|null;expiresAt:string;status:string}|undefined;
    const last=sqlite.prepare("SELECT created_at AS createdAt FROM token_photo_sessions WHERE player_id=? ORDER BY created_at DESC LIMIT 1").get(playerId) as {createdAt:string}|undefined;
    const daily=sqlite.prepare("SELECT COUNT(*) AS count FROM token_photo_sessions WHERE player_id=? AND datetime(created_at)>=datetime('now','-1 day')").get(playerId) as {count:number};
    const cooldownUntil=last?new Date(new Date(last.createdAt.replace(' ','T')+'Z').getTime()+settings.cooldownMinutes*60000).toISOString():null;
    const coolingDown=!!cooldownUntil&&Date.now()<Date.parse(cooldownUntil);
    const eligible=settings.enabled&&player.balance<settings.balanceThreshold&&!pending&&!coolingDown&&daily.count<settings.dailyLimit;
    return {enabled:settings.enabled,eligible,balance:player.balance,balanceThreshold:settings.balanceThreshold,rewardAmount:settings.rewardAmount,cooldownMinutes:settings.cooldownMinutes,dailyLimit:settings.dailyLimit,dailyUsed:daily.count,dailyRemaining:Math.max(0,settings.dailyLimit-daily.count),pending:!!pending,sessionId:pending?.sessionId??null,expiresAt:pending?.expiresAt??null,cooldownUntil,reason:!settings.enabled?'DISABLED':player.balance>=settings.balanceThreshold?'BALANCE_TOO_HIGH':pending?'PENDING':coolingDown?'COOLDOWN':daily.count>=settings.dailyLimit?'DAILY_LIMIT':null};
  }

  getTokenPhotoSettingsForAdmin() { return this.getTokenPhotoSettings(); }

  setTokenPhotoSettings(input:{enabled:boolean;balanceThreshold:number;rewardAmount:number;cooldownMinutes:number;dailyLimit:number}) {
    if(typeof input.enabled!=='boolean'||![input.balanceThreshold,input.rewardAmount,input.cooldownMinutes,input.dailyLimit].every(Number.isSafeInteger)||input.balanceThreshold<0||input.balanceThreshold>2000000000||input.rewardAmount<1||input.rewardAmount>1000000||input.cooldownMinutes<0||input.cooldownMinutes>10080||input.dailyLimit<1||input.dailyLimit>24) throw new BadRequestException('Érvénytelen fotófeltöltési beállítás.');
    const values:[string,string][]=[['enabled',input.enabled?'1':'0'],['balance_threshold',String(input.balanceThreshold)],['reward_amount',String(input.rewardAmount)],['cooldown_minutes',String(input.cooldownMinutes)],['daily_limit',String(input.dailyLimit)]];
    const stmt=this.database.sqlite.prepare('INSERT INTO token_photo_settings (setting_key,setting_value) VALUES (?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value');
    for(const [key,value] of values) stmt.run(key,value);
    return this.getTokenPhotoSettings();
  }

  async createTokenPhotoSession(playerId:number) {
    const sqlite=this.database.sqlite;
    const status=this.getTokenPhotoStatus(playerId);
    if(!status.eligible) {
      const messages:Record<string,string>={DISABLED:'A fotófeltöltés jelenleg nem érhető el.',BALANCE_TOO_HIGH:'A tokenegyenleged túl magas a fotófeltöltéshez.',PENDING:'Már van folyamatban lévő fotófeltöltésed.',COOLDOWN:'A következő fotófeltöltésig várnod kell.',DAILY_LIMIT:'Elérted a napi fotófeltöltési limitet.'};
      throw new BadRequestException(messages[status.reason??'']??'Most nem indíthatsz fotófeltöltést.');
    }
    const player=sqlite.prepare('SELECT name FROM players WHERE id=?').get(playerId) as {name:string};
    const externalReference=`party-casino:token-reward:player:${playerId}:${randomUUID()}`;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const recheck=this.getTokenPhotoStatus(playerId);
      if(!recheck.eligible) throw new BadRequestException('A fotófeltöltési lehetőség időközben megváltozott. Frissítsd az oldalt.');
      sqlite.prepare("INSERT INTO token_photo_sessions (session_id,external_reference,player_id,expires_at,status,reward_amount) VALUES (?,?,?,?, 'CREATING',?)").run('creating:'+externalReference,externalReference,playerId,new Date(Date.now()+300000).toISOString(),status.rewardAmount);
      sqlite.exec('COMMIT');
    } catch(error) { sqlite.exec('ROLLBACK'); throw error; }
    try {
      const {eventId}=this.snappinConfig();
      const payload=await this.snappinRequest('/api/integrations/sessions',{method:'POST',body:JSON.stringify({eventId,externalReference,guest:{externalId:`party-casino-player-${playerId}`,displayName:player.name},expiresInSeconds:300})});
      const sessionId=String(payload.sessionId??''),cameraUrl=String(payload.cameraUrl??''),expiresAt=String(payload.expiresAt??'');
      if(!sessionId||!cameraUrl||!expiresAt) throw new BadRequestException('A Snappin API válasza hiányos.');
      let parsedUrl:URL;try{parsedUrl=new URL(cameraUrl);}catch{throw new BadRequestException('A Snappin kamera URL érvénytelen.');}
      if(parsedUrl.protocol!=='https:'&&!(parsedUrl.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsedUrl.hostname)))throw new BadRequestException('A Snappin kamera URL-nek HTTPS-t kell használnia.');
      sqlite.prepare("UPDATE token_photo_sessions SET session_id=?,expires_at=?,status='PENDING' WHERE external_reference=? AND status='CREATING'").run(sessionId,expiresAt,externalReference);
      return {sessionId,cameraUrl:parsedUrl.toString(),expiresAt,rewardAmount:status.rewardAmount};
    } catch(error) {
      sqlite.prepare("DELETE FROM token_photo_sessions WHERE external_reference=? AND status='CREATING'").run(externalReference);
      throw error;
    }
  }

  async checkTokenPhotoSession(playerId:number,sessionIdInput:string) {
    const sessionId=String(sessionIdInput??'').trim();
    if(!sessionId||sessionId.length>200) throw new BadRequestException('Érvénytelen fotófeltöltési munkamenet.');
    const sqlite=this.database.sqlite;
    const local=sqlite.prepare('SELECT external_reference AS externalReference,expires_at AS expiresAt,status,photo_id AS photoId,reward_amount AS rewardAmount FROM token_photo_sessions WHERE session_id=? AND player_id=?').get(sessionId,playerId) as {externalReference:string;expiresAt:string;status:string;photoId:string|null;rewardAmount:number}|undefined;
    if(!local) throw new BadRequestException('A fotófeltöltési munkamenet nem található.');
    if(local.status==='COMPLETED') return {...this.getTokenPhotoStatus(playerId),success:true,completed:true,rewardAmount:local.rewardAmount,photoId:local.photoId};
    if(local.status!=='PENDING'||Date.parse(local.expiresAt)<=Date.now()) {
      sqlite.prepare("UPDATE token_photo_sessions SET status='EXPIRED' WHERE session_id=? AND status='PENDING'").run(sessionId);
      return {success:true,completed:false,status:'EXPIRED'};
    }
    const {eventId}=this.snappinConfig();
    const verify:any=await this.snappinRequest('/api/integrations/sessions/'+encodeURIComponent(sessionId));
    if(String(verify.eventId??'')!==eventId||String(verify.externalReference??'')!==local.externalReference) throw new BadRequestException('A Snappin munkamenet esemény- vagy külső hivatkozása nem egyezik.');
    const photoId=String(verify.photo?.id??''),remoteStatus=String(verify.status??'').toUpperCase();
    if(remoteStatus==='EXPIRED'||remoteStatus==='CANCELLED'){
      sqlite.prepare("UPDATE token_photo_sessions SET status='EXPIRED' WHERE session_id=? AND status='PENDING'").run(sessionId);
      return {success:true,completed:false,status:'EXPIRED'};
    }
    if(remoteStatus!=='UPLOADED'||!photoId) return {success:true,completed:false,status:remoteStatus||'PENDING'};
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const current=sqlite.prepare("SELECT status,photo_id AS photoId,reward_amount AS rewardAmount FROM token_photo_sessions WHERE session_id=? AND player_id=?").get(sessionId,playerId) as {status:string;photoId:string|null;rewardAmount:number}|undefined;
      if(!current) throw new BadRequestException('A fotófeltöltési munkamenet nem található.');
      if(current.status==='COMPLETED'){sqlite.exec('COMMIT');return {...this.getTokenPhotoStatus(playerId),success:true,completed:true,rewardAmount:current.rewardAmount,photoId:current.photoId};}
      if(current.status!=='PENDING') throw new BadRequestException('Ez a fotófeltöltés már nem teljesíthető.');
      const duplicate=sqlite.prepare('SELECT session_id FROM token_photo_sessions WHERE photo_id=? AND session_id<>?').get(photoId,sessionId);
      if(duplicate) throw new BadRequestException('Ezt a fotót már felhasználták egy jutalom igényléséhez.');
      const update=sqlite.prepare("UPDATE token_photo_sessions SET status='COMPLETED',photo_id=?,completed_at=CURRENT_TIMESTAMP WHERE session_id=? AND status='PENDING'").run(photoId,sessionId);
      if(!update.changes) throw new BadRequestException('A fotófeltöltés már feldolgozás alatt áll.');
      sqlite.prepare('UPDATE players SET token_balance=token_balance+? WHERE id=?').run(current.rewardAmount,playerId);
      const balance=sqlite.prepare('SELECT token_balance AS balance FROM players WHERE id=?').get(playerId) as {balance:number};
      sqlite.prepare("INSERT INTO token_transactions (player_id,amount,balance_after,type,description) VALUES (?,?,?,'PHOTO_REWARD',?)").run(playerId,current.rewardAmount,balance.balance,'Snappin fotófeltöltési jutalom · +'+current.rewardAmount+' CR');
      sqlite.exec('COMMIT');
      return {...this.getTokenPhotoStatus(playerId),success:true,completed:true,rewardAmount:current.rewardAmount,photoId};
    } catch(error) { sqlite.exec('ROLLBACK'); throw error; }
  }

  getSideQuestPool() {
    return this.database.sqlite.prepare('SELECT id, title, description, enabled, photo_enabled AS photoEnabled, created_at AS createdAt FROM side_quest_pool ORDER BY id DESC').all();
  }

  addSideQuestToPool(titleInput: string, descriptionInput: string, photoEnabledInput = false) {
    const title = String(titleInput ?? '').trim();
    const description = String(descriptionInput ?? '').trim();
    if (!title || title.length > 120) throw new BadRequestException('A side quest címe 1–120 karakter legyen.');
    if (description.length > 500) throw new BadRequestException('A leírás legfeljebb 500 karakter lehet.');
    const result = this.database.sqlite.prepare('INSERT INTO side_quest_pool (title, description, photo_enabled) VALUES (?, ?, ?)').run(title, description, photoEnabledInput ? 1 : 0);
    return this.database.sqlite.prepare('SELECT id, title, description, enabled, photo_enabled AS photoEnabled FROM side_quest_pool WHERE id = ?').get(result.lastInsertRowid);
  }

  setSideQuestEnabled(questId:number,enabled:boolean) {
    if(typeof enabled!=='boolean')throw new BadRequestException('Érvénytelen küldetésállapot.');
    const result=this.database.sqlite.prepare('UPDATE side_quest_pool SET enabled=? WHERE id=?').run(enabled?1:0,questId);
    if(!result.changes)throw new BadRequestException('A küldetés nem található.');
    return this.database.sqlite.prepare('SELECT id,title,description,enabled,photo_enabled AS photoEnabled FROM side_quest_pool WHERE id=?').get(questId);
  }

  setSideQuestPhotoEnabled(questId:number,enabledInput:boolean) {
    if(typeof enabledInput!=='boolean') throw new BadRequestException('Érvénytelen fotós teljesítési beállítás.');
    const result=this.database.sqlite.prepare('UPDATE side_quest_pool SET photo_enabled=? WHERE id=?').run(enabledInput?1:0,questId);
    if(!result.changes) throw new BadRequestException('A side quest nem található.');
    return this.database.sqlite.prepare('SELECT id,title,description,enabled,photo_enabled AS photoEnabled FROM side_quest_pool WHERE id=?').get(questId);
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
      const result=sqlite.prepare("INSERT INTO duels (challenger_id,opponent_id,status,reward_amount) VALUES (?,?,'PENDING',?)").run(challengerId,opponentId,this.getCasinoGameSettings().duelReward);
      const challenger=sqlite.prepare('SELECT name FROM players WHERE id=?').get(challengerId) as {name:string};
      sqlite.prepare("INSERT INTO party_notifications (type,title,message,audience_player_id) VALUES ('duel','Párbajkihívás',?,?)").run(challenger.name+' kihívott egy párbajra.',opponentId);
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

  getShopItemsForAdmin() {
    return this.database.sqlite.prepare('SELECT item_key AS itemKey, name, description, price, enabled FROM shop_items ORDER BY name COLLATE NOCASE').all();
  }

  updateShopItem(itemKeyInput:string,input:{price:number;name:string;description:string}){
    const itemKey=String(itemKeyInput??'').trim().toUpperCase(),name=String(input?.name??'').trim(),description=String(input?.description??'').trim(),price=Number(input?.price);
    if(!name||name.length>80||description.length>300||!Number.isSafeInteger(price)||price<0||price>2000000)throw new BadRequestException('Érvénytelen shop termékadatok.');
    const result=this.database.sqlite.prepare('UPDATE shop_items SET name=?,description=?,price=? WHERE item_key=?').run(name,description,price,itemKey);
    if(!result.changes)throw new BadRequestException('A termék nem található.');
    return this.database.sqlite.prepare('SELECT item_key AS itemKey,name,description,price,enabled FROM shop_items WHERE item_key=?').get(itemKey);
  }

  setShopItemEnabled(itemKeyInput: string, enabledInput: boolean) {
    const itemKey = String(itemKeyInput ?? '').trim().toUpperCase();
    if (typeof enabledInput !== 'boolean') throw new BadRequestException('Érvénytelen termékállapot.');
    const result = this.database.sqlite.prepare('UPDATE shop_items SET enabled=? WHERE item_key=?').run(enabledInput ? 1 : 0, itemKey);
    if (!result.changes) throw new BadRequestException('A termék nem található.');
    return this.database.sqlite.prepare('SELECT item_key AS itemKey, name, description, price, enabled FROM shop_items WHERE item_key=?').get(itemKey);
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
    const sqlite=this.database.sqlite; sqlite.exec('BEGIN IMMEDIATE');
    try {
      const player=sqlite.prepare('SELECT token_balance AS balance FROM players WHERE id=?').get(playerId) as {balance:number}|undefined;
      if (!player) throw new BadRequestException('A játékos nem található.');
      const item=sqlite.prepare('SELECT item_key AS itemKey,name,price FROM shop_items WHERE item_key=? AND enabled=1').get(itemKey) as {itemKey:string;name:string;price:number}|undefined;
      if (!item) throw new BadRequestException('Ez a termék jelenleg nem elérhető.');
      if (player.balance < item.price) throw new BadRequestException('Nincs elég CR az egyenlegeden.');
      sqlite.prepare('UPDATE players SET token_balance=token_balance-? WHERE id=?').run(item.price,playerId);
      const balance=player.balance-item.price;
      sqlite.prepare("INSERT INTO token_transactions (player_id,amount,balance_after,type,description) VALUES (?,?,?,'SHOP_PURCHASE',?)").run(playerId,-item.price,balance,'Shop vásárlás · '+item.name);
      if(itemKey==='SCRATCH_TICKET'){
        const settings=this.getCasinoGameSettings();
        const roll=randomInt(0,10000);let threshold=settings.scratchLossPercent*100,prize=0;
        for(const [chance,value] of [[settings.scratch10Percent,10],[settings.scratch25Percent,25],[settings.scratch50Percent,50],[settings.scratch100Percent,100]] as Array<[number,number]>){threshold+=chance*100;if(roll>=settings.scratchLossPercent*100 && roll<threshold){prize=value;break;}}
        const symbols=['🍒','🍋','🔔','🍀','💎','⭐','7️⃣'];
        const makeNonWinningRow=():string[]=>{
          for(let attempt=0;attempt<100;attempt++){
            const row=Array.from({length:3},()=>symbols[randomInt(0,symbols.length-1)]);
            if(!(row[0]===row[1]&&row[1]===row[2]))return row;
          }
          return ['🍒','🍋','🍒'];
        };
        const grid:string[][]=Array.from({length:3},()=>makeNonWinningRow());
        if(prize>0){
          const prizeSymbol=prize===100?'7️⃣':prize===50?'💎':prize===25?'⭐':'🔔';
          const winningRow=randomInt(0,2);
          grid[winningRow]=[prizeSymbol,prizeSymbol,prizeSymbol];
        }
        const result=sqlite.prepare('INSERT INTO scratch_tickets (player_id,prize_amount,outcome_json) VALUES (?,?,?)').run(playerId,prize,JSON.stringify(grid));
        sqlite.exec('COMMIT'); return {success:true,itemKey:item.itemKey,ticketId:Number(result.lastInsertRowid),tokenBalance:balance};
      }
      sqlite.prepare('INSERT INTO player_inventory (player_id,item_key,quantity) VALUES (?,?,1) ON CONFLICT(player_id,item_key) DO UPDATE SET quantity=quantity+1,updated_at=CURRENT_TIMESTAMP').run(playerId,item.itemKey);
      sqlite.exec('COMMIT');
      return {success:true,itemKey:item.itemKey,quantity:sqlite.prepare('SELECT quantity FROM player_inventory WHERE player_id=? AND item_key=?').get(playerId,item.itemKey).quantity,tokenBalance:balance};
    } catch(error) { sqlite.exec('ROLLBACK'); throw error; }
  }

  getScratchTickets(playerId:number) {
    if(!this.database.sqlite.prepare('SELECT id FROM players WHERE id=?').get(playerId)) throw new BadRequestException('A játékos nem található.');
    return this.database.sqlite.prepare("SELECT id,status,CASE WHEN status='REVEALED' THEN prize_amount ELSE NULL END AS prizeAmount,CASE WHEN status='REVEALED' THEN outcome_json ELSE NULL END AS outcomeJson,created_at AS createdAt,revealed_at AS revealedAt FROM scratch_tickets WHERE player_id=? ORDER BY id DESC LIMIT 20").all(playerId);
  }

  revealScratchTicket(playerId:number,ticketId:number) {
    if(!Number.isSafeInteger(ticketId)||ticketId<=0) throw new BadRequestException('Érvénytelen sorsjegy.');
    const sqlite=this.database.sqlite; sqlite.exec('BEGIN IMMEDIATE');
    try {
      const ticket=sqlite.prepare('SELECT id,status,prize_amount AS prizeAmount,outcome_json AS outcomeJson FROM scratch_tickets WHERE id=? AND player_id=?').get(ticketId,playerId) as {id:number;status:string;prizeAmount:number;outcomeJson:string}|undefined;
      if(!ticket) throw new BadRequestException('A sorsjegy nem található.');
      if(ticket.status==='REVEALED'){sqlite.exec('COMMIT');return {success:true,ticketId,prizeAmount:ticket.prizeAmount,outcome:JSON.parse(ticket.outcomeJson),alreadyRevealed:true};}
      sqlite.prepare("UPDATE scratch_tickets SET status='REVEALED',revealed_at=CURRENT_TIMESTAMP WHERE id=? AND status='UNSCRATCHED'").run(ticketId);
      if(ticket.prizeAmount>0){
        sqlite.prepare('UPDATE players SET token_balance=token_balance+? WHERE id=?').run(ticket.prizeAmount,playerId);
        const balance=sqlite.prepare('SELECT token_balance AS balance FROM players WHERE id=?').get(playerId) as {balance:number};
        sqlite.prepare("INSERT INTO token_transactions (player_id,amount,balance_after,type,description) VALUES (?,?,?,'SCRATCH_WIN',?)").run(playerId,ticket.prizeAmount,balance.balance,'Kapart sorsjegy nyeremény · +'+ticket.prizeAmount+' CR');
      }
      sqlite.exec('COMMIT'); return {success:true,ticketId,prizeAmount:ticket.prizeAmount,outcome:JSON.parse(ticket.outcomeJson),alreadyRevealed:false};
    } catch(error){sqlite.exec('ROLLBACK');throw error;}
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
