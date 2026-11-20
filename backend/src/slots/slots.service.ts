import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DATABASE } from '../database/database.module';

const SYMBOLS = ['🍒', '🍋', '🍉', '⭐', '7️⃣'];

@Injectable()
export class SlotsService {
  constructor(@Inject(DATABASE) private readonly database: any) {}

  spin(playerId: number) {
    const player = this.database.sqlite.prepare('SELECT id, name FROM players WHERE id = ?').get(playerId);
    if (!player) throw new NotFoundException('A játékos nem található. Lépj be újra.');
    const reels = Array.from({ length: 3 }, () => SYMBOLS[randomInt(0, SYMBOLS.length)]);
    return { playerId, playerName: player.name, reels, isWin: reels.every((symbol) => symbol === reels[0]) };
  }
}
