import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { PlayerPresenceGateway } from './player-presence.gateway';
import { SnappinIntegrationController } from './snappin-integration.controller';
import { EventsModule } from '../events/events.module';
@Module({ imports: [EventsModule], controllers: [PlayersController, SnappinIntegrationController], providers: [PlayersService, PlayerPresenceGateway], exports: [PlayersService, PlayerPresenceGateway] })
export class PlayersModule {}