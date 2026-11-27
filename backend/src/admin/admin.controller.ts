import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { BlackjackService } from '../blackjack/blackjack.service';
import { PlayersService } from '../players/players.service';
import { PlayerPresenceGateway } from '../players/player-presence.gateway';
import { AdminService } from './admin.service';
import { EventsGateway } from '../events/events.gateway';

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly players: PlayersService,
    private readonly presence: PlayerPresenceGateway,
    private readonly events: EventsGateway,
    private readonly blackjack: BlackjackService,
  ) {}

  private token(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Admin bejelentkezés szükséges.');
    return authorization.slice(7);
  }

  @Post('login')
  login(@Body() body: { password: string }) {
    return this.admin.login(body.password);
  }

  @Post('logout')
  logout(@Headers('authorization') authorization?: string) {
    return this.admin.logout(this.token(authorization));
  }

  @Get('notification-settings') getNotificationSettings(@Headers('authorization') authorization?:string) { this.admin.assertToken(this.token(authorization)); return this.events.getNotificationSettings(); }
  @Post('notification-settings') setNotificationSettings(@Body() body:Record<string,boolean>,@Headers('authorization') authorization?:string) { this.admin.assertToken(this.token(authorization)); return this.events.setNotificationSettings(body); }

  @Get('players')
  getPlayers(@Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    const onlineIds = new Set(this.presence.getOnlinePlayers().map(player => player.id));
    return this.players.findAll().map((player: any) => ({
      ...player,
      online: onlineIds.has(player.id),
    }));
  }
  @Get('game-settings')
  getCasinoGameSettings(@Headers('authorization') authorization?:string){this.admin.assertToken(this.token(authorization));return this.players.getCasinoGameSettings();}

  @Post('game-settings')
  setCasinoGameSettings(@Body() body:any,@Headers('authorization') authorization?:string){this.admin.assertToken(this.token(authorization));return this.players.setCasinoGameSettings(body);}

  @Get('default-player-tokens')
  getDefaultPlayerTokens(@Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    return this.players.getDefaultPlayerTokens();
  }

  @Post('default-player-tokens')
  setDefaultPlayerTokens(@Body() body:{defaultTokens:number},@Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    return this.players.setDefaultPlayerTokens(Number(body.defaultTokens));
  }

  @Get('statistics')
  getCasinoStatistics(@Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    return this.players.getCasinoStatistics();
  }

  @Post('reset-player-data')
  resetPlayerData(@Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    const result=this.players.resetPlayerData();
    this.presence.resetPlayerPresence();
    this.blackjack.reset();
    return result;
  }

  @Get('shop')
  getShopItems(@Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    return this.players.getShopItemsForAdmin();
  }

  @Post('shop/:itemKey')
  updateShopItem(@Param('itemKey') itemKey:string,@Body() body:{price:number;name:string;description:string},@Headers('authorization') authorization?:string){
    this.admin.assertToken(this.token(authorization));return this.players.updateShopItem(itemKey,body);
  }

  @Post('shop/:itemKey/enabled')
  setShopItemEnabled(
    @Param('itemKey') itemKey: string,
    @Body() body: { enabled: boolean },
    @Headers('authorization') authorization?: string,
  ) {
    this.admin.assertToken(this.token(authorization));
    return this.players.setShopItemEnabled(itemKey, body.enabled);
  }

  @Get('token-photo-settings') getTokenPhotoSettings(@Headers('authorization') authorization?:string) {
    this.admin.assertToken(this.token(authorization));
    return this.players.getTokenPhotoSettingsForAdmin();
  }

  @Post('token-photo-settings') setTokenPhotoSettings(@Body() body:{enabled:boolean;balanceThreshold:number;rewardAmount:number;cooldownMinutes:number;dailyLimit:number},@Headers('authorization') authorization?:string) {
    this.admin.assertToken(this.token(authorization));
    return this.players.setTokenPhotoSettings(body);
  }

  @Get('side-quests')
  getSideQuestPool(@Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    return this.players.getSideQuestPool();
  }

  @Post('side-quests')
  addSideQuest(@Body() body: { title: string; description?: string; photoEnabled?: boolean }, @Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    return this.players.addSideQuestToPool(body.title, body.description ?? '', body.photoEnabled === true);
  }

  @Post('side-quests/:id/enabled')
  setSideQuestEnabled(@Param('id') id:string,@Body() body:{enabled:boolean},@Headers('authorization') authorization?:string){
    this.admin.assertToken(this.token(authorization));
    const questId=Number(id);if(!Number.isSafeInteger(questId)||questId<=0)throw new BadRequestException('Érvénytelen side quest azonosító.');
    return this.players.setSideQuestEnabled(questId,body.enabled);
  }

  @Post('side-quests/:id/photo-enabled')
  setSideQuestPhotoEnabled(@Param('id') id:string,@Body() body:{enabled:boolean},@Headers('authorization') authorization?:string) {
    this.admin.assertToken(this.token(authorization));
    const questId=Number(id);
    if(!Number.isSafeInteger(questId)||questId<=0) throw new BadRequestException('Érvénytelen side quest azonosító.');
    return this.players.setSideQuestPhotoEnabled(questId,body.enabled);
  }

  @Post('side-quests/:id/delete')
  deleteSideQuest(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    const questId = Number(id);
    if (!Number.isSafeInteger(questId) || questId <= 0) throw new BadRequestException('Érvénytelen side quest azonosító.');
    return this.players.deleteSideQuestFromPool(questId);
  }

  @Post('players/:id/balance')
  setPlayerBalance(
    @Param('id') id: string,
    @Body() body: { balance: number },
    @Headers('authorization') authorization?: string,
  ) {
    this.admin.assertToken(this.token(authorization));
    const playerId = Number(id);
    const balance = Number(body.balance);
    if (!Number.isSafeInteger(playerId) || playerId <= 0 || !Number.isSafeInteger(balance) || balance < 0 || balance > 2_000_000_000) {
      throw new BadRequestException('Érvénytelen játékosazonosító vagy tokenmennyiség.');
    }
    return { playerId, ...this.players.setBalance(playerId, balance) };
  }

  @Get('players/:id/transactions')
  getPlayerTransactions(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    const playerId = Number(id);
    if (!Number.isSafeInteger(playerId) || playerId <= 0) throw new BadRequestException('Érvénytelen játékosazonosító.');
    return this.players.getTransactions(playerId);
  }

}
