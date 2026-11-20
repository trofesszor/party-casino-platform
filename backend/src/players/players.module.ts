import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { PlayerPresenceGateway } from './player-presence.gateway';
@Module({ controllers: [PlayersController], providers: [PlayersService, PlayerPresenceGateway], exports: [PlayersService] })
export class PlayersModule {}
