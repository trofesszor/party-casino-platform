import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '../database/database.module';
import { EventsGateway } from './events.gateway';

@Injectable()
export class EventsService {
  constructor(@Inject(DATABASE) private readonly database: any, private readonly gateway: EventsGateway) {}

  list() {
    return this.database.sqlite.prepare(`
      SELECT e.id, e.title, e.description, e.event_type AS eventType, e.status,
        e.max_players AS maxPlayers, e.created_at AS createdAt,
        COUNT(ep.player_id) AS participantCount,
        COALESCE(json_group_array(CASE WHEN p.id IS NOT NULL THEN json_object('id',p.id,'name',p.name) END), '[]') AS participantsJson
      FROM events e LEFT JOIN event_participants ep ON ep.event_id=e.id
      LEFT JOIN players p ON p.id=ep.player_id GROUP BY e.id ORDER BY e.created_at DESC
    `).all().map((e: any) => ({ ...e, participants: JSON.parse(e.participantsJson).filter(Boolean), participantsJson: undefined }));
  }

  create(input: any) {
    const title = String(input.title ?? '').trim();
    if (!title || title.length > 60) throw new BadRequestException('Az esemény neve 1–60 karakter legyen.');
    const description = String(input.description ?? '').trim().slice(0, 300);
    const maxPlayers = input.maxPlayers ? Math.max(1, Math.min(100, Number(input.maxPlayers))) : null;
    const result = this.database.sqlite.prepare('INSERT INTO events (title, description, event_type, max_players) VALUES (?, ?, ?, ?)').run(title, description, String(input.eventType ?? 'CUSTOM'), maxPlayers);
    const event = this.getOne(Number(result.lastInsertRowid));
    this.gateway.publish('events:changed', this.list());
    return event;
  }

  join(eventId: number, playerId: number) {
    const event = this.getOne(eventId);
    if (event.status !== 'OPEN') throw new BadRequestException('Erre az eseményre már nem lehet csatlakozni.');
    const player = this.database.sqlite.prepare('SELECT id FROM players WHERE id=?').get(playerId);
    if (!player) throw new NotFoundException('A játékos nem található.');
    if (event.maxPlayers && event.participantCount >= event.maxPlayers && !event.participants.some((p: any) => p.id === playerId)) throw new BadRequestException('Az esemény megtelt.');
    this.database.sqlite.prepare('INSERT OR IGNORE INTO event_participants (event_id, player_id) VALUES (?, ?)').run(eventId, playerId);
    const updated = this.getOne(eventId);
    this.gateway.publish('events:changed', this.list());
    return updated;
  }

  setStatus(eventId: number, status: 'RUNNING' | 'COMPLETED') {
    const event = this.getOne(eventId);

    if (status === 'RUNNING') {
      if (event.status !== 'OPEN') {
        throw new BadRequestException('Csak nyitott eseményt lehet elindítani.');
      }

      const result = this.database.sqlite.prepare(
        "UPDATE events SET status='RUNNING', started_at=CURRENT_TIMESTAMP WHERE id=? AND status='OPEN'",
      ).run(eventId);

      if (Number(result.changes) !== 1) {
        throw new BadRequestException('Az esemény állapota időközben megváltozott.');
      }
    } else {
      if (event.status === 'COMPLETED') {
        throw new BadRequestException('Az esemény már le van zárva.');
      }

      const result = this.database.sqlite.prepare(
        "UPDATE events SET status='COMPLETED', completed_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('OPEN','RUNNING')",
      ).run(eventId);

      if (Number(result.changes) !== 1) {
        throw new BadRequestException('Az esemény állapota időközben megváltozott.');
      }
    }

    const updated = this.getOne(eventId);
    this.gateway.publish('events:changed', this.list());
    return updated;
  }

  getOne(id: number) {
    const event = this.list().find((item: any) => item.id === id);
    if (!event) throw new NotFoundException('Az esemény nem található.');
    return event;
  }
}
