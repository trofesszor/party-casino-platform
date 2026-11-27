<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api } from '../services/api';
import { socket } from '../services/socket';
import PlayerWallet from '../components/PlayerWallet.vue';
import type { SlotBonus, SlotProgressives, SlotSpin, SlotStake, SlotState, SlotTier, SlotTile } from '../types';

const playerId = Number(localStorage.getItem('party-player-id')) || 0;
const rules = ref<SlotState>();
const jackpots = ref<SlotProgressives>();
const available = ref<number | null>(null);
const denomination = ref(1);
const units = ref(1);
const bonus = ref<SlotBonus | null>(null);
const freeSpins = ref(0);
const freeStake = ref<SlotStake | null>(null);
const last = ref<SlotSpin | null>(null);
const error = ref('');
const busy = ref(false);
const rolling = ref<boolean[]>(Array(5).fill(false));
const columns = [0, 1, 2, 3, 4];
const rows = [0, 1, 2];
const labels: Record<SlotTile['symbol'], string> = {
  cherry: 'Cseresznye', lemon: 'Citrom', lime: 'Lime', grapes: 'Szőlő', orange: 'Narancs',
  crescent: 'Rubinhold', wild: 'Wild', scatter: 'Scatter', coin: 'Érme', empty: 'Üres mező',
};
const reelSymbols: SlotTile['symbol'][] = ['cherry', 'lemon', 'lime', 'grapes', 'orange', 'crescent', 'wild', 'scatter', 'coin'];
const reel = ref<SlotTile[]>(Array.from({ length: 15 }, (_, index) => ({ symbol: reelSymbols[(index * 2) % reelSymbols.length] })));
let mounted = false;
let ticker: ReturnType<typeof setInterval> | undefined;
let pendingJackpots: SlotProgressives | undefined;

const format = (value: number) => value.toLocaleString('hu-HU');
const effectiveStake = computed(() => bonus.value?.stake ?? freeStake.value ?? { denomination: denomination.value, units: units.value });
const bet = computed(() => effectiveStake.value.denomination * effectiveStake.value.units);
const stakesLocked = computed(() => busy.value || Boolean(bonus.value || freeStake.value));
const canSpin = computed(() => !busy.value && Boolean(rules.value && playerId && (bonus.value || freeSpins.value > 0 || (available.value ?? 0) >= bet.value)));
const winningPositions = computed(() => new Set(last.value?.wins.flatMap(win => win.positions) ?? []));
const lockedCoins = computed(() => bonus.value?.coins.filter(Boolean).length ?? 0);
const jackpotCards = computed<Array<{ tier: SlotTier; amount: number; progressive: boolean }>>(() => {
  if (!rules.value || !jackpots.value) return [];
  return [
    { tier: 'grand', amount: jackpots.value.grand, progressive: true },
    { tier: 'major', amount: jackpots.value.major, progressive: true },
    { tier: 'minor', amount: effectiveStake.value.denomination * rules.value.jackpotMultipliers.minor, progressive: false },
    { tier: 'mini', amount: effectiveStake.value.denomination * rules.value.jackpotMultipliers.mini, progressive: false },
  ];
});
const spinLabel = computed(() => busy.value ? 'Pörgetés…' : bonus.value ? 'Újrapörgetés' : freeSpins.value ? 'Ingyenpörgetés' : 'Pörgetés');

