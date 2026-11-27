export interface Player { id: number; name: string; joinedAt: string; tokenBalance: number }
export type RouletteBetType = 'NUMBER' | 'SPLIT' | 'STREET' | 'CORNER' | 'SIX_LINE' | 'DOZEN' | 'COLUMN' | 'COLOR' | 'ODD_EVEN' | 'LOW_HIGH';
export interface RouletteBet { id: number; playerId: number; playerName: string; betType: RouletteBetType; betValue: string; amount: number }
export interface RouletteRound { id: number; roundNumber: number; status: 'BETTING' | 'COMPLETED'; resultNumber: number | null; bettingEndsAt: string; createdAt: string; completedAt: string | null }
export interface RouletteHistory { roundNumber: number; resultNumber: number; completedAt: string }
export interface RouletteState { currentRound: RouletteRound | null; bets: RouletteBet[]; winners: RouletteBet[]; history: RouletteHistory[]; bettingSeconds: number; resultSeconds?: number }

export type SlotTier = 'grand' | 'major' | 'minor' | 'mini';
export type SlotProgressives = Record<'grand' | 'major', number>;
export type SlotStake = { denomination: number; units: number };
export type SlotCoin = { value: number; tier?: SlotTier };
export type SlotTile = { symbol: 'cherry' | 'lemon' | 'lime' | 'grapes' | 'orange' | 'crescent' | 'wild' | 'scatter' | 'coin' | 'empty'; coin?: SlotCoin };
export type SlotBonus = { coins: Array<SlotCoin | null>; remaining: number; stake: SlotStake };
export type SlotState = {
  denominations: number[];
  betUnits: number[];
  maxBet: number;
  jackpotStarts: SlotProgressives;
  bellBonus: { trigger: number; respins: number; grandBells: number; fullBoardMultiplier: number };
  jackpotMultipliers: Record<'minor' | 'mini', number>;
  lines: number[][];
  paytable: Array<{ symbol: SlotTile['symbol']; label: string; payouts: number[] }>;
  jackpots: SlotProgressives;
  tokenBalance: number | null;
  freeSpins: number;
  freeStake: SlotStake | null;
  bonus: SlotBonus | null;
};
export type SlotSpin = Pick<SlotState, 'jackpots' | 'freeSpins' | 'freeStake' | 'bonus'> & {
  grid: SlotTile[];
  stake: SlotStake;
  tokenBalance: number;
  payoutAmount: number;
  freeSpinsAwarded: number;
  usedFreeSpin: boolean;
  winLabel: string;
  jackpotWins: Array<{ tier: SlotTier; amount: number }>;
  finishedBonus: SlotBonus | null;
  bonusMultiplier: number;
  wins: Array<{ line: number; amount: number; positions: number[] }>;
};

export type ShopItem = { itemKey: string; name: string; description: string; price: number; quantity: number; enabled: number };
export type ShopRedemption = { id: number; itemKey: string; name: string; redeemedAt: string };
export type CreditEconomy = { startingCredits: number; wheelSpinCost: number; scratchPrizes: number[]; legacyScratchPrizes: number[]; slotStakeLimit: number; blackjackBets: number[]; duelReward: number; photoReward: { enabled: boolean; rewardAmount: number; balanceThreshold: number; dailyLimit: number } };
