<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../services/api';
import type { Player } from '../types';
import { identifyPlayer } from '../services/socket';

const router = useRouter();
const player = ref<Player | null>(null);
const tokenBalance = ref(0);
const name = ref('');
const error = ref('');
const busy = ref(false);

const savedPlayerId = Number(localStorage.getItem('party-player-id'));
const savedPlayerName = localStorage.getItem('party-player-name');
if (savedPlayerId > 0 && savedPlayerName) {
  player.value = { id: savedPlayerId, name: savedPlayerName, joinedAt: '', tokenBalance: 0 };
  name.value = savedPlayerName;
  identifyPlayer(savedPlayerId);
  api.getPlayerBalance(savedPlayerId).then(balance => tokenBalance.value = balance.tokenBalance).catch(() => {});
}


async function enter() {
  const trimmedName = name.value.trim();
  if (!trimmedName) return;

  error.value = '';
  busy.value = true;

  try {
    player.value = await api.joinPlayer(trimmedName);
    name.value = player.value.name;
    tokenBalance.value = player.value.tokenBalance ?? 0;
    localStorage.setItem('party-player-name', player.value.name);
    localStorage.setItem('party-player-id', String(player.value.id));
    window.dispatchEvent(new Event('party-player-changed'));
    identifyPlayer(player.value.id);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
function logout() {
  identifyPlayer(null);
  localStorage.removeItem('party-player-id');
  localStorage.removeItem('party-player-name');
  window.dispatchEvent(new Event('party-player-changed'));
  player.value = null;
  tokenBalance.value = 0;
  name.value = '';
  error.value = '';
}
</script>

<template>
  <main v-if="!player" class="page-shell login-shell">
    <section class="join-panel panel login-panel">
      <div>
        <p class="eyebrow">PARTY CASINO</p>
        <h1>Hogy hívnak?</h1>
        <p class="muted">Add meg a neved a belépéshez.</p>
      </div>

      <form @submit.prevent="enter">
        <input v-model="name" maxlength="24" placeholder="A neved" autocomplete="nickname" autofocus>
        <button class="primary" :disabled="busy || !name.trim()">
          {{ busy ? 'Belépés...' : 'Belépés →' }}
        </button>
      </form>

      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </main>

  <main v-else class="page-shell">
    <header class="topbar">
      <a class="brand" href="/">PARTY<span>CASINO</span></a>
      <nav><a href="/leaderboard">Ranglista</a><a href="/display" target="_blank">TV kijelző ↗</a><button class="ghost exit-button" @click="logout">Kilépés</button></nav>
    </header>

    <section class="hero">
      <p class="eyebrow">A TE HELYI KASZINÓD</p>
      <h1>Válassz <span>játékot.</span></h1>
      <p class="muted">Egy platform, állandó játékasztalok.</p>
    </section>

    <section class="welcome panel">
      <div>
        <p class="eyebrow">JÁTÉKOS</p>
        <h2>Szia, {{ player.name }}!</h2>
        <p class="muted">Válassz az állandó játékok közül.</p>
        <p class="player-token-balance">Tokenegyenleg: <strong>{{ tokenBalance }} CR</strong></p>
      </div>
    </section>

    <section class="section-heading">
      <div>
        <p class="eyebrow">JÁTÉKTEREM</p>
        <h2>Válassz játékot</h2>
      </div>
    </section>

    <div class="game-grid">
      <button class="game-card panel" @click="router.push('/roulette')">
        <span class="game-icon">🎡</span>
        <h3>Rulettasztal</h3>
        <p class="muted">Közös asztal, automatikus körök. Mindenki ugyanarra az eredményre játszik.</p>
        <span class="game-link">Játék megnyitása →</span>
      </button>

      <button class="game-card panel" @click="router.push('/slots')">
        <span class="game-icon">🎰</span>
        <h3>Slot machine</h3>
        <p class="muted">Egyéni pörgetések. Minden játékos külön játszik.</p>
        <span class="game-link">Játék megnyitása →</span>
      </button>

      <button class="game-card panel" @click="router.push('/lucky-wheel')">
        <span class="game-icon">🎡</span>
        <h3>Szerencsekerék</h3>
        <p class="muted">Közös party kihívások. Egy játékos pörget, mindenki ugyanazt látja.</p>
        <span class="game-link">Kerék megnyitása →</span>
      </button>

      <article class="game-card panel coming-soon">
        <span class="game-icon">🛍️</span>
        <h3>Shop</h3>
        <p class="muted">A későbbiekben itt válthatod be a játék során szerzett jutalmakat.</p>
        <span class="game-link">Hamarosan</span>
      </article>
    </div>

    <footer>PARTY CASINO <span>•</span> Helyi hálózaton futó party platform</footer>
  </main>
</template>
