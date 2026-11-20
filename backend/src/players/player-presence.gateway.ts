import { Inject } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { DATABASE } from '../database/database.module';

@WebSocketGateway({ cors: { origin: true } })
export class PlayerPresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly sessions = new Map<number, Set<string>>();
  private readonly names = new Map<number, string>();

  constructor(@Inject(DATABASE) private readonly database: any) {}
  handleConnection(_client: Socket) {}

  handleDisconnect(client: Socket) {
    const playerId = Number(client.data.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) return;
    this.removeSession(playerId, client.id);
    this.publishOnlinePlayers();
  }

  @SubscribeMessage('player:identify')
  identify(@ConnectedSocket() client: Socket, @MessageBody() playerIdInput: unknown) {
    if (playerIdInput === null || playerIdInput === undefined || playerIdInput === '') {
      const previousId = Number(client.data.playerId);
      if (previousId > 0) {
        this.removeSession(previousId, client.id);
        delete client.data.playerId;
        this.publishOnlinePlayers();
      }
      return;
    }

    const playerId = Number(playerIdInput);
    if (!Number.isInteger(playerId) || playerId <= 0) return;
    const player = this.database.sqlite.prepare('SELECT id, name FROM players WHERE id = ?').get(playerId) as { id: number; name: string } | undefined;
    if (!player) return;
    const previousId = Number(client.data.playerId);
    if (previousId && previousId !== playerId) this.removeSession(previousId, client.id);
    client.data.playerId = player.id;
    const sessions = this.sessions.get(player.id) ?? new Set<string>();
    sessions.add(client.id);
    this.sessions.set(player.id, sessions);
    this.names.set(player.id, player.name);
    this.publishOnlinePlayers();
  }

  resetPlayerPresence() {
    for (const client of this.server?.sockets.sockets.values() ?? []) {
      delete client.data.playerId;
      client.emit('player:reset');
    }
    this.sessions.clear();
    this.names.clear();
    this.publishOnlinePlayers();
  }

  getOnlinePlayers() {
    return [...this.sessions.keys()]
      .filter((id) => (this.sessions.get(id)?.size ?? 0) > 0)
      .map((id) => ({ id, name: this.names.get(id) ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private removeSession(playerId: number, socketId: string) {
    const sessions = this.sessions.get(playerId);
    sessions?.delete(socketId);
    if (sessions?.size === 0) {
      this.sessions.delete(playerId);
      this.names.delete(playerId);
    }
  }

  private publishOnlinePlayers() {
    this.server?.emit('players:online', this.getOnlinePlayers());
  }
}
