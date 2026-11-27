import { Body, Controller, Get, Post } from '@nestjs/common';
import { RouletteService } from './roulette.service';

@Controller('api/roulette')
export class RouletteController {
  constructor(private readonly roulette: RouletteService) {}

  @Get()
  getState() {
    return this.roulette.getState();
  }

  @Post('bets')
  placeBet(@Body() body: { playerId: number; betType: string; betValue: string | number; amount?: number; roundId?: number }) {
    return this.roulette.placeBet(Number(body.playerId), body);
  }
}
