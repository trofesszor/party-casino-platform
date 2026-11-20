<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../services/api';

const playerId = Number(localStorage.getItem('party-player-id'));
const reels = ref(['🍒', '7️⃣', '💎']);
const busy = ref(false);
const error = ref('');
const result = ref('');
const spinCount = ref(0);
const canPlay = computed(() => Number.isInteger(playerId) && playerId > 0);
const symbols = ['🍒','🍋','🍇','🍉','🔔','💎','7️⃣'];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function spin() {
  if (!canPlay.value) { error.value = 'Előbb lépj be a főoldalon a neveddel.'; return; }
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  result.value = '';
  spinCount.value++;
  const startedAt = Date.now();
  try {
    const response = await api.spinSlots(playerId);
    // Keep the reels moving long enough to make each spin feel deliberate.
    await sleep(Math.max(0, 1650 - (Date.now() - startedAt)));
    reels.value = response.reels;
    result.value = response.isWin ? 'JACKPOT! Három egyforma!' : 'Nincs nyeremény. Próbáld újra!';
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="game-page slot-page">
    <header class="roulette-header"><a href="/" class="brand">PARTY<span>CASINO</span></a><a href="/" class="ghost">Vissza a játékokhoz</a></header>

    <section class="slot-machine-content">
      <div class="slot-heading">
        <p class="eyebrow">CLASSIC CASINO · 3 REEL SLOT</p>
        <h1>LUCKY <span>7</span></h1>
        <p class="muted">A saját géped. A saját pörgetésed. Próbáld ki a szerencséd.</p>
      </div>

      <div class="slot-cabinet" :class="{ 'is-spinning': busy, 'is-winning': result.startsWith('JACKPOT') }">
        <div class="slot-top-lights"><i v-for="n in 13" :key="n"></i></div>
        <div class="slot-marquee">
          <span class="marquee-star">✦</span>
          <div><small>PARTY CASINO PRESENTS</small><strong>LUCKY <b>7</b></strong><em>★ ★ ★ WIN BIG ★ ★ ★</em></div>
          <span class="marquee-star">✦</span>
        </div>
        <div class="slot-side-bolts"><i></i><i></i></div>
        <div class="slot-reel-frame">
          <div class="slot-reel-labels"><span>1</span><span>2</span><span>3</span></div>
          <div class="slot-reels" :class="{ spinning: busy }">
            <div v-for="(symbol,index) in reels" :key="index" class="slot-reel-window">
              <div class="slot-reel-symbol" :class="{ 'symbol-winner': !busy && result.startsWith('JACKPOT') }">{{ busy ? symbols[(spinCount + index * 2) % symbols.length] : symbol }}</div>
              <div class="slot-reel-reflection"></div>
            </div>
          </div>
          <div class="slot-payline"><span>◆</span><b>WIN LINE</b><span>◆</span></div>
        </div>
        <div class="slot-lower-panel">
          <div class="slot-status-screen"><span class="status-dot"></span>{{ busy ? 'REELS IN MOTION' : result ? (result.startsWith('JACKPOT') ? 'WINNER!' : 'GOOD LUCK NEXT TIME') : 'INSERT YOUR LUCK' }}</div>
          <button class="slot-spin-button" :disabled="busy || !canPlay" @click="spin">
            <span class="spin-button-icon">{{ busy ? '⟳' : '★' }}</span>
            <strong>{{ busy ? 'SPINNING' : 'SPIN' }}</strong>
            <small>{{ busy ? 'GOOD LUCK' : 'PULL TO PLAY' }}</small>
          </button>
          <div class="slot-side-display"><span>LAST SPIN</span><strong>{{ spinCount }}</strong><span>GOOD LUCK!</span></div>
        </div>
        <div class="slot-bottom-lights"><i v-for="n in 13" :key="n"></i></div>
      </div>

      <p v-if="result" class="slot-result" :class="{ jackpot: result.startsWith('JACKPOT') }">{{ result }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="!canPlay" class="muted small slot-login-hint">A játékhoz először lépj be a főoldalon.</p>
      <div class="slot-paytable">
        <p class="eyebrow">LUCKY SYMBOLS</p>
        <div><span v-for="symbol in ['🍒','🍋','🍇','🍉','🔔','💎','7️⃣']" :key="symbol">{{ symbol }}</span></div>
        <small>Három egyforma szimbólum = nyerő kombináció</small>
      </div>
    </section>
  </main>
</template>
