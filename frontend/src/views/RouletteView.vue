<script setup lang="ts">
import GameAudioControl from '../components/GameAudioControl.vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useRouletteAudio } from '../services/game-audio';
import { api } from '../services/api';
import { rouletteDisplayBalance } from '../services/roulette-balance';
import { socket } from '../services/socket';
import type { RouletteBet, RouletteBetType, RouletteState } from '../types';
import PlayerWallet from '../components/PlayerWallet.vue';
import RouletteBetChip from '../components/RouletteBetChip.vue';
import RouletteWheel from '../components/RouletteWheel.vue';

const audio = useRouletteAudio();
const route = useRoute();
const isDisplay = computed(() => route.query.display === '1');
const playerId = Number(localStorage.getItem('party-player-id')) || 0;
const state = ref<RouletteState | null>(null);
const now = ref(Date.now());
const error = ref('');
const queued = ref<QueuedBet[]>([]);
let sending = false;
const balance = ref<number | null>(null);
let balanceRevision = 0;
let refreshAfterBets = false;
const chip = ref<number | 'all-in' | 'custom'>(500);
const customStake = ref<number | string>('');
const formatCredits = (amount: number) => amount.toLocaleString('hu-HU');
const landedRound = ref<number | null>(null);
let clock: ReturnType<typeof setInterval> | undefined;

type Choice = { type: RouletteBetType; value: string; label: string; color?: string };
type QueuedBet = { choice: Choice; amount: number; roundId: number };
type Combination = Choice & { type: 'SPLIT' | 'STREET' | 'CORNER' | 'SIX_LINE'; x: number; y: number };
const names: Record<RouletteBetType, string> = {
  NUMBER: 'Szám', SPLIT: 'Két szám', STREET: 'Három szám', CORNER: 'Négy szám', SIX_LINE: 'Hat szám',
  DOZEN: 'Tucat', COLUMN: 'Oszlop', COLOR: 'Szín', ODD_EVEN: 'Páros/páratlan', LOW_HIGH: 'Számtartomány',
};
const outside: Choice[] = [
  { type: 'LOW_HIGH', value: 'low', label: '1–18' },
  { type: 'ODD_EVEN', value: 'even', label: 'Páros' },
  { type: 'COLOR', value: 'red', label: 'Piros', color: 'red' },
  { type: 'COLOR', value: 'black', label: 'Fekete', color: 'black' },
  { type: 'ODD_EVEN', value: 'odd', label: 'Páratlan' },
  { type: 'LOW_HIGH', value: 'high', label: '19–36' },
];
const dozens: Choice[] = [1, 2, 3].map(n => ({
  type: 'DOZEN', value: String(n), label: `${(n - 1) * 12 + 1}–${n * 12}`,
}));
const columns: Choice[] = [3, 2, 1].map(n => ({ type: 'COLUMN', value: String(n), label: `${n}. oszlop` }));
const standardChoices = [...outside, ...dozens, ...columns];
const chipValues = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const numberList = Array.from({ length: 36 }, (_, index) => {
  const number = index + 1;
  return {
    type: 'NUMBER', value: String(number), label: String(number), color: color(number),
    column: Math.floor(index / 3) + 1, row: 3 - index % 3,
  } as const;
});
const zero: Choice = { type: 'NUMBER', value: '0', label: '0', color: 'green' };
const combinations: Combination[] = [];
const edge: Combination[] = [];
for (let column = 0; column < 12; column++) {
  const first = column * 3 + 1;
  edge.push(combination('STREET', [first, first + 1, first + 2], column + .5, 0));
  if (column < 11) edge.push(combination('SIX_LINE', [first, first + 1, first + 2, first + 3, first + 4, first + 5], column + 1, 0));
  for (let index = 0; index < 3; index++) {
    const number = first + index;
    if (index < 2) combinations.push(combination('SPLIT', [number, number + 1], column + .5, 2 - index));
    if (column < 11) combinations.push(combination('SPLIT', [number, number + 3], column + 1, 2.5 - index));
    if (column < 11 && index < 2) combinations.push(combination('CORNER', [number, number + 1, number + 3, number + 4], column + 1, 2 - index));
  }
}

const round = computed(() => state.value?.currentRound);
const myBets = computed(() => state.value?.bets.filter(bet => bet.playerId === playerId) ?? []);
const visibleBalance = computed(() => balance.value === null ? null : Math.max(0,
  balance.value - queued.value.reduce((sum, bet) => sum + bet.amount, 0)));
watch(visibleBalance, value => { rouletteDisplayBalance.value = value; }, { immediate: true });