function bonusGrid(state: SlotBonus): SlotTile[] {
  return state.coins.map(coin => coin ? { symbol: 'coin', coin } : { symbol: 'empty' });
}
function refreshJackpots(values: SlotProgressives) {
  if (busy.value) pendingJackpots = values;
  else jackpots.value = values;
}
async function load() {
  if (busy.value) return;
  try {
    const state = await api.getSlots(playerId);
    if (!mounted || busy.value) return;
    rules.value = state;
    jackpots.value = state.jackpots;
    available.value = state.tokenBalance;
    bonus.value = state.bonus;
    freeSpins.value = state.freeSpins;
    freeStake.value = state.freeStake;
    if (state.bonus) reel.value = bonusGrid(state.bonus);
    error.value = '';
  } catch (cause) {
    if (mounted) error.value = cause instanceof Error ? cause.message : 'A slot betöltése sikertelen.';
  }
}
function displayTile(tile: SlotTile) {
  if (!tile.coin) return labels[tile.symbol];
  return tile.coin.tier ? `${tile.coin.tier.toUpperCase()} · ${format(tile.coin.value)} CR` : `${format(tile.coin.value)} CR`;
}
function tierTitle(tier: SlotTier) {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
async function animate(grid: SlotTile[], held: readonly boolean[]) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reel.value = grid;
    return;
  }
  for (const column of columns) {
    await new Promise<void>(resolve => setTimeout(resolve, column === 0 ? 290 : 115));
    if (!mounted) return;
    rolling.value[column] = false;
    for (const row of rows) {
      const index = row * 5 + column;
      if (!held[index]) reel.value[index] = grid[index];
    }
  }
}
async function spin() {
  if (!canSpin.value) return;
  const held = bonus.value?.coins.map(Boolean) ?? [];
  const before = reel.value.slice();
  busy.value = true;
  error.value = '';
  last.value = null;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rolling.value = columns.map(() => true);
    ticker = setInterval(() => {
      reel.value = reel.value.map((tile, index) => {
        if (!rolling.value[index % 5] || held[index]) return tile;
        return { symbol: reelSymbols[Math.floor(Math.random() * reelSymbols.length)] };
      });
    }, 84);
  }
  try {
    const reply = await api.spinSlots(playerId, effectiveStake.value);
    if (!mounted) return;
    await animate(reply.grid, held);
    if (!mounted) return;
    reel.value = reply.grid;
    bonus.value = reply.bonus;
    freeSpins.value = reply.freeSpins;
    freeStake.value = reply.freeStake;
    available.value = reply.tokenBalance;
    jackpots.value = pendingJackpots ?? reply.jackpots;
    last.value = reply;
    window.dispatchEvent(new Event('party-player-changed'));
  } catch (cause) {
    if (!mounted) return;
    reel.value = before;
    error.value = cause instanceof Error ? cause.message : 'A pörgetés sikertelen.';
  } finally {
    clearInterval(ticker);
    rolling.value = columns.map(() => false);
    if (pendingJackpots) jackpots.value = pendingJackpots;
    pendingJackpots = undefined;
    busy.value = false;
  }
}

onMounted(() => {
  mounted = true;
  socket.on('slots:jackpots', refreshJackpots);
  socket.on('connect', load);
  void load();
});
onUnmounted(() => {
  mounted = false;
  clearInterval(ticker);
  socket.off('slots:jackpots', refreshJackpots);
  socket.off('connect', load);
});
</script>

