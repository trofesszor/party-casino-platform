import { randomInt } from 'node:crypto';

export const denominations = [1, 2, 5, 10];
export const betUnits = [1, 2, 3, 5, 10];
export const bellBonus = { trigger: 5, respins: 3, grandBells: 3, fullBoardMultiplier: 2 };
export const jackpotStarts = { grand: 2500, major: 600 };
export const jackpotMultipliers = { minor: 80, mini: 20 };
export const symbols = [
  { id: 'cherry', weight: 23, label: 'Cseresznye', payouts: [1, 3, 10] },
  { id: 'lemon', weight: 20, label: 'Citrom', payouts: [1, 4, 12] },
  { id: 'lime', weight: 17, label: 'Lime', payouts: [2, 5, 16] },
  { id: 'grapes', weight: 13, label: 'Szőlő', payouts: [2, 7, 22] },
  { id: 'orange', weight: 12, label: 'Narancs', payouts: [3, 9, 28] },
  { id: 'crescent', weight: 8, label: 'Rubinhold', payouts: [4, 12, 40] },
  { id: 'wild', weight: 4, label: 'Wild' },
  { id: 'scatter', weight: 4, label: 'Scatter' },
  { id: 'coin', weight: 10, label: 'Harang' },
] as const;

export type SymbolId = typeof symbols[number]['id'];
export type Coin = { value: number; tier?: JackpotTier };
export type Tile = { symbol: SymbolId | 'empty'; coin?: Coin };
export type Stake = { denomination: number; units: number };
export type Bonus = { coins: Array<Coin | null>; remaining: number; stake: Stake };
export type JackpotTier = 'grand' | 'major' | 'minor' | 'mini';
export type JackpotWin = { tier: JackpotTier; amount: number };

const lines = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
] as const;
const totalWeight = symbols.reduce((sum, symbol) => sum + symbol.weight, 0);

export const slotRules = {
  denominations,
  betUnits,
  jackpotStarts,
  bellBonus,
  jackpotMultipliers,
  lines,
  paytable: symbols.filter(symbol => 'payouts' in symbol).map(symbol => ({
    symbol: symbol.id,
    label: symbol.label,
    payouts: [...symbol.payouts],
    combination: symbol.label,
    multiplier: symbol.payouts[2],
  })),
};

export function amount(stake: Stake) {
  return stake.denomination * stake.units;
}

function coinDraw(stake: Stake, existing: Array<Coin | null> = []) {
  let major = existing.some(coin => coin?.tier === 'major');
  let grand = existing.filter(coin => coin?.tier === 'grand').length;
  const values = [1, 1, 2, 2, 3, 5, 8];
  return (): Coin => {
    const special = randomInt(100);
    if (special < 2) return { value: stake.denomination * jackpotMultipliers.minor, tier: 'minor' };
    if (special < 9) return { value: stake.denomination * jackpotMultipliers.mini, tier: 'mini' };
    if (special === 9 && !major) {
      major = true;
      return { value: 0, tier: 'major' };
    }
    if (special >= 10 && special < 13 && grand < bellBonus.grandBells) {
      grand++;
      return { value: 0, tier: 'grand' };
    }
    return { value: amount(stake) * values[randomInt(values.length)] };
  };
}

function drawTile(drawCoin: () => Coin): Tile {
  let draw = randomInt(totalWeight);
  for (const symbol of symbols) {
    draw -= symbol.weight;
    if (draw < 0) return symbol.id === 'coin' ? { symbol: symbol.id, coin: drawCoin() } : { symbol: symbol.id };
  }
  throw new Error('Invalid slot symbol weights.');
}

export function spinGrid(stake: Stake) {
  const drawCoin = coinDraw(stake);
  return Array.from({ length: 15 }, () => drawTile(drawCoin));
}

export function scoreBonus(bells: Coin[], jackpots: typeof jackpotStarts) {
  const jackpotWins: JackpotWin[] = bells.flatMap(bell =>
    bell.tier === 'mini' || bell.tier === 'minor' ? [{ tier: bell.tier, amount: bell.value }] : []);
  if (bells.some(bell => bell.tier === 'major')) jackpotWins.push({ tier: 'major', amount: jackpots.major });
  if (bells.filter(bell => bell.tier === 'grand').length >= bellBonus.grandBells) {
    jackpotWins.push({ tier: 'grand', amount: jackpots.grand });
  }
  const normalAmount = bells.reduce((sum, bell) => sum + (bell.tier ? 0 : bell.value), 0);
  const subtotal = jackpotWins.reduce((sum, win) => sum + win.amount, normalAmount);
  const bonusMultiplier = bells.length === 15 ? bellBonus.fullBoardMultiplier : 1;
  return { jackpotWins, bonusMultiplier, payoutAmount: subtotal * bonusMultiplier };
}

export function scoreGrid(grid: Tile[], stake: Stake) {
  return lines.flatMap((line, index) => {
    const positions = line.map((row, column) => row * 5 + column);
    const drawn = positions.map(position => grid[position].symbol);
    const candidates = symbols.flatMap(item => {
      if (!('payouts' in item)) return [];
      const end = drawn.findIndex(symbol => symbol !== item.id && symbol !== 'wild');
      const count = end === -1 ? 5 : end;
      if (count < 3) return [];
      return [{ positions: positions.slice(0, count), amount: item.payouts[count - 3] * amount(stake), line: index + 1 }];
    });
    return candidates.sort((a, b) => b.amount - a.amount).slice(0, 1);
  });
}

export function respin(bonus: Bonus): Bonus {
  let added = false;
  const drawCoin = coinDraw(bonus.stake, bonus.coins);
  const coins = bonus.coins.map(coin => {
    if (coin || randomInt(100) >= 13) return coin;
    added = true;
    return drawCoin();
  });
  return { ...bonus, coins, remaining: added ? bellBonus.respins : bonus.remaining - 1 };
}
