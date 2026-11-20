import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { RouletteService } from './roulette.service';

@Controller('api/events/:eventId/roulette')
export class RouletteController {
  constructor(private readonly roulette: RouletteService) {}

  @Get()
  getState(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.roulette.getState(eventId);
  }

  @Post('bets')
  placeBet(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: { playerId: number; betType: string; betValue: string | number },
  ) {
    return this.roulette.placeBet(eventId, Number(body.playerId), body);
  }

  @Patch('spin')
  spin(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.roulette.spin(eventId);
  }

  @Post('rounds')
  startNextRound(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.roulette.startNextRound(eventId);
  }
}
