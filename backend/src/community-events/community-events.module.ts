import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { PlayersModule } from '../players/players.module';
import { CommunityEventsController } from './community-events.controller';
import { CommunityEventsService } from './community-events.service';

@Module({
  imports: [AdminModule, PlayersModule],
  controllers: [CommunityEventsController],
  providers: [CommunityEventsService],
})
export class CommunityEventsModule {}
