import { Module } from '@nestjs/common';
import { EventsGateway } from '../events/events.gateway';
import { RouletteController } from './roulette.controller';
import { RouletteService } from './roulette.service';

@Module({
  controllers: [RouletteController],
  providers: [RouletteService, EventsGateway],
})
export class RouletteModule {}
