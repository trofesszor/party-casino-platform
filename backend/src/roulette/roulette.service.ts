import { BadRequestException, Inject, Injectable, OnModuleDestroy, OnModuleInit, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DATABASE } from '../database/database.module';
import { EventsGateway } from '../events/events.gateway';

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const BET_TYPES = new Set(['NUMBER', 'SPLIT', 'STREET', 'CORNER', 'SIX_LINE', 'DOZEN', 'COLUMN', 'COLOR', 'ODD_EVEN', 'LOW_HIGH']);

@Injectable()
export class RouletteService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(DATABASE) private readonly database: any, private readonly gateway: EventsGateway) {}
  private setting(key:string,fallback:number){const row=this.database.sqlite.prepare('SELECT setting_value AS value FROM casino_settings WHERE setting_key=?').get(key) as {value:string}|undefined;return Number(row?.value??fallback);}
  private get bettingSeconds(){return this.setting('roulette_betting_seconds',20);}
  private get resultSeconds(){return this.setting('roulette_result_seconds',5);}
  private get maxBet(){return this.setting('roulette_max_bet',100);}


  onModuleInit() {
    const current = this.latestRound();
    if (!current) { this.openNextRound(); return; }
    if (current.status === 'BETTING') {
      const endsAt = new Date(Date.now() + this.bettingSeconds * 1000).toISOString();
      this.database.sqlite.prepare('UPDATE casino_roulette_rounds SET betting_ends_at = ? WHERE id = ?').run(endsAt, current.id);
      this.schedule(this.bettingSeconds * 1000, () => this.finishRound());
    } else {
      this.schedule(this.resultSeconds * 1000, () => this.openNextRound());
    }
    this.publishState();
  }

  onModuleDestroy() { if (this.timer) clearTimeout(this.timer); }

  getState() {
    const currentRound = this.latestRound();
    if (!currentRound) return { currentRound: null, bets: [], winners: [], history: [], bettingSeconds: this.bettingSeconds };
    const bets = this.database.sqlite.prepare(`
      SELECT b.id AS id, b.player_id AS playerId, p.name AS playerName,
        b.bet_type AS betType, b.bet_value AS betValue, b.amount AS amount
      FROM casino_roulette_bets b JOIN players p ON p.id = b.player_id
      WHERE b.round_id = ? ORDER BY b.created_at, b.id
    `).all(currentRound.id) as any[];
    const winners = currentRound.status === 'COMPLETED'
      ? bets.filter((bet: any) => this.isWinner(bet, currentRound.resultNumber)) : [];
    const history = this.database.sqlite.prepare(`
      SELECT round_number AS roundNumber, result_number AS resultNumber, completed_at AS completedAt
      FROM casino_roulette_rounds WHERE status = 'COMPLETED' AND id < ?
      ORDER BY id DESC LIMIT 10
    `).all(currentRound.id);
    return { currentRound, bets, winners, history, bettingSeconds: this.bettingSeconds };
  }

  placeBet(playerId: number, input: { betType: string; betValue: string | number; amount?: number }) {
    const player = this.database.sqlite.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
    if (!player) throw new NotFoundException('A játékos nem található. Lépj be újra a neveddel.');
    const round = this.latestRound();
    if (!round || round.status !== 'BETTING' || Date.parse(round.bettingEndsAt) <= Date.now()) {
      throw new BadRequestException('A fogadási időszak lezárult.');
    }

    const betType = String(input?.betType ?? '').toUpperCase();
    const betValue = String(input?.betValue ?? '').toLowerCase();
    const amount = Number(input?.amount ?? 1);
    if (!BET_TYPES.has(betType)) throw new BadRequestException('Érvénytelen fogadástípus.');
    if (!Number.isInteger(amount) || amount < 1 || amount > this.maxBet) throw new BadRequestException('A tét értéke 1 és '+this.maxBet+' között lehet.');
    this.validateBet(betType, betValue);

    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const debit = sqlite.prepare('UPDATE players SET token_balance = token_balance - ? WHERE id = ? AND token_balance >= ?').run(amount, playerId, amount);
      if (Number(debit.changes) !== 1) throw new BadRequestException('Nincs elegendő token a fogadáshoz.');
      const balance = sqlite.prepare('SELECT token_balance AS tokenBalance FROM players WHERE id = ?').get(playerId) as { tokenBalance: number };
      sqlite.prepare("INSERT INTO token_transactions (player_id, amount, balance_after, type, description) VALUES (?, ?, ?, 'ROULETTE_BET', ?)").run(playerId, -amount, balance.tokenBalance, 'Rulett tét: ' + betType + ' ' + betValue);
      sqlite.prepare('INSERT INTO casino_roulette_bets (round_id, player_id, bet_type, bet_value, amount) VALUES (?, ?, ?, ?, ?)').run(round.id, playerId, betType, betValue, amount);
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
    return this.publishState();
  }

  private validateBet(type: string, value: string) {
    const parts = value.split(',').map(Number);
    const validNumbers = (count: number) => parts.length === count && parts.every(n => Number.isInteger(n) && n >= 1 && n <= 36) && new Set(parts).size === count;
    if (type === 'NUMBER' && value !== '0' && !validNumbers(1)) throw new BadRequestException('Válassz egy számot 0 és 36 között.');
    if (type === 'NUMBER' && value === '0') return;
    if (type === 'SPLIT') {
      if (!validNumbers(2)) throw new BadRequestException('A splithez két szomszédos szám kell.');
      const [a,b] = parts.sort((x,y)=>x-y);
      if (!(b-a===1 && Math.floor((a-1)/3)===Math.floor((b-1)/3)) && b-a!==3) throw new BadRequestException('A split mezőknek szomszédosnak kell lenniük.');
    } else if (type === 'STREET') {
      if (!validNumbers(3)) throw new BadRequestException('A streethez egy teljes háromszámos sor kell.');
      const sorted = parts.sort((a,b)=>a-b);
      if (sorted[1]!==sorted[0]+1 || sorted[2]!==sorted[0]+2 || (sorted[0]-1)%3!==0) throw new BadRequestException('A street mezőinek egy sorban kell lenniük.');
    } else if (type === 'CORNER') {
      if (!validNumbers(4)) throw new BadRequestException('A cornerhez négy szám kell.');
      const sorted = parts.sort((a,b)=>a-b);
      const base = sorted[0];
      const expected = [base,base+1,base+3,base+4];
      if ((base-1)%3===2 || Math.floor((base-1)/3)>=11 || expected.some(n=>!sorted.includes(n))) throw new BadRequestException('A corner mezőinek egy közös saroknál kell lenniük.');
    } else if (type === 'SIX_LINE') {
      if (!validNumbers(6)) throw new BadRequestException('A six line-hoz hat szám kell.');
      const sorted = parts.sort((a,b)=>a-b);
      const base = sorted[0];
      if ((base-1)%3!==0 || Math.floor((base-1)/3)>=11 || sorted.some((n,i)=>n!==base+i)) throw new BadRequestException('A six line két egymást követő teljes sorból áll.');
    } else if (type === 'DOZEN' && !['1','2','3'].includes(value)) throw new BadRequestException('Válassz egy tucatot.');
    else if (type === 'COLUMN' && !['1','2','3'].includes(value)) throw new BadRequestException('Válassz egy oszlopot.');
    else if (type === 'COLOR' && !['red','black'].includes(value)) throw new BadRequestException('Válassz pirosat vagy feketét.');
    else if (type === 'ODD_EVEN' && !['odd','even'].includes(value)) throw new BadRequestException('Válassz páratlant vagy párosat.');
    else if (type === 'LOW_HIGH' && !['low','high'].includes(value)) throw new BadRequestException('Válassz kis vagy nagy számot.');
  }

  private latestRound() {
    return this.database.sqlite.prepare(`
      SELECT id, round_number AS roundNumber, status, result_number AS resultNumber,
        betting_ends_at AS bettingEndsAt, created_at AS createdAt, completed_at AS completedAt
      FROM casino_roulette_rounds ORDER BY id DESC LIMIT 1
    `).get() as any | undefined;
  }

  private openNextRound() {
    const next = this.database.sqlite.prepare('SELECT COALESCE(MAX(round_number), 0) + 1 AS n FROM casino_roulette_rounds').get() as { n: number };
    const endsAt = new Date(Date.now() + this.bettingSeconds * 1000).toISOString();
    this.database.sqlite.prepare("INSERT INTO casino_roulette_rounds (round_number, status, betting_ends_at) VALUES (?, 'BETTING', ?)").run(next.n, endsAt);
    this.publishState();
    this.schedule(this.bettingSeconds * 1000, () => this.finishRound());
  }

  private finishRound() {
    const round = this.latestRound();
    if (!round || round.status !== 'BETTING') return;
    const result = randomInt(0, 37);
    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const updated = sqlite.prepare("UPDATE casino_roulette_rounds SET status = 'COMPLETED', result_number = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'BETTING'").run(result, round.id);
      if (Number(updated.changes) === 1) {
        const bets = sqlite.prepare('SELECT id, player_id AS playerId, bet_type AS betType, bet_value AS betValue, amount FROM casino_roulette_bets WHERE round_id = ?').all(round.id) as any[];
        const savePayout = sqlite.prepare('UPDATE casino_roulette_bets SET payout_amount = ? WHERE id = ?');
        const credit = sqlite.prepare('UPDATE players SET token_balance = token_balance + ? WHERE id = ?');
        const balanceQuery = sqlite.prepare('SELECT token_balance AS tokenBalance FROM players WHERE id = ?');
        const ledger = sqlite.prepare("INSERT INTO token_transactions (player_id, amount, balance_after, type, description) VALUES (?, ?, ?, 'ROULETTE_WIN', ?)");
        for (const bet of bets) {
          if (!this.isWinner(bet, result)) continue;
          const payout = Number(bet.amount) * (this.payoutOdds(bet.betType) + 1);
          savePayout.run(payout, bet.id);
          credit.run(payout, bet.playerId);
          const balance = balanceQuery.get(bet.playerId) as { tokenBalance: number };
          ledger.run(bet.playerId, payout, balance.tokenBalance, 'Rulett nyeremény: ' + bet.betType);
        }
      }
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
    this.publishState();
    this.schedule(this.resultSeconds * 1000, () => this.openNextRound());
  }

  private publishState() {
    const state = this.getState();
    this.gateway.publish('roulette:changed', state);
    return state;
  }

  private schedule(delay: number, callback: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(callback, Math.max(0, delay));
  }

  private payoutOdds(type: string) {
    const odds: Record<string, number> = { NUMBER: 35, SPLIT: 17, STREET: 11, CORNER: 8, SIX_LINE: 5, DOZEN: 2, COLUMN: 2, COLOR: 1, ODD_EVEN: 1, LOW_HIGH: 1 };
    return odds[type] ?? 0;
  }

  private isWinner(bet: any, result: number) {
    if (result === 0) return bet.betType === 'NUMBER' && Number(bet.betValue) === 0;
    const values = bet.betValue.split(',').map(Number);
    switch (bet.betType) {
      case 'NUMBER': case 'SPLIT': case 'STREET': case 'CORNER': case 'SIX_LINE': return values.includes(result);
      case 'DOZEN': return Math.ceil(result / 12) === Number(bet.betValue);
      case 'COLUMN': return (result - 1) % 3 + 1 === Number(bet.betValue);
      case 'COLOR': return bet.betValue === (RED_NUMBERS.has(result) ? 'red' : 'black');
      case 'ODD_EVEN': return bet.betValue === (result % 2 ? 'odd' : 'even');
      case 'LOW_HIGH': return bet.betValue === (result <= 18 ? 'low' : 'high');
      default: return false;
    }
  }
}
