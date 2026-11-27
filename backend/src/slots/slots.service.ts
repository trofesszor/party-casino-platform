import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import { DATABASE } from '../database/database.module';
import { EventsGateway } from '../events/events.gateway';
import { amount, betUnits, denominations, jackpotStarts, respin, scoreGrid, slotRules, spinGrid } from './slots-game';
import type { Bonus, JackpotWin, Stake, Tile } from './slots-game';

const legacyReels: Record<Tile['symbol'], string> = {
  cherry: '🍒', lemon: '🍋', lime: '🍉', grapes: '🍇', orange: '🔔', crescent: '7️⃣',
  wild: '⭐', scatter: '💎', coin: '🪙', empty: '·',
};
type Progressives = typeof jackpotStarts;
type Player = { id: number; name: string; tokenBalance: number };
type PlayerSlot = { freeSpins: number; freeStake: string | null; bonusState: string | null };

@Injectable()
export class SlotsService {
  constructor(@Inject(DATABASE) private readonly database: { sqlite: DatabaseSync }, private readonly gateway: EventsGateway) {}

  state(playerId?: number) {
    const player = playerId ? this.player(playerId) : null;
    const slot = player ? this.playerSlot(player.id) : null;
    return {
      ...slotRules,
      jackpots: this.jackpots(),
      tokenBalance: player?.tokenBalance ?? null,
      freeSpins: slot?.freeSpins ?? 0,
      freeStake: this.decode<Stake>(slot?.freeStake),
      bonus: this.decode<Bonus>(slot?.bonusState),
    };
  }

