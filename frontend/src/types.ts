export interface Player { id: number; name: string; joinedAt: string }
export type RouletteBetType = 'NUMBER' | 'SPLIT' | 'STREET' | 'CORNER' | 'SIX_LINE' | 'DOZEN' | 'COLUMN' | 'COLOR' | 'ODD_EVEN' | 'LOW_HIGH';
export interface RouletteBet { id: number; playerId: number; playerName: string; betType: RouletteBetType; betValue: string; amount: number }
export interface RouletteRound { id: number; roundNumber: number; status: 'BETTING' | 'COMPLETED'; resultNumber: number | null; bettingEndsAt: string; createdAt: string; completedAt: string | null }
export interface RouletteHistory { roundNumber: number; resultNumber: number; completedAt: string }
export interface RouletteState { currentRound: RouletteRound | null; bets: RouletteBet[]; winners: RouletteBet[]; history: RouletteHistory[]; bettingSeconds: number }
