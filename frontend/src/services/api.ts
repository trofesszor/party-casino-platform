import type { Player, RouletteBetType, RouletteState } from '../types';
export type Duel = { id:number; challengerId:number; challengerName:string; opponentId:number; opponentName:string; status:'PENDING'|'CHOOSE_TYPE'|'IN_PROGRESS'|'AWAITING_CONFIRMATION'|'COMPLETED'|'REFUSED'; duelType:string|null; challengerWinnerId:number|null; opponentWinnerId:number|null; winnerId:number|null; loserId:number|null; rewardAmount:number; createdAt:string; completedAt:string|null };
const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Hiba történt.');
  return data as T;
};
export const api = {
  getLuckyWheel: () => request<{ status: 'IDLE' | 'SPINNING' | 'RESULT'; spinId: string | null; startedAt: number | null; endsAt: number | null; winner: { id: number; label: string; position: number } | null; segments: { id: number; label: string; position: number; enabled: number }[]; durationMs: number; spinCost: number }>('/api/lucky-wheel'),
  spinLuckyWheel: (playerId: number) => request<any>('/api/lucky-wheel/spin', { method: 'POST', body: JSON.stringify({ playerId }) }),
  adminGetLuckyWheelSegments: (token: string) => request<{id:number;label:string;position:number;enabled:number}[]>('/api/lucky-wheel/segments', { headers: { Authorization: `Bearer ${token}` } }),
  saveLuckyWheel: (token: string, segments: { label: string; enabled: boolean }[]) => request<any>('/api/lucky-wheel/segments', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ segments }) }),
  getDuels: (playerId:number) => request<Duel[]>(`/api/players/${playerId}/duels`),
  createDuel: (playerId:number, opponentId:number) => request<Duel>(`/api/players/${playerId}/duels`, { method:'POST', body:JSON.stringify({opponentId}) }),
  respondToDuel: (playerId:number, duelId:number, accept:boolean) => request<Duel>(`/api/players/${playerId}/duels/${duelId}/respond`, { method:'POST', body:JSON.stringify({accept}) }),
  chooseDuelType: (playerId:number, duelId:number, duelType:string) => request<Duel>(`/api/players/${playerId}/duels/${duelId}/type`, { method:'POST', body:JSON.stringify({duelType}) }),
  submitDuelWinner: (playerId:number, duelId:number, winnerId:number) => request<Duel>(`/api/players/${playerId}/duels/${duelId}/result`, { method:'POST', body:JSON.stringify({winnerId}) }),
  getShop: (playerId:number) => request<{itemKey:string;name:string;description:string;price:number;quantity:number}[]>(`/api/players/${playerId}/shop`),
  buyShopItem: (playerId:number,itemKey:string) => request<{success:boolean;itemKey:string;quantity:number;tokenBalance:number}>(`/api/players/${playerId}/shop/buy`, {method:'POST',body:JSON.stringify({itemKey})}),
  useShopItem: (playerId:number,itemKey:string,questId:number) => request<{success:boolean;skippedQuestId:number;inventoryQuantity:number}>(`/api/players/${playerId}/shop/use`, {method:'POST',body:JSON.stringify({itemKey,questId})}),
  getPlayerSideQuests: (playerId: number) => request<{id:number;title:string;description:string;status:'ACTIVE'|'COMPLETED'|'SKIPPED';assignedAt:string;completedAt:string|null;approvedByName?:string|null;approvedAt?:string|null}[]>(`/api/players/${playerId}/side-quests`),
  requestSideQuest: (playerId: number) => request<any>(`/api/players/${playerId}/side-quests`, { method: 'POST' }),
  requestSideQuestVerification: (playerId:number,questId:number) => request<{pin:string;expiresAt:string}>(`/api/players/${playerId}/side-quests/${questId}/verification`, {method:'POST'}),
  getSideQuestVerification: (pin:string,verifierId:number) => request<{questId:number;ownerId:number;ownerName:string;title:string;description:string;expiresAt:string}>('/api/players/side-quest-verifications/lookup', {method:'POST',body:JSON.stringify({pin,verifierId})}),
  verifySideQuest: (pin:string,verifierId:number,approve:boolean) => request<{success:boolean;status:'APPROVED'|'REJECTED';questId:number;questTitle:string;verifiedByName:string}>('/api/players/side-quest-verifications/verify', {method:'POST',body:JSON.stringify({pin,verifierId,approve})}),
  adminShopItems: (token: string) => request<{itemKey:string;name:string;description:string;price:number;enabled:number}[]>('/api/admin/shop', { headers: { Authorization: `Bearer ${token}` } }),
  adminSetShopItemEnabled: (token: string, itemKey: string, enabled: boolean) => request<{itemKey:string;enabled:number}>(`/api/admin/shop/${encodeURIComponent(itemKey)}/enabled`, { method:'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ enabled }) }),
  adminSideQuestPool: (token: string) => request<{id:number;title:string;description:string;enabled:number}[]>('/api/admin/side-quests', { headers: { Authorization: `Bearer ${token}` } }),
  adminAddSideQuest: (token: string, title: string, description: string) => request<any>('/api/admin/side-quests', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ title, description }) }),
  adminDeleteSideQuest: (token: string, questId: number) => request<any>(`/api/admin/side-quests/${questId}/delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  adminLogin: (password: string) => request<{ token: string; expiresIn: number }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  adminPlayers: (token: string) => request<(Player & { online: boolean })[]>('/api/admin/players', { headers: { Authorization: `Bearer ${token}` } }),
  adminSetBalance: (token: string, playerId: number, balance: number) => request<{ playerId: number; tokenBalance: number }>(`/api/admin/players/${playerId}/balance`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ balance }) }),
  adminTransactions: (token: string, playerId: number) => request<{ id: number; amount: number; balanceAfter: number; type: string; description: string; createdAt: string }[]>(`/api/admin/players/${playerId}/transactions`, { headers: { Authorization: `Bearer ${token}` } }),
  adminLogout: (token: string) => request<{ success: boolean }>('/api/admin/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  joinPlayer: (name: string) => request<Player>('/api/players/join', { method: 'POST', body: JSON.stringify({ name }) }),
  getPlayers: () => request<Player[]>('/api/players'),
  getLeaderboard: () => request<{ id: number; name: string; tokenBalance: number }[]>('/api/players/leaderboard'),
  getPlayerBalance: (playerId: number) => request<{ tokenBalance: number }>(`/api/players/${playerId}/balance`),
  getPlayerTransactions: (playerId: number) => request<{ id: number; amount: number; balanceAfter: number; type: string; description: string; createdAt: string }[]>(`/api/players/${playerId}/transactions`),
  getRouletteState: () => request<RouletteState>('/api/roulette'),
  placeRouletteBet: (playerId: number, betType: RouletteBetType, betValue: string | number, amount: number) =>
    request<RouletteState>('/api/roulette/bets', { method: 'POST', body: JSON.stringify({ playerId, betType, betValue, amount }) }),
  spinSlots: (playerId: number, betAmount: number) => request<{ playerId: number; playerName: string; reels: string[]; isWin: boolean; multiplier: number; betAmount: number; payoutAmount: number; tokenBalance: number; winLabel: string; freeSpinsAwarded: number; freeSpins: number; usedFreeSpin: boolean; paytable: { combination: string; multiplier: number; bonusSpins?: number }[] }>('/api/slots/spin', { method: 'POST', body: JSON.stringify({ playerId, betAmount }) }),
};
