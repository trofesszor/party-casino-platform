<script setup lang="ts">
import CasinoHeader from '../components/CasinoHeader.vue';
import { computed, nextTick, onMounted, ref } from 'vue';
import { api } from '../services/api';

const playerId = Number(localStorage.getItem('party-player-id'));
const reels = ref(['🍒', '7️⃣', '💎']);
const reelStrips = ref<string[][]>(reels.value.map(symbol => Array(13).fill(symbol)));
const reelOffsets = ref([0, 0, 0]);
const reelCellHeights = ref([104, 104, 104]);
const reelAnimating = ref(false);
const reelDurations = [3300, 4100, 4900];
const reelSymbols = ['🍒','🍋','🍇','🍉','🔔','💎','7️⃣','⭐','🪙'];
const randomSymbol = () => reelSymbols[Math.floor(Math.random() * reelSymbols.length)];
const busy = ref(false);
const error = ref('');
const result = ref('');
const winMultiplier = ref(0);
const selectedBet = ref(5);
const betOptions = [1, 5, 10, 25, 50];
const payoutAmount = ref(0);
const tokenBalance = ref(0);
const freeSpins = ref(0);
const spinCount = ref(0);
const paytable = ref<{ combination: string; multiplier: number; bonusSpins?: number }[]>([
 {combination:'Three 7️⃣',multiplier:30},{combination:'Three 💎',multiplier:15},{combination:'Three 🔔',multiplier:8},{combination:'Three 🍉',multiplier:5},{combination:'Three 🍇',multiplier:4},{combination:'Three 🍋',multiplier:3},{combination:'Three 🍒',multiplier:2},{combination:'Two matching symbols',multiplier:1},{combination:'Three ⭐ (Wild)',multiplier:50},{combination:'Three 🪙 (Bonus)',multiplier:5,bonusSpins:5}
]);
const canPlay = computed(() => Number.isInteger(playerId) && playerId > 0);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
onMounted(async () => { if (canPlay.value) { try { tokenBalance.value = (await api.getPlayerBalance(playerId)).tokenBalance; } catch (e: any) { error.value = e.message; } } });

async function spin() {
  if (!canPlay.value) { error.value = 'Előbb lépj be a főoldalon a neveddel.'; return; }
  if (busy.value) return;
  busy.value = true;
  reelAnimating.value = false;
  error.value = '';
  result.value = '';
  spinCount.value++;
  const startedAt = Date.now();
  try {
    const response = await api.spinSlots(playerId, selectedBet.value);

    // Build a real vertical symbol strip for each reel. The server-selected
    // result is placed at the end of each strip and the reel scrolls to it.
    reelStrips.value = response.reels.map((winningSymbol) => [
      ...Array.from({ length: 69 }, randomSymbol),
      winningSymbol,
    ]);
    reelOffsets.value = [0, 0, 0];
    await nextTick();

    // Measure the visible reel window. Transform percentages are relative to
    // the strip's own box, not its overflowing contents, so use exact pixels.
    const windows = Array.from(document.querySelectorAll<HTMLElement>('.slot-reel-window'));
    reelCellHeights.value = windows.map(window => window.getBoundingClientRect().height);
    reelOffsets.value = [0, 0, 0];
    reelAnimating.value = false;
    await nextTick();

    // Paint the reset position, then travel through 70+ symbols per reel.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    reelAnimating.value = true;
    await nextTick();
    reelOffsets.value = reelStrips.value.map(strip => strip.length - 1);
    await sleep(reelDurations[2] + 220);

    reels.value = response.reels;
    winMultiplier.value = response.multiplier;
    payoutAmount.value = response.payoutAmount;
    tokenBalance.value = response.tokenBalance;
    freeSpins.value = response.freeSpins;
    paytable.value = response.paytable;
    result.value = response.freeSpinsAwarded
      ? 'BONUS! 5 INGYEN PÖRGETÉS!'
      : response.multiplier > 0
        ? `${response.winLabel} · ${response.multiplier}× SZORZÓ`
        : response.winLabel;
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="game-page slot-page">
    <CasinoHeader />

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
            <div v-for="(strip,index) in reelStrips" :key="index" class="slot-reel-window" :class="{ 'reel-stopped': !busy && spinCount > 0 }">
              <div class="slot-reel-strip" :style="{ transform: `translate3d(0, -${reelOffsets[index] * reelCellHeights[index]}px, 0)`, transitionDuration: reelAnimating ? `${reelDurations[index]}ms` : '0ms' }">
                <div v-for="(symbol, symbolIndex) in strip" :key="symbolIndex" class="slot-reel-symbol">{{ symbol }}</div>
              </div>
              <div class="slot-reel-reflection"></div>
            </div>
          </div>
          <div class="slot-payline"><span>◆</span><b>WIN LINE</b><span>◆</span></div>
        </div>
        <div class="slot-bet-selector">
          <div><span class="eyebrow">SELECT YOUR BET</span><small>Choose a stake for this spin</small></div>
          <div class="slot-bet-options">
            <button v-for="amount in betOptions" :key="amount" :class="{ active: selectedBet === amount }" :disabled="busy" @click="selectedBet = amount">{{ amount }}<small>CR</small></button>
          </div>
        </div>
        <div class="slot-lower-panel">
          <div class="slot-status-screen"><span class="status-dot"></span>{{ busy ? 'REELS IN MOTION' : result ? (winMultiplier > 0 ? 'WINNER!' : 'GOOD LUCK NEXT TIME') : 'INSERT YOUR LUCK' }}<small>YOUR TOKENS: {{ tokenBalance }}</small></div>
          <button class="slot-spin-button" :disabled="busy || !canPlay" @click="spin">
            <span class="spin-button-icon">{{ busy ? '⟳' : '★' }}</span>
            <strong>{{ busy ? 'SPINNING' : 'SPIN' }}</strong>
            <small>{{ busy ? 'GOOD LUCK' : 'PULL TO PLAY' }}</small>
          </button>
          <div class="slot-side-display"><span>FREE SPINS</span><strong>{{ freeSpins }}</strong><span>SPINS: {{ spinCount }}</span></div>
        </div>
        <div class="slot-bottom-lights"><i v-for="n in 13" :key="n"></i></div>
      </div>

      <p v-if="result" class="slot-result" :class="{ jackpot: winMultiplier >= 8 || result.startsWith('BONUS') }">{{ result }}</p>
      <p v-if="winMultiplier > 0" class="slot-win-detail">{{ winMultiplier }}× multiplier · {{ payoutAmount }} CR credited <span v-if="freeSpins">· {{ freeSpins }} free spins remaining</span></p>
      <p v-else class="slot-current-bet">Current bet: <strong>{{ selectedBet }} CR</strong> · Balance: <strong>{{ tokenBalance }} CR</strong><span v-if="freeSpins"> · Free spin available (no stake deducted)</span></p>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="!canPlay" class="muted small slot-login-hint">A játékhoz először lépj be a főoldalon.</p>
      <div class="slot-paytable">
        <p class="eyebrow">PAYTABLE · MULTIPLIERS</p>
        <div class="slot-paytable-rows"><div v-for="item in paytable" :key="item.combination"><span>{{ item.combination }}</span><strong>{{ item.multiplier }}×</strong></div></div>
        <small>⭐ Wild substitutes for regular symbols · 🪙 Bonus awards 5 free spins</small>
      </div>
    </section>
  </main>
</template>
