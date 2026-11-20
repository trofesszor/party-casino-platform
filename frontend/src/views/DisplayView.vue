<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { socket } from '../services/socket';
import { api } from '../services/api';
import type { RouletteState } from '../types';
import RouletteWheel from '../components/RouletteWheel.vue';
const state = ref<RouletteState | null>(null);
const players = ref<{id:number;name:string}[]>([]);
async function refresh() {
  const [roulette, onlinePlayers] = await Promise.all([api.getRouletteState(), api.getPlayers()]);
  state.value = roulette;
  players.value = onlinePlayers;
}
function onChanged(next: RouletteState) { state.value = next; }
function onPlayersChanged(next: {id:number;name:string}[]) { players.value = next; }
onMounted(() => {
  refresh().catch(() => undefined);
  socket.on('roulette:changed', onChanged);
  socket.on('players:online', onPlayersChanged);
});
onUnmounted(() => {
  socket.off('roulette:changed', onChanged);
  socket.off('players:online', onPlayersChanged);
});
</script>
<template>
  <main class="display-page">
    <header class="display-header"><a href="/" class="brand">PARTY<span>CASINO</span></a><div class="live-indicator"><i></i> PARTY LIVE</div></header>
    <section class="display-intro"><p class="eyebrow">A KÖZÖS JÁTÉKTÉR</p><h1>Party <span>Casino</span></h1><p>Nyisd meg a játékokat a telefonodon, és csatlakozz a rulettasztalhoz.</p></section>
    <section v-if="state?.currentRound" class="tv-roulette panel">
      <p class="eyebrow">KÖZÖS RULETTASZTAL · {{ state.currentRound.status === 'BETTING' ? 'FOGADÁS' : 'EREDMÉNY' }}</p>
      <h2>{{ state.currentRound.status === 'BETTING' ? 'Tétek leadása folyamatban' : 'A kör eredménye' }}</h2>
      <RouletteWheel :result-number="state.currentRound.resultNumber" :spinning="state.currentRound.status === 'COMPLETED'" :round-number="state.currentRound.roundNumber" />
      
      <div class="tv-meta"><span>Online játékosok: {{ players.length }}</span><span>Leadott tippek: {{ state.bets.length }}</span></div>
      <div class="online-players"><span v-for="player in players" :key="player.id" class="online-player">{{ player.name }}</span><span v-if="!players.length" class="muted">Jelenleg nincs online játékos.</span></div>
      <div class="roulette-bet-row" v-for="bet in state.bets" :key="bet.playerId"><strong>{{ bet.playerName }}</strong><span>{{ bet.betType === 'NUMBER' ? bet.betValue : bet.betValue === 'red' ? 'Piros' : 'Fekete' }}</span><b v-if="state.currentRound.status === 'COMPLETED'">{{ state.winners.some(w => w.playerId === bet.playerId) ? 'NYERT' : '—' }}</b></div>
    </section>
    <div v-else class="display-empty"><h2>Hamarosan indul az első rulettkör</h2></div>
    <footer><span>NYISD MEG A PARTY CASINO OLDALÁT A TELEFONODON</span><strong>VÁLASSZ JÁTÉKOT. CSATLAKOZZ. JÁTSSZ.</strong></footer>
  </main>
</template>
