<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../services/api';
import type { Player } from '../types';

type AdminPlayer = Player & { online: boolean };
const password = ref('');
const token = ref(localStorage.getItem('party-admin-token') ?? '');
const players = ref<AdminPlayer[]>([]);
const error = ref('');
const busy = ref(false);
const authenticated = ref(false);

async function loadPlayers() {
  if (!token.value) return;
  try {
    players.value = await api.adminPlayers(token.value);
    authenticated.value = true;
    localStorage.setItem('party-admin-token', token.value);
  } catch {
    token.value = '';
    authenticated.value = false;
    localStorage.removeItem('party-admin-token');
  }
}

async function login() {
  if (!password.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await api.adminLogin(password.value);
    token.value = result.token;
    password.value = '';
    await loadPlayers();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function logout() {
  try { if (token.value) await api.adminLogout(token.value); } catch { /* local logout still applies */ }
  token.value = '';
  authenticated.value = false;
  players.value = [];
  localStorage.removeItem('party-admin-token');
}

onMounted(loadPlayers);
</script>

<template>
  <main class="admin-page">
    <header class="admin-topbar">
      <a class="brand" href="/">PARTY<span>CASINO</span></a>
      <span class="admin-label">ADMINISTRATION</span>
    </header>

    <section v-if="!authenticated" class="admin-login panel">
      <p class="eyebrow">RESTRICTED AREA</p>
      <h1>Admin <span>login</span></h1>
      <p class="muted">Add meg az admin jelszót a vezérlőpult eléréséhez.</p>
      <form @submit.prevent="login">
        <input v-model="password" type="password" autocomplete="current-password" placeholder="Admin jelszó" autofocus>
        <button class="primary" :disabled="busy || !password">{{ busy ? 'Belépés...' : 'Belépés' }}</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
      <a class="admin-back" href="/">Vissza a kaszinóba</a>
    </section>

    <section v-else class="admin-content">
      <div class="admin-heading">
        <div><p class="eyebrow">CONTROL PANEL</p><h1>Admin <span>dashboard</span></h1><p class="muted">Játékosok és aktivitási adatok.</p></div>
        <button class="ghost" @click="logout">Kilépés</button>
      </div>

      <div class="admin-stat-grid">
        <article class="panel admin-stat"><span>ÖSSZES JÁTÉKOS</span><strong>{{ players.length }}</strong></article>
        <article class="panel admin-stat"><span>ONLINE JÁTÉKOS</span><strong>{{ players.filter(p => p.online).length }}</strong></article>
      </div>

      <section class="panel admin-players">
        <div class="admin-section-heading"><div><p class="eyebrow">PLAYER DATABASE</p><h2>Játékosok</h2></div><button class="ghost" @click="loadPlayers">Frissítés</button></div>
        <div v-if="!players.length" class="muted admin-empty">Még nincs regisztrált játékos.</div>
        <div v-else class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Állapot</th><th>Játékos</th><th>Azonosító</th><th>Csatlakozott</th></tr></thead>
            <tbody>
              <tr v-for="player in players" :key="player.id">
                <td><span class="player-status" :class="{online:player.online}">{{ player.online ? 'Online' : 'Offline' }}</span></td>
                <td class="player-name">{{ player.name }}</td>
                <td>#{{ player.id }}</td>
                <td>{{ new Date(player.joinedAt).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <p class="admin-footnote">A játékosadatok jelenleg az azonosítót, nevet, csatlakozás idejét és online állapotot tartalmazzák. További statisztikák később bővíthetők.</p>
    </section>
  </main>
</template>
