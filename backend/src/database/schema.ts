import { integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';

// Drizzle schema definitions mirror the small SQLite schema initialized by DatabaseModule.
export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  joinedAt: text('joined_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  eventType: text('event_type').notNull().default('CUSTOM'),
  status: text('status').notNull().default('OPEN'),
  maxPlayers: integer('max_players'),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
});

export const eventParticipants = sqliteTable('event_participants', {
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  joinedAt: text('joined_at').notNull().default('CURRENT_TIMESTAMP'),
}, (table) => ({ pk: primaryKey({ columns: [table.eventId, table.playerId] }) }));
