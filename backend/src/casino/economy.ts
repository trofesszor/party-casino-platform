export const creditScale = 1000;
export const startingCredits = 100_000;
export const wheelSpinPrice = 2500;
export const slotStakeLimit = 7500;
export const blackjackBets = [1000, 2000, 3500, 5000];
export const duelReward = 5000;
export const scratchTicketPrice = 5000;
export const questSkipPrice = 7500;
export const scratchPrizes = [5000, 12_500, 25_000, 50_000];
export const legacyScratchPrizes = [10_000, 25_000, 50_000, 100_000];
export const scratchOdds = [62, 22, 11, 4, 1];
export const photoRewardDefaults = { balanceThreshold: 15_000, rewardAmount: 7500, cooldownMinutes: 30, dailyLimit: 2 };

export const partyCoupons: ReadonlyArray<readonly [string, string, string, number]> = [
  ['PARTY_SONG', 'Egy dal a lejátszási listára', 'Kérj egy dalt a házigazdától a következő szabad helyre.', 5000],
  ['PARTY_PHOTO', 'Közös bulifotó', 'Válassz fotókelléket, és kérj egy közös képet a házigazdától.', 6000],
  ['PARTY_SNACK', 'Következő nasi választása', 'Válassz egy adagot a házigazdánál elérhető nasikból.', 7500],
  ['PARTY_MOCKTAIL', 'Alkoholmentes koktél', 'Válassz egy alkoholmentes italt a házigazda kínálatából.', 10000],
  ['PARTY_KARAOKE', 'Karaokehely', 'Kérj egy helyet a következő karaoke-körben.', 12500],
  ['PARTY_GAME', 'Te választasz partijátékot', 'Válaszd ki a következő közös játékot a társasággal egyeztetve.', 15000],
];

export function isPartyCoupon(key: string) {
  return partyCoupons.some(([itemKey]) => itemKey === key);
}
