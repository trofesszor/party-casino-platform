<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../services/api';
import type { Player } from '../types';
const router = useRouter();
const player = ref<Player | null>(null);
const name = ref(localStorage.getItem('party-player-name') || '');
const error = ref('');
const busy = ref(false);
const restoring = ref(false);
async function enter() {
  error.value = ''; busy.value = true;
  try {
    player.value = await api.joinPlayer(name.value);
    name.value = player.value.name;
    localStorage.setItem('party-player-name', player.value.name);
    localStorage.setItem('party-player-id', String(player.value.id));
  } catch (e: any) { error.value = e.message; }
  finally { busy.value = false; }
}
onMounted(() => {
  const savedName = localStorage.getItem('party-player-name');
  if (!savedName) return;
  restoring.value = true;
  api.joinPlayer(savedName).then((p) => {
    player.value = p; name.value = p.name;
    localStorage.setItem('party-player-id', String(p.id));
    localStorage.setItem('party-player-name', p.name);
  }).catch((e: any) => { error.value = e.message; }).finally(() => { restoring.value = false; });
});
</script>
<template>
  <main class="page-shell">
    <header class="topbar"><a class="brand" href="/">PARTY<span>CASINO</span></a><nav><a href="/display" target="_blank">TV kijelző ↗</a></nav></header>
    <section class="hero"><p class="eyebrow">A TE HELYI KASZINÓD</p><h1>Válassz <span>játékot.</span></h1><p class="muted">Egy platform, állandó játékasztalok. Nincs esemény létrehozás vagy csatlakozás.</p></section>
    <section v-if="!player" class="join-panel panel"><div><p class="eyebrow">JÁTÉKOS BELÉPÉS</p><h2>Hogy hívnak?</h2><p class="muted">Csak a neved szükséges. Nincs regisztráció vagy jelszó.</p></div><form @submit.prevent="enter"><input v-model="name" maxlength="24" placeholder="Add meg a neved" autocomplete="nickname"><button class="primary" :disabled="busy || restoring || !name.trim()">Belépés →</button></form></section>
    <section v-else class="welcome panel"><div><p class="eyebrow">JÁTÉKOS</p><h2>Szia, {{ player.name }}!</h2><p class="muted">Válassz az állandó játékok közül.</p></div><button class="ghost" @click="player=null; localStorage.removeItem('party-player-id'); localStorage.removeItem('party-player-name'); name=''">Név váltása</button></section>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="section-heading"><div><p class="eyebrow">JÁTÉKTEREM</p><h2>Válassz játékot</h2></div></section>
    <div class="game-grid">
      <button class="game-card panel" @click="router.push('/roulette')"><span class="game-icon">🎡</span><h3>Rulettasztal</h3><p class="muted">Közös asztal, automatikus körök. Mindenki ugyanarra az eredményre játszik.</p><span class="game-link">Játék megnyitása →</span></button>
      <button class="game-card panel" :disabled="!player" @click="router.push('/slots')"><span class="game-icon">🎰</span><h3>Slot machine</h3><p class="muted">Egyéni pörgetések. Minden játékos külön játszik.</p><span class="game-link">{{ player ? 'Játék megnyitása →' : 'Belépés szükséges' }}</span></button>
      <article class="game-card panel coming-soon"><span class="game-icon">🛍️</span><h3>Shop</h3><p class="muted">A későbbiekben itt válthatod be a játék során szerzett jutalmakat.</p><span class="game-link">Hamarosan</span></article>
    </div>
    <footer>PARTY CASINO <span>•</span> Helyi hálózaton futó party platform</footer>
  </main>
</template>
