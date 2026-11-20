import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { PlayersModule } from './players/players.module';
import { RouletteModule } from './roulette/roulette.module';
import { SlotsModule } from './slots/slots.module';

@Module({
  imports: [DatabaseModule, PlayersModule, RouletteModule, SlotsModule],
})
export class AppModule {}
