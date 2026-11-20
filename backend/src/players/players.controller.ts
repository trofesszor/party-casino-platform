import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PlayersService } from './players.service';
import { PlayerPresenceGateway } from './player-presence.gateway';

@Controller('api/players')
export class PlayersController {
  constructor(private readonly players: PlayersService, private readonly presence: PlayerPresenceGateway) {}
  @Post('join') join(@Body() body: { name: string }) { return this.players.join(body.name); }
  @Get() findAll() { return this.presence.getOnlinePlayers(); }
  @Get('leaderboard') getLeaderboard() { return this.players.getLeaderboard(); }
  @Get(':id/duels') getDuels(@Param('id') id:string) { return this.players.getDuels(Number(id)); }
  @Post(':id/duels') createDuel(@Param('id') id:string, @Body() body:{opponentId:number}) { return this.players.createDuel(Number(id),Number(body.opponentId)); }
  @Post(':id/duels/:duelId/respond') respondToDuel(@Param('id') id:string,@Param('duelId') duelId:string,@Body() body:{accept:boolean}) { return this.players.respondToDuel(Number(duelId),Number(id),body.accept===true); }
  @Post(':id/duels/:duelId/type') chooseDuelType(@Param('id') id:string,@Param('duelId') duelId:string,@Body() body:{duelType:string}) { return this.players.chooseDuelType(Number(duelId),Number(id),body.duelType); }
  @Post(':id/duels/:duelId/result') submitDuelWinner(@Param('id') id:string,@Param('duelId') duelId:string,@Body() body:{winnerId:number}) { return this.players.submitDuelWinner(Number(duelId),Number(id),Number(body.winnerId)); }
  @Get(':id/side-quests') getSideQuests(@Param('id') id: string) { return this.players.getSideQuests(Number(id)); }
  @Post(':id/side-quests') assignSideQuest(@Param('id') id: string) { return this.players.assignSideQuest(Number(id)); }
  @Post(':id/side-quests/:questId/complete') completeSideQuest(@Param('id') id: string, @Param('questId') questId: string) { return this.players.completeSideQuest(Number(id), Number(questId)); }
  @Get(':id/balance') getBalance(@Param('id') id: string) { return this.players.getBalance(Number(id)); }
  @Get(':id/transactions') getTransactions(@Param('id') id: string) { return this.players.getTransactions(Number(id)); }
}
