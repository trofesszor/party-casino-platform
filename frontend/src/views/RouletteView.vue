<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { RouletteBet, RouletteBetType, RouletteState } from '../types';
import PlayerWallet from '../components/PlayerWallet.vue';
import RouletteWheel from '../components/RouletteWheel.vue';

const route = useRoute();
const isDisplay = computed(() => route.query.display === '1');
const playerId = Number(localStorage.getItem('party-player-id')) || 0;
const state = ref<RouletteState | null>(null);
const now = ref(Date.now());
const error = ref('');
const busy = ref(false);
const balance = ref(0);
const chip = ref(1);
const selection = ref<Choice | null>(null);
const landedRound = ref<number | null>(null);
let clock: ReturnType<typeof setInterval> | undefined;

type Choice = { type: RouletteBetType; value: string; label: string; color?: string };
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
const chips = [1, 5, 10, 25, 100];
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
const totalStake = computed(() => myBets.value.reduce((sum, bet) => sum + bet.amount, 0));
const secondsLeft = computed(() => Math.max(0, Math.ceil((Date.parse(round.value?.bettingEndsAt ?? '') - now.value) / 1000)));
const accepting = computed(() => round.value?.status === 'BETTING' && secondsLeft.value > 0);
const resultVisible = computed(() => round.value?.status === 'COMPLETED' && round.value.roundNumber === landedRound.value);
const remaining = computed(() => Math.max(0, Math.min(100, secondsLeft.value * 100 / (state.value?.bettingSeconds || 20))));
const selectedNumbers = computed(() => {
  const choice = selection.value;
  if (!choice || standardChoices.some(item => item.type === choice.type)) return [];
  return choice.value.split(',').map(Number);
});

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
function clearSelection() {
  selection.value = null;
}
function selected(choice: Choice) {
  return selection.value?.type === choice.type && selection.value.value === choice.value;
}
async function refreshBalance() {
  if (playerId) balance.value = (await api.getPlayerBalance(playerId)).tokenBalance;
}
function onState(payload: RouletteState) {
  state.value = payload;
  refreshBalance().catch(() => {});
}
async function submit() {
  const choice = selection.value;
  if (!choice || !accepting.value || !playerId || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    onState(await api.placeRouletteBet(playerId, choice.type, choice.value, chip.value));
    clearSelection();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'A tét elhelyezése sikertelen.';
  } finally {
    busy.value = false;
  }
}
function loadState() {
  api.getRouletteState().then(onState).catch(cause => { error.value = cause.message; });
}
onMounted(() => {
  socket.on('roulette:changed', onState);
  socket.on('connect', loadState);
  loadState();
  clock = setInterval(() => { now.value = Date.now(); }, 200);
});
onUnmounted(() => {
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
            :result-seconds="state?.resultSeconds" @landed="landedRound = $event" />
          <div class="studio-history">
            <h2>Előző körök</h2>
            <ol v-if="state?.history.length">
              <li v-for="item in state.history" :key="item.roundNumber" :class="color(item.resultNumber)" :title="'Kör ' + item.roundNumber">{{ item.resultNumber }}</li>
            </ol>
            <p v-else>Az első nyerőszámra várunk.</p>
          </div>
        </section>

        <section v-if="!isDisplay" class="studio-console" aria-label="Fogadóasztal">
          <div class="studio-console-heading"><h2>Fogadóasztal</h2><span>{{ myBets.length }} tét · {{ totalStake }} CR</span></div>
          <fieldset class="studio-fields" :disabled="busy || !accepting">
            <legend class="layout-visually-hidden">Fogadás kiválasztása</legend>
            <p class="studio-instruction" id="roulette-board-help">
              A mező közepe egy szám, a határ két szám, a sarok négy szám. Az alsó jelölők három- és hatszámos tétek.
            </p>
            <p class="studio-board-pan">A teljes asztal oldalra húzható.</p>
            <div class="studio-board-scroll" role="region" tabindex="0" aria-label="Európai rulettasztal" aria-describedby="roulette-board-help">
              <div class="studio-table">
                <button class="studio-board-cell studio-zero green" type="button" :aria-pressed="selected(zero)" @click="selection = zero">0</button>
                <div class="studio-inner-bets">
                  <div class="studio-number-board" aria-label="Számmezők">
                    <button v-for="number in numberList" :key="number.value" type="button" class="studio-board-cell"
                      :class="[number.color, { 'studio-covered-number': selectedNumbers.includes(Number(number.value)) }]"
                      :style="{ gridColumn: number.column, gridRow: number.row }"
                      :aria-pressed="selected(number)" @click="selection = number">{{ number.label }}</button>
                  </div>
                  <button v-for="mark in combinations" :key="mark.type + mark.value" type="button" class="studio-bet-marker"
                    :class="mark.type.toLowerCase()" :style="{ left: mark.x + '%', top: mark.y + '%' }"
                    :aria-label="names[mark.type] + ' · ' + mark.label" :title="names[mark.type] + ' · ' + mark.label"
                    :aria-pressed="selected(mark)" @click="selection = mark"><span aria-hidden="true"></span></button>
                </div>
                <div class="studio-column-bets" role="group" aria-label="Oszlopfogadások">
                  <button v-for="choice in columns" :key="choice.value" type="button" class="studio-board-cell"
                    :aria-pressed="selected(choice)" @click="selection = choice">{{ choice.label }}</button>
                </div>
                <div class="studio-edge-bets" role="group" aria-label="Három és hat szám">
                  <button v-for="mark in edge" :key="mark.type + mark.value" type="button" class="studio-bet-marker"
                    :class="mark.type.toLowerCase()" :style="{ left: mark.x + '%' }"
                    :aria-label="names[mark.type] + ' · ' + mark.label" :title="names[mark.type] + ' · ' + mark.label"
                    :aria-pressed="selected(mark)" @click="selection = mark"><span aria-hidden="true">{{ mark.type === 'STREET' ? '3' : '6' }}</span></button>
                </div>
                <div class="studio-dozen-bets" role="group" aria-label="Tucatfogadások">
                  <button v-for="choice in dozens" :key="choice.value" type="button" class="studio-board-cell"
                    :aria-pressed="selected(choice)" @click="selection = choice">{{ choice.label }}</button>
                </div>
                <div class="studio-outside-bets" role="group" aria-label="Külső fogadások">
                  <button v-for="choice in outside" :key="choice.value" type="button" class="studio-board-cell" :class="choice.color"
                    :aria-pressed="selected(choice)" @click="selection = choice">{{ choice.label }}</button>
                </div>
              </div>
            </div>
          </fieldset>

          <div class="studio-ticket">
            <div class="studio-chipline" role="group" aria-label="Zsetonérték">
              <span>Tét</span>
              <button v-for="value in chips" :key="value" type="button" :aria-pressed="value === chip" :aria-label="value + ' CR'"
                :disabled="busy" @click="chip = value">{{ value }}</button>
            </div>
            <div class="studio-submit">
              <div class="studio-selection"><small>Kijelölés</small><strong>{{ selection ? names[selection.type] + ' · ' + selection.label : 'Válassz fogadást' }}</strong></div>
              <button v-if="selection" type="button" class="studio-clear" :disabled="busy" @click="clearSelection">Törlés</button>
              <RouterLink v-if="!playerId" class="studio-cta" to="/">Csatlakozás</RouterLink>
              <button v-else class="studio-cta" type="button" :disabled="busy || !accepting || !selection" @click="submit">{{ busy ? 'Elhelyezés…' : chip + ' CR elhelyezése' }}</button>
            </div>
            <p v-if="error" class="error studio-error" role="alert">{{ error }}</p>
          </div>
        </section>
      </div>

      <div class="studio-footer">
        <div v-if="playerId && !isDisplay" class="studio-wallet"><span>Egyenleg <strong>{{ balance.toLocaleString('hu-HU') }} CR</strong></span><PlayerWallet inline /></div>
        <details class="studio-log">
          <summary>Asztalon lévő tétek <b>{{ state?.bets.length || 0 }}</b></summary>
          <p v-if="!state?.bets.length">Még nincs tét ebben a körben.</p>
          <div v-for="bet in state?.bets" :key="bet.id" class="studio-bet-row">
            <strong>{{ bet.playerName }}</strong><span>{{ describe(bet) }}</span><b>{{ bet.amount }} CR</b>
            <span v-if="resultVisible && state?.winners.some(win => win.id === bet.id)" class="studio-winner">Nyert</span>
          </div>
        </details>
        <details v-if="!isDisplay" class="studio-log">
          <summary>Saját téteim <b>{{ myBets.length }}</b></summary>
          <p v-if="!myBets.length">Még nem adtál le tétet ebben a körben.</p>
          <div v-for="bet in myBets" :key="bet.id" class="studio-bet-row"><span>{{ describe(bet) }}</span><b>{{ bet.amount }} CR</b></div>
        </details>
      </div>
    </div>
    <p v-else class="studio-loading" role="status">{{ error || 'Rulett betöltése…' }}</p>
  </main>
</template>
