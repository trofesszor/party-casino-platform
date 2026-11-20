import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { PlayersModule } from './players/players.module';
import { RouletteModule } from './roulette/roulette.module';
import { SlotsModule } from './slots/slots.module';
import { AdminModule } from './admin/admin.module';
import { LuckyWheelModule } from './lucky-wheel/lucky-wheel.module';

@Module({
  imports: [DatabaseModule, PlayersModule, RouletteModule, SlotsModule, AdminModule, LuckyWheelModule],
})
export class AppModule {}
