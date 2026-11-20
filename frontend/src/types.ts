export interface Player { id: number; name: string; joinedAt: string }
export interface Participant { id: number; name: string }
export interface PartyEvent { id: number; title: string; description: string; eventType: string; status: 'OPEN' | 'RUNNING' | 'COMPLETED'; maxPlayers: number | null; participantCount: number; participants: Participant[]; createdAt: string }
