import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { BlackjackService } from './blackjack.service';

@WebSocketGateway({ namespace: '/blackjack', cors: { origin: true } })
export class BlackjackGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server: Namespace;
  private readonly logger = new Logger(BlackjackGateway.name);

  constructor(private readonly table: BlackjackService) {}

  afterInit() {
    this.table.onChange = () => this.publish();
  }

  handleConnection(client: Socket) {
    client.data.playerId = Number(client.handshake.auth?.playerId) || 0;
    this.send(client);
  }

  handleDisconnect(client: Socket) {
    try {
      if (this.table.leave(client.id)) this.publish();
    } catch (error) {
      this.logger.error('Blackjack szék felszabadítása sikertelen.', error);
    }
  }

  @SubscribeMessage('blackjack:command')
  command(@ConnectedSocket() client: Socket, @MessageBody() command: { action?: string; seat?: number; amount?: number } | null) {
    try {
      const position = Number(command?.seat);
      const action = command?.action;
      switch (action) {
        case 'sit': this.table.sit(client.id, client.data.playerId, position); break;
        case 'leave': this.table.leave(client.id, position); break;
        case 'bet': this.table.wager(client.id, position, Number(command?.amount)); break;
        case 'skip': this.table.skip(client.id, position); break;
        case 'hit':
        case 'stand':
        case 'double': this.table.play(client.id, position, action); break;
        default: return { ok: false, error: 'Ismeretlen blackjackművelet.' };
      }
      this.publish();
      return { ok: true };
    } catch (error) {
      this.send(client);
      return { ok: false, error: error instanceof Error ? error.message : 'A blackjackművelet sikertelen.' };
    }
  }

  private publish() {
    for (const client of this.server.sockets.values()) this.send(client);
  }

  private send(client: Socket) {
    client.emit('blackjack:state', this.table.snapshot(client.id, client.data.playerId));
  }
}
