import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { AdminService } from '../admin/admin.service';
import { CommunityEventsService } from './community-events.service';

@Controller('api/community-events')
export class CommunityEventsController {
  constructor(private readonly community: CommunityEventsService, private readonly admin: AdminService) {}

  private assertAdmin(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Admin bejelentkezés szükséges.');
    this.admin.assertToken(authorization.slice(7));
  }

  @Get()
  listPublic() { return this.community.listPublic(); }

  @Get(':id/history')
  history(@Param('id') id: string) { return this.community.getHistory(this.id(id)); }

  @Post(':id/contribute')
  contribute(@Param('id') id: string, @Body() body: { playerId: number; amount: number }) {
    return this.community.contribute(this.id(id), Number(body.playerId), Number(body.amount));
  }

  @Get('admin/all')
  listAdmin(@Headers('authorization') authorization?: string) {
    this.assertAdmin(authorization);
    return this.community.listAdmin();
  }

  @Post('admin')
  create(@Body() body: any, @Headers('authorization') authorization?: string) {
    this.assertAdmin(authorization);
    return this.community.create(body);
  }

  @Post('admin/:id')
  update(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    this.assertAdmin(authorization);
    return this.community.update(this.id(id), body);
  }

  @Post('admin/:id/toggle')
  toggle(@Param('id') id: string, @Body() body: { active: boolean }, @Headers('authorization') authorization?: string) {
    this.assertAdmin(authorization);
    return this.community.setActive(this.id(id), body.active === true);
  }

  @Post('admin/:id/activate')
  activate(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    this.assertAdmin(authorization);
    return this.community.activateManually(this.id(id));
  }

  @Post('admin/:id/delete')
  remove(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    this.assertAdmin(authorization);
    return this.community.remove(this.id(id));
  }

  private id(value: string) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Érvénytelen eseményazonosító.');
    return id;
  }
}
