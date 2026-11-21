<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { identifyPlayer } from './services/socket';
import PlayerWallet from './components/PlayerWallet.vue';
import PartyNotification from './components/PartyNotification.vue';

const route = useRoute();
const showPlayerNotifications = computed(() => route.path !== '/display');

onMounted(() => {
  identifyPlayer(Number(localStorage.getItem('party-player-id')) || null);
});
</script>
<template>
  <router-view />
  <PlayerWallet />
  <PartyNotification v-if="showPlayerNotifications" />
</template>
