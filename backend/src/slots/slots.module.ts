import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

@Module({ imports: [EventsModule], controllers: [SlotsController], providers: [SlotsService] })
export class SlotsModule {}