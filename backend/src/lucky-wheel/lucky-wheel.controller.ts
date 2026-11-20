import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { LuckyWheelService } from './lucky-wheel.service';
import { AdminService } from '../admin/admin.service';

@Controller('api/lucky-wheel')
export class LuckyWheelController {
  constructor(private readonly wheel: LuckyWheelService, private readonly admin: AdminService) {}
  @Get() getState() { return this.wheel.getState(); }
  @Post('spin') spin(@Body() body: { playerId: number }) { return this.wheel.spin(Number(body?.playerId)); }
  @Get('segments') getSegments(@Headers('authorization') authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Admin bejelentkezés szükséges.');
    this.admin.assertToken(authorization.slice(7));
    return this.wheel.getAllSegments();
  }
  @Post('segments')
  saveSegments(@Body() body: { segments: Array<{ id?: number; label: string; enabled?: boolean }> }, @Headers('authorization') authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Admin bejelentkezés szükséges.');
    this.admin.assertToken(authorization.slice(7));
    return this.wheel.saveSegments(body.segments);
  }
}