const selectedStake = computed(() => {
  if (chip.value === 'all-in') return visibleBalance.value ?? 0;
  if (chip.value === 'custom') return Number(customStake.value);
  return chip.value;
});
const totalStake = computed(() => myBets.value.reduce((sum, bet) => sum + bet.amount, 0));
const secondsLeft = computed(() => Math.max(0, Math.ceil((Date.parse(round.value?.bettingEndsAt ?? '') - now.value) / 1000)));
const accepting = computed(() => round.value?.status === 'BETTING' && secondsLeft.value > 0);
const resultVisible = computed(() => round.value?.status === 'COMPLETED' && round.value.roundNumber === landedRound.value);
const remaining = computed(() => Math.max(0, Math.min(100, secondsLeft.value * 100 / (state.value?.bettingSeconds || 20))));
const boardStakes = computed(() => {
  const stakes = new Map<string, { amount: number; pending: boolean }>();
  for (const { betType, betValue, amount } of myBets.value) {
    const key = betKey(betType, betValue);
    stakes.set(key, { amount: (stakes.get(key)?.amount ?? 0) + amount, pending: false });
  }
  for (const bet of queued.value) {
    if (bet.roundId !== round.value?.id) continue;
    const key = betKey(bet.choice.type, bet.choice.value);
    const stake = stakes.get(key);
    if (stake) {
      stake.pending = true;
    } else {
      stakes.set(key, { amount: bet.amount, pending: true });
    }
  }
  return stakes;
});

function betKey(type: RouletteBetType, value: string) {
  return type + ':' + value;
}
function boardStake(choice: Choice) {
  return boardStakes.value.get(betKey(choice.type, choice.value));
}

function combination(type: Combination['type'], numbers: number[], column: number, row: number): Combination {
  return { type, value: numbers.join(','), label: numbers.join(' + '), x: column * 100 / 12, y: row * 100 / 3 };
}

