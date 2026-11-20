import type { Player, RouletteBetType, RouletteState } from '../types';
const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Hiba történt.');
  return data as T;
};
export const api = {
  getLuckyWheel: () => request<{ status: 'IDLE' | 'SPINNING' | 'RESULT'; spinId: string | null; startedAt: number | null; endsAt: number | null; winner: { id: number; label: string; position: number } | null; segments: { id: number; label: string; position: number; enabled: number }[]; durationMs: number }>('/api/lucky-wheel'),
  spinLuckyWheel: () => request<any>('/api/lucky-wheel/spin', { method: 'POST' }),
  adminGetLuckyWheelSegments: (token: string) => request<{id:number;label:string;position:number;enabled:number}[]>('/api/lucky-wheel/segments', { headers: { Authorization: `Bearer ${token}` } }),
  saveLuckyWheel: (token: string, segments: { label: string; enabled: boolean }[]) => request<any>('/api/lucky-wheel/segments', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ segments }) }),
  adminLogin: (password: string) => request<{ token: string; expiresIn: number }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  adminPlayers: (token: string) => request<(Player & { online: boolean })[]>('/api/admin/players', { headers: { Authorization: `Bearer ${token}` } }),
  adminSetBalance: (token: string, playerId: number, balance: number) => request<{ playerId: number; tokenBalance: number }>(`/api/admin/players/${playerId}/balance`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ balance }) }),
  adminTransactions: (token: string, playerId: number) => request<{ id: number; amount: number; balanceAfter: number; type: string; description: string; createdAt: string }[]>(`/api/admin/players/${playerId}/transactions`, { headers: { Authorization: `Bearer ${token}` } }),
  adminLogout: (token: string) => request<{ success: boolean }>('/api/admin/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  joinPlayer: (name: string) => request<Player>('/api/players/join', { method: 'POST', body: JSON.stringify({ name }) }),
  getPlayers: () => request<Player[]>('/api/players'),
  getPlayerBalance: (playerId: number) => request<{ tokenBalance: number }>(`/api/players/${playerId}/balance`),
  getPlayerTransactions: (playerId: number) => request<{ id: number; amount: number; balanceAfter: number; type: string; description: string; createdAt: string }[]>(`/api/players/${playerId}/transactions`),
  getRouletteState: () => request<RouletteState>('/api/roulette'),
  placeRouletteBet: (playerId: number, betType: RouletteBetType, betValue: string | number, amount: number) =>
    request<RouletteState>('/api/roulette/bets', { method: 'POST', body: JSON.stringify({ playerId, betType, betValue, amount }) }),
  spinSlots: (playerId: number, betAmount: number) => request<{ playerId: number; playerName: string; reels: string[]; isWin: boolean; multiplier: number; betAmount: number; payoutAmount: number; tokenBalance: number; winLabel: string; freeSpinsAwarded: number; freeSpins: number; usedFreeSpin: boolean; paytable: { combination: string; multiplier: number; bonusSpins?: number }[] }>('/api/slots/spin', { method: 'POST', body: JSON.stringify({ playerId, betAmount }) }),
};
