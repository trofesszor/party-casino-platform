import { BadRequestException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import { blackjackBets as bets } from '../casino/economy';
import { DATABASE } from '../database/database.module';
import { isBlackjack, scoreHand, shuffledShoe, total } from './blackjack-rules';
import type { Card } from './blackjack-rules';

type HeldBet = { id: number; playerId: number; amount: number };
type Hand = {
  round: number;
  revision: number;
  bet: HeldBet;
  cards: Card[];
  dealer: Card[];
  deck: Card[];
  outcome?: ReturnType<typeof scoreHand>;
};

@Injectable()
export class BlackjackService implements OnModuleInit {
  private readonly tables = new Map<number, Hand>();

  constructor(@Inject(DATABASE) private readonly database: { sqlite: DatabaseSync }) {}

  onModuleInit() {
    const held = this.database.sqlite.prepare('SELECT id, player_id AS playerId, amount FROM blackjack_holds').all() as HeldBet[];
    if (held.length) this.transaction(() => {
      for (const bet of held) this.release(bet, bet.amount, 'Blackjack · megszakadt kör visszatérítése');
    });
  }

  snapshot(playerId?: number) {
    const player = this.player(playerId);
    const hand = player && this.tables.get(playerId!);
    return {
      phase: hand ? hand.outcome ? 'results' : 'playing' : 'betting',
      round: hand?.round ?? 0,
      revision: hand?.revision ?? 0,
      allowedBets: bets,
      balance: player?.balance ?? null,
      dealer: hand ? hand.outcome ? hand.dealer : hand.dealer.slice(0, 1) : [],
      dealerHidden: Boolean(hand && !hand.outcome),
      dealerTotal: hand?.outcome ? total(hand.dealer) : null,
      hand: hand ? {
        cards: hand.cards, total: total(hand.cards), stake: hand.bet.amount,
        result: hand.outcome?.result ?? null, payout: hand.outcome?.payout ?? null,
        canDouble: !hand.outcome && hand.cards.length === 2 && (player?.balance ?? 0) >= hand.bet.amount,
      } : null,
    };
  }

  deal(playerId: number | undefined, previousRound: number | undefined, amount: number) {
    if (!playerId || !this.player(playerId)) throw new BadRequestException('A blackjackhez lépj be a neveddel.');
    const previous = this.tables.get(playerId);
    if (previous && !previous.outcome) throw new BadRequestException('Előbb fejezd be a folyamatban lévő kezet.');
    if (previousRound !== (previous?.round ?? 0)) throw new BadRequestException('Az asztal állapota közben megváltozott.');
    if (!bets.includes(amount)) throw new BadRequestException('Válassz érvényes CR-tétet.');

    const deck = shuffledShoe();
    const cards = [deck.pop()!];
    const dealer = [deck.pop()!];
    cards.push(deck.pop()!);
    dealer.push(deck.pop()!);
    const hand = this.transaction(() => {
      this.changeBalance(playerId, -amount, 'BLACKJACK_BET', 'Blackjack · tét');
      const id = Number(this.database.sqlite.prepare('INSERT INTO blackjack_holds (player_id, amount) VALUES (?, ?)').run(playerId, amount).lastInsertRowid);
      const next: Hand = { round: (previous?.round ?? 0) + 1, revision: 1, bet: { id, playerId, amount }, cards, dealer, deck };
      if (isBlackjack(cards) || isBlackjack(dealer)) this.finish(next);
      return next;
    });
    this.tables.set(playerId, hand);
  }

  play(playerId: number | undefined, round: number | undefined, revision: number | undefined, action: 'hit' | 'stand' | 'double') {
    const hand = playerId ? this.tables.get(playerId) : undefined;
    if (!playerId || !hand || hand.outcome || round !== hand.round || revision !== hand.revision) throw new BadRequestException('Most nincs játszható kéz.');
    if (action === 'hit') {
      const card = hand.deck[hand.deck.length - 1];
      const cards = [...hand.cards, card];
      if (total(cards) < 21) {
        hand.deck.pop();
        hand.cards.push(card);
        hand.revision++;
        return;
      }
    }
    if (action === 'double' && hand.cards.length !== 2) throw new BadRequestException('Duplázni csak két lappal lehet.');
    const next: Hand = { ...hand, revision: hand.revision + 1, bet: { ...hand.bet }, cards: [...hand.cards], dealer: [...hand.dealer], deck: [...hand.deck] };
    if (action !== 'stand') next.cards.push(next.deck.pop()!);
    this.transaction(() => {
      if (action === 'double') {
        this.changeBalance(playerId, -hand.bet.amount, 'BLACKJACK_BET', 'Blackjack · duplázás');
        this.database.sqlite.prepare('UPDATE blackjack_holds SET amount = amount + ? WHERE id = ?').run(hand.bet.amount, hand.bet.id);
        next.bet.amount *= 2;
      }
      this.finish(next);
    });
    this.tables.set(playerId, next);
  }

  finishOnExit(playerId: number) {
    const hand = this.tables.get(playerId);
    if (hand && !hand.outcome) this.play(playerId, hand.round, hand.revision, 'stand');
  }

  reset() {
    this.tables.clear();
  }

  private finish(hand: Hand) {
    if (total(hand.cards) <= 21 && !isBlackjack(hand.cards)) {
      while (total(hand.dealer) < 17) hand.dealer.push(hand.deck.pop()!);
    }
    const outcome = scoreHand(hand.cards, hand.dealer, hand.bet.amount);
    this.release(hand.bet, outcome.payout, 'Blackjack · kifizetés');
    hand.outcome = outcome;
  }

  private player(id?: number) {
    if (!id || !Number.isSafeInteger(id) || id < 1) return undefined;
    return this.database.sqlite.prepare('SELECT name, token_balance AS balance FROM players WHERE id = ?').get(id) as { name: string; balance: number } | undefined;
  }

  private changeBalance(id: number, amount: number, type: string, description: string) {
    const db = this.database.sqlite;
    const result = db.prepare('UPDATE players SET token_balance = token_balance + ? WHERE id = ? AND token_balance + ? >= 0')
      .run(amount, id, amount);
    if (!result.changes) throw new BadRequestException('Nincs elegendő CR a tétre.');
    const balance = this.player(id)!.balance;
    db.prepare('INSERT INTO token_transactions (player_id, amount, balance_after, type, description) VALUES (?, ?, ?, ?, ?)')
      .run(id, amount, balance, type, description);
  }

  private release(bet: HeldBet, payout: number, description: string) {
    const result = this.database.sqlite.prepare('DELETE FROM blackjack_holds WHERE id = ?').run(bet.id);
    if (result.changes && payout) this.changeBalance(bet.playerId, payout, payout === bet.amount ? 'BLACKJACK_RETURN' : 'BLACKJACK_WIN', description);
  }

  private transaction<T>(work: () => T): T {
    const db = this.database.sqlite;
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
