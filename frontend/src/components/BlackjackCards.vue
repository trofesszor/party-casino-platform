<script setup lang="ts">
defineProps<{ cards: Array<{ rank: string; suit: string } | null> }>();
const suits: Record<string, string> = { '♠': 'pikk', '♥': 'kőr', '♦': 'káró', '♣': 'treff' };
</script>

<template>
  <div class="bj-cards" aria-label="Lapok">
    <span v-for="(card,index) in cards" :key="index" class="bj-card"
      :class="{ 'bj-card-back': !card, 'bj-card-red': card?.suit === '♥' || card?.suit === '♦' }"
      role="img" :aria-label="card ? card.rank + ' ' + suits[card.suit] : 'Lefordított lap'">
      <template v-if="card"><strong>{{ card.rank }}</strong><span>{{ card.suit }}</span></template>
      <span v-else aria-hidden="true">♣</span>
    </span>
  </div>
</template>
