import { Body, Controller, Get, Post } from '@nestjs/common';
import { PlayersService } from './players.service';
import { PlayerPresenceGateway } from './player-presence.gateway';

@Controller('api/players')
export class PlayersController {
  constructor(private readonly players: PlayersService, private readonly presence: PlayerPresenceGateway) {}
  @Post('join') join(@Body() body: { name: string }) { return this.players.join(body.name); }
  @Get() findAll() { return this.presence.getOnlinePlayers(); }
}
