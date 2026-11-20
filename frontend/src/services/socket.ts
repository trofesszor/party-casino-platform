import { io } from 'socket.io-client';

export const socket = io('/', { path: '/socket.io', autoConnect: true });
let currentPlayerId: number | null = null;

function sendIdentity() {
  if (currentPlayerId && socket.connected) socket.emit('player:identify', currentPlayerId);
}

socket.on('connect', sendIdentity);

export function identifyPlayer(playerId: number | null) {
  currentPlayerId = playerId && Number.isInteger(playerId) && playerId > 0 ? playerId : null;
  sendIdentity();
}
