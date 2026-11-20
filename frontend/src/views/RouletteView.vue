<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { RouletteState } from '../types';
const route = useRoute();
const eventId = Number(route.params.eventId);
const isDisplay = computed(() => route.query.display === '1');
const playerId = Number(localStorage.getItem('party-player-id'));
const state = ref<RouletteState | null>(null);
const betType = ref<'NUMBER' | 'COLOR'>('COLOR');
const betValue = ref('red');
const error = ref('');
const busy = ref(false);
const redNumbers = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const myBet = computed(() => state.value?.bets.find(b => b.playerId === playerId));
const resultColor = computed(() => {
 const n = state.value?.currentRound?.resultNumber;
 if (n === null || n === undefined || n === 0) return 'green';
 return redNumbers.has(n) ? 'red' : 'black';
});
async function refresh() { state.value = await api.getRouletteState(eventId); }
async function submitBet() {
 if (!playerId) { error.value = 'Előbb lépj be a játékos oldalon.'; return; }
 busy.value = true; error.value = '';
 try { state.value = await api.placeRouletteBet(eventId, playerId, betType.value, betValue.value); }
 catch (e: any) { error.value = e.message; }
 finally { busy.value = false; }
}
function onChanged(payload: RouletteState) { if (payload?.event?.id === eventId) state.value = payload; }
onMounted(() => { refresh().catch(e => error.value = e.message); socket.on('roulette:changed', onChanged); });
onUnmounted(() => socket.off('roulette:changed', onChanged));
</script>
<template>
 <main class="roulette-page">
  <header class="roulette-header"><a href="/" class="brand">PARTY<span>CASINO</span></a><span class="live-indicator">● {{ isDisplay ? 'TV KIJELZŐ' : 'KÖZÖS RULETT' }}</span></header>
  <section v-if="state" class="roulette-content">
   <p class="eyebrow">EURÓPAI RULETT · 0–36</p><h1>{{ state.event.title }}</h1>
   <div class="roulette-round panel"><span class="eyebrow">AKTUÁLIS KÖR</span><h2>{{ state.currentRound ? '#' + state.currentRound.roundNumber : 'Még nincs kör' }}</h2><p class="muted">{{ state.currentRound?.status === 'OPEN' ? 'A tippek leadása folyamatban.' : state.currentRound?.status === 'COMPLETED' ? 'A kör lezárult.' : 'Várakozás az első körre.' }}</p><div v-if="state.currentRound?.status==='COMPLETED'" class="roulette-result" :class="resultColor">{{ state.currentRound.resultNumber }}</div></div>
   <section v-if="!isDisplay && state.event.status==='RUNNING' && state.currentRound?.status==='OPEN'" class="panel roulette-bet">
    <h2>Add le a tipped</h2><p v-if="myBet" class="joined-label">Már leadtad a tipped: {{ myBet.betType==='NUMBER' ? myBet.betValue : (myBet.betValue==='red'?'Piros':'Fekete') }}</p>
    <template v-else><div class="bet-tabs"><button :class="{active:betType==='COLOR'}" @click="betType='COLOR';betValue='red'">Szín</button><button :class="{active:betType==='NUMBER'}" @click="betType='NUMBER';betValue='0'">Szám</button></div>
     <div v-if="betType==='COLOR'" class="color-options"><button class="red" :class="{selected:betValue==='red'}" @click="betValue='red'">PIROS</button><button class="black" :class="{selected:betValue==='black'}" @click="betValue='black'">FEKETE</button></div>
     <div v-else class="number-grid"><button v-for="n in 37" :key="n-1" :class="n===1?'green':redNumbers.has(n-1)?'red':'black'" @click="betValue=String(n-1)">{{ n-1 }}</button></div>
     <button class="primary full" :disabled="busy" @click="submitBet">Tipp leadása</button>
    </template><p v-if="error" class="error">{{ error }}</p>
   </section>
   <section class="panel roulette-participants"><h2>Leadott tippek <span>{{ state.bets.length }}</span></h2><p v-if="!state.bets.length" class="muted">Még senki nem tippelt.</p>
    <div v-for="bet in state.bets" :key="bet.playerId" class="roulette-bet-row"><strong>{{ bet.playerName }}</strong><span>{{ bet.betType==='NUMBER' ? 'Szám: ' + bet.betValue : bet.betValue==='red'?'Piros':'Fekete' }}</span><b v-if="state.currentRound?.status==='COMPLETED'" :class="{winner:state.winners.some(w=>w.playerId===bet.playerId)}">{{ state.winners.some(w=>w.playerId===bet.playerId)?'NYERT':'—' }}</b></div>
   </section>
  </section><p v-else-if="error" class="error">{{ error }}</p><footer>Az eredményt a helyi szerver sorsolja ki.</footer>
 </main>
</template>