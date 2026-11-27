import { BlackjackModule } from './blackjack/blackjack.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { PlayersModule } from './players/players.module';
import { RouletteModule } from './roulette/roulette.module';
import { SlotsModule } from './slots/slots.module';
import { AdminModule } from './admin/admin.module';
import { LuckyWheelModule } from './lucky-wheel/lucky-wheel.module';
import { CommunityEventsModule } from './community-events/community-events.module';

@Module({
  imports: [DatabaseModule, BlackjackModule, PlayersModule, RouletteModule, SlotsModule, AdminModule, LuckyWheelModule, CommunityEventsModule],
})
export class AppModule {}
