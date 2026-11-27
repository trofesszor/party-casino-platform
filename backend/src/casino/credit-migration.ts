import type { DatabaseSync } from 'node:sqlite';
import {
  creditScale, duelReward, partyCoupons, photoRewardDefaults, questSkipPrice, rouletteRoundLimit,
  scratchOdds, scratchTicketPrice, startingCredits, wheelSpinPrice,
} from './economy';

export function migratePartyCredits(sqlite: DatabaseSync) {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const migration = sqlite.prepare("INSERT OR IGNORE INTO casino_settings VALUES ('party_economy_100k','1')").run();
    if (migration.changes) applyPartyCredits(sqlite);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

function applyPartyCredits(sqlite: DatabaseSync) {
  sqlite.exec(`
    UPDATE players SET token_balance=token_balance*${creditScale};
    UPDATE token_transactions SET amount=amount*${creditScale}, balance_after=balance_after*${creditScale};
    UPDATE blackjack_holds SET amount=amount*${creditScale};
    UPDATE duels SET reward_amount=reward_amount*${creditScale};
    UPDATE token_photo_sessions SET reward_amount=reward_amount*${creditScale};
    UPDATE slot_jackpots SET grand=(grand*100+grand_carry)*10, major=(major*100+major_carry)*10,
      grand_carry=0, major_carry=0;
    UPDATE slot_player_state SET free_stake=json_set(free_stake, '$.denomination', json_extract(free_stake, '$.denomination')*${creditScale})
      WHERE json_valid(free_stake) AND json_type(free_stake, '$.denomination')='integer';
    ALTER TABLE casino_roulette_bets RENAME TO roulette_bets_before_100k;
    CREATE TABLE casino_roulette_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES casino_roulette_rounds(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      bet_type TEXT NOT NULL, bet_value TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
      payout_amount INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO casino_roulette_bets (id,round_id,player_id,bet_type,bet_value,amount,payout_amount,created_at)
      SELECT id,round_id,player_id,bet_type,bet_value,amount*${creditScale},payout_amount*${creditScale},created_at FROM roulette_bets_before_100k;
    DROP TABLE roulette_bets_before_100k;

    ALTER TABLE scratch_tickets RENAME TO scratch_tickets_before_100k;
    CREATE TABLE scratch_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      prize_amount INTEGER NOT NULL CHECK(prize_amount>=0), outcome_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UNSCRATCHED' CHECK(status IN ('UNSCRATCHED','REVEALED')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, revealed_at TEXT,
      legacy_prizes INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO scratch_tickets (id,player_id,prize_amount,outcome_json,status,created_at,revealed_at,legacy_prizes)
      SELECT id,player_id,prize_amount*${creditScale},outcome_json,status,created_at,revealed_at,1 FROM scratch_tickets_before_100k;
    DROP TABLE scratch_tickets_before_100k;
    CREATE INDEX idx_scratch_tickets_player ON scratch_tickets(player_id,status);
  `);

  const saveBonus = sqlite.prepare('UPDATE slot_player_state SET bonus_state=? WHERE player_id=?');
  const bonuses = sqlite.prepare("SELECT player_id AS id, bonus_state AS bonus FROM slot_player_state WHERE json_valid(bonus_state)")
    .all() as { id: number; bonus: string }[];
  for (const row of bonuses) {
    const bonus = JSON.parse(row.bonus);
    if (!Number.isSafeInteger(bonus?.stake?.denomination) || !Array.isArray(bonus.coins)) continue;
    bonus.stake.denomination *= creditScale;
    for (const coin of bonus.coins) if (Number.isSafeInteger(coin?.value)) coin.value *= creditScale;
    saveBonus.run(JSON.stringify(bonus), row.id);
  }

  const statsFields = ['$.tokensSpent', '$.tokensWon', '$.rouletteTokens', '$.scratchPrizes',
    '$.topWinner.amount', '$.leaderboardLeader.balance', '$.homelessPlayer.balance', '$.biggestWin.amount'];
  const scaleStats = sqlite.prepare(`
    UPDATE casino_sessions SET stats_json=json_set(stats_json, ?, json_extract(stats_json, ?)*${creditScale})
    WHERE json_valid(stats_json) AND json_type(stats_json, ?)='integer'
  `);
  for (const field of statsFields) scaleStats.run(field, field, field);

  const gameSetting = sqlite.prepare('UPDATE casino_settings SET setting_value=? WHERE setting_key=?');
  gameSetting.run(String(startingCredits), 'default_player_tokens');
  gameSetting.run(String(wheelSpinPrice), 'wheel_spin_cost');
  gameSetting.run(String(rouletteRoundLimit), 'roulette_max_bet');
  gameSetting.run(String(duelReward), 'duel_reward');
  const oddsKeys = ['scratch_loss_percent', 'scratch_10_percent', 'scratch_25_percent', 'scratch_50_percent', 'scratch_100_percent'];
  oddsKeys.forEach((key, index) => gameSetting.run(String(scratchOdds[index]), key));
  const photoSetting = sqlite.prepare('UPDATE token_photo_settings SET setting_value=? WHERE setting_key=?');
  photoSetting.run(String(photoRewardDefaults.balanceThreshold), 'balance_threshold');
  photoSetting.run(String(photoRewardDefaults.rewardAmount), 'reward_amount');
  photoSetting.run(String(photoRewardDefaults.cooldownMinutes), 'cooldown_minutes');
  photoSetting.run(String(photoRewardDefaults.dailyLimit), 'daily_limit');

  sqlite.exec(`UPDATE shop_items SET price=price*${creditScale}`);
  const setPrice = sqlite.prepare('UPDATE shop_items SET price=? WHERE item_key=?');
  setPrice.run(questSkipPrice, 'QUEST_SKIP');
  setPrice.run(scratchTicketPrice, 'SCRATCH_TICKET');
  for (const [key, , , price] of partyCoupons) setPrice.run(price, key);
  sqlite.prepare("UPDATE shop_items SET description=replace(description,'100 CR','50 000 CR') WHERE item_key='SCRATCH_TICKET'").run();
}
