import { BadRequestException, Inject, Injectable, OnModuleDestroy, OnModuleInit, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DATABASE } from '../database/database.module';
import { EventsGateway } from '../events/events.gateway';

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const BETTING_SECONDS = 20;
const RESULT_SECONDS = 5;

@Injectable()
export class RouletteService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(DATABASE) private readonly database: any, private readonly gateway: EventsGateway) {}

  onModuleInit() {
    const current = this.latestRound();
    if (!current) {
      this.openNextRound();
      return;
    }
    if (current.status === 'BETTING') {
      // Restarting the local server starts a fresh betting window rather than leaving a stale round locked.
      const endsAt = new Date(Date.now() + BETTING_SECONDS * 1000).toISOString();
      this.database.sqlite.prepare('UPDATE casino_roulette_rounds SET betting_ends_at = ? WHERE id = ?').run(endsAt, current.id);
      this.schedule(BETTING_SECONDS * 1000, () => this.finishRound());
    } else {
      this.schedule(RESULT_SECONDS * 1000, () => this.openNextRound());
    }
    this.publishState();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  getState() {
    const currentRound = this.latestRound();
    if (!currentRound) return { currentRound: null, bets: [], winners: [], history: [], bettingSeconds: BETTING_SECONDS };
    const bets = this.database.sqlite.prepare(`
      SELECT b.player_id AS playerId, p.name AS playerName,
        b.bet_type AS betType, b.bet_value AS betValue
      FROM casino_roulette_bets b
      JOIN players p ON p.id = b.player_id
      WHERE b.round_id = ? ORDER BY b.created_at, p.name
    `).all(currentRound.id) as any[];
    const winners = currentRound.status === 'COMPLETED'
      ? bets.filter((bet: any) => this.isWinner(bet, currentRound.resultNumber))
      : [];
    const history = this.database.sqlite.prepare(`
      SELECT round_number AS roundNumber, result_number AS resultNumber, completed_at AS completedAt
      FROM casino_roulette_rounds WHERE status = 'COMPLETED' AND id < ?
      ORDER BY id DESC LIMIT 10
    `).all(currentRound.id);
    return { currentRound, bets, winners, history, bettingSeconds: BETTING_SECONDS };
  }

  placeBet(playerId: number, input: { betType: string; betValue: string | number }) {
    const player = this.database.sqlite.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
    if (!player) throw new NotFoundException('A játékos nem található. Lépj be újra a neveddel.');
    const round = this.latestRound();
    if (!round || round.status !== 'BETTING') throw new BadRequestException('A fogadási időszak lezárult.');
    if (Date.parse(round.bettingEndsAt) <= Date.now()) throw new BadRequestException('A fogadási időszak lezárult.');

    const betType = String(input?.betType ?? '').toUpperCase();
    const betValue = String(input?.betValue ?? '').toLowerCase();
    if (betType === 'NUMBER') {
      const number = Number(betValue);
      if (!Number.isInteger(number) || number < 0 || number > 36) throw new BadRequestException('0 és 36 közötti számot válassz.');
    } else if (betType === 'COLOR') {
      if (!['red', 'black'].includes(betValue)) throw new BadRequestException('Pirosat vagy feketét válassz.');
    } else {
      throw new BadRequestException('Érvénytelen tét.');
    }

    try {
      this.database.sqlite.prepare(
        'INSERT INTO casino_roulette_bets (round_id, player_id, bet_type, bet_value) VALUES (?, ?, ?, ?)',
      ).run(round.id, playerId, betType, betValue);
    } catch {
      throw new BadRequestException('Ebben a körben már leadtad a tippedet.');
    }
    return this.publishState();
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
    const endsAt = new Date(Date.now() + BETTING_SECONDS * 1000).toISOString();
    this.database.sqlite.prepare(
      "INSERT INTO casino_roulette_rounds (round_number, status, betting_ends_at) VALUES (?, 'BETTING', ?)",
    ).run(next.n, endsAt);
    this.publishState();
    this.schedule(BETTING_SECONDS * 1000, () => this.finishRound());
  }

  private finishRound() {
    const round = this.latestRound();
    if (!round || round.status !== 'BETTING') return;
    const result = randomInt(0, 37);
    this.database.sqlite.prepare(
      "UPDATE casino_roulette_rounds SET status = 'COMPLETED', result_number = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'BETTING'",
    ).run(result, round.id);
    this.publishState();
    this.schedule(RESULT_SECONDS * 1000, () => this.openNextRound());
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

  private isWinner(bet: any, result: number) {
    if (bet.betType === 'NUMBER') return Number(bet.betValue) === result;
    if (result === 0) return false;
    return bet.betValue === (RED_NUMBERS.has(result) ? 'red' : 'black');
  }
}
