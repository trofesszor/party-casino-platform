<script setup lang="ts">
import { onMounted } from 'vue';
import { identifyPlayer } from './services/socket';
import PlayerWallet from './components/PlayerWallet.vue';

onMounted(() => {
  identifyPlayer(Number(localStorage.getItem('party-player-id')) || null);
});
</script>
<template><router-view /><PlayerWallet /></template>
