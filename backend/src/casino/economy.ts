export const startingCredits = 100;
export const wheelSpinPrice = 5;
export const rouletteRoundLimit = 25;
export const slotStakeLimit = 25;
export const blackjackBets = [2, 4, 10, 20];
export const scratchTicketPrice = 10;
export const questSkipPrice = 15;

export const partyCoupons: ReadonlyArray<readonly [string, string, string, number]> = [
  ['PARTY_SONG', 'Egy dal a lejátszási listára', 'Kérj egy dalt a házigazdától a következő szabad helyre.', 10],
  ['PARTY_PHOTO', 'Közös bulifotó', 'Válassz fotókelléket, és kérj egy közös képet a házigazdától.', 12],
  ['PARTY_SNACK', 'Következő nasi választása', 'Válassz egy adagot a házigazdánál elérhető nasikból.', 15],
  ['PARTY_MOCKTAIL', 'Alkoholmentes koktél', 'Válassz egy alkoholmentes italt a házigazda kínálatából.', 20],
  ['PARTY_KARAOKE', 'Karaokehely', 'Kérj egy helyet a következő karaoke-körben.', 25],
  ['PARTY_GAME', 'Te választasz partijátékot', 'Válaszd ki a következő közös játékot a társasággal egyeztetve.', 30],
];

export function isPartyCoupon(key: string) {
  return partyCoupons.some(([itemKey]) => itemKey === key);
}
