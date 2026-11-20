<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { RouletteState } from '../types';
const route = useRoute();
const isDisplay = computed(() => route.query.display === '1');
const playerId = Number(localStorage.getItem('party-player-id'));
const state = ref<RouletteState | null>(null);
const betType = ref<'NUMBER' | 'COLOR'>('COLOR');
const betValue = ref('red');
const error = ref('');
const busy = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
const redNumbers = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const myBet = computed(() => state.value?.bets.find(b => b.playerId === playerId));
const secondsLeft = computed(() => Math.max(0, Math.ceil((Date.parse(state.value?.currentRound?.bettingEndsAt ?? '') - now.value) / 1000)));
const resultColor = computed(() => {
 const n = state.value?.currentRound?.resultNumber;
 if (n === null || n === undefined || n === 0) return 'green';
 return redNumbers.has(n) ? 'red' : 'black';
});
async function refresh() { state.value = await api.getRouletteState(); }
async function submitBet() {
 if (!playerId) { error.value = 'Előbb lépj be a játékos oldalon.'; return; }
 busy.value = true; error.value = '';
 try { state.value = await api.placeRouletteBet(playerId, betType.value, betValue.value); }
 catch (e: any) { error.value = e.message; }
 finally { busy.value = false; }
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
   <div class="roulette-round panel"><span class="eyebrow">KÖR #{{ state.currentRound.roundNumber }}</span><h2>{{ state.currentRound.status === 'BETTING' ? secondsLeft + ' mp' : 'Eredmény' }}</h2><p class="muted">{{ state.currentRound.status === 'BETTING' ? 'Add le a tippedet a fogadási időszak végéig.' : 'A következő kör automatikusan indul.' }}</p><div v-if="state.currentRound.status === 'COMPLETED'" class="roulette-result" :class="resultColor">{{ state.currentRound.resultNumber }}</div></div>
   <section v-if="!isDisplay && state.currentRound.status === 'BETTING'" class="panel roulette-bet">
    <h2>Add le a tipped</h2><p v-if="myBet" class="joined-label">A tipped: {{ myBet.betType === 'NUMBER' ? myBet.betValue : myBet.betValue === 'red' ? 'Piros' : 'Fekete' }}</p>
    <template v-else><div class="bet-tabs"><button :class="{active:betType==='COLOR'}" @click="betType='COLOR';betValue='red'">Szín</button><button :class="{active:betType==='NUMBER'}" @click="betType='NUMBER';betValue='0'">Szám</button></div>
     <div v-if="betType==='COLOR'" class="color-options"><button class="red" :class="{selected:betValue==='red'}" @click="betValue='red'">PIROS</button><button class="black" :class="{selected:betValue==='black'}" @click="betValue='black'">FEKETE</button></div>
     <div v-else class="number-grid"><button v-for="n in 37" :key="n-1" :class="n===1?'green':redNumbers.has(n-1)?'red':'black'" @click="betValue=String(n-1)">{{ n-1 }}</button></div>
     <button class="primary full" :disabled="busy || secondsLeft <= 0" @click="submitBet">Tipp leadása</button>
    </template><p v-if="error" class="error">{{ error }}</p>
   </section>
   <section class="panel roulette-participants"><h2>Leadott tippek <span>{{ state.bets.length }}</span></h2><p v-if="!state.bets.length" class="muted">Még senki nem tippelt ebben a körben.</p>
    <div v-for="bet in state.bets" :key="bet.playerId" class="roulette-bet-row"><strong>{{ bet.playerName }}</strong><span>{{ bet.betType==='NUMBER' ? 'Szám: ' + bet.betValue : bet.betValue==='red'?'Piros':'Fekete' }}</span><b v-if="state.currentRound.status==='COMPLETED'" :class="{winner:state.winners.some(w=>w.playerId===bet.playerId)}">{{ state.winners.some(w=>w.playerId===bet.playerId)?'NYERT':'—' }}</b></div>
   </section>
  </section><p v-else-if="error" class="error">{{ error }}</p><footer>A rulett automatikusan működik, nincs szükség adminisztrátori indításra.</footer>
 </main>
</template>
