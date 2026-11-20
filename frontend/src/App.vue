<script setup lang="ts">
import { onMounted } from 'vue';
import { identifyPlayer } from './services/socket';

onMounted(() => {
  identifyPlayer(Number(localStorage.getItem('party-player-id')) || null);
});
</script>
<template><router-view /></template>
