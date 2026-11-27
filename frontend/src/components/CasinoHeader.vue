<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../services/api';
import { identifyPlayer } from '../services/socket';

const route = useRoute();
const router = useRouter();
const playerId = ref(Number(localStorage.getItem('party-player-id')) || 0);
const playerName = ref(localStorage.getItem('party-player-name') || '');
const balance = ref(0);
const menuOpen = ref(false);
const activePath = computed(() => route.path);
let balancePoller: ReturnType<typeof setInterval> | undefined;

async function refreshPlayer() {
  playerId.value = Number(localStorage.getItem('party-player-id')) || 0;
  playerName.value = localStorage.getItem('party-player-name') || '';
  if (!playerId.value) { balance.value = 0; return; }
  try { balance.value = (await api.getPlayerBalance(playerId.value)).tokenBalance; } catch { /* keep last known balance */ }
}
function logout() {
  identifyPlayer(null);
  localStorage.removeItem('party-player-id');
  localStorage.removeItem('party-player-name');
  window.dispatchEvent(new Event('party-player-changed'));
  menuOpen.value = false;
  router.push('/');
}
function closeMenu() { menuOpen.value = false; }

onMounted(() => {
  refreshPlayer();
  balancePoller = setInterval(refreshPlayer, 5000);
  window.addEventListener('party-player-changed', refreshPlayer);
});
onUnmounted(() => {
  if (balancePoller) clearInterval(balancePoller);
  window.removeEventListener('party-player-changed', refreshPlayer);
});
</script>

<template>
  <header class="casino-header casino-global-header">
    <a class="casino-brand" href="/"><span class="brand-mark">♣</span><span><strong>PARTY CASINO</strong><em>PRIVATE PARTY GAMING</em></span></a>
    <nav class="casino-nav desktop-casino-nav">
      <a href="/" :class="{ active: activePath === '/' }">Lobby</a>
      <a href="/community-events" :class="{ active: activePath === '/community-events' }">Events</a>
      <a href="/leaderboard" :class="{ active: activePath === '/leaderboard' }">Leaderboard</a>
      <a href="/shop" :class="{ active: activePath === '/shop' }">Shop</a>
    </nav>
    <div class="header-player">
      <div v-if="playerName" class="header-avatar">{{ playerName.slice(0,1).toUpperCase() }}</div>
      <div v-if="playerName" class="header-player-copy"><strong>{{ playerName }}</strong><small>ONLINE</small></div>
      <button v-if="playerId" class="header-balance" @click="router.push('/leaderboard')"><span>◈</span>{{ balance.toLocaleString('hu-HU') }} <small>CR</small></button>
      <button class="mobile-menu-button" aria-label="Menü" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">☰</button>
      <button v-if="playerId" class="header-exit" @click="logout">Kilépés</button>
    </div>
    <div v-if="menuOpen" class="mobile-casino-menu" @click="closeMenu">
      <a href="/">Lobby</a>
      <a href="/community-events">Events</a>
      <a href="/leaderboard">Leaderboard</a>
      <a href="/shop">Shop</a>
      <a href="/verify-quest" class="mobile-quest-link">✓ Quest PIN ellenőrzés</a>
      <button v-if="playerId" class="mobile-menu-logout" @click.stop="logout">Kilépés</button>
    </div>
  </header>
</template>
