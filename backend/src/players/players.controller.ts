import { Body, Controller, Get, Post } from '@nestjs/common';
import { PlayersService } from './players.service';
@Controller('api/players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}
  @Post('join') join(@Body() body: { name: string }) { return this.players.join(body.name); }
  @Get() findAll() { return this.players.findAll(); }
}
