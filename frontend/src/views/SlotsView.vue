<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api } from '../services/api';
import { socket } from '../services/socket';
import PlayerWallet from '../components/PlayerWallet.vue';
import type { SlotBonus, SlotCoin, SlotProgressives, SlotSpin, SlotStake, SlotState, SlotTier, SlotTile } from '../types';

const playerId = Number(localStorage.getItem('party-player-id')) || 0;
const rules = ref<SlotState>();
const jackpots = ref<SlotProgressives>();
const available = ref<number | null>(null);
const denomination = ref(1);
const units = ref(1);
const stakeDialog = ref<HTMLDialogElement>();
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
  crescent: 'Rubinhold', wild: 'Wild', scatter: 'Scatter', coin: 'Harang', empty: 'Üres mező',
};
const reelSymbols: SlotTile['symbol'][] = ['cherry', 'lemon', 'lime', 'grapes', 'orange', 'crescent', 'wild', 'scatter'];
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
const displayedBonus = computed(() => bonus.value ?? last.value?.finishedBonus ?? null);
const lockedBells = computed(() => displayedBonus.value?.coins.filter(Boolean).length ?? 0);
const grandCount = computed(() => displayedBonus.value?.coins.filter(bell => bell?.tier === 'grand').length ?? 0);
const majorCollected = computed(() => displayedBonus.value?.coins.some(bell => bell?.tier === 'major') ?? false);
const newBells = ref<number[]>([]);
const newBellCount = computed(() => newBells.value.length);
const bellStaggerMs = 38;
const bellFallMs = 610;
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const jackpotCards = computed<Array<{ tier: SlotTier; amount: number; progressive: boolean }>>(() => {
  if (!rules.value || !jackpots.value) return [];
  return [
    { tier: 'grand', amount: jackpots.value.grand, progressive: true },
    { tier: 'major', amount: jackpots.value.major, progressive: true },
    { tier: 'minor', amount: effectiveStake.value.denomination * rules.value.jackpotMultipliers.minor, progressive: false },
    { tier: 'mini', amount: effectiveStake.value.denomination * rules.value.jackpotMultipliers.mini, progressive: false },
  ];
});
const bonusPayout = computed(() => {
  const spin = last.value;
  if (!spin?.finishedBonus) return [];
  const regular = spin.finishedBonus.coins.flatMap(coin => coin && !coin.tier ? [coin] : []);
  const rows = [{ label: 'Normál harangok', count: regular.length, amount: regular.reduce((sum, coin) => sum + coin.value, 0) }];
  const byTier = new Map<SlotTier, { label: string; count: number; amount: number }>();
  for (const win of spin.jackpotWins) {
    const row = byTier.get(win.tier) ?? { label: tierTitle(win.tier), count: 0, amount: 0 };
    row.count++;
    row.amount += win.amount;
    byTier.set(win.tier, row);
  }
  return [...rows, ...byTier.values()].filter(row => row.count > 0);
});
const spinLabel = computed(() => busy.value ? 'Pörgetés…' : bonus.value ? 'Ingyenes újrapörgetés' : freeSpins.value ? 'Ingyenpörgetés' : 'Pörgetés');

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
function openStakePicker() {
  if (!stakesLocked.value) stakeDialog.value?.showModal();
}
function chooseStake(nextDenomination: number, nextUnits: number) {
  if (stakesLocked.value) return;
  denomination.value = nextDenomination;
  units.value = nextUnits;
  stakeDialog.value?.close();
}

