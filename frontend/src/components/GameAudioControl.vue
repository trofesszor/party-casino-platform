<script setup lang="ts">
import { audioMode, setAudioMode, useGameAudio } from '../services/game-audio';

defineProps<{ compact?: boolean }>();

const { effect, announce } = useGameAudio();

function change(event: Event) {
  const mode = (event.target as HTMLSelectElement).value;
  if (mode !== 'off' && mode !== 'effects' && mode !== 'voice') return;
  setAudioMode(mode);
  if (mode === 'voice') announce('Magyar bemondás bekapcsolva.');
  else if (mode === 'effects') effect('click');
}
</script>

<template>
  <label class="game-audio" :class="{ compact }">
    <span>Játékhang</span>
    <select aria-label="Játékhang" :value="audioMode" @change="change">
      <option value="off">Néma</option>
      <option value="effects">Hangeffektek</option>
      <option value="voice">Hang és bemondás</option>
    </select>
  </label>
</template>

<style scoped>
.game-audio {
  display: grid;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  font-size: .79rem;
}
.game-audio select {
  width: 100%;
  min-height: 44px;
  padding: 4px 7px;
  font: inherit;
}
.compact > span { display: none; }
.compact select { min-height: 36px; }
.game-audio select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
