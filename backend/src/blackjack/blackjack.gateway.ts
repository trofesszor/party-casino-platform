import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { BlackjackService } from './blackjack.service';

@WebSocketGateway({ namespace: '/blackjack', cors: { origin: true } })
export class BlackjackGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server: Namespace;
  private readonly logger = new Logger(BlackjackGateway.name);

  constructor(private readonly blackjack: BlackjackService) {}

  async handleConnection(client: Socket) {
    const playerId = Number(client.handshake.auth?.playerId);
    if (Number.isSafeInteger(playerId) && playerId > 0) {
      client.data.playerId = playerId;
      await client.join(this.room(playerId));
    }
    if (client.connected) client.emit('blackjack:state', this.blackjack.snapshot(client.data.playerId));
  }

  handleDisconnect(client: Socket) {
    const playerId: number | undefined = client.data.playerId;
    if (!playerId || this.server.adapter.rooms.has(this.room(playerId))) return;
    try {
      this.blackjack.finishOnExit(playerId);
    } catch (error) {
      this.logger.error('Blackjack kör lezárása sikertelen.', error);
    }
  }

  @SubscribeMessage('blackjack:command')
  command(@ConnectedSocket() client: Socket, @MessageBody() command: { action?: string; amount?: number; round?: number; revision?: number } | null) {
    const playerId: number | undefined = client.data.playerId;
    try {
      switch (command?.action) {
        case 'bet': this.blackjack.deal(playerId, command.round, Number(command.amount)); break;
        case 'hit':
        case 'stand':
        case 'double': this.blackjack.play(playerId, command.round, command.revision, command.action); break;
        default: return { ok: false, error: 'Ismeretlen blackjackművelet.' };
      }
      this.server.to(this.room(playerId!)).emit('blackjack:state', this.blackjack.snapshot(playerId));
      return { ok: true };
    } catch (error) {
      client.emit('blackjack:state', this.blackjack.snapshot(playerId));
      return { ok: false, error: error instanceof Error ? error.message : 'A blackjackművelet sikertelen.' };
    }
  }

  private room(playerId: number) {
    return 'player:' + playerId;
  }
}
