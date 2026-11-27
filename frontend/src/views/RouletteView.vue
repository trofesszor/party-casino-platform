<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { RouletteBetType, RouletteState } from '../types';
import PlayerWallet from '../components/PlayerWallet.vue';
import RouletteWheel from '../components/RouletteWheel.vue';

const route = useRoute();
const isDisplay = computed(() => route.query.display === '1');
const playerId = Number(localStorage.getItem('party-player-id')) || 0;
const state = ref<RouletteState | null>(null);
const selectedType = ref<RouletteBetType>('NUMBER');
const selectedNumbers = ref<number[]>([]);
const selectedValue = ref('');
const chip = ref(1);
const tokenBalance = ref(0);
const error = ref('');
const busy = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

const redNumbers = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const myBets = computed(() => state.value?.bets.filter(b => b.playerId === playerId) ?? []);
const secondsLeft = computed(() => Math.max(0, Math.ceil((Date.parse(state.value?.currentRound?.bettingEndsAt ?? '') - now.value) / 1000)));
const acceptingBets = computed(() => state.value?.currentRound?.status === 'BETTING' && secondsLeft.value > 0);
const insideTypes = [
  { type: 'NUMBER', label: 'Egy szám' },
  { type: 'SPLIT', label: 'Két szám' },
  { type: 'STREET', label: 'Három szám' },
  { type: 'CORNER', label: 'Négy szám' },
  { type: 'SIX_LINE', label: 'Hat szám' },
] as const;
const outsideBets = [
  { type: 'LOW_HIGH', value: 'low', label: '1–18' },
  { type: 'ODD_EVEN', value: 'even', label: 'Páros' },
  { type: 'COLOR', value: 'red', label: 'Piros' },
  { type: 'COLOR', value: 'black', label: 'Fekete' },
  { type: 'ODD_EVEN', value: 'odd', label: 'Páratlan' },
  { type: 'LOW_HIGH', value: 'high', label: '19–36' },
] as const;
function pocketColor(number: number) {
  return number === 0 ? 'green' : redNumbers.has(number) ? 'red' : 'black';
}
const requiredNumbers = computed(() => ({ NUMBER:1, SPLIT:2, STREET:3, CORNER:4, SIX_LINE:6 }[selectedType.value as 'NUMBER'|'SPLIT'|'STREET'|'CORNER'|'SIX_LINE'] ?? 0));
type BetSpot = { type: RouletteBetType; value: string; left: string; top: string; label: string };
const betSpots = computed<BetSpot[]>(() => {
 const spots: BetSpot[] = [];
 const center = (column: number, row: number) => ({
   left: `${((column + 0.5) / 12) * 100}%`,
   top: `${((row + 0.5) / 3) * 100}%`,
 });
 if (selectedType.value === 'SPLIT') {
   for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) {
     const n = col * 3 + row + 1;
     if (row < 2) spots.push({ type:'SPLIT', value:`${n},${n+1}`, left:center(col,row).left, top:`${((row+1)/3)*100}%`, label:'↕' });
     if (col < 11) spots.push({ type:'SPLIT', value:`${n},${n+3}`, left:`${((col+1)/12)*100}%`, top:center(col,row).top, label:'↔' });
   }
 } else if (selectedType.value === 'CORNER') {
   for (let col = 0; col < 11; col++) for (let row = 0; row < 2; row++) {
     const n = col * 3 + row + 1;
     spots.push({ type:'CORNER', value:[n,n+1,n+3,n+4].join(','), left:`${((col+1)/12)*100}%`, top:`${((row+1)/3)*100}%`, label:'✣' });
   }
 } else if (selectedType.value === 'STREET') {
   for (let col = 0; col < 12; col++) {
     const n = col * 3 + 1;
     spots.push({ type:'STREET', value:`${n},${n+1},${n+2}`, left:center(col,1).left, top:'50%', label:'3' });
   }
 } else if (selectedType.value === 'SIX_LINE') {
   for (let col = 0; col < 11; col += 2) {
     const n = col * 3 + 1;
     spots.push({ type:'SIX_LINE', value:Array.from({length:6},(_,i)=>n+i).join(','), left:`${((col+1)/12)*100}%`, top:'50%', label:'6' });
   }
 }
 return spots.map(spot => ({
   ...spot,
   top: `${100 - Number.parseFloat(spot.top)}%`,
 }));
});
const isNumberBet = computed(() => requiredNumbers.value > 0);
const selectedDescription = computed(() => isNumberBet.value
 ? (selectedNumbers.value.length ? selectedNumbers.value.slice().sort((a,b)=>a-b).join(' / ') : 'Válassz mezőket az asztalon')
 : selectedValue.value ? labelBet({ betType: selectedType.value, betValue: selectedValue.value }) : 'Válassz egy fogadást');
const hasSelection = computed(() => isNumberBet.value
  ? selectedNumbers.value.length === requiredNumbers.value
  : selectedValue.value !== '');

