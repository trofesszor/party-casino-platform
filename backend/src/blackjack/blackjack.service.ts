import { BadRequestException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import { DATABASE } from '../database/database.module';
import { isBlackjack, scoreHand, shuffledShoe, total } from './blackjack-rules';
import type { Card } from './blackjack-rules';

const seatCount = 6;
const bets = [2, 4, 10, 20, 50, 100];
const resultsMs = 6000;
type Person = { playerId: number; name: string; owner: string };
type HeldBet = { id: number; playerId: number; amount: number };
type Seat = Person & { bet: HeldBet | null; skipped: boolean };
type Hand = Person & {
  position: number;
  bet: HeldBet;
  cards: Card[];
  finished: boolean;
  left: boolean;
  outcome?: ReturnType<typeof scoreHand>;
};
type TablePhase = 'betting' | 'playing' | 'results';

@Injectable()
export class BlackjackService implements OnModuleInit, OnModuleDestroy {
  private readonly seats = new Map<number, Seat>();
  private hands: Hand[] = [];
  private dealer: Card[] = [];
  private deck: Card[] = [];
  private phase: TablePhase = 'betting';
  private round = 1;
  private nextRoundAt: number | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  onChange?: () => void;

  constructor(@Inject(DATABASE) private readonly database: { sqlite: DatabaseSync }) {}

  onModuleInit() {
    const held = this.database.sqlite.prepare('SELECT id, player_id AS playerId, amount FROM blackjack_holds').all() as HeldBet[];
    if (held.length) this.transaction(() => {
      for (const bet of held) this.release(bet, bet.amount, 'Blackjack · megszakadt kör visszatérítése');
    });
  }

  onModuleDestroy() { clearTimeout(this.timer); }

  snapshot(owner: string, playerId: number) {
    const player = this.player(playerId);
    return {
      phase: this.phase,
      round: this.round,
      allowedBets: bets,
      balance: player?.balance ?? null,
      nextRoundAt: this.nextRoundAt,
      dealer: this.phase === 'playing' ? this.dealer.slice(0, 1) : this.dealer,
      dealerHidden: this.phase === 'playing',
      dealerTotal: this.phase === 'results' ? total(this.dealer) : null,
      seats: Array.from({ length: seatCount }, (_, index) => {
        const position = index + 1;
        const seat = this.seats.get(position);
        const hand = this.hands.find(entry => entry.position === position);
        return {
          position,
          occupant: seat ? { name: seat.name, mine: seat.owner === owner, bet: seat.bet?.amount ?? null, skipped: seat.skipped } : null,
          hand: hand ? {
            name: hand.name, mine: hand.owner === owner && !hand.left, left: hand.left,
            cards: hand.cards, total: total(hand.cards), stake: hand.bet.amount,
            finished: hand.finished, result: hand.outcome?.result ?? null, payout: hand.outcome?.payout ?? null,
            canDouble: !hand.finished && hand.owner === owner && hand.cards.length === 2 && (player?.balance ?? 0) >= hand.bet.amount,
          } : null,
        };
      }),
    };
  }

  sit(owner: string, playerId: number, position: number) {
    this.checkPosition(position);
    const player = this.player(playerId);
    if (!player) throw new BadRequestException('A székfoglaláshoz lépj be a neveddel.');
    if (this.seats.has(position)) throw new BadRequestException('Ez a szék foglalt.');
    this.seats.set(position, { owner, playerId, name: player.name, skipped: false, bet: null });
  }

  leave(owner: string, position?: number) {
    if (position !== undefined) this.checkPosition(position);
    const leaving = [...this.seats].filter(([number, seat]) => seat.owner === owner && (position === undefined || position === number));
    if (position !== undefined && !leaving.length) throw new BadRequestException('Ez a szék nem a tiéd.');
    if (!leaving.length) return false;
    if (this.phase === 'betting' && leaving.some(([, seat]) => seat.bet)) this.transaction(() => {
      for (const [, seat] of leaving) {
        if (seat.bet) this.release(seat.bet, seat.bet.amount, 'Blackjack · tét visszatérítve');
      }
    });
    for (const [number] of leaving) {
      this.seats.delete(number);
      const hand = this.hands.find(entry => entry.position === number && entry.owner === owner);
      if (hand) {
        hand.left = true;
        hand.finished = true;
      }
    }
    if (this.phase === 'betting') this.maybeDeal();
    else if (this.phase === 'playing') this.maybeSettle();
    return true;
  }

  wager(owner: string, position: number, amount: number) {
    const seat = this.openSeat(owner, position);
    if (!bets.includes(amount)) throw new BadRequestException('Válassz érvényes CR-tétet.');
    const id = this.transaction(() => {
      this.changeBalance(seat.playerId, -amount, 'BLACKJACK_BET', 'Blackjack · tét');
      return Number(this.database.sqlite.prepare('INSERT INTO blackjack_holds (player_id, amount) VALUES (?, ?)').run(seat.playerId, amount).lastInsertRowid);
    });
    seat.bet = { id, playerId: seat.playerId, amount };
    this.maybeDeal();
  }

  skip(owner: string, position: number) {
    const seat = this.openSeat(owner, position);
    seat.skipped = true;
    this.maybeDeal();
  }

  play(owner: string, position: number, action: string) {
    if (this.phase !== 'playing') throw new BadRequestException('Most nincs játszható kéz.');
    const hand = this.hands.find(entry => entry.position === position && entry.owner === owner && !entry.left);
    if (!hand || hand.finished) throw new BadRequestException('Ennél a kéznél már nincs teendő.');
    if (action === 'double') {
      if (hand.cards.length !== 2) throw new BadRequestException('Duplázni csak két lappal lehet.');
      const extra = hand.bet.amount;
      this.transaction(() => {
        this.changeBalance(hand.playerId, -extra, 'BLACKJACK_BET', 'Blackjack · duplázás');
        this.database.sqlite.prepare('UPDATE blackjack_holds SET amount = amount + ? WHERE id = ?').run(extra, hand.bet.id);
      });
      hand.bet.amount += extra;
    }
    if (action === 'hit' || action === 'double') hand.cards.push(this.draw());
    else if (action !== 'stand') throw new BadRequestException('Ismeretlen blackjackművelet.');
    hand.finished = action !== 'hit' || total(hand.cards) >= 21;
    this.maybeSettle();
  }

  reset() {
    clearTimeout(this.timer);
    this.seats.clear();
    this.round = 1;
    this.openBetting();
  }

  private openSeat(owner: string, position: number) {
    if (this.phase !== 'betting') throw new BadRequestException('A következő kör elején tehetsz tétet.');
    const seat = this.seats.get(position);
    if (!seat || seat.owner !== owner) throw new BadRequestException('Ez a szék nem a tiéd.');
    if (seat.bet || seat.skipped) throw new BadRequestException('Erre a körre már döntöttél ennél a széknél.');
    return seat;
  }

  private maybeDeal() {
    const occupied = [...this.seats].sort(([a], [b]) => a - b);
    if (occupied.some(([, seat]) => !seat.bet && !seat.skipped)) return;
    this.hands = occupied.flatMap(([position, seat]) => seat.bet
      ? [{ position, owner: seat.owner, playerId: seat.playerId, name: seat.name, bet: seat.bet, cards: [], finished: false, left: false }]
      : []);
    if (!this.hands.length) {
      for (const [, seat] of occupied) seat.skipped = false;
      return;
    }
    this.phase = 'playing';
    this.deck = shuffledShoe();
    this.dealer = [];
    for (let pass = 0; pass < 2; pass++) {
      for (const hand of this.hands) hand.cards.push(this.draw());
      this.dealer.push(this.draw());
    }
    for (const hand of this.hands) hand.finished = isBlackjack(hand.cards);
    this.maybeSettle();
  }

  private maybeSettle() {
    if (this.hands.some(hand => !hand.finished)) return;
    if (this.hands.some(hand => total(hand.cards) <= 21)) {
      while (total(this.dealer) < 17) this.dealer.push(this.draw());
    }
    const outcomes = this.hands.map(hand => scoreHand(hand.cards, this.dealer, hand.bet.amount));
    this.transaction(() => this.hands.forEach((hand, index) => {
      this.release(hand.bet, outcomes[index].payout, 'Blackjack · kifizetés');
    }));
    this.hands.forEach((hand, index) => { hand.outcome = outcomes[index]; });
    this.phase = 'results';
    this.nextRoundAt = Date.now() + resultsMs;
    this.timer = setTimeout(() => {
      this.round++;
      this.openBetting();
    }, resultsMs);
  }

  private openBetting() {
    this.phase = 'betting';
    this.nextRoundAt = null;
    this.hands = [];
    this.dealer = [];
    this.deck = [];
    for (const seat of this.seats.values()) {
      seat.bet = null;
      seat.skipped = false;
    }
    this.onChange?.();
  }

  private draw() {
    const card = this.deck.pop();
    if (!card) throw new Error('A blackjackpakli elfogyott.');
    return card;
  }

  private checkPosition(position: number) {
    if (!Number.isInteger(position) || position < 1 || position > seatCount) throw new BadRequestException('Érvénytelen szék.');
  }

  private player(id: number) {
    if (!Number.isSafeInteger(id) || id < 1) return undefined;
    return this.database.sqlite.prepare('SELECT name, token_balance AS balance FROM players WHERE id = ?').get(id) as { name: string; balance: number } | undefined;
  }

  private changeBalance(id: number, amount: number, type: string, description: string) {
    const db = this.database.sqlite;
    const result = db.prepare('UPDATE players SET token_balance = token_balance + ? WHERE id = ? AND token_balance + ? >= 0')
      .run(amount, id, amount);
    if (!result.changes) throw new BadRequestException('Nincs elegendő CR a tétre.');
    const balance = this.player(id)!.balance;
    db.prepare('INSERT INTO token_transactions (player_id, amount, balance_after, type, description) VALUES (?, ?, ?, ?, ?)')
      .run(id, amount, balance, type, description);
  }

  private release(bet: HeldBet, payout: number, description: string) {
    const result = this.database.sqlite.prepare('DELETE FROM blackjack_holds WHERE id = ?').run(bet.id);
    if (result.changes && payout) this.changeBalance(bet.playerId, payout, payout === bet.amount ? 'BLACKJACK_RETURN' : 'BLACKJACK_WIN', description);
  }

  private transaction<T>(work: () => T): T {
    const db = this.database.sqlite;
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
