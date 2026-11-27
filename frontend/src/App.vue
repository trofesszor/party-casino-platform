<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { identifyPlayer } from './services/socket';
import CasinoHeader from './components/CasinoHeader.vue';
import PlayerWallet from './components/PlayerWallet.vue';
import PartyNotification from './components/PartyNotification.vue';

const route = useRoute();
const playerId = ref(Number(localStorage.getItem('party-player-id')) || 0);
const showCasinoHeader = computed(() => route.path !== '/display'
  && !route.path.startsWith('/admin')
  && route.query.display !== '1'
  && (route.path !== '/' || playerId.value > 0));

function updatePlayer() {
  playerId.value = Number(localStorage.getItem('party-player-id')) || 0;
}

const showPlayerNotifications = computed(() => route.path !== '/display');

onMounted(() => {
  updatePlayer();
  identifyPlayer(playerId.value || null);
  window.addEventListener('party-player-changed', updatePlayer);
});
onUnmounted(() => window.removeEventListener('party-player-changed', updatePlayer));
</script>
<template>
  <CasinoHeader v-if="showCasinoHeader" />
  <router-view />
  <PlayerWallet v-if="route.path !== '/roulette' && route.path !== '/slots' && route.path !== '/blackjack'" />
  <PartyNotification v-if="showPlayerNotifications" />
</template>