function bellValue(bell: SlotCoin) {
  if (bell.tier === 'grand') return null;
  if (bell.tier !== 'major') return bell.value;
  return last.value?.jackpotWins.find(win => win.tier === 'major')?.amount ?? jackpots.value?.major ?? null;
}
function displayTile(tile: SlotTile) {
  if (!tile.coin) return labels[tile.symbol];
  const tier = tile.coin.tier ? ' · ' + tierTitle(tile.coin.tier) : '';
  const value = bellValue(tile.coin);
  return 'Harang' + tier + (value === null ? '' : ' · ' + format(value) + ' CR');
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
    await wait(column === 0 ? 290 : 115);
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
  const wasBonus = Boolean(bonus.value);
  const held = bonus.value?.coins.map(Boolean) ?? [];
  const before = reel.value.slice();
  busy.value = true;
  error.value = '';
  last.value = null;
  newBells.value = [];
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rolling.value = columns.map(() => true);
    ticker = setInterval(() => {
      reel.value = reel.value.map((tile, index) => {
        if (!rolling.value[index % 5] || held[index]) return tile;
        if (wasBonus) return { symbol: 'empty' };
        return { symbol: reelSymbols[Math.floor(Math.random() * reelSymbols.length)] };
      });
    }, 84);
  }
  try {
    const reply = await api.spinSlots(playerId, effectiveStake.value);
    if (!mounted) return;
    const feature = reply.bonus ?? reply.finishedBonus;
    const incoming = feature?.coins.flatMap((coin, index) => coin && !held[index] ? [index] : []) ?? [];
    const stagingGrid: SlotTile[] = reply.grid.map((tile, index) => incoming.includes(index) ? { symbol: 'empty' } : tile);
    await animate(stagingGrid, held);
    if (!mounted) return;
    reel.value = feature ? bonusGrid(feature) : reply.grid;
    newBells.value = incoming;
    bonus.value = reply.bonus;
    freeSpins.value = reply.freeSpins;
    freeStake.value = reply.freeStake;
    available.value = reply.tokenBalance;
    jackpots.value = pendingJackpots ?? reply.jackpots;
    last.value = reply;
    window.dispatchEvent(new Event('party-player-changed'));
    if (incoming.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await wait(bellFallMs + (incoming.length - 1) * bellStaggerMs);
    }
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

        <section class="mint-machine" :class="{ 'mint-bonus': displayedBonus }" aria-label="Midnight Mint játékgép">
          <header class="mint-machine-head">
            <h2>{{ displayedBonus ? 'Harangeső' : 'Tárcsák' }}</h2>
            <div v-if="displayedBonus" class="mint-bonus-progress">
              <span>{{ lockedBells }} / 15 harang</span>
              <span v-if="majorCollected" class="mint-major-progress">Major begyűjtve</span>
              <span>Grand {{ grandCount }} / {{ rules.bellBonus.grandBells }}</span>
            </div>
            <span v-else-if="freeSpins">{{ freeSpins }} ingyenpörgetés</span>
          </header>
          <div v-if="displayedBonus" class="mint-respin-meter" :class="{ 'mint-respin-refill': newBellCount && bonus }" aria-live="polite">
            <span>{{ bonus ? 'Hátralévő ingyenes körök' : 'Bónusz vége' }}</span>
            <ol :aria-label="(bonus?.remaining ?? 0) + ' ingyenes kör maradt'">
              <li v-for="index in rules.bellBonus.respins" :key="index" :class="{ 'mint-respin-lit': index <= (bonus?.remaining ?? 0) }" aria-hidden="true">{{ index }}</li>
            </ol>
          </div>
          <div class="mint-reels" :aria-busy="busy">
            <div v-for="column in columns" :key="column" class="mint-reel" :class="{ rolling: rolling[column] }">
              <div v-for="row in rows" :key="row" :class="['mint-cell', reel[row * 5 + column].coin?.tier, { 'mint-winning': !displayedBonus && winningPositions.has(row * 5 + column), 'mint-held': displayedBonus?.coins[row * 5 + column], 'mint-new-bell': newBells.includes(row * 5 + column), 'mint-captioned': reel[row * 5 + column].coin || reel[row * 5 + column].symbol === 'wild' }]" role="img" :aria-label="displayTile(reel[row * 5 + column])"
                :style="{ '--mint-fall-delay': Math.max(0, newBells.indexOf(row * 5 + column)) * bellStaggerMs + 'ms', '--mint-fall-duration': bellFallMs + 'ms' }">
                <span v-if="bonus && rolling[column] && !bonus.coins[row * 5 + column]" class="mint-respin-ghost"
                  :style="{ '--mint-respin-delay': row * 35 + column * 12 + 'ms' }" aria-hidden="true"></span>
                <span :class="['mint-symbol', 'symbol-' + reel[row * 5 + column].symbol]" aria-hidden="true"></span>
                <strong v-if="reel[row * 5 + column].coin" class="mint-tile-caption mint-coin-value">
                  <small v-if="reel[row * 5 + column].coin?.tier">{{ reel[row * 5 + column].coin?.tier }}</small>
                  <span v-if="bellValue(reel[row * 5 + column].coin!) !== null">{{ format(bellValue(reel[row * 5 + column].coin!)!) }} CR</span>
                </strong>
                <strong v-else-if="reel[row * 5 + column].symbol === 'wild'" class="mint-tile-caption mint-wild-caption">WILD</strong>
              </div>
            </div>
          </div>
          <div class="mint-result" role="status" aria-live="polite">
            <template v-if="last">
              <strong>{{ last.winLabel }}</strong>
              <span v-if="bonus && newBellCount">+{{ newBellCount }} harang · {{ rules.bellBonus.respins }} kör</span>
              <span v-else-if="bonus">Nem érkezett új harang.</span>
              <span v-if="last.payoutAmount && !last.finishedBonus">+{{ format(last.payoutAmount) }} CR</span>
              
            </template>
            <span v-else>{{ busy ? 'A tárcsák forognak…' : bonus ? 'A gyűjtött harangok a helyükön maradnak.' : 'Pörgetésre kész' }}</span>
          </div>

          <dl v-if="last?.finishedBonus" class="mint-payout-details" aria-label="A bónusznyeremény bontása">
            <div v-for="row in bonusPayout" :key="row.label">
              <dt>{{ row.label }} <small v-if="row.count > 1">×{{ row.count }}</small></dt>
              <dd>{{ format(row.amount) }} CR</dd>
            </div>
            <div v-if="last.bonusMultiplier > 1"><dt>Teljes tábla</dt><dd>×{{ last.bonusMultiplier }}</dd></div>
            <div class="mint-payout-total"><dt>Jóváírva összesen</dt><dd>{{ format(last.payoutAmount) }} CR</dd></div>
          </dl>

          <form class="mint-controls" @submit.prevent="spin">
            <div v-if="available !== null" class="mint-balance"><span>Egyenleg</span><strong>{{ format(available) }} CR</strong></div>
            <button class="mint-stake-trigger" type="button" aria-haspopup="dialog" :disabled="stakesLocked" @click="openStakePicker">
              <span>Tét <span aria-hidden="true">▾</span></span>
              <strong>{{ format(bet) }} CR</strong>
              <small>{{ effectiveStake.denomination }} CR × {{ effectiveStake.units }}</small>
            </button>
            <div v-if="bonus || freeSpins" class="mint-cost"><span>Fizetendő</span><strong>0 CR</strong></div>
            <RouterLink v-if="!playerId" class="mint-spin" to="/">Csatlakozás</RouterLink>
            <button v-else class="mint-spin" type="submit" :disabled="!canSpin"><span aria-hidden="true">⟳</span>{{ spinLabel }}</button>
          </form>

          <dialog ref="stakeDialog" class="mint-stake-dialog" aria-labelledby="mint-stake-title">
            <header class="mint-stake-heading">
              <h2 id="mint-stake-title">Tétválasztás</h2>
              <button class="mint-stake-close" type="button" aria-label="Bezárás" autofocus @click="stakeDialog?.close()">×</button>
            </header>
            <table class="mint-stake-table">
              <thead><tr>
                <th scope="col">Egység</th>
                <th v-for="factor in rules.betUnits" :key="factor" scope="col">{{ factor }}×</th>
              </tr></thead>
              <tbody>
                <tr v-for="unit in rules.denominations" :key="unit" :class="{ 'mint-stake-current-row': effectiveStake.denomination === unit }">
                  <th scope="row">{{ unit }} <small>CR</small></th>
                  <td v-for="factor in rules.betUnits" :key="factor">
                    <button class="mint-stake-option" type="button" :aria-label="unit + ' CR × ' + factor + ' = ' + unit * factor + ' CR'"
                      :aria-pressed="effectiveStake.denomination === unit && effectiveStake.units === factor" @click="chooseStake(unit, factor)">
                      {{ format(unit * factor) }}<small>CR</small>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <footer class="mint-stake-footer">
              <span v-if="available !== null">Egyenleg <strong>{{ format(available) }} CR</strong></span>
              <span>Kiválasztott tét <strong>{{ format(bet) }} CR</strong></span>
            </footer>
          </dialog>
          <p v-if="error" class="error mint-message" role="alert">{{ error }}</p>
          <p v-else-if="playerId && !bonus && !freeSpins && available !== null && available < bet" class="mint-message">Ehhez a téthez nincs elég CR-ed.</p>
        </section>

        <PlayerWallet inline class="mint-wallet" />
        <details class="mint-rules">
          <summary>Játékszabályok és nyereménytábla</summary>
          <p>A tét a tétegység és a tétszorzó szorzata. A 9 nyerővonal balról jobbra fizet, legalább három egyező jelnél. A Wild a vonalszimbólumokat helyettesíti.</p>
          <p>Legalább 3 Scatter 5 ingyenpörgetést ad. Legalább {{ rules.bellBonus.trigger }} harang indítja a Harangesőt {{ rules.bellBonus.respins }} díjmentes újrapörgetéssel ugyanazon a mezőn. Minden új harang visszaállítja a számlálót {{ rules.bellBonus.respins }}-ra. Ha három körön át nem érkezik új harang, a bónusz lezárul és jóváírja az összegyűlt értékeket. A Majorhoz egy Major harang, a Grandhoz {{ rules.bellBonus.grandBells }} Grand harang kell. Ha mind a 15 mező megtelik, a teljes bónusznyeremény, a megnyert jackpotokkal együtt, {{ rules.bellBonus.fullBoardMultiplier }}×-os szorzót kap.</p>
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
