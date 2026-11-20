import type { Player, RouletteBetType, RouletteState } from '../types';
const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Hiba történt.');
  return data as T;
};
export const api = {
  joinPlayer: (name: string) => request<Player>('/api/players/join', { method: 'POST', body: JSON.stringify({ name }) }),
  getPlayers: () => request<Player[]>('/api/players'),
  getRouletteState: () => request<RouletteState>('/api/roulette'),
  placeRouletteBet: (playerId: number, betType: RouletteBetType, betValue: string | number, amount: number) =>
    request<RouletteState>('/api/roulette/bets', { method: 'POST', body: JSON.stringify({ playerId, betType, betValue, amount }) }),
  spinSlots: (playerId: number, betAmount: number) => request<{ playerId: number; playerName: string; reels: string[]; isWin: boolean; multiplier: number; betAmount: number; payoutAmount: number; winLabel: string; freeSpinsAwarded: number; freeSpins: number; usedFreeSpin: boolean; paytable: { combination: string; multiplier: number; bonusSpins?: number }[] }>('/api/slots/spin', { method: 'POST', body: JSON.stringify({ playerId, betAmount }) }),
};
