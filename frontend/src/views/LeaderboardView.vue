<script setup lang="ts">
import CasinoHeader from '../components/CasinoHeader.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api } from '../services/api';

type LeaderboardPlayer = { id: number; name: string; tokenBalance: number };
const players = ref<LeaderboardPlayer[]>([]);
const loading = ref(true);
const error = ref('');
const currentPlayerId = Number(localStorage.getItem('party-player-id')) || 0;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
const currentPlayerRank = computed(() => players.value.findIndex(player => player.id === currentPlayerId) + 1);

async function loadLeaderboard() {
  try {
    players.value = await api.getLeaderboard();
    error.value = '';
  } catch (e: any) {
    error.value = e.message || 'Nem sikerült betölteni a ranglistát.';
  } finally {
    loading.value = false;
  }
}
function formatBalance(value: number) { return Number(value || 0).toLocaleString('hu-HU'); }
onMounted(() => {
  loadLeaderboard();
  refreshTimer = setInterval(loadLeaderboard, 5000);
});
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer); });
</script>

<template>
  <main class="leaderboard-page">
    <CasinoHeader />

    <section class="leaderboard-content">
      <div class="leaderboard-intro">
        <p class="eyebrow">PARTY CASINO · RANGLISTA</p>
        <h1>Token <span>Leaderboard</span></h1>
        <p class="muted">A játékosok aktuális tokenegyenlege, legtöbbtől a legkevesebbig.</p>
      </div>

      <section class="leaderboard-panel panel">
        <header class="leaderboard-panel-heading">
          <div><p class="eyebrow">JÁTÉKOSOK</p><h2>Ranglista</h2></div>
          <span class="leaderboard-count">{{ players.length }} játékos</span>
        </header>
        <div v-if="loading" class="leaderboard-empty">Ranglista betöltése…</div>
        <div v-else-if="error" class="leaderboard-empty leaderboard-error">{{ error }} <button class="ghost" @click="loadLeaderboard">Újrapróbálás</button></div>
        <div v-else-if="!players.length" class="leaderboard-empty">Még nincs játékos a ranglistán.</div>
        <div v-else class="leaderboard-list">
          <article v-for="(player, index) in players" :key="player.id" class="leaderboard-row" :class="{ 'is-current-player': player.id === currentPlayerId, 'is-top-three': index < 3 }">
            <span class="leaderboard-rank" :class="'rank-' + (index + 1)">{{ index === 0 ? '♛' : String(index + 1).padStart(2, '0') }}</span>
            <span class="leaderboard-player">
              <strong>{{ player.name }}</strong>
              <small v-if="player.id === currentPlayerId">TE VAGY</small>
            </span>
            <strong class="leaderboard-balance">{{ formatBalance(player.tokenBalance) }} <em>CR</em></strong>
          </article>
        </div>
        <footer class="leaderboard-footer">
          <span><i></i> Automatikusan frissül</span>
          <span v-if="currentPlayerRank">Helyezésed: <strong>#{{ currentPlayerRank }}</strong></span>
        </footer>
      </section>
    </section>
  </main>
</template>
