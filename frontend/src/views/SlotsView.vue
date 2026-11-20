<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../services/api';

const playerId = Number(localStorage.getItem('party-player-id'));
const reels = ref(['❔', '❔', '❔']);
const busy = ref(false);
const error = ref('');
const result = ref('');
const canPlay = computed(() => Number.isInteger(playerId) && playerId > 0);

async function spin() {
  if (!canPlay.value) { error.value = 'Előbb lépj be a főoldalon a neveddel.'; return; }
  busy.value = true; error.value = ''; result.value = '';
  try {
    const response = await api.spinSlots(playerId);
    reels.value = response.reels;
    result.value = response.isWin ? 'Három egyforma! Nyertél!' : 'Próbálkozz újra!';
  } catch (e: any) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <main class="game-page">
    <header class="roulette-header"><a href="/" class="brand">PARTY<span>CASINO</span></a><a href="/" class="ghost">Vissza a játékokhoz</a></header>
    <section class="game-content panel">
      <p class="eyebrow">EGYÉNI JÁTÉK</p><h1>Slot machine</h1>
      <p class="muted">Minden játékos saját pörgetést indít. A többiek eredményét ez nem befolyásolja.</p>
      <div class="slot-reels"><span v-for="(symbol, index) in reels" :key="index">{{ symbol }}</span></div>
      <p v-if="result" class="slot-result">{{ result }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <button class="primary full" :disabled="busy || !canPlay" @click="spin">{{ busy ? 'Pörgetés...' : 'Pörgetés' }}</button>
      <p v-if="!canPlay" class="muted small">A játékhoz először lépj be a főoldalon.</p>
    </section>
  </main>
</template>
