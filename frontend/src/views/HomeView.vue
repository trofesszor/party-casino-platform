<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api } from '../services/api';
import { socket } from '../services/socket';
import type { PartyEvent, Player } from '../types';
const player = ref<Player | null>(null);
const name = ref(localStorage.getItem('party-player-name') || '');
const events = ref<PartyEvent[]>([]);
const error = ref(''); const busy = ref(false); const restoring = ref(false);
const myEventIds = computed(() => new Set(events.value.filter(e => e.participants.some(p => p.id === player.value?.id)).map(e => e.id)));
async function refresh() { events.value = await api.getEvents(); }
async function enter() { error.value=''; busy.value=true; try { player.value = await api.joinPlayer(name.value); name.value=player.value.name; localStorage.setItem('party-player-name', player.value.name); localStorage.setItem('party-player-id', String(player.value.id)); } catch(e:any) { error.value=e.message; } finally { busy.value=false; } }
async function join(event: PartyEvent) { if (!player.value) return; error.value=''; try { await api.joinEvent(event.id, player.value.id); await refresh(); } catch(e:any) { error.value=e.message; } }
onMounted(() => {
  refresh().catch(e => error.value = e.message);
  socket.on('events:changed', refresh);

  const savedName = localStorage.getItem('party-player-name');
  if (savedName) {
    restoring.value = true;
    api.joinPlayer(savedName)
      .then(restoredPlayer => {
        player.value = restoredPlayer;
        name.value = restoredPlayer.name;
        localStorage.setItem('party-player-id', String(restoredPlayer.id));
        localStorage.setItem('party-player-name', restoredPlayer.name);
      })
      .catch(e => { error.value = e.message; })
      .finally(() => { restoring.value = false; });
  }
});
onUnmounted(() => { socket.off('events:changed', refresh); });
</script>
<template>
  <main class="page-shell">
    <header class="topbar"><a class="brand" href="/">PARTY<span>CASINO</span></a><nav><a href="/display" target="_blank">TV kijelző ↗</a><a href="/admin">Admin</a></nav></header>
    <section class="hero"><p class="eyebrow">PRIVATE PARTY PLATFORM</p><h1>A buli <span>játéktáblája.</span></h1><p class="muted">Csatlakozz az aktuális eseményekhez, és játsszatok együtt.</p></section>
    <section v-if="!player" class="join-panel panel"><div><p class="eyebrow">JÁTÉKOS BELÉPÉS</p><h2>Hogy hívnak?</h2><p class="muted">Csak a nevedre van szükség. Nincs regisztráció vagy jelszó.</p></div><form @submit.prevent="enter"><input v-model="name" maxlength="24" placeholder="Add meg a neved" autocomplete="nickname"><button class="primary" :disabled="busy || restoring || !name.trim()">Belépés <span>→</span></button></form></section>
    <section v-else class="welcome panel"><div><p class="eyebrow">BEJELENTKEZVE</p><h2>Szia, {{ player.name }}!</h2><p class="muted">Válassz egy nyitott eseményt lentebb.</p></div><button class="ghost" @click="player=null">Név váltása</button></section>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="section-heading"><div><p class="eyebrow">MOST A BULIBAN</p><h2>Aktív események</h2></div><button class="ghost" @click="refresh">Frissítés ↻</button></section>
    <div v-if="!events.length" class="empty panel"><div class="empty-icon">✳</div><h3>Még nincs meghirdetett esemény</h3><p class="muted">Az új események itt és a TV kijelzőn is megjelennek.</p></div>
    <div v-else class="event-grid"><article v-for="event in events" :key="event.id" class="event-card panel"><div class="event-card-top"><span class="status" :class="event.status.toLowerCase()">{{ event.status === 'OPEN' ? 'CSATLAKOZÁS NYITVA' : event.status === 'RUNNING' ? 'ÉLŐ' : 'LEZÁRVA' }}</span><span class="event-type">{{ event.eventType }}</span></div><h3>{{ event.title }}</h3><p class="muted description">{{ event.description || 'Készülj, hamarosan kezdődik!' }}</p><div class="event-meta"><span>♙ {{ event.participantCount }}{{ event.maxPlayers ? ` / ${event.maxPlayers}` : '' }} játékos</span><span>{{ event.participants.map(p=>p.name).join(', ') || 'Még nincs résztvevő' }}</span></div><button v-if="player && event.status==='OPEN' && !myEventIds.has(event.id)" class="primary full" @click="join(event)">Csatlakozom <span>→</span></button><div v-else-if="myEventIds.has(event.id)" class="joined-label">✓ Csatlakoztál</div><div v-else class="muted small">{{ event.status==='RUNNING' ? 'Az esemény már elkezdődött.' : 'Az esemény lezárult.' }}</div></article></div>
    <footer>PARTY CASINO <span>•</span> Helyi hálózaton futó party platform</footer>
  </main>
</template>
