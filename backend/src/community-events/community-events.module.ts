import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { CommunityEventsController } from './community-events.controller';
import { CommunityEventsService } from './community-events.service';

@Module({
  imports: [AdminModule],
  controllers: [CommunityEventsController],
  providers: [CommunityEventsService],
})
export class CommunityEventsModule {}
