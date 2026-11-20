import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RouletteController } from './roulette.controller';
import { RouletteService } from './roulette.service';

@Module({
  controllers: [RouletteController],
  imports: [EventsModule],
  providers: [RouletteService],
})
export class RouletteModule {}
