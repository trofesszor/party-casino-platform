<script setup lang="ts">
const compact = (amount: number) => amount >= 1000 ? (amount / 1000).toLocaleString('hu-HU', { maximumFractionDigits: 1 }) + 'k' : String(amount);
defineProps<{ stake?: { amount: number; pending: boolean } }>();
</script>

<template>
  <span v-if="stake" class="studio-placed-chip" :class="{ 'studio-chip-pending': stake.pending }">
    <span aria-hidden="true">{{ compact(stake.amount) }}</span>
    <span class="layout-visually-hidden">{{ stake.amount.toLocaleString('hu-HU') }} CR</span>
  </span>
</template>
