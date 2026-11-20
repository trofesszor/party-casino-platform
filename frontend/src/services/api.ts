import type { PartyEvent, Player } from '../types';
const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Hiba történt.');
  return data as T;
};
export const api = {
  joinPlayer: (name: string) => request<Player>('/api/players/join', { method: 'POST', body: JSON.stringify({ name }) }),
  getEvents: () => request<PartyEvent[]>('/api/events'),
  createEvent: (data: { title: string; description: string; maxPlayers?: number | null }) => request<PartyEvent>('/api/events', { method: 'POST', body: JSON.stringify(data) }),
  joinEvent: (eventId: number, playerId: number) => request<PartyEvent>(`/api/events/${eventId}/join`, { method: 'POST', body: JSON.stringify({ playerId }) }),
  updateEvent: (eventId: number, action: 'start' | 'complete') => request<PartyEvent>(`/api/events/${eventId}/${action}`, { method: 'PATCH' }),
};
