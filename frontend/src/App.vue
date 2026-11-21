<script setup lang="ts">
import { onMounted } from 'vue';
import { identifyPlayer } from './services/socket';
import PlayerWallet from './components/PlayerWallet.vue';
import PartyNotification from './components/PartyNotification.vue';

onMounted(() => {
  identifyPlayer(Number(localStorage.getItem('party-player-id')) || null);
});
</script>
<template><router-view /><PlayerWallet /><PartyNotification /></template>
