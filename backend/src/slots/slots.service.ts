import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DATABASE } from '../database/database.module';

const SYMBOLS = [
  { symbol: '🍒', weight: 30, payout: 2, name: 'Cherry' },
  { symbol: '🍋', weight: 25, payout: 3, name: 'Lemon' },
  { symbol: '🍇', weight: 20, payout: 4, name: 'Grapes' },
  { symbol: '🍉', weight: 15, payout: 5, name: 'Watermelon' },
  { symbol: '🔔', weight: 10, payout: 8, name: 'Bell' },
  { symbol: '💎', weight: 7, payout: 15, name: 'Diamond' },
  { symbol: '7️⃣', weight: 4, payout: 30, name: 'Lucky seven' },
  { symbol: '⭐', weight: 5, payout: 0, name: 'Wild' },
  { symbol: '🪙', weight: 4, payout: 0, name: 'Bonus' },
] as const;

const WILD = '⭐';
const BONUS = '🪙';
const PAYTABLE = [
  { combination: 'Three 7️⃣', multiplier: 30 },
  { combination: 'Three 💎', multiplier: 15 },
  { combination: 'Three 🔔', multiplier: 8 },
  { combination: 'Three 🍉', multiplier: 5 },
  { combination: 'Three 🍇', multiplier: 4 },
  { combination: 'Three 🍋', multiplier: 3 },
  { combination: 'Three 🍒', multiplier: 2 },
  { combination: 'Two matching symbols', multiplier: 1 },
  { combination: 'Three ⭐ (Wild)', multiplier: 50 },
  { combination: 'Three 🪙 (Bonus)', multiplier: 5, bonusSpins: 5 },
];

@Injectable()
export class SlotsService {
  constructor(@Inject(DATABASE) private readonly database: any) {}

  spin(playerId: number, betAmount: number) {
    const allowedBets = [1, 5, 10, 25, 50];
    if (!allowedBets.includes(betAmount)) {
      throw new NotFoundException('Érvénytelen tét. Válassz az elérhető tétek közül.');
    }
    const player = this.database.sqlite.prepare('SELECT id, name FROM players WHERE id = ?').get(playerId) as { id: number; name: string } | undefined;
    if (!player) throw new NotFoundException('A játékos nem található. Lépj be újra.');

    const state = this.database.sqlite.prepare('SELECT free_spins AS freeSpins FROM slot_player_state WHERE player_id = ?').get(playerId) as { freeSpins: number } | undefined;
    const freeSpinsBefore = state?.freeSpins ?? 0;
    const usedFreeSpin = freeSpinsBefore > 0;
    if (usedFreeSpin) {
      this.database.sqlite.prepare('UPDATE slot_player_state SET free_spins = free_spins - 1 WHERE player_id = ?').run(playerId);
    } else {
      this.database.sqlite.prepare('INSERT INTO slot_player_state (player_id, free_spins) VALUES (?, 0) ON CONFLICT(player_id) DO NOTHING').run(playerId);
    }

    const reels = Array.from({ length: 3 }, () => this.drawSymbol());
    const evaluation = this.evaluate(reels);
    const freeSpinsAwarded = reels.every(symbol => symbol === BONUS) ? 5 : 0;
    if (freeSpinsAwarded) {
      this.database.sqlite.prepare('UPDATE slot_player_state SET free_spins = free_spins + ? WHERE player_id = ?').run(freeSpinsAwarded, playerId);
    }
    const remaining = this.database.sqlite.prepare('SELECT free_spins AS freeSpins FROM slot_player_state WHERE player_id = ?').get(playerId) as { freeSpins: number };

    return {
      playerId,
      playerName: player.name,
      reels,
      isWin: evaluation.multiplier > 0,
      multiplier: evaluation.multiplier,
      betAmount,
      payoutAmount: evaluation.multiplier * betAmount,
      winLabel: evaluation.label,
      freeSpinsAwarded,
      freeSpins: remaining.freeSpins,
      usedFreeSpin,
      paytable: PAYTABLE,
    };
  }

  private drawSymbol(): string {
    const totalWeight = SYMBOLS.reduce((sum, item) => sum + item.weight, 0);
    let roll = randomInt(totalWeight);
    for (const item of SYMBOLS) {
      roll -= item.weight;
      if (roll < 0) return item.symbol;
    }
    return SYMBOLS[0].symbol;
  }

  private evaluate(reels: string[]) {
    if (reels.every(symbol => symbol === BONUS)) return { multiplier: 5, label: 'BONUS ROUND — 5 FREE SPINS' };
    if (reels.every(symbol => symbol === WILD)) return { multiplier: 50, label: 'TRIPLE WILD — MEGA WIN!' };

    const regular = SYMBOLS.filter(item => item.payout > 0).map(item => item.symbol);
    const counts = new Map<string, number>();
    for (const symbol of reels) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);

    for (const symbol of regular) {
      const count = counts.get(symbol) ?? 0;
      const wildCount = counts.get(WILD) ?? 0;
      if (count + wildCount === 3 && count > 0) {
        const item = SYMBOLS.find(entry => entry.symbol === symbol)!;
        return { multiplier: item.payout, label: `THREE OF A KIND — ${item.name.toUpperCase()}` };
      }
    }

    // Two matching regular symbols or one regular symbol plus one Wild.
    for (const symbol of regular) {
      const count = counts.get(symbol) ?? 0;
      if (count >= 2 || (count === 1 && (counts.get(WILD) ?? 0) >= 1)) {
        return { multiplier: Math.max(1, Math.floor(SYMBOLS.find(entry => entry.symbol === symbol)!.payout / 2)), label: `PAIR — ${SYMBOLS.find(entry => entry.symbol === symbol)!.name.toUpperCase()}` };
      }
    }
    return { multiplier: 0, label: 'NO WIN — TRY AGAIN' };
  }
}
