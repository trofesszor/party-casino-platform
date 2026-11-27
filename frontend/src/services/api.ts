import type { Player, RouletteBetType, RouletteState, SlotSpin, SlotStake, SlotState } from '../types';

export type CommunityEvent = {id:number;title:string;description:string;targetAmount:number;currentAmount:number;repeatMode:'ONCE'|'REPEATABLE'|'COOLDOWN';isSecret:number;unlocked?:number;nextAvailableAt:string|null;contributorCount:number};
export type CommunityEventAdmin = CommunityEvent & {cooldownMinutes:number;minContribution:number;maxContribution:number|null;active:number;completed:number;activationCount:number};
export type CommunityActivation = {id:number;title:string;description:string;totalContributions:number;participantCount:number;activatedAt:string;triggerType:string};

export type Duel = { id:number; challengerId:number; challengerName:string; opponentId:number; opponentName:string; status:'PENDING'|'CHOOSE_TYPE'|'IN_PROGRESS'|'AWAITING_CONFIRMATION'|'COMPLETED'|'REFUSED'; duelType:string|null; challengerWinnerId:number|null; opponentWinnerId:number|null; winnerId:number|null; loserId:number|null; rewardAmount:number; createdAt:string; completedAt:string|null };
const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Hiba történt.');
  return data as T;
};
export const api = {

  adminGetNotificationSettings: (token:string) => request<Record<string,boolean>>('/api/admin/notification-settings',{headers:{Authorization:`Bearer ${token}`}}),
  adminSaveNotificationSettings: (token:string,settings:Record<string,boolean>) => request<Record<string,boolean>>('/api/admin/notification-settings',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(settings)}),
  getPartyNotifications: (playerId?:number) => request<{id:number;type:'event'|'wheel'|'system'|'duel'|'roulette'|'slots'|'leaderboard';title:string|null;message:string;createdAt:string}[]>(`/api/events/notifications${playerId ? `?playerId=${playerId}` : ''}`),
  getCommunityEvents: () => request<{events:CommunityEvent[];recentActivations:CommunityActivation[]}>('/api/community-events'),
  contributeCommunityEvent: (eventId:number,playerId:number,amount:number) => request<any>(`/api/community-events/${eventId}/contribute`,{method:'POST',body:JSON.stringify({playerId,amount})}),
  getCommunityEventHistory: (eventId:number) => request<any>(`/api/community-events/${eventId}/history`),
  adminCommunityEvents: (token:string) => request<CommunityEventAdmin[]>('/api/community-events/admin/all',{headers:{Authorization:`Bearer ${token}`}}),
  adminCreateCommunityEvent: (token:string,input:any) => request<any>('/api/community-events/admin',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(input)}),
  adminUpdateCommunityEvent: (token:string,id:number,input:any) => request<any>(`/api/community-events/admin/${id}`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(input)}),
  adminToggleCommunityEvent: (token:string,id:number,active:boolean) => request<any>(`/api/community-events/admin/${id}/toggle`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({active})}),
  adminActivateCommunityEvent: (token:string,id:number) => request<any>(`/api/community-events/admin/${id}/activate`,{method:'POST',headers:{Authorization:`Bearer ${token}`}}),
  adminDeleteCommunityEvent: (token:string,id:number) => request<any>(`/api/community-events/admin/${id}/delete`,{method:'POST',headers:{Authorization:`Bearer ${token}`}}),

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
  buyShopItem: (playerId:number,itemKey:string) => request<{success:boolean;itemKey:string;quantity?:number;ticketId?:number;tokenBalance:number}>(`/api/players/${playerId}/shop/buy`, {method:'POST',body:JSON.stringify({itemKey})}),
  getScratchTickets: (playerId:number) => request<{id:number;status:'UNSCRATCHED'|'REVEALED';prizeAmount?:number;outcomeJson?:string|null;createdAt:string}[]>(`/api/players/${playerId}/scratch-tickets`),
  revealScratchTicket: (playerId:number,ticketId:number) => request<{success:boolean;ticketId:number;prizeAmount:number;outcome:string[][];alreadyRevealed:boolean}>(`/api/players/${playerId}/scratch-tickets/${ticketId}/reveal`,{method:'POST'}),
  useShopItem: (playerId:number,itemKey:string,questId:number) => request<{success:boolean;skippedQuestId:number;inventoryQuantity:number}>(`/api/players/${playerId}/shop/use`, {method:'POST',body:JSON.stringify({itemKey,questId})}),
  getTokenPhotoStatus: (playerId:number) => request<any>(`/api/players/${playerId}/token-photo/status`),
  createTokenPhotoSession: (playerId:number) => request<{sessionId:string;cameraUrl:string;expiresAt:string;rewardAmount:number}>(`/api/players/${playerId}/token-photo/session`,{method:'POST'}),
  checkTokenPhotoSession: (playerId:number,sessionId:string) => request<any>(`/api/players/${playerId}/token-photo/session/${encodeURIComponent(sessionId)}/status`),
  adminGetTokenPhotoSettings: (token:string) => request<{enabled:boolean;balanceThreshold:number;rewardAmount:number;cooldownMinutes:number;dailyLimit:number}>('/api/admin/token-photo-settings',{headers:{Authorization:`Bearer ${token}`}}),
  adminSaveTokenPhotoSettings: (token:string,settings:{enabled:boolean;balanceThreshold:number;rewardAmount:number;cooldownMinutes:number;dailyLimit:number}) => request<any>('/api/admin/token-photo-settings',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(settings)}),
  getPlayerSideQuests: (playerId: number) => request<{id:number;title:string;description:string;status:'ACTIVE'|'COMPLETED'|'SKIPPED';assignedAt:string;completedAt:string|null;photoEnabled:number;completionMethod?:string|null;photoId?:string|null;approvedByName?:string|null;approvedAt?:string|null}[]>(`/api/players/${playerId}/side-quests`),
  requestSideQuest: (playerId: number) => request<any>(`/api/players/${playerId}/side-quests`, { method: 'POST' }),
  getSideQuestVerificationStatus: (playerId:number,questId:number) => request<{active:boolean;expiresAt:string|null}>(`/api/players/${playerId}/side-quests/${questId}/verification-status`),
  requestSideQuestVerification: (playerId:number,questId:number) => request<{pin:string;expiresAt:string}>(`/api/players/${playerId}/side-quests/${questId}/verification`, {method:'POST'}),
  createSideQuestPhotoSession: (playerId:number,questId:number) => request<{sessionId:string;cameraUrl:string;expiresAt:string;questTitle:string}>(`/api/players/${playerId}/side-quests/${questId}/photo-session`,{method:'POST'}),
  checkSideQuestPhotoSession: (playerId:number,questId:number,sessionId:string) => request<{success:boolean;completed:boolean;questId:number;photoId?:string;status?:string}>(`/api/players/${playerId}/side-quests/${questId}/photo-session/${encodeURIComponent(sessionId)}/status`),
  getSideQuestVerification: (pin:string,verifierId:number) => request<{questId:number;ownerId:number;ownerName:string;title:string;description:string;expiresAt:string}>('/api/players/side-quest-verifications/lookup', {method:'POST',body:JSON.stringify({pin,verifierId})}),
  verifySideQuest: (pin:string,verifierId:number,approve:boolean) => request<{success:boolean;status:'APPROVED'|'REJECTED';questId:number;questTitle:string;verifiedByName:string}>('/api/players/side-quest-verifications/verify', {method:'POST',body:JSON.stringify({pin,verifierId,approve})}),
  adminShopItems: (token: string) => request<{itemKey:string;name:string;description:string;price:number;enabled:number}[]>('/api/admin/shop', { headers: { Authorization: `Bearer ${token}` } }),
  adminSetShopItemEnabled: (token: string, itemKey: string, enabled: boolean) => request<{itemKey:string;enabled:number}>(`/api/admin/shop/${encodeURIComponent(itemKey)}/enabled`, { method:'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ enabled }) }),
  adminSideQuestPool: (token: string) => request<{id:number;title:string;description:string;enabled:number;photoEnabled:number}[]>('/api/admin/side-quests', { headers: { Authorization: `Bearer ${token}` } }),
  adminAddSideQuest: (token: string, title: string, description: string, photoEnabled:boolean) => request<any>('/api/admin/side-quests', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ title, description, photoEnabled }) }),
  adminSetSideQuestEnabled: (token:string,questId:number,enabled:boolean) => request<any>(`/api/admin/side-quests/${questId}/enabled`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({enabled})}),
  adminSetSideQuestPhotoEnabled: (token:string,questId:number,enabled:boolean) => request<any>(`/api/admin/side-quests/${questId}/photo-enabled`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({enabled})}),
  adminDeleteSideQuest: (token: string, questId: number) => request<any>(`/api/admin/side-quests/${questId}/delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  adminLogin: (password: string) => request<{ token: string; expiresIn: number }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  adminGetGameSettings: (token:string) => request<any>('/api/admin/game-settings',{headers:{Authorization:`Bearer ${token}`}}),
  adminSaveGameSettings: (token:string,settings:any) => request<any>('/api/admin/game-settings',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(settings)}),
  adminUpdateShopItem: (token:string,item:{itemKey:string;name:string;description:string;price:number}) => request<any>(`/api/admin/shop/${encodeURIComponent(item.itemKey)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({name:item.name,description:item.description,price:item.price})}),
  adminGetDefaultPlayerTokens: (token:string) => request<{defaultTokens:number}>('/api/admin/default-player-tokens',{headers:{Authorization:`Bearer ${token}`}}),
  adminSetDefaultPlayerTokens: (token:string,defaultTokens:number) => request<{defaultTokens:number}>('/api/admin/default-player-tokens',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({defaultTokens})}),
  adminCasinoStatistics: (token:string) => request<any>('/api/admin/statistics',{headers:{Authorization:`Bearer ${token}`}}),
  adminResetPlayerData: (token:string) => request<{success:boolean;deletedPlayers:number}>('/api/admin/reset-player-data',{method:'POST',headers:{Authorization:`Bearer ${token}`}}),
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
  placeRouletteBet: (playerId: number, betType: RouletteBetType, betValue: string | number, amount: number, roundId?: number) =>
    request<RouletteState & { tokenBalance?: number }>('/api/roulette/bets', { method: 'POST', body: JSON.stringify({ playerId, betType, betValue, amount, roundId }) }),
  getSlots: (playerId?: number) => request<SlotState>(`/api/slots${playerId ? '?playerId=' + playerId : ''}`),
  spinSlots: (playerId: number, stake: SlotStake) => request<SlotSpin>('/api/slots/spin', { method: 'POST', body: JSON.stringify({ playerId, ...stake }) }),
};