async function refresh() { state.value = await api.getRouletteState(); }
function toggleNumber(number: number) {
 if (selectedType.value !== 'NUMBER') return;
 selectedNumbers.value = [number];
 selectedValue.value = '';
}
function selectBetSpot(spot: BetSpot) {
 selectedType.value = spot.type;
 selectedNumbers.value = spot.value.split(',').map(Number);
 selectedValue.value = '';
}
function clearSelection() {
 selectedNumbers.value = [];
 selectedValue.value = '';
}
function chooseType(type: RouletteBetType) {
 selectedType.value = type;
 clearSelection();
}
function chooseOutside(type: RouletteBetType, value: string) {
 selectedType.value = type;
 selectedNumbers.value = [];
 selectedValue.value = value;
}
async function submitBet() {
 if (!playerId) { error.value = 'Előbb lépj be a játékos oldalon.'; return; }
 const value = isNumberBet.value ? selectedNumbers.value.slice().sort((a,b)=>a-b).join(',') : selectedValue.value;
 if (isNumberBet.value && selectedNumbers.value.length !== requiredNumbers.value) { error.value = 'Válaszd ki a megfelelő számmezőket.'; return; }
 if (!value) { error.value = 'Válassz egy fogadást.'; return; }
 busy.value = true; error.value = '';
 try {
   state.value = await api.placeRouletteBet(playerId, selectedType.value, value, chip.value);
   tokenBalance.value = (await api.getPlayerBalance(playerId)).tokenBalance;
   clearSelection();
 } catch (e: any) { error.value = e.message; }
 finally { busy.value = false; }
}
function labelBet(bet: { betType: RouletteBetType; betValue: string }) {
 const names: Record<string,string> = { NUMBER:'Szám', SPLIT:'Split', STREET:'Street', CORNER:'Corner', SIX_LINE:'Six line', DOZEN:'Tucat', COLUMN:'Oszlop', COLOR:'Szín', ODD_EVEN:'Páros/páratlan', LOW_HIGH:'Kis/nagy' };
 const values: Record<string,string> = { red:'Piros', black:'Fekete', odd:'Páratlan', even:'Páros', low:'1–18', high:'19–36' };
 return names[bet.betType] + ': ' + (values[bet.betValue] ?? bet.betValue.split(',').join(' / '));
}
function onChanged(payload: RouletteState) { state.value = payload; if (playerId > 0) api.getPlayerBalance(playerId).then(b => tokenBalance.value = b.tokenBalance).catch(() => {}); }
onMounted(() => { refresh().catch(e => error.value = e.message); if (playerId > 0) api.getPlayerBalance(playerId).then(b => tokenBalance.value = b.tokenBalance).catch(e => error.value = e.message); socket.on('roulette:changed', onChanged); clock = setInterval(() => { now.value = Date.now(); }, 250); });
onUnmounted(() => { socket.off('roulette:changed', onChanged); if (clock) clearInterval(clock); });
</script>

