import { Inject } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { DATABASE } from '../database/database.module';

@WebSocketGateway({ cors: { origin: true } })
export class EventsGateway {
  @WebSocketServer() server: Server;

  constructor(@Inject(DATABASE) private readonly database: any) {
    this.database.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS party_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'system',
        title TEXT,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        audience_player_id INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_party_notifications_created ON party_notifications(id DESC);
    `);
    try { this.database.sqlite.exec('ALTER TABLE party_notifications ADD COLUMN audience_player_id INTEGER'); } catch { /* already exists */ }
  }

  publish(event: string, payload: any) {
    if (event === 'party:notification' && payload?.message) {
      this.database.sqlite.prepare(
        'INSERT INTO party_notifications (type,title,message,audience_player_id) VALUES (?,?,?,?)',
      ).run(String(payload.type ?? 'system'), payload.title ? String(payload.title) : null, String(payload.message), payload.audiencePlayerId ?? null);
    }
    if (event === 'party:notification' && Number.isSafeInteger(payload?.audiencePlayerId) && payload.audiencePlayerId > 0) {
      this.server?.to(`player:${payload.audiencePlayerId}`).emit(event, payload);
    } else {
      this.server?.emit(event, payload);
    }
  }
}
