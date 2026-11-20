export interface Player { id: number; name: string; joinedAt: string }
export interface Participant { id: number; name: string }
export interface PartyEvent { id: number; title: string; description: string; eventType: string; status: 'OPEN' | 'RUNNING' | 'COMPLETED'; maxPlayers: number | null; participantCount: number; participants: Participant[]; createdAt: string }

export interface RouletteBet { playerId: number; playerName: string; betType: 'NUMBER' | 'COLOR'; betValue: string }
export interface RouletteRound { id: number; roundNumber: number; status: 'OPEN' | 'COMPLETED'; resultNumber: number | null; createdAt: string; completedAt: string | null }
export interface RouletteState { event: { id: number; title: string; status: PartyEvent['status']; eventType: string }; currentRound: RouletteRound | null; bets: RouletteBet[]; winners: RouletteBet[]; history: RouletteRound[] }
