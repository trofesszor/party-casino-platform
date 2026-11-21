import { Module } from '@nestjs/common';
import { PlayersModule } from '../players/players.module';
import { EventsModule } from '../events/events.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PlayersModule, EventsModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
