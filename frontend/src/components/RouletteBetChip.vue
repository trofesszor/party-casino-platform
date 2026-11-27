<script setup lang="ts">
defineProps<{ stake?: { amount: number; pending: boolean } }>();
</script>

<template>
  <span v-if="stake" class="studio-placed-chip" :class="{ 'studio-chip-pending': stake.pending }">
    {{ stake.amount }}<span class="layout-visually-hidden"> CR</span>
  </span>
</template>
