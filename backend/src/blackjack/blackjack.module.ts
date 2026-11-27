import { Module } from '@nestjs/common';
import { BlackjackGateway } from './blackjack.gateway';
import { BlackjackService } from './blackjack.service';

@Module({
  providers: [BlackjackService, BlackjackGateway],
  exports: [BlackjackService],
})
export class BlackjackModule {}
