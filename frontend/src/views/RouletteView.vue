<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { RouletteBetType, RouletteState } from '../types';
import RouletteWheel from '../components/RouletteWheel.vue';

const route = useRoute();
const isDisplay = computed(() => route.query.display === '1');
const playerId = Number(localStorage.getItem('party-player-id'));
const state = ref<RouletteState | null>(null);
const selectedType = ref<RouletteBetType>('NUMBER');
const selectedNumbers = ref<number[]>([]);
const selectedValue = ref('');
const chip = ref(1);
const error = ref('');
const busy = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

const redNumbers = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const myBets = computed(() => state.value?.bets.filter(b => b.playerId === playerId) ?? []);
const secondsLeft = computed(() => Math.max(0, Math.ceil((Date.parse(state.value?.currentRound?.bettingEndsAt ?? '') - now.value) / 1000)));
const resultColor = computed(() => {
 const n = state.value?.currentRound?.resultNumber;
 if (n === null || n === undefined || n === 0) return 'green';
 return redNumbers.has(n) ? 'red' : 'black';
});
const requiredNumbers = computed(() => ({ NUMBER:1, SPLIT:2, STREET:3, CORNER:4, SIX_LINE:6 }[selectedType.value as 'NUMBER'|'SPLIT'|'STREET'|'CORNER'|'SIX_LINE'] ?? 0));
const isNumberBet = computed(() => requiredNumbers.value > 0);
const selectedDescription = computed(() => isNumberBet.value
 ? (selectedNumbers.value.length ? selectedNumbers.value.slice().sort((a,b)=>a-b).join(' / ') : 'Válassz mezőket az asztalon')
 : selectedValue.value || 'Válassz egy fogadást');

async function refresh() { state.value = await api.getRouletteState(); }
function toggleNumber(number: number) {
 if (!isNumberBet.value) return;
 if (selectedNumbers.value.includes(number)) {
   selectedNumbers.value = selectedNumbers.value.filter(n => n !== number);
 } else if (selectedNumbers.value.length < requiredNumbers.value) {
   selectedNumbers.value = [...selectedNumbers.value, number];
 }
}
function chooseType(type: RouletteBetType) {
 selectedType.value = type;
 selectedNumbers.value = [];
 selectedValue.value = '';
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
   selectedNumbers.value = [];
   selectedValue.value = '';
 } catch (e: any) { error.value = e.message; }
 finally { busy.value = false; }
}
function labelBet(bet: { betType: RouletteBetType; betValue: string }) {
 const names: Record<string,string> = { NUMBER:'Szám', SPLIT:'Split', STREET:'Street', CORNER:'Corner', SIX_LINE:'Six line', DOZEN:'Tucat', COLUMN:'Oszlop', COLOR:'Szín', ODD_EVEN:'Páros/páratlan', LOW_HIGH:'Kis/nagy' };
 const values: Record<string,string> = { red:'Piros', black:'Fekete', odd:'Páratlan', even:'Páros', low:'1–18', high:'19–36' };
 return names[bet.betType] + ': ' + (values[bet.betValue] ?? bet.betValue.replaceAll(',', ' / '));
}
function onChanged(payload: RouletteState) { state.value = payload; }
onMounted(() => { refresh().catch(e => error.value = e.message); socket.on('roulette:changed', onChanged); clock = setInterval(() => { now.value = Date.now(); }, 250); });
onUnmounted(() => { socket.off('roulette:changed', onChanged); if (clock) clearInterval(clock); });
</script>

