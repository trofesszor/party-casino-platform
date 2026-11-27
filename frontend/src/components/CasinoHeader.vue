<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../services/api';
import { rouletteDisplayBalance } from '../services/roulette-balance';
import { identifyPlayer } from '../services/socket';

const route = useRoute();
const router = useRouter();
const playerId = ref(Number(localStorage.getItem('party-player-id')) || 0);
const playerName = ref(localStorage.getItem('party-player-name') || '');
const balance = ref(0);
const shownBalance = computed(() => route.path === '/roulette' ? rouletteDisplayBalance.value ?? balance.value : balance.value);
const menuOpen = ref(false);
const links = [
  { path: '/', label: 'Játékok' },
  { path: '/roulette', label: 'Rulett' },
  { path: '/slots', label: 'Slot' },
  { path: '/lucky-wheel', label: 'Szerencsekerék' },
  { path: '/community-events', label: 'Események' },
  { path: '/leaderboard', label: 'Ranglista' },
  { path: '/shop', label: 'Bolt' },
];
watch(() => route.fullPath, () => { menuOpen.value = false; });
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
  <header class="casino-masthead" @keydown.esc="closeMenu">
    <div class="casino-masthead-inner">
      <RouterLink class="masthead-brand" to="/" aria-label="Party Casino – Előtér">
        <span class="masthead-mark" aria-hidden="true">♣</span>
        <span>Party <strong>Casino</strong></span>
      </RouterLink>
      <nav class="masthead-desktop" aria-label="Főmenü">
        <RouterLink v-for="link in links" :key="link.path" :to="link.path">{{ link.label }}</RouterLink>
      </nav>
      <div class="masthead-account">
        <span v-if="playerName" class="masthead-name">{{ playerName }}</span>
        <RouterLink v-if="playerId" to="/leaderboard" class="masthead-balance" aria-label="Egyenleg és ranglista">{{ shownBalance.toLocaleString('hu-HU') }} <small>CR</small></RouterLink>
        <button v-if="playerId" class="masthead-exit" @click="logout">Kilépés</button>
        <button class="mobile-menu-button masthead-toggle" type="button" :aria-label="menuOpen ? 'Menü bezárása' : 'Menü megnyitása'" aria-controls="casino-mobile-menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><span class="menu-glyph" aria-hidden="true"></span></button>
      </div>
    </div>
    <Transition name="casino-menu">
      <nav v-if="menuOpen" id="casino-mobile-menu" class="masthead-menu" aria-label="Mobil főmenü">
        <RouterLink v-for="link in links" :key="link.path" :to="link.path" @click="closeMenu">{{ link.label }}</RouterLink>
        <RouterLink to="/verify-quest" @click="closeMenu">PIN ellenőrzése</RouterLink>
        <button v-if="playerId" type="button" @click="logout">Kilépés</button>
      </nav>
    </Transition>
  </header>
</template>
