<script setup lang="ts">
import { audioEnabled, setAudioEnabled } from '../services/game-audio';

defineProps<{ compact?: boolean }>();
</script>

<template>
  <button
    type="button"
    class="game-audio"
    :class="{ compact }"
    aria-label="Játékhang"
    :aria-pressed="audioEnabled"
    @click="setAudioEnabled(!audioEnabled)"
  >
    Hang {{ audioEnabled ? 'be' : 'ki' }}
  </button>
</template>

<style scoped>
.game-audio {
  min-height: 44px;
  max-width: 100%;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: var(--control-radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: .79rem;
}
.game-audio[aria-pressed="true"] { color: var(--accent); }
.compact { min-height: 36px; }
.game-audio:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