<template>
  <main class="roulette-page roulette-room">
    <section v-if="state?.currentRound" class="roulette-content roulette-room-layout">
      <header class="roulette-stage">
        <div class="roulette-stage-title">
          <h1>Európai<br>rulett</h1>
          <p>Kör #{{ state.currentRound.roundNumber }}</p>
          <div class="roulette-round-clock" :class="{ 'is-closing': acceptingBets && secondsLeft <= 5 }">
            <strong v-if="acceptingBets">{{ secondsLeft }} mp</strong>
            <strong v-else>Kör lezárva</strong>
            <span>{{ acceptingBets ? 'Fogadás nyitva' : 'Hamarosan új kör indul' }}</span>
          </div>
        </div>
        <RouletteWheel
          :result-number="state.currentRound.resultNumber"
          :previous-result-number="state.history[0]?.resultNumber ?? null"
          :spinning="state.currentRound.status === 'COMPLETED'"
          :round-number="state.currentRound.roundNumber"
        />
        <aside class="roulette-recent" aria-label="Korábbi nyerőszámok">
          <h2>Legutóbbi számok</h2>
          <ol v-if="state.history.length" class="roulette-history">
            <li v-for="round in state.history.slice(0, 8)" :key="round.roundNumber" :class="pocketColor(round.resultNumber)" :title="`Kör #${round.roundNumber}`">{{ round.resultNumber }}</li>
          </ol>
          <p v-else>Még nincs lezárt kör.</p>
        </aside>
      </header>

      <section v-if="!isDisplay" class="felt-table" aria-label="Rulett fogadóasztal">
        <fieldset :disabled="!acceptingBets || busy">
          <legend class="layout-visually-hidden">Fogadás kiválasztása</legend>
          <div class="felt-controls">
            <div class="felt-types" aria-label="Belső fogadások">
              <button v-for="item in insideTypes" :key="item.type" type="button" :aria-pressed="selectedType === item.type" @click="chooseType(item.type)">{{ item.label }}</button>
            </div>
            <span v-if="acceptingBets && selectedType !== 'NUMBER' && isNumberBet" class="felt-tip">Válassz egy jelölt pontot a számmezőkön.</span>
          </div>
          <p class="felt-scroll-note">A teljes asztal oldalra húzható.</p>
          <div class="felt-scroller" role="region" tabindex="0" aria-label="Görgethető rulettasztal">
            <div class="felt-board">
              <button class="felt-zero green" type="button" :disabled="selectedType !== 'NUMBER'" :aria-pressed="selectedNumbers.includes(0)" @click="toggleNumber(0)">0</button>
              <div class="felt-numbers-shell">
                <div class="felt-numbers">
                  <button v-for="n in 36" :key="n" type="button"
                    :style="{ gridRow: 3 - (n - 1) % 3, gridColumn: Math.floor((n - 1) / 3) + 1 }"
                    :class="pocketColor(n)" :aria-pressed="selectedNumbers.includes(n)"
                    :disabled="selectedType !== 'NUMBER'" @click="toggleNumber(n)">{{ n }}</button>
                </div>
                <button v-for="spot in betSpots" :key="spot.type + spot.value" type="button" class="roulette-bet-spot"
                  :class="{ active: selectedNumbers.length === requiredNumbers && selectedNumbers.every(n => spot.value.split(',').includes(String(n))) }"
                  :style="{ left: spot.left, top: spot.top }" :aria-label="`Kombináció: ${spot.value}`" @click="selectBetSpot(spot)">{{ spot.label }}</button>
              </div>
              <div class="felt-columns" aria-label="Oszlopfogadások">
                <button v-for="n in [3, 2, 1]" :key="n" type="button" :aria-pressed="selectedType === 'COLUMN' && selectedValue === String(n)"
                  @click="chooseOutside('COLUMN', String(n))">{{ n }}. oszlop</button>
              </div>
              <div class="felt-dozens" aria-label="Tucatfogadások">
                <button v-for="n in 3" :key="n" type="button" :aria-pressed="selectedType === 'DOZEN' && selectedValue === String(n)"
                  @click="chooseOutside('DOZEN', String(n))">{{ (n - 1) * 12 + 1 }}–{{ n * 12 }}</button>
              </div>
              <div class="felt-outside" aria-label="Külső fogadások">
                <button v-for="bet in outsideBets" :key="bet.value" type="button" :class="bet.type === 'COLOR' ? bet.value : ''"
                  :aria-pressed="selectedType === bet.type && selectedValue === bet.value"
                  @click="chooseOutside(bet.type, bet.value)">{{ bet.label }}</button>
              </div>
            </div>
          </div>
        </fieldset>

        <div class="felt-dock">
          <div class="felt-selection">
            <small>Kijelölt fogadás</small>
            <strong>{{ selectedDescription }}</strong>
          </div>
          <div class="felt-chips" role="group" aria-label="Zsetonérték">
            <button v-for="value in [1, 5, 10, 25, 100]" :key="value" type="button"
              :aria-label="`${value} CR`" :aria-pressed="chip === value" :disabled="busy" @click="chip = value">{{ value }}</button>
          </div>
          <div class="felt-actions">
            <button v-if="hasSelection" class="felt-clear" type="button" :disabled="busy" @click="clearSelection">Törlés</button>
            <RouterLink v-if="!playerId" class="primary" to="/">Csatlakozás</RouterLink>
            <button v-else class="primary" type="button" :disabled="busy || !acceptingBets || !hasSelection" @click="submitBet">{{ busy ? 'Elhelyezés…' : `Tét elhelyezése · ${chip} CR` }}</button>
          </div>
        </div>
        <p v-if="error" class="felt-error error" role="alert">{{ error }}</p>
      </section>

      <div v-if="!isDisplay && playerId" class="roulette-account">
        <p class="felt-balance">Egyenleg <strong>{{ tokenBalance.toLocaleString('hu-HU') }} CR</strong></p>
        <PlayerWallet inline />
      </div>

      <div class="roulette-ledger">
        <details class="roulette-ledger-panel">
          <summary>Asztalon lévő tétek <span>{{ state.bets.length }}</span></summary>
          <p v-if="!state.bets.length">Még nincsenek tétek ebben a körben.</p>
          <div v-for="bet in state.bets" :key="bet.id" class="roulette-bet-row">
            <strong>{{ bet.playerName }}</strong><span>{{ labelBet(bet) }}</span><b>{{ bet.amount }} CR</b>
            <b v-if="state.winners.some(w => w.id === bet.id)" class="winner">Nyert</b>
          </div>
        </details>
        <details v-if="!isDisplay" class="roulette-ledger-panel">
          <summary>Saját téteim <span>{{ myBets.length }}</span></summary>
          <p v-if="!myBets.length">Még nem helyeztél el zsetont.</p>
          <div v-for="bet in myBets" :key="bet.id" class="roulette-bet-row"><strong>{{ labelBet(bet) }}</strong><span>{{ bet.amount }} CR</span></div>
        </details>
      </div>
    </section>
    <p v-else class="roulette-loading" :class="{ error }" role="status">{{ error || 'Rulettasztal betöltése…' }}</p>
  </main>
</template>
