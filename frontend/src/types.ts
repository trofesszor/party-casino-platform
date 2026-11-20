export interface Player { id: number; name: string; joinedAt: string }
export interface RouletteBet { playerId: number; playerName: string; betType: 'NUMBER' | 'COLOR'; betValue: string }
export interface RouletteRound { id: number; roundNumber: number; status: 'BETTING' | 'COMPLETED'; resultNumber: number | null; bettingEndsAt: string; createdAt: string; completedAt: string | null }
export interface RouletteHistory { roundNumber: number; resultNumber: number; completedAt: string }
export interface RouletteState { currentRound: RouletteRound | null; bets: RouletteBet[]; winners: RouletteBet[]; history: RouletteHistory[]; bettingSeconds: number }
