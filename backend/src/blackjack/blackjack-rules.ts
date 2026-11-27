import { randomInt } from 'node:crypto';

const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const suits = ['♠', '♥', '♦', '♣'] as const;

export type Card = { rank: typeof ranks[number]; suit: typeof suits[number] };

export function shuffledShoe(): Card[] {
  const deck = suits.flatMap(suit => ranks.map(rank => ({ rank, suit })));
  const shoe = Array.from({ length: 6 }, () => deck).flat();
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export function total(cards: Card[]) {
  let aces = 0;
  let sum = 0;
  for (const { rank } of cards) {
    if (rank === 'A') aces++;
    sum += rank === 'A' ? 1 : Number(rank) || 10;
  }
  return aces > 0 && sum <= 11 ? sum + 10 : sum;
}

export function isBlackjack(cards: Card[]) {
  return cards.length === 2 && total(cards) === 21;
}

export function scoreHand(cards: Card[], dealer: Card[], stake: number) {
  const points = total(cards);
  const house = total(dealer);
  if (points > 21) return { result: 'bust', payout: 0 } as const;
  const natural = isBlackjack(cards);
  if (isBlackjack(dealer)) return natural
    ? { result: 'push', payout: stake } as const
    : { result: 'lost', payout: 0 } as const;
  if (natural) return { result: 'blackjack', payout: stake * 5 / 2 } as const;
  if (house > 21 || points > house) return { result: 'won', payout: stake * 2 } as const;
  if (points === house) return { result: 'push', payout: stake } as const;
  return { result: 'lost', payout: 0 } as const;
}
