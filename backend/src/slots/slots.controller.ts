import { Body, Controller, Post } from '@nestjs/common';
import { SlotsService } from './slots.service';

@Controller('api/slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Post('spin')
  spin(@Body() body: { playerId: number; betAmount: number }) {
    return this.slots.spin(Number(body.playerId), Number(body.betAmount));
  }
}
