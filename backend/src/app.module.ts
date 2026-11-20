import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { PlayersModule } from './players/players.module';
import { RouletteModule } from './roulette/roulette.module';
@Module({ imports: [DatabaseModule, PlayersModule, EventsModule, RouletteModule] })
export class AppModule {}
