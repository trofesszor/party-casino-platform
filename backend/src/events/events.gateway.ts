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
      CREATE TABLE IF NOT EXISTS party_notification_settings (category TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1);
    `);
    try { this.database.sqlite.exec('ALTER TABLE party_notifications ADD COLUMN audience_player_id INTEGER'); } catch { /* already exists */ }
  }


  private readonly categories = ['wheel','event','duel','roulette','slots','leaderboard','system'];
  getNotificationSettings() {
    const rows = this.database.sqlite.prepare('SELECT category, enabled FROM party_notification_settings').all() as {category:string;enabled:number}[];
    return Object.fromEntries(this.categories.map(category => [category, rows.find(row => row.category === category)?.enabled !== 0]));
  }
  setNotificationSettings(settings: Record<string, boolean>) {
    const update = this.database.sqlite.prepare('INSERT INTO party_notification_settings(category,enabled) VALUES (?,?) ON CONFLICT(category) DO UPDATE SET enabled=excluded.enabled');
    const tx = this.database.sqlite.transaction(() => this.categories.forEach(category => {
      if (typeof settings[category] === 'boolean') update.run(category, settings[category] ? 1 : 0);
    }));
    tx();
    return this.getNotificationSettings();
  }

  publish(event: string, payload: any) {
    if (event === 'party:notification' && payload?.message) {
      const category = this.categories.includes(String(payload.type)) ? String(payload.type) : 'system';
      if (!this.getNotificationSettings()[category]) return;
      const inserted = this.database.sqlite.prepare(
        'INSERT INTO party_notifications (type,title,message,audience_player_id) VALUES (?,?,?,?)',
      ).run(String(payload.type ?? 'system'), payload.title ? String(payload.title) : null, String(payload.message), payload.audiencePlayerId ?? null);
      // Attach the persisted notification ID to the socket event. The frontend also
      // receives this row through polling; both delivery paths must share one identity.
      payload = {
        ...payload,
        id: Number(inserted.lastInsertRowid),
        createdAt: this.database.sqlite.prepare(
          'SELECT created_at AS createdAt FROM party_notifications WHERE id = ?',
        ).get(Number(inserted.lastInsertRowid))?.createdAt,
      };
    }
    if (event === 'party:notification' && Number.isSafeInteger(payload?.audiencePlayerId) && payload.audiencePlayerId > 0) {
      this.server?.to(`player:${payload.audiencePlayerId}`).emit(event, payload);
    } else {
      this.server?.emit(event, payload);
    }
  }
}
