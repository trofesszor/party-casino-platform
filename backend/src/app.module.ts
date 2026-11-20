import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { PlayersModule } from './players/players.module';
@Module({ imports: [DatabaseModule, PlayersModule, EventsModule] })
export class AppModule {}
