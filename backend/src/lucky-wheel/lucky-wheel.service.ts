import { BadRequestException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { DATABASE } from '../database/database.module';
import { EventsGateway } from '../events/events.gateway';

const SPIN_DURATION_MS = 7000;
const SPIN_COST = 5;

@Injectable()
export class LuckyWheelService implements OnModuleInit {
  private timer: NodeJS.Timeout | null = null;
  constructor(@Inject(DATABASE) private readonly database: any, private readonly events: EventsGateway) {}

  onModuleInit() {
    const state = this.readState();
    if (state.status === 'SPINNING' && state.endsAt) {
      const remaining = Math.max(0, state.endsAt - Date.now());
      this.timer = setTimeout(() => this.finishSpin(state.spinId), remaining);
    }
  }

  getState() {
    const state = this.readState();
    const segments = this.database.sqlite.prepare(
      'SELECT id, label, position, enabled FROM lucky_wheel_segments WHERE enabled = 1 ORDER BY position, id',
    ).all();
    return { ...state, segments, durationMs: SPIN_DURATION_MS, spinCost: SPIN_COST };
  }

  getAllSegments() {
    return this.database.sqlite.prepare('SELECT id, label, position, enabled FROM lucky_wheel_segments ORDER BY position, id').all();
  }

  spin(playerId: number) {
    if (!Number.isInteger(playerId) || playerId <= 0) throw new BadRequestException('Előbb lépj be a játékosneveddel.');
    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    let spinId = '';
    let winningSegment: any;
    const startedAt = Date.now();
    const endsAt = startedAt + SPIN_DURATION_MS;
    try {
      const state = sqlite.prepare("SELECT status FROM lucky_wheel_state WHERE id = 1").get() as { status: string };
      if (state.status === 'SPINNING') throw new BadRequestException('A szerencsekerék már forog. Várd meg az eredményt!');
      const player = sqlite.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
      if (!player) throw new BadRequestException('A játékos nem található. Lépj be újra.');
      const segments = sqlite.prepare('SELECT id, label, position FROM lucky_wheel_segments WHERE enabled = 1 ORDER BY position, id').all() as any[];
      if (segments.length < 2) throw new BadRequestException('Legalább két aktív mező szükséges a kerékhez.');
      winningSegment = segments[randomInt(segments.length)];
      const debit = sqlite.prepare('UPDATE players SET token_balance = token_balance - ? WHERE id = ? AND token_balance >= ?').run(SPIN_COST, playerId, SPIN_COST);
      if (Number(debit.changes) !== 1) throw new BadRequestException(`A kerék megpörgetéséhez ${SPIN_COST} CR szükséges.`);
      const balance = sqlite.prepare('SELECT token_balance AS tokenBalance FROM players WHERE id = ?').get(playerId) as { tokenBalance: number };
      sqlite.prepare("INSERT INTO token_transactions (player_id, amount, balance_after, type, description) VALUES (?, ?, ?, 'LUCKY_WHEEL_SPIN', ?)").run(playerId, -SPIN_COST, balance.tokenBalance, 'Szerencsekerék: ' + winningSegment.label);
      spinId = randomUUID();
      sqlite.prepare("UPDATE lucky_wheel_state SET status = 'SPINNING', spin_id = ?, winning_segment_id = ?, started_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1")
        .run(spinId, winningSegment.id, startedAt, endsAt);
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }

    const started = this.getState();
    this.events.publish('lucky-wheel:changed', started);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finishSpin(spinId), SPIN_DURATION_MS);
    const balance = sqlite.prepare('SELECT token_balance AS tokenBalance FROM players WHERE id = ?').get(playerId) as { tokenBalance: number };
    return { ...started, tokenBalance: balance.tokenBalance };
  }

  saveSegments(input: Array<{ id?: number; label: string; enabled?: boolean }>) {
    if (!Array.isArray(input) || input.length < 2 || input.length > 24) {
      throw new BadRequestException('A kerékhez 2–24 mező szükséges.');
    }
    const normalized = input.map((item, index) => {
      const label = String(item?.label ?? '').trim();
      if (!label || label.length > 48) throw new BadRequestException('Minden felirat 1–48 karakter legyen.');
      return { id: Number(item.id) || 0, label, enabled: item.enabled !== false, position: index };
    });
    if (normalized.filter(item => item.enabled).length < 2) {
      throw new BadRequestException('Legalább két aktív mező szükséges.');
    }
    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const state = sqlite.prepare("SELECT status FROM lucky_wheel_state WHERE id = 1").get() as { status: string };
      if (state.status === 'SPINNING') throw new BadRequestException('Pörgetés közben a kerék nem szerkeszthető.');
      sqlite.prepare('DELETE FROM lucky_wheel_segments').run();
      const insert = sqlite.prepare('INSERT INTO lucky_wheel_segments (label, position, enabled) VALUES (?, ?, ?)');
      normalized.forEach(item => insert.run(item.label, item.position, item.enabled ? 1 : 0));
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
    const next = this.getState();
    this.events.publish('lucky-wheel:changed', next);
    return this.getAllSegments();
  }

  private readState() {
    const row = this.database.sqlite.prepare(`
      SELECT status, spin_id AS spinId, winning_segment_id AS winningSegmentId,
        started_at AS startedAt, ends_at AS endsAt
      FROM lucky_wheel_state WHERE id = 1
    `).get() as any;
    const winner = row?.winningSegmentId
      ? this.database.sqlite.prepare('SELECT id, label, position FROM lucky_wheel_segments WHERE id = ?').get(row.winningSegmentId)
      : null;
    return { status: row?.status ?? 'IDLE', spinId: row?.spinId ?? null, winningSegmentId: row?.winningSegmentId ?? null,
      startedAt: row?.startedAt ?? null, endsAt: row?.endsAt ?? null, winner: winner ?? null };
  }

  private finishSpin(spinId: string | null) {
    if (!spinId) return;
    const result = this.database.sqlite.prepare(
      "UPDATE lucky_wheel_state SET status = 'RESULT', updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND status = 'SPINNING' AND spin_id = ?",
    ).run(spinId);
    if (Number(result.changes) > 0) this.events.publish('lucky-wheel:changed', this.getState());
    this.timer = null;
  }
}
