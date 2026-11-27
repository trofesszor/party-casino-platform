import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SlotsService } from './slots.service';

@Controller('api/slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  state(@Query('playerId') playerId?: string) {
    return this.slots.state(Number(playerId));
  }

  @Post('spin')
  spin(@Body() body: { playerId: number; betAmount?: number; denomination?: number; units?: number }) {
    return this.slots.spin(
      Number(body.playerId),
      Number(body.betAmount),
      body.denomination === undefined ? undefined : Number(body.denomination),
      body.units === undefined ? undefined : Number(body.units),
    );
  }
}