<template>
 <main class="roulette-page">
  <header class="roulette-header"><a href="/" class="brand">PARTY<span>CASINO</span></a><span class="live-indicator">● {{ isDisplay ? 'TV KIJELZŐ' : 'KÖZÖS RULETTASZTAL' }}</span></header>
  <section v-if="state?.currentRound" class="roulette-content">
   <p class="eyebrow">EURÓPAI RULETT · 0–36</p><h1>Rulettasztal</h1>
   <div class="roulette-round panel"><span class="eyebrow">KÖR #{{ state.currentRound.roundNumber }}</span><h2>{{ state.currentRound.status === 'BETTING' ? secondsLeft + ' mp' : 'Eredmény' }}</h2><p class="muted">{{ state.currentRound.status === 'BETTING' ? 'Helyezd el a zsetonjaidat az asztalon.' : 'A következő kör automatikusan indul.' }}</p></div>
   <RouletteWheel :result-number="state.currentRound.resultNumber" :previous-result-number="state.history[0]?.resultNumber ?? null" :spinning="state.currentRound.status === 'COMPLETED'" :round-number="state.currentRound.roundNumber" />

   <section v-if="!isDisplay && state.currentRound.status === 'BETTING'" class="panel roulette-bet">
    <div class="bet-heading"><div><p class="eyebrow">FOGADÁSI ASZTAL</p><h2>Válaszd ki a fogadást</h2></div><div class="chip-picker"><button v-for="value in [1,5,10,25,100]" :key="value" :class="{active:chip===value}" @click="chip=value">{{ value }}</button></div></div>
    <div class="roulette-bet-types">
     <button v-for="item in [{type:'NUMBER',label:'Egy szám'},{type:'SPLIT',label:'Split'},{type:'STREET',label:'Street'},{type:'CORNER',label:'Corner'},{type:'SIX_LINE',label:'Six line'}]" :key="item.type" :class="{active:selectedType===item.type}" @click="chooseType(item.type as RouletteBetType)">{{ item.label }}</button>
    </div>
    <p class="bet-instruction">{{ isNumberBet ? 'Kattints a megfelelő számmezőkre. A kijelölés sorrendje nem számít.' : 'Válassz egy külső fogadást.' }}</p>
    <div class="roulette-layout">
     <div class="roulette-number-board">
      <button class="roulette-zero" :class="{selected:selectedNumbers.includes(0)}" :disabled="selectedType!=='NUMBER'" @click="toggleNumber(0)">0</button>
      <div class="roulette-number-grid">
       <button v-for="n in 36" :key="n" :class="[redNumbers.has(n)?'red':'black',{selected:selectedNumbers.includes(n)}]" @click="toggleNumber(n)">{{ n }}</button>
      </div>
     </div>
     <div class="roulette-outside">
      <div class="outside-group"><strong>Külső fogadások</strong>
       <button @click="chooseOutside('COLOR','red')" :class="{active:selectedType==='COLOR'&&selectedValue==='red'}">PIROS</button>
       <button @click="chooseOutside('COLOR','black')" :class="{active:selectedType==='COLOR'&&selectedValue==='black'}">FEKETE</button>
       <button @click="chooseOutside('ODD_EVEN','odd')" :class="{active:selectedType==='ODD_EVEN'&&selectedValue==='odd'}">PÁRATLAN</button>
       <button @click="chooseOutside('ODD_EVEN','even')" :class="{active:selectedType==='ODD_EVEN'&&selectedValue==='even'}">PÁROS</button>
       <button @click="chooseOutside('LOW_HIGH','low')" :class="{active:selectedType==='LOW_HIGH'&&selectedValue==='low'}">1–18</button>
       <button @click="chooseOutside('LOW_HIGH','high')" :class="{active:selectedType==='LOW_HIGH'&&selectedValue==='high'}">19–36</button>
      </div>
      <div class="outside-group"><strong>Tucat</strong><button v-for="n in 3" :key="'d'+n" @click="chooseOutside('DOZEN',String(n))" :class="{active:selectedType==='DOZEN'&&selectedValue===String(n)}">{{ (n-1)*12+1 }}–{{ n*12 }}</button></div>
      <div class="outside-group"><strong>Oszlop</strong><button v-for="n in 3" :key="'c'+n" @click="chooseOutside('COLUMN',String(n))" :class="{active:selectedType==='COLUMN'&&selectedValue===String(n)}">{{ n }}. oszlop</button></div>
     </div>
    </div>
    <div class="bet-confirm"><div><span class="muted">Kijelölés</span><strong>{{ selectedDescription }}</strong><span class="muted">Zseton: {{ chip }}</span></div><button class="primary" :disabled="busy || secondsLeft<=0" @click="submitBet">Zseton elhelyezése</button></div>
    <p v-if="error" class="error">{{ error }}</p>
   </section>

   <section class="panel roulette-participants">
    <h2>Asztalon lévő tétek <span>{{ state.bets.length }}</span></h2>
    <p v-if="!state.bets.length" class="muted">Még nincsenek tétek ebben a körben.</p>
    <div v-for="bet in state.bets" :key="bet.id" class="roulette-bet-row">
     <strong>{{ bet.playerName }}</strong><span>{{ labelBet(bet) }}</span><b>{{ bet.amount }} zseton</b>
     <b v-if="state.currentRound.status==='COMPLETED'" :class="{winner:state.winners.some(w=>w.id===bet.id)}">{{ state.winners.some(w=>w.id===bet.id)?'NYERT':'—' }}</b>
    </div>
   </section>
   <section v-if="!isDisplay" class="panel roulette-participants"><h2>Saját téteim <span>{{ myBets.length }}</span></h2><p v-if="!myBets.length" class="muted">Még nem helyeztél el zsetont.</p><div v-for="bet in myBets" :key="'mine'+bet.id" class="roulette-bet-row"><strong>{{ labelBet(bet) }}</strong><span>{{ bet.amount }} zseton</span></div></section>
  </section>
  <p v-else-if="error" class="error">{{ error }}</p>
  <footer>A rulett automatikusan működik, nincs szükség adminisztrátori indításra.</footer>
 </main>
</template>