<template>
  <main class="mint-page">
    <div class="mint-shell">
      <header class="mint-top">
        <div><h1>Midnight <em>Mint</em></h1><p>5 tárcsa · {{ rules?.lines.length ?? 9 }} nyerővonal · CR</p></div>
        <div v-if="available !== null" class="mint-balance"><span>Egyenleg</span><strong>{{ format(available) }} CR</strong></div>
      </header>

      <p v-if="!rules && !error" class="mint-loading" role="status">Játék betöltése…</p>
      <div v-else-if="!rules" class="mint-loading"><p class="error">{{ error }}</p><button class="ghost" @click="load">Újrapróbálás</button></div>

      <template v-else>
        <section class="mint-jackpots" aria-label="Jackpotok">
          <article v-for="card in jackpotCards" :key="card.tier" :class="['mint-jackpot', card.tier]">
            <span>{{ tierTitle(card.tier) }}</span>
            <strong>{{ format(card.amount) }} <small>CR</small></strong>
            <small>{{ card.progressive ? 'Közös jackpot' : 'Tétegység alapján' }}</small>
          </article>
        </section>

        <section class="mint-machine" :class="{ 'mint-bonus': bonus }" aria-label="Midnight Mint játékgép">
          <header class="mint-machine-head">
            <h2>{{ bonus ? 'Érmegyűjtés' : 'Tárcsák' }}</h2>
            <span v-if="bonus">{{ lockedCoins }} / 15 érme · {{ bonus.remaining }} újrapörgetés</span>
            <span v-else-if="freeSpins">{{ freeSpins }} ingyenpörgetés</span>
          </header>
          <div class="mint-reels" :aria-busy="busy">
            <div v-for="column in columns" :key="column" class="mint-reel" :class="{ rolling: rolling[column] }">
              <div v-for="row in rows" :key="row" :class="['mint-cell', reel[row * 5 + column].coin?.tier, { 'mint-winning': winningPositions.has(row * 5 + column), 'mint-held': bonus?.coins[row * 5 + column] }]" role="img" :aria-label="displayTile(reel[row * 5 + column])">
                <span :class="['mint-symbol', 'symbol-' + reel[row * 5 + column].symbol]" aria-hidden="true"></span>
                <strong v-if="reel[row * 5 + column].coin" class="mint-coin-value">
                  <small v-if="reel[row * 5 + column].coin?.tier">{{ reel[row * 5 + column].coin?.tier }}</small>{{ format(reel[row * 5 + column].coin!.value) }} CR
                </strong>
              </div>
            </div>
          </div>
          <div class="mint-result" role="status" aria-live="polite">
            <template v-if="last">
              <strong>{{ last.winLabel }}</strong>
              <span v-if="last.payoutAmount">+{{ format(last.payoutAmount) }} CR</span>
              <span v-if="last.jackpotWins.length">{{ last.jackpotWins.map(win => tierTitle(win.tier) + ' ' + format(win.amount) + ' CR').join(' · ') }}</span>
            </template>
            <span v-else>{{ busy ? 'A tárcsák forognak…' : bonus ? 'A gyűjtött érmék a helyükön maradnak.' : 'Válassz tétegységet a pörgetéshez.' }}</span>
          </div>

          <form class="mint-controls" @submit.prevent="spin">
            <label>Tétegység (CR)
              <select :value="effectiveStake.denomination" @change="denomination = Number(($event.target as HTMLSelectElement).value)" :disabled="stakesLocked">
                <option v-for="value in rules.denominations" :key="value" :value="value">{{ value }} CR</option>
              </select>
            </label>
            <label>Tétszorzó
              <select :value="effectiveStake.units" @change="units = Number(($event.target as HTMLSelectElement).value)" :disabled="stakesLocked">
                <option v-for="value in rules.betUnits" :key="value" :value="value">{{ value }}×</option>
              </select>
            </label>
            <div class="mint-cost"><span>Fizetendő tét</span><strong>{{ bonus || freeSpins ? '0' : format(bet) }} CR</strong></div>
            <RouterLink v-if="!playerId" class="mint-spin" to="/">Csatlakozás</RouterLink>
            <button v-else class="mint-spin" type="submit" :disabled="!canSpin">{{ spinLabel }}</button>
          </form>
          <p v-if="error" class="error mint-message" role="alert">{{ error }}</p>
          <p v-else-if="playerId && !bonus && !freeSpins && available !== null && available < bet" class="mint-message">Ehhez a téthez nincs elég CR-ed.</p>
        </section>

        <PlayerWallet inline class="mint-wallet" />
        <details class="mint-rules">
          <summary>Játékszabályok és nyereménytábla</summary>
          <p>A tét a tétegység és a tétszorzó szorzata. A 9 nyerővonal balról jobbra fizet, legalább három egyező jelnél. A Wild a vonalszimbólumokat helyettesíti.</p>
          <p>Legalább 3 Scatter 5 ingyenpörgetést ad. Legalább 6 érme 3 újrapörgetéssel indítja az érmegyűjtést. Minden új érme ismét 3-ra állítja a számlálót. A lezáráskor 12–14 érme a Major, 15 érme a Grand jackpotot adja.</p>
          <div class="mint-paytable">
            <table><thead><tr><th>Szimbólum</th><th>3 egyező</th><th>4 egyező</th><th>5 egyező</th></tr></thead>
              <tbody><tr v-for="entry in rules.paytable" :key="entry.symbol"><th scope="row">{{ entry.label }}</th><td v-for="(payout, index) in entry.payouts" :key="index">{{ payout }}×</td></tr></tbody>
            </table>
          </div>
        </details>
      </template>
    </div>
  </main>
</template>