  spin(playerId: number, legacyAmount: number, denomination?: number, units?: number) {
    const requestedStake = this.stake(legacyAmount, denomination, units);
    const sqlite = this.database.sqlite;
    sqlite.exec('BEGIN IMMEDIATE');
    const result = (() => {
      try {
        const player = this.player(playerId);
        if (!player) throw new NotFoundException('A játékos nem található. Lépj be újra.');
        const spin = this.play(player, requestedStake);
        sqlite.exec('COMMIT');
        return spin;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    })();

    this.gateway.publish('slots:jackpots', result.jackpots);
    if (result.jackpotWins.length || result.payoutAmount >= Math.max(50, result.betAmount * 8)) {
      this.gateway.publish('party:notification', {
        type: 'slots',
        title: 'SLOT · NAGY NYEREMÉNY',
        message: `${result.playerName} nyert a Midnight Mint gépen: +${result.payoutAmount} CR!`,
      });
    }
    return result;
  }

  private play(player: Player, requestedStake: Stake) {
    const sqlite = this.database.sqlite;
    const existing = this.playerSlot(player.id);
    let bonus = this.decode<Bonus>(existing?.bonusState);
    let freeSpins = existing?.freeSpins ?? 0;
    let freeStake = this.decode<Stake>(existing?.freeStake);
    const usedFreeSpin = !bonus && freeSpins > 0;
    const stake = bonus?.stake ?? (usedFreeSpin ? freeStake ?? requestedStake : requestedStake);
    const betAmount = amount(stake);
    const jackpots = this.jackpots();
    const jackpotWins: JackpotWin[] = [];
    let payoutAmount = 0;
    let freeSpinsAwarded = 0;
    let paidAmount = 0;
    let grid: Tile[];
    let winLabel = 'Nincs nyeremény';
    let wins: ReturnType<typeof scoreGrid> = [];
    let finishedBonus: Bonus | null = null;

    if (bonus) {
      bonus = respin(bonus);
      grid = bonus.coins.map(coin => coin ? { symbol: 'coin', coin } : { symbol: 'empty' } as const);
      const locked = bonus.coins.flatMap(coin => coin ? [coin] : []);
      if (bonus.remaining === 0 || locked.length === 15) {
        for (const coin of locked) {
          if (coin.tier) jackpotWins.push({ tier: coin.tier, amount: coin.value });
          payoutAmount += coin.value;
        }
        const progressive = locked.length === 15 ? 'grand' : locked.length >= 12 ? 'major' : null;
        if (progressive) {
          jackpotWins.push({ tier: progressive, amount: jackpots[progressive] });
          payoutAmount += jackpots[progressive];
          jackpots[progressive] = jackpotStarts[progressive];
        }
        finishedBonus = bonus;
        bonus = null;
        winLabel = 'Érmegyűjtés lezárva';
      } else {
        winLabel = 'Érmegyűjtés folyamatban';
      }
    } else {
      if (usedFreeSpin) {
        freeSpins--;
        freeStake = freeSpins > 0 ? stake : null;
      } else {
        if (player.tokenBalance < betAmount) throw new BadRequestException('Nincs elegendő CR a pörgetéshez.');
        paidAmount = betAmount;
        this.record(player.id, -paidAmount, 'SLOT_BET', 'Midnight Mint tét');
        jackpots.grand += Math.max(1, Math.floor(paidAmount / 10));
        jackpots.major += Math.max(1, Math.floor(paidAmount / 5));
      }
      grid = spinGrid(stake);
      wins = scoreGrid(grid, stake);
      payoutAmount = wins.reduce((sum, win) => sum + win.amount, 0);
      const coins = grid.map(tile => tile.coin ?? null);
      freeSpinsAwarded = grid.filter(tile => tile.symbol === 'scatter').length >= 3 ? 5 : 0;
      if (freeSpinsAwarded) {
        freeSpins += freeSpinsAwarded;
        freeStake = stake;
      }
      if (coins.filter(Boolean).length >= 6) {
        bonus = { coins, remaining: 3, stake };
        winLabel = 'Érmegyűjtés indul';
      } else if (freeSpinsAwarded) {
        winLabel = `+${freeSpinsAwarded} ingyenpörgetés`;
      } else if (payoutAmount > 0) {
        winLabel = `${wins.length} nyerő sor`;
      }
    }

    if (payoutAmount) this.record(player.id, payoutAmount, 'SLOT_WIN', winLabel);
    sqlite.prepare('UPDATE slot_jackpots SET grand = ?, major = ? WHERE id = 1').run(jackpots.grand, jackpots.major);
    sqlite.prepare(`INSERT INTO slot_player_state (player_id, free_spins, free_stake, bonus_state) VALUES (?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET free_spins = excluded.free_spins, free_stake = excluded.free_stake, bonus_state = excluded.bonus_state`)
      .run(player.id, freeSpins, freeStake ? JSON.stringify(freeStake) : null, bonus ? JSON.stringify(bonus) : null);

    return {
      playerId: player.id, playerName: player.name, grid, reels: grid.slice(5, 8).map(tile => legacyReels[tile.symbol]),
      isWin: payoutAmount > 0, multiplier: payoutAmount / betAmount, betAmount, paidAmount,
      payoutAmount, tokenBalance: player.tokenBalance - paidAmount + payoutAmount, winLabel,
      freeSpinsAwarded, freeSpins, freeStake, usedFreeSpin, stake, jackpots, jackpotWins, bonus, finishedBonus, wins,
      paytable: slotRules.paytable,
    };
  }

  private stake(legacyAmount: number, denomination?: number, units?: number): Stake {
    if (denomination === undefined && units === undefined) {
      if ([1, 5, 10, 25].includes(legacyAmount)) return { denomination: legacyAmount, units: 1 };
      if (legacyAmount === 50) return { denomination: 25, units: 2 };
    } else if (denomination !== undefined && units !== undefined) {
      const supported = denominations.includes(denomination) && betUnits.includes(units);
      const legacy = denomination === 25 && [1, 2, 3, 5].includes(units);
      if (supported || legacy) return { denomination, units };
    }
    throw new BadRequestException('Érvénytelen tétegység vagy tét.');
  }

  private record(playerId: number, delta: number, type: 'SLOT_BET' | 'SLOT_WIN', description: string) {
    const sqlite = this.database.sqlite;
    sqlite.prepare('UPDATE players SET token_balance = token_balance + ? WHERE id = ?').run(delta, playerId);
    const balance = this.player(playerId)!.tokenBalance;
    sqlite.prepare('INSERT INTO token_transactions (player_id, amount, balance_after, type, description) VALUES (?, ?, ?, ?, ?)')
      .run(playerId, delta, balance, type, description);
  }

  private jackpots() {
    return this.database.sqlite.prepare('SELECT grand, major FROM slot_jackpots WHERE id = 1').get() as Progressives;
  }

  private player(id: number) {
    return this.database.sqlite.prepare('SELECT id, name, token_balance AS tokenBalance FROM players WHERE id = ?').get(id) as Player | undefined;
  }

  private playerSlot(id: number) {
    return this.database.sqlite.prepare('SELECT free_spins AS freeSpins, free_stake AS freeStake, bonus_state AS bonusState FROM slot_player_state WHERE player_id = ?')
      .get(id) as PlayerSlot | undefined;
  }

  private decode<T>(value?: string | null) {
    return value ? JSON.parse(value) as T : null;
  }
}
