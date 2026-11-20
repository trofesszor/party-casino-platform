import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { EventsService } from './events.service';
@Controller('api/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}
  @Get() list() { return this.events.list(); }
  @Post() create(@Body() body: any) { return this.events.create(body); }
  @Post(':id/join') join(@Param('id', ParseIntPipe) id: number, @Body() body: { playerId: number }) { return this.events.join(id, Number(body.playerId)); }
  @Patch(':id/start') start(@Param('id', ParseIntPipe) id: number) { return this.events.setStatus(id, 'RUNNING'); }
  @Patch(':id/complete') complete(@Param('id', ParseIntPipe) id: number) { return this.events.setStatus(id, 'COMPLETED'); }
}
