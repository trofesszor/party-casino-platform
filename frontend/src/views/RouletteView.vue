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
const mode = ref<'numbers' | 'combination' | 'outside'>('numbers');
const combinationType = ref<Combination>('SPLIT');
const anchor = ref<number | null>(null);
const selection = ref<Choice | null>(null);
const landedRound = ref<number | null>(null);
let clock: ReturnType<typeof setInterval> | undefined;

type Choice = { type: RouletteBetType; value: string; label: string; color?: string };
type Combination = 'SPLIT' | 'STREET' | 'CORNER' | 'SIX_LINE';
const combinations: Array<{ type: Combination; label: string }> = [
  { type: 'SPLIT', label: '2 szám' },
  { type: 'STREET', label: '3 szám' },
  { type: 'CORNER', label: '4 szám' },
  { type: 'SIX_LINE', label: '6 szám' },
];
const sections: Array<{ id: typeof mode.value; label: string }> = [
  { id: 'numbers', label: 'Számok' },
  { id: 'combination', label: 'Kombinációk' },
  { id: 'outside', label: 'Külső tétek' },
];
const names: Record<RouletteBetType, string> = {
  NUMBER: 'Szám', SPLIT: 'Két szám', STREET: 'Három szám', CORNER: 'Négy szám', SIX_LINE: 'Hat szám',
  DOZEN: 'Tucat', COLUMN: 'Oszlop', COLOR: 'Szín', ODD_EVEN: 'Páros/páratlan', LOW_HIGH: 'Számtartomány',
};
const outsideGroups: Array<{ label: string; choices: Choice[] }> = [
  { label: 'Színek és tartományok', choices: [
    { type: 'COLOR', value: 'red', label: 'Piros', color: 'red' },
    { type: 'COLOR', value: 'black', label: 'Fekete', color: 'black' },
    { type: 'ODD_EVEN', value: 'even', label: 'Páros' },
    { type: 'ODD_EVEN', value: 'odd', label: 'Páratlan' },
    { type: 'LOW_HIGH', value: 'low', label: '1–18' },
    { type: 'LOW_HIGH', value: 'high', label: '19–36' },
  ] },
  { label: 'Tucat', choices: [
    { type: 'DOZEN', value: '1', label: '1–12' },
    { type: 'DOZEN', value: '2', label: '13–24' },
    { type: 'DOZEN', value: '3', label: '25–36' },
  ] },
  { label: 'Oszlop', choices: [1, 2, 3].map(n => ({ type: 'COLUMN', value: String(n), label: `${n}. oszlop` })) },
];
const chips = [1, 5, 10, 25, 100];
const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const numberList = Array.from({ length: 36 }, (_, index) => index + 1);

const round = computed(() => state.value?.currentRound);
const myBets = computed(() => state.value?.bets.filter(bet => bet.playerId === playerId) ?? []);
const totalStake = computed(() => myBets.value.reduce((sum, bet) => sum + bet.amount, 0));
const secondsLeft = computed(() => Math.max(0, Math.ceil((Date.parse(round.value?.bettingEndsAt ?? '') - now.value) / 1000)));
const accepting = computed(() => round.value?.status === 'BETTING' && secondsLeft.value > 0);
const resultVisible = computed(() => round.value?.status === 'COMPLETED' && round.value.roundNumber === landedRound.value);
const remaining = computed(() => Math.max(0, Math.min(100, secondsLeft.value * 100 / (state.value?.bettingSeconds || 20))));
const matchingGroups = computed(() => {
  const selected = anchor.value;
  return selected === null ? [] : groupsFor(combinationType.value).filter(numbers => numbers.includes(selected));
});
const selectedNumbers = computed(() => selection.value && mode.value !== 'outside'
  ? selection.value.value.split(',').map(Number)
  : []);

function groupsFor(type: Combination) {
  const groups: number[][] = [];
  for (let row = 0; row < 12; row++) {
    const first = row * 3 + 1;
    if (type === 'STREET') groups.push([first, first + 1, first + 2]);
    if (type === 'SIX_LINE' && row < 11) groups.push([first, first + 1, first + 2, first + 3, first + 4, first + 5]);
    for (let column = 0; column < 3; column++) {
      const n = first + column;
      if (type === 'SPLIT') {
        if (column < 2) groups.push([n, n + 1]);
        if (row < 11) groups.push([n, n + 3]);
      }
      if (type === 'CORNER' && column < 2 && row < 11) groups.push([n, n + 1, n + 3, n + 4]);
    }
  }
  return groups;
}

function color(number: number) {
  return number === 0 ? 'green' : red.has(number) ? 'red' : 'black';
}
function describe(bet: RouletteBet) {
  const standard = outsideGroups.flatMap(group => group.choices).find(choice => choice.type === bet.betType && choice.value === bet.betValue);
  return `${names[bet.betType]} · ${standard?.label ?? bet.betValue.split(',').join(' + ')}`;
}
function clearSelection() {
  selection.value = null;
  anchor.value = null;
}
function changeMode(next: typeof mode.value) {
  if (mode.value === next) return;
  mode.value = next;
  clearSelection();
}
function chooseCombination(type: Combination) {
  combinationType.value = type;
  clearSelection();
}
function chooseNumber(number: number) {
  if (mode.value === 'numbers') {
    selection.value = { type: 'NUMBER', value: String(number), label: String(number) };
  } else {
    selection.value = null;
    anchor.value = number;
  }
}
function chooseGroup(numbers: number[]) {
  selection.value = { type: combinationType.value, value: numbers.join(','), label: numbers.join(' + ') };
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
          <div class="studio-modes" role="group" aria-label="Fogadás típusa">
            <button v-for="section in sections" :key="section.id" type="button" :aria-pressed="mode === section.id"
              :disabled="busy" @click="changeMode(section.id)">{{ section.label }}</button>
          </div>
          <fieldset class="studio-fields" :disabled="busy || !accepting">
            <legend class="layout-visually-hidden">Fogadás kiválasztása</legend>
            <template v-if="mode !== 'outside'">
              <div v-if="mode === 'combination'" class="studio-combinations">
                <button v-for="item in combinations" :key="item.type" type="button" :aria-pressed="combinationType === item.type"
                  @click="chooseCombination(item.type)">{{ item.label }}</button>
              </div>
              <p v-if="mode === 'combination'" class="studio-instruction">Válassz egy számot, majd egy hozzá tartozó kombinációt.</p>
              <div class="studio-number-board" aria-label="Számmezők">
                <button v-if="mode === 'numbers'" type="button" class="green studio-zero" :aria-pressed="selectedNumbers.includes(0)" @click="chooseNumber(0)">0</button>
                <button v-for="number in numberList" :key="number" type="button" :class="color(number)"
                  :aria-pressed="selectedNumbers.includes(number) || anchor === number" @click="chooseNumber(number)">{{ number }}</button>
              </div>
              <div v-if="matchingGroups.length && mode === 'combination'" class="studio-group-options">
                <button v-for="numbers in matchingGroups" :key="numbers.join(',')" type="button"
                  :aria-pressed="selection?.value === numbers.join(',')" @click="chooseGroup(numbers)">{{ numbers.join(' + ') }}</button>
              </div>
            </template>
            <div v-else class="studio-outside">
              <section v-for="group in outsideGroups" :key="group.label">
                <h3>{{ group.label }}</h3>
                <div><button v-for="choice in group.choices" :key="choice.value" type="button" :class="choice.color"
                  :aria-pressed="selected(choice)" @click="selection = choice">{{ choice.label }}</button></div>
              </section>
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
