import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
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
      if (active.count >= 2) throw new BadRequestException('Már van 2 aktív side quested.');
      const quest = sqlite.prepare(`
        SELECT id, title, description, photo_enabled AS photoEnabled FROM side_quest_pool
        WHERE enabled = 1 AND NOT EXISTS (
          SELECT 1 FROM player_side_quests assigned
          WHERE assigned.player_id = ? AND assigned.pool_quest_id = side_quest_pool.id AND assigned.status <> 'SKIPPED'
        )
        ORDER BY RANDOM() LIMIT 1
      `).get(playerId) as { id: number; title: string; description: string } | undefined;
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
      const expiresAt = new Date(Date.now() + 90_000).toISOString();
      sqlite.prepare("INSERT INTO side_quest_verification_requests (quest_id,owner_id,token_hash,expires_at) VALUES (?,?,?,?)").run(questId,playerId,pinHash,expiresAt);
      sqlite.exec('COMMIT');
      return { pin, expiresAt };
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
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

  async createSideQuestPhotoSession(playerId: number, questId: number) {
    const sqlite=this.database.sqlite;
    const quest=sqlite.prepare("SELECT id,photo_enabled AS photoEnabled,status,title FROM player_side_quests WHERE id=? AND player_id=?").get(questId,playerId) as {id:number;photoEnabled:number;status:string;title:string}|undefined;
    if(!quest||quest.status!=='ACTIVE') throw new BadRequestException('Az aktív küldetés nem található.');
    if(!quest.photoEnabled) throw new BadRequestException('Ehhez a küldetéshez PIN-kódos igazolás szükséges.');
    const baseUrl=String(process.env.SNAPPIN_API_URL??'').trim().replace(/\/$/,'');
    const apiKey=String(process.env.SNAPPIN_API_KEY??'').trim();
    const eventId=String(process.env.SNAPPIN_EVENT_ID??'').trim();
    if(!baseUrl||!apiKey||!eventId) throw new BadRequestException('A Snappin integrációhoz SNAPPIN_API_URL, SNAPPIN_API_KEY és SNAPPIN_EVENT_ID beállítása szükséges.');
    const player=sqlite.prepare('SELECT name FROM players WHERE id=?').get(playerId) as {name:string}|undefined;
    const response=await fetch(baseUrl+'/v1/events/'+encodeURIComponent(eventId)+'/sessions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({guestExternalId:'party-casino-player-'+playerId,guestName:player?.name??'Party Casino player'})
    });
    const payload:any=await response.json().catch(()=>({}));
    if(!response.ok) throw new BadRequestException(payload.message||'A Snappin kamera-munkamenet nem indítható el.');
    const sessionId=String(payload.sessionId??'');
    const token=String(payload.token??'');
    const cameraUrl=String(payload.cameraUrl??'');
    const expiresAt=String(payload.expiresAt??'');
    if(!sessionId||!token||!cameraUrl||!expiresAt) throw new BadRequestException('A Snappin API válasza hiányos (sessionId, token, cameraUrl, expiresAt).');
    sqlite.prepare("INSERT INTO side_quest_photo_sessions (session_id,quest_id,player_id,expires_at) VALUES (?,?,?,?)").run(sessionId,questId,playerId,expiresAt);
    const url=new URL(cameraUrl);
    if(!url.searchParams.has('token')) url.searchParams.set('token',token);
    return {sessionId,cameraUrl:url.toString(),expiresAt,questTitle:quest.title};
  }

  async completeSideQuestWithPhoto(playerId:number,questId:number,sessionIdInput:string) {
    const sessionId=String(sessionIdInput??'').trim();
    if(!sessionId||sessionId.length>200) throw new BadRequestException('Érvénytelen fotófeltöltési munkamenet.');
    const sqlite=this.database.sqlite;
    const localSession=sqlite.prepare("SELECT * FROM side_quest_photo_sessions WHERE session_id=? AND quest_id=? AND player_id=? AND status='PENDING' AND datetime(expires_at)>CURRENT_TIMESTAMP").get(sessionId,questId,playerId);
    if(!localSession) {
      const completed=sqlite.prepare("SELECT status,photo_id AS photoId FROM side_quest_photo_sessions WHERE session_id=? AND quest_id=? AND player_id=?").get(sessionId,questId,playerId) as {status:string;photoId:string|null}|undefined;
      if(completed?.status==='COMPLETED') return {success:true,completed:true,questId,photoId:completed.photoId};
      throw new BadRequestException('A fotófeltöltési munkamenet lejárt vagy nem található.');
    }
    const baseUrl=String(process.env.SNAPPIN_API_URL??'').trim().replace(/\/$/,'');
    const apiKey=String(process.env.SNAPPIN_API_KEY??'').trim();
    const eventId=String(process.env.SNAPPIN_EVENT_ID??'').trim();
    if(!baseUrl||!apiKey||!eventId) throw new BadRequestException('A Snappin integráció nincs konfigurálva.');
    const verifyResponse=await fetch(baseUrl+'/v1/events/'+encodeURIComponent(eventId)+'/sessions/'+encodeURIComponent(sessionId),{headers:{Authorization:'Bearer '+apiKey}});
    const verify:any=await verifyResponse.json().catch(()=>({}));
    if(!verifyResponse.ok) throw new BadRequestException(verify.message||'Nem sikerült ellenőrizni a Snappin munkamenetet.');
    const expectedExternalId='party-casino-player-'+playerId;
    if(String(verify.guestExternalId??'')!==expectedExternalId) throw new BadRequestException('A Snappin munkamenet nem ehhez a játékoshoz tartozik.');
    const photoId=String(verify.photoId??verify.photo?.id??verify.photos?.[0]?.id??'');
    const status=String(verify.status??'').toUpperCase();
    const uploaded=!!photoId&&(['COMPLETED','UPLOADED','READY'].includes(status)||!!verify.completedAt||verify.completed===true);
    if(!uploaded) return {success:true,completed:false,status:status||'PENDING'};
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const current=sqlite.prepare("SELECT status,photo_enabled FROM player_side_quests WHERE id=? AND player_id=?").get(questId,playerId) as {status:string;photo_enabled:number}|undefined;
      if(!current||current.status!=='ACTIVE'||!current.photo_enabled) throw new BadRequestException('Ez a küldetés már nem teljesíthető fotóval.');
      sqlite.prepare("UPDATE side_quest_photo_sessions SET status='COMPLETED',photo_id=?,completed_at=CURRENT_TIMESTAMP WHERE session_id=? AND status='PENDING'").run(photoId,sessionId);
      sqlite.prepare("UPDATE player_side_quests SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP,completion_method='PHOTO',photo_id=? WHERE id=? AND status='ACTIVE'").run(photoId,questId);
      sqlite.exec('COMMIT');
      return {success:true,completed:true,questId,photoId,completionMethod:'PHOTO'};
    } catch(error){sqlite.exec('ROLLBACK');throw error;}
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

  getShopItemsForAdmin() {
    return this.database.sqlite.prepare('SELECT item_key AS itemKey, name, description, price, enabled FROM shop_items ORDER BY name COLLATE NOCASE').all();
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
