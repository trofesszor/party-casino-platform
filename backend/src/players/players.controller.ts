import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PlayersService } from './players.service';
import { PlayerPresenceGateway } from './player-presence.gateway';

@Controller('api/players')
export class PlayersController {
  constructor(private readonly players: PlayersService, private readonly presence: PlayerPresenceGateway) {}
  @Post('join') join(@Body() body: { name: string }) { return this.players.join(body.name); }
  @Get() findAll() { return this.presence.getOnlinePlayers(); }
  @Get('economy') getEconomy() { return this.players.getEconomy(); }
  @Get('leaderboard') getLeaderboard() { return this.players.getLeaderboard(); }
  @Get(':id/duels') getDuels(@Param('id') id:string) { return this.players.getDuels(Number(id)); }
  @Post(':id/duels') createDuel(@Param('id') id:string, @Body() body:{opponentId:number}) { return this.players.createDuel(Number(id),Number(body.opponentId)); }
  @Post(':id/duels/:duelId/respond') respondToDuel(@Param('id') id:string,@Param('duelId') duelId:string,@Body() body:{accept:boolean}) { return this.players.respondToDuel(Number(duelId),Number(id),body.accept===true); }
  @Post(':id/duels/:duelId/type') chooseDuelType(@Param('id') id:string,@Param('duelId') duelId:string,@Body() body:{duelType:string}) { return this.players.chooseDuelType(Number(duelId),Number(id),body.duelType); }
  @Post(':id/duels/:duelId/result') submitDuelWinner(@Param('id') id:string,@Param('duelId') duelId:string,@Body() body:{winnerId:number}) { return this.players.submitDuelWinner(Number(duelId),Number(id),Number(body.winnerId)); }
  @Post('side-quest-verifications/lookup') getSideQuestVerification(@Body() body:{pin:string;verifierId:number}) { return this.players.getSideQuestVerification(body.pin,Number(body.verifierId)); }
  @Post('side-quest-verifications/verify') verifySideQuest(@Body() body:{pin:string;verifierId:number;approve:boolean}) { return this.players.verifySideQuest(body.pin,Number(body.verifierId),body.approve); }
  @Get(':id/token-photo/status') getTokenPhotoStatus(@Param('id') id:string) { return this.players.getTokenPhotoStatus(Number(id)); }
  @Post(':id/token-photo/session') createTokenPhotoSession(@Param('id') id:string) { return this.players.createTokenPhotoSession(Number(id)); }
  @Get(':id/token-photo/session/:sessionId/status') checkTokenPhotoSession(@Param('id') id:string,@Param('sessionId') sessionId:string) { return this.players.checkTokenPhotoSession(Number(id),sessionId); }
  @Post(':id/side-quests/:questId/photo-session') createSideQuestPhotoSession(@Param('id') id:string,@Param('questId') questId:string) { return this.players.createSideQuestPhotoSession(Number(id),Number(questId)); }
  @Get(':id/side-quests/:questId/photo-session/:sessionId/status') checkSideQuestPhotoSession(@Param('id') id:string,@Param('questId') questId:string,@Param('sessionId') sessionId:string) { return this.players.checkSideQuestPhotoSession(Number(id),Number(questId),sessionId); }
  @Get(':id/side-quests') getSideQuests(@Param('id') id: string) { return this.players.getSideQuests(Number(id)); }
  @Post(':id/side-quests') assignSideQuest(@Param('id') id: string) { return this.players.assignSideQuest(Number(id)); }
  @Get(':id/side-quests/:questId/verification-status') getSideQuestVerificationStatus(@Param('id') id:string,@Param('questId') questId:string) { return this.players.getSideQuestVerificationStatus(Number(id),Number(questId)); }
  @Post(':id/side-quests/:questId/verification') requestSideQuestVerification(@Param('id') id:string,@Param('questId') questId:string) { return this.players.requestSideQuestVerification(Number(id),Number(questId)); }
  @Get(':id/shop') getShop(@Param('id') id: string) { return this.players.getShop(Number(id)); }
  @Get(':id/shop/redemptions') getShopRedemptions(@Param('id') id: string) { return this.players.getShopRedemptions(Number(id)); }
  @Post(':id/shop/redeem') redeemShopCoupon(@Param('id') id: string, @Body() body: { itemKey: string }) { return this.players.redeemShopCoupon(Number(id), body.itemKey); }
  @Get(':id/scratch-tickets') getScratchTickets(@Param('id') id:string) { return this.players.getScratchTickets(Number(id)); }
  @Post(':id/scratch-tickets/:ticketId/reveal') revealScratchTicket(@Param('id') id:string,@Param('ticketId') ticketId:string) { return this.players.revealScratchTicket(Number(id),Number(ticketId)); }
  @Post(':id/shop/buy') buyShopItem(@Param('id') id: string, @Body() body:{itemKey:string}) { return this.players.buyShopItem(Number(id),body.itemKey); }
  @Post(':id/shop/use') useShopItem(@Param('id') id: string, @Body() body:{itemKey:string;questId:number}) { return this.players.useShopItem(Number(id),body.itemKey,Number(body.questId)); }
  @Get(':id/balance') getBalance(@Param('id') id: string) { return this.players.getBalance(Number(id)); }
  @Get(':id/transactions') getTransactions(@Param('id') id: string) { return this.players.getTransactions(Number(id)); }
}
