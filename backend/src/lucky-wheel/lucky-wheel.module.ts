import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { AdminModule } from '../admin/admin.module';
import { LuckyWheelController } from './lucky-wheel.controller';
import { LuckyWheelService } from './lucky-wheel.service';

@Module({
  imports: [EventsModule, AdminModule],
  controllers: [LuckyWheelController],
  providers: [LuckyWheelService],
})
export class LuckyWheelModule {}
