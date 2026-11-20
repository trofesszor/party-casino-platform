import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DATABASE } from '../database/database.module';
import { EventsGateway } from '../events/events.gateway';

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

@Injectable()
export class RouletteService {
  constructor(@Inject(DATABASE) private readonly database: any, private readonly gateway: EventsGateway) {}

  getState(eventId: number) {
    const event = this.database.sqlite.prepare(
      'SELECT id, title, status, event_type AS eventType FROM events WHERE id = ?',
    ).get(eventId) as any;
    if (!event) throw new NotFoundException('Az esemény nem található.');
    if (event.eventType !== 'ROULETTE') throw new BadRequestException('Ez az esemény nem rulett játék.');

    const rounds = this.database.sqlite.prepare(`
      SELECT id, round_number AS roundNumber, status, result_number AS resultNumber,
        created_at AS createdAt, completed_at AS completedAt
      FROM roulette_rounds WHERE event_id = ? ORDER BY round_number DESC
    `).all(eventId) as any[];

    const currentRound = rounds[0] ?? null;
    if (!currentRound) return { event, currentRound: null, bets: [], winners: [], history: [] };

    const bets = this.database.sqlite.prepare(`
      SELECT b.player_id AS playerId, p.name AS playerName,
        b.bet_type AS betType, b.bet_value AS betValue
      FROM roulette_bets b
      JOIN players p ON p.id = b.player_id
      WHERE b.round_id = ? ORDER BY b.created_at, p.name
    `).all(currentRound.id) as any[];

    const winners = currentRound.status === 'COMPLETED'
      ? bets.filter((bet: any) => this.isWinner(bet, currentRound.resultNumber))
      : [];

    return { event, currentRound, bets, winners, history: rounds.slice(1) };
  }

  placeBet(eventId: number, playerId: number, input: { betType: string; betValue: string | number }) {
    const state = this.getState(eventId);
    if (state.event.status !== 'RUNNING') throw new BadRequestException('A rulett esemény még nem fut.');
    if (!state.currentRound || state.currentRound.status !== 'OPEN') throw new BadRequestException('Jelenleg nincs nyitott kör.');
    const joined = this.database.sqlite.prepare(
      'SELECT 1 FROM event_participants WHERE event_id = ? AND player_id = ?',
    ).get(eventId, playerId);
    if (!joined) throw new BadRequestException('Előbb csatlakozz az eseményhez.');

    const betType = String(input?.betType ?? '').toUpperCase();
    const betValue = String(input?.betValue ?? '').toLowerCase();
    if (betType === 'NUMBER') {
      const number = Number(betValue);
      if (!Number.isInteger(number) || number < 0 || number > 36) {
        throw new BadRequestException('0 és 36 közötti számot válassz.');
      }
    } else if (betType === 'COLOR') {
      if (!['red', 'black'].includes(betValue)) throw new BadRequestException('Pirosat vagy feketét válassz.');
    } else {
      throw new BadRequestException('Érvénytelen tét.');
    }

    try {
      this.database.sqlite.prepare(
        'INSERT INTO roulette_bets (round_id, player_id, bet_type, bet_value) VALUES (?, ?, ?, ?)',
      ).run(state.currentRound.id, playerId, betType, betValue);
    } catch {
      throw new BadRequestException('Ebben a körben már leadtad a tippedet.');
    }

    const updated = this.getState(eventId);
    this.gateway.publish('roulette:changed', updated);
    return updated;
  }

  spin(eventId: number) {
    const state = this.getState(eventId);
    if (state.event.status !== 'RUNNING') throw new BadRequestException('Csak futó eseményt lehet pörgetni.');
    if (!state.currentRound || state.currentRound.status !== 'OPEN') throw new BadRequestException('Nincs pörgethető kör.');

    const result = randomInt(0, 37);
    const update = this.database.sqlite.prepare(
      "UPDATE roulette_rounds SET status = 'COMPLETED', result_number = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'",
    ).run(result, state.currentRound.id);
    if (Number(update.changes) !== 1) throw new BadRequestException('A kör állapota időközben megváltozott.');

    const updated = this.getState(eventId);
    this.gateway.publish('roulette:changed', updated);
    return updated;
  }

  startNextRound(eventId: number) {
    const state = this.getState(eventId);
    if (state.event.status !== 'RUNNING') throw new BadRequestException('Csak futó eseményben indítható új kör.');
    if (state.currentRound?.status === 'OPEN') throw new BadRequestException('Az aktuális kör még nyitva van.');

    const roundNumber = this.database.sqlite.prepare(
      'SELECT COALESCE(MAX(round_number), 0) + 1 AS roundNumber FROM roulette_rounds WHERE event_id = ?',
    ).get(eventId) as { roundNumber: number };
    this.database.sqlite.prepare(
      "INSERT INTO roulette_rounds (event_id, round_number) VALUES (?, ?)",
    ).run(eventId, roundNumber.roundNumber);

    const updated = this.getState(eventId);
    this.gateway.publish('roulette:changed', updated);
    return updated;
  }

  private isWinner(bet: any, result: number) {
    if (bet.betType === 'NUMBER') return Number(bet.betValue) === result;
    if (result === 0) return false;
    return bet.betValue === (RED_NUMBERS.has(result) ? 'red' : 'black');
  }
}
