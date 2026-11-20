import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PlayersService } from './players.service';
import { PlayerPresenceGateway } from './player-presence.gateway';

@Controller('api/players')
export class PlayersController {
  constructor(private readonly players: PlayersService, private readonly presence: PlayerPresenceGateway) {}
  @Post('join') join(@Body() body: { name: string }) { return this.players.join(body.name); }
  @Get() findAll() { return this.presence.getOnlinePlayers(); }
  @Get('leaderboard') getLeaderboard() { return this.players.getLeaderboard(); }
  @Get(':id/side-quests') getSideQuests(@Param('id') id: string) { return this.players.getSideQuests(Number(id)); }
  @Post(':id/side-quests') assignSideQuest(@Param('id') id: string) { return this.players.assignSideQuest(Number(id)); }
  @Post(':id/side-quests/:questId/complete') completeSideQuest(@Param('id') id: string, @Param('questId') questId: string) { return this.players.completeSideQuest(Number(id), Number(questId)); }
  @Get(':id/balance') getBalance(@Param('id') id: string) { return this.players.getBalance(Number(id)); }
  @Get(':id/transactions') getTransactions(@Param('id') id: string) { return this.players.getTransactions(Number(id)); }
}
