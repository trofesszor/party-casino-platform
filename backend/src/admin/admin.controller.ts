import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { PlayersService } from '../players/players.service';
import { PlayerPresenceGateway } from '../players/player-presence.gateway';
import { AdminService } from './admin.service';

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly players: PlayersService,
    private readonly presence: PlayerPresenceGateway,
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

  @Get('players')
  getPlayers(@Headers('authorization') authorization?: string) {
    this.admin.assertToken(this.token(authorization));
    const onlineIds = new Set(this.presence.getOnlinePlayers().map(player => player.id));
    return this.players.findAll().map((player: any) => ({
      ...player,
      online: onlineIds.has(player.id),
    }));
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
