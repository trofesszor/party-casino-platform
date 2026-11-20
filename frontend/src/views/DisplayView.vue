<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { socket } from '../services/socket';
import { api } from '../services/api';
import type { RouletteState } from '../types';
const state = ref<RouletteState | null>(null);
const players = ref<{id:number;name:string}[]>([]);
async function refresh() {
  const [roulette, allPlayers] = await Promise.all([api.getRouletteState(), api.getPlayers()]);
  state.value = roulette; players.value = allPlayers;
}
function onChanged(next: RouletteState) { state.value = next; }
onMounted(() => { refresh().catch(() => undefined); socket.on('roulette:changed', onChanged); });
onUnmounted(() => socket.off('roulette:changed', onChanged));
</script>
<template>
  <main class="display-page">
    <header class="display-header"><a href="/" class="brand">PARTY<span>CASINO</span></a><div class="live-indicator"><i></i> PARTY LIVE</div></header>
    <section class="display-intro"><p class="eyebrow">A KÖZÖS JÁTÉKTÉR</p><h1>Party <span>Casino</span></h1><p>Nyisd meg a játékokat a telefonodon, és csatlakozz a rulettasztalhoz.</p></section>
    <section v-if="state?.currentRound" class="tv-roulette panel">
      <p class="eyebrow">KÖZÖS RULETTASZTAL · {{ state.currentRound.status === 'BETTING' ? 'FOGADÁS' : 'EREDMÉNY' }}</p>
      <h2>{{ state.currentRound.status === 'BETTING' ? 'Tétek leadása folyamatban' : 'A kör eredménye' }}</h2>
      <div v-if="state.currentRound.status === 'COMPLETED'" class="roulette-result" :class="state.currentRound.resultNumber === 0 ? 'green' : [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(state.currentRound.resultNumber ?? -1) ? 'red' : 'black'">{{ state.currentRound.resultNumber }}</div>
      <div class="tv-meta"><span>Játékosok: {{ players.length }}</span><span>Leadott tippek: {{ state.bets.length }}</span></div>
      <div class="roulette-bet-row" v-for="bet in state.bets" :key="bet.playerId"><strong>{{ bet.playerName }}</strong><span>{{ bet.betType === 'NUMBER' ? bet.betValue : bet.betValue === 'red' ? 'Piros' : 'Fekete' }}</span><b v-if="state.currentRound.status === 'COMPLETED'">{{ state.winners.some(w => w.playerId === bet.playerId) ? 'NYERT' : '—' }}</b></div>
    </section>
    <div v-else class="display-empty"><h2>Hamarosan indul az első rulettkör</h2></div>
    <footer><span>NYISD MEG A PARTY CASINO OLDALÁT A TELEFONODON</span><strong>VÁLASSZ JÁTÉKOT. CSATLAKOZZ. JÁTSSZ.</strong></footer>
  </main>
</template>
