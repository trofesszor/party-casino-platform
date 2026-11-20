import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { PlayersService } from './players.service';

@Controller('api/integrations/snappin')
export class SnappinIntegrationController {
  constructor(private readonly players: PlayersService) {}

  @Post('webhook')
  handleWebhook(
    @Body() body: any,
    @Headers('x-snappin-timestamp') timestamp: string | undefined,
    @Headers('x-snappin-signature') signature: string | undefined,
    @Req() request: any,
  ) {
    return this.players.handleSnappinWebhook(body, timestamp, signature, request.rawBody);
  }
}