function color(number: number) {
  return number === 0 ? 'green' : red.has(number) ? 'red' : 'black';
}
function describe(bet: RouletteBet) {
  const standard = standardChoices.find(choice => choice.type === bet.betType && choice.value === bet.betValue);
  return `${names[bet.betType]} · ${standard?.label ?? bet.betValue.split(',').join(' + ')}`;
}
async function refreshBalance() {
  if (!playerId) return;
  if (sending) {
    refreshAfterBets = true;
    return;
  }
  const revision = ++balanceRevision;
  try {
    const next = await api.getPlayerBalance(playerId);
    if (revision === balanceRevision && !sending) balance.value = next.tokenBalance;
  } catch { /* The existing balance stays visible during a network interruption. */ }
}
function onState(payload: RouletteState) {
  const previous = round.value;
  state.value = payload;
  const current = payload.currentRound;
  audio.changed(previous, current);
  if (current?.status !== 'COMPLETED' || (previous?.id === current.id && previous.status === 'COMPLETED')) return;
  void refreshBalance();
  if (previous?.id === current.id && previous.status === 'BETTING' && !isDisplay.value) {
    void nextTick(() => {
      if (round.value?.id !== current.id || round.value.status !== 'COMPLETED') return;
      const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }
}
function onLanded(number: number) {
  landedRound.value = number;
  audio.landed(round.value, number, state.value?.winners.some(bet => bet.playerId === playerId));
}
function placeBet(choice: Choice) {
  if (!accepting.value || !playerId || !round.value) return;
  const amount = selectedStake.value;
  if (!Number.isSafeInteger(amount) || amount < 1) {
    error.value = chip.value === 'all-in' ? 'Nincs feltehető CR az egyenlegeden.' : 'Adj meg pozitív egész CR-tétet.';
    return;
  }
  if (visibleBalance.value === null || amount > visibleBalance.value) {
    error.value = 'Nincs elegendő CR az egyenlegeden.';
    return;
  }
  error.value = '';
  balanceRevision++;
  queued.value.push({ choice, amount, roundId: round.value.id });
  if (chip.value === 'all-in') chip.value = chipValues[0];
  void sendBets();
}
async function sendBets() {
  if (sending) return;
  sending = true;
  try {
    while (queued.value.length) {
      const bet = queued.value[0];
      try {
        if (!accepting.value || round.value?.id !== bet.roundId) throw new Error('Ez a rulettkör már véget ért.');
        const result = await api.placeRouletteBet(playerId, bet.choice.type, bet.choice.value, bet.amount, bet.roundId);
        if (typeof result.tokenBalance === 'number') balance.value = result.tokenBalance;
        else refreshAfterBets = true;
        if (round.value?.id === bet.roundId && round.value.status === 'BETTING' && result.bets.length >= (state.value?.bets.length ?? 0)) onState(result);
      } catch (cause) {
        refreshAfterBets = true;
        error.value = cause instanceof Error ? cause.message : 'A tét elhelyezése sikertelen.';
      } finally {
        queued.value.shift();
      }
    }
  } finally {
    sending = false;
    if (refreshAfterBets) {
      refreshAfterBets = false;
      void refreshBalance();
    }
  }
}
function loadState() {
  void refreshBalance();
  api.getRouletteState().then(onState).catch(cause => { error.value = cause.message; });
}
onMounted(() => {
  socket.on('roulette:changed', onState);
  socket.on('connect', loadState);
  loadState();
  clock = setInterval(() => { now.value = Date.now(); }, 200);
});
onUnmounted(() => {
  rouletteDisplayBalance.value = null;
  socket.off('roulette:changed', onState);
  socket.off('connect', loadState);
  clearInterval(clock);
});
</script>

<template>
  <main class="roulette-studio">
    <div v-if="round" class="roulette-studio-shell">
      <header class="studio-heading">
        <div><p>Party Casino / Játékterem</p><h1>Európai rulett</h1></div>
        <GameAudioControl />
        <div class="studio-clock" :class="{ 'studio-closing': accepting && secondsLeft <= 5 }">
          <div><span>{{ accepting ? 'Fogadás nyitva' : resultVisible ? 'Eredmény' : 'Tétek lezárva' }}</span><small>Kör {{ round.roundNumber }}</small></div>
          <strong>{{ accepting ? secondsLeft + ' mp' : '–' }}</strong>
          <div class="studio-timer" role="presentation"><span :style="{ width: (accepting ? remaining : 0) + '%' }"></span></div>
        </div>
      </header>

      <div class="studio-columns" :class="{ 'studio-display': isDisplay }">
        <section class="studio-observation" aria-label="Kerék és eredmények">
          <RouletteWheel :result-number="round.resultNumber" :previous-result-number="state?.history[0]?.resultNumber"
            :round-number="round.roundNumber" :spinning="round.status === 'COMPLETED'" :completed-at="round.completedAt"
            :result-seconds="state?.resultSeconds" @landed="onLanded" />
          <div class="studio-history">
            <h2>Előző körök</h2>
            <ol v-if="state?.history.length">
              <li v-for="item in state.history" :key="item.roundNumber" :class="color(item.resultNumber)" :title="'Kör ' + item.roundNumber">{{ item.resultNumber }}</li>
            </ol>
            <p v-else>Az első nyerőszámra várunk.</p>
          </div>
        </section>

        <section v-if="!isDisplay" class="studio-console" aria-label="Fogadóasztal">
          <div class="studio-console-heading"><h2>Fogadóasztal</h2><span>{{ myBets.length }} tét · {{ formatCredits(totalStake) }} CR</span></div>
          <div class="studio-chipline" role="group" aria-label="Zsetonérték">
            <span>Zseton</span>
            <button v-for="value in chipValues" :key="value" type="button" :aria-pressed="value === chip" :aria-label="value + ' CR'"
              @click="chip = value">{{ value < 1000 ? value : (value / 1000).toLocaleString('hu-HU') + 'k' }}</button>
            <button v-if="playerId" class="studio-all-in" type="button" :aria-pressed="chip === 'all-in'"
              :disabled="!accepting || !visibleBalance" @click="chip = 'all-in'">
              All-in <span>{{ formatCredits(visibleBalance ?? 0) }} CR</span>
            </button>
            <label v-if="playerId" class="studio-custom-bet">
              <span>Egyéni tét (CR)</span>
              <input v-model.number="customStake" type="number" inputmode="numeric" min="1" step="1"
                placeholder="Egyéni tét" @focus="chip = 'custom'" @input="chip = 'custom'">
            </label>
            <RouterLink v-if="!playerId" class="studio-cta" to="/">Csatlakozás</RouterLink>
          </div>
          <p v-if="error" class="error studio-error" role="alert">{{ error }}</p>
          <fieldset class="studio-fields" :disabled="!accepting || !playerId">
            <legend class="layout-visually-hidden">Fogadás kiválasztása</legend>
            <p class="studio-instruction" id="roulette-board-help">
              {{ chip === 'all-in'
                ? 'All-in kiválasztva. A következő koppintással a teljes szabad egyenlegedet felteszed arra a mezőre.'
                : 'A kiválasztott tét a mezőre koppintva azonnal felkerül. A határokon és a jelölőkön kombinációkra tehetsz.' }}
            </p>
            <div class="studio-board-frame" role="region" tabindex="0" aria-label="Európai rulettasztal" aria-describedby="roulette-board-help">
              <div class="studio-table">
                <button class="studio-board-cell studio-zero green" type="button" @click="placeBet(zero)">0<RouletteBetChip :stake="boardStake(zero)" /></button>
                <div class="studio-inner-bets">
                  <div class="studio-number-board" aria-label="Számmezők">
                    <button v-for="number in numberList" :key="number.value" type="button" class="studio-board-cell"
                      :class="number.color"
                      :style="{ '--table-column': number.column, '--table-row': number.row, '--vertical-column': 4 - number.row }"
                      @click="placeBet(number)">{{ number.label }}<RouletteBetChip :stake="boardStake(number)" /></button>
                  </div>
                  <button v-for="mark in combinations" :key="mark.type + mark.value" type="button" class="studio-bet-marker"
                    :class="mark.type.toLowerCase()" :style="{ '--table-x': mark.x + '%', '--table-y': mark.y + '%', '--vertical-x': 100 - mark.y + '%' }"
                    :aria-label="names[mark.type] + ' · ' + mark.label" :title="names[mark.type] + ' · ' + mark.label"
                    @click="placeBet(mark)"><span v-if="!boardStake(mark)" class="studio-marker-dot" aria-hidden="true"></span><RouletteBetChip :stake="boardStake(mark)" /></button>
                </div>
                <div class="studio-column-bets" role="group" aria-label="Oszlopfogadások">
                  <button v-for="choice in columns" :key="choice.value" type="button" class="studio-board-cell"
                    :style="{ '--vertical-column': Number(choice.value) }" @click="placeBet(choice)">{{ choice.label }}<RouletteBetChip :stake="boardStake(choice)" /></button>
                </div>
                <div class="studio-edge-bets" role="group" aria-label="Három és hat szám">
                  <button v-for="mark in edge" :key="mark.type + mark.value" type="button" class="studio-bet-marker"
                    :class="mark.type.toLowerCase()" :style="{ '--table-x': mark.x + '%' }"
                    :aria-label="names[mark.type] + ' · ' + mark.label" :title="names[mark.type] + ' · ' + mark.label"
                    @click="placeBet(mark)"><span v-if="!boardStake(mark)" class="studio-marker-dot" aria-hidden="true">{{ mark.type === 'STREET' ? '3' : '6' }}</span><RouletteBetChip :stake="boardStake(mark)" /></button>
                </div>
                <div class="studio-dozen-bets" role="group" aria-label="Tucatfogadások">
                  <button v-for="choice in dozens" :key="choice.value" type="button" class="studio-board-cell"
                    @click="placeBet(choice)">{{ choice.label }}<RouletteBetChip :stake="boardStake(choice)" /></button>
                </div>
                <div class="studio-outside-bets" role="group" aria-label="Külső fogadások">
                  <button v-for="choice in outside" :key="choice.value" type="button" class="studio-board-cell" :class="choice.color"
                    @click="placeBet(choice)">{{ choice.label }}<RouletteBetChip :stake="boardStake(choice)" /></button>
                </div>
              </div>
            </div>
          </fieldset>

        </section>
      </div>

      <div class="studio-footer">
        <div v-if="playerId && !isDisplay" class="studio-wallet"><span>Egyenleg <strong>{{ visibleBalance === null ? '–' : visibleBalance.toLocaleString('hu-HU') + ' CR' }}</strong></span><PlayerWallet inline /></div>
        <details class="studio-log">
          <summary>Asztalon lévő tétek <b>{{ state?.bets.length || 0 }}</b></summary>
          <p v-if="!state?.bets.length">Még nincs tét ebben a körben.</p>
          <div v-for="bet in state?.bets" :key="bet.id" class="studio-bet-row">
            <strong>{{ bet.playerName }}</strong><span>{{ describe(bet) }}</span><b>{{ formatCredits(bet.amount) }} CR</b>
            <span v-if="resultVisible && state?.winners.some(win => win.id === bet.id)" class="studio-winner">Nyert</span>
          </div>
        </details>
        <details v-if="!isDisplay" class="studio-log">
          <summary>Saját téteim <b>{{ myBets.length }}</b></summary>
          <p v-if="!myBets.length">Még nem adtál le tétet ebben a körben.</p>
          <div v-for="bet in myBets" :key="bet.id" class="studio-bet-row"><span>{{ describe(bet) }}</span><b>{{ formatCredits(bet.amount) }} CR</b></div>
        </details>
      </div>
    </div>
    <p v-else class="studio-loading" role="status">{{ error || 'Rulett betöltése…' }}</p>
  </main>
</template>
