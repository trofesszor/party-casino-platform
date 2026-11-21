<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { api } from '../services/api';
import { socket } from '../services/socket';

type NotificationItem = {
  id: number;
  type?: 'event'|'wheel'|'system'|'duel'|'roulette'|'slots'|'leaderboard';
  title?: string|null;
  message: string;
  createdAt?: string;
};

const queue = ref<NotificationItem[]>([]);
const history = ref<NotificationItem[]>([]);
const historyOpen = ref(false);
const historyLoading = ref(false);
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
let poller: ReturnType<typeof setInterval> | undefined;
let lastServerNotificationId = 0;

function pushNotification(payload: Partial<NotificationItem>) {
  if (!payload.message) return;
  const item: NotificationItem = { id: nextId++, type: payload.type ?? 'system', title: payload.title, message: payload.message, createdAt: new Date().toISOString() };
  queue.value = [...queue.value.slice(-2), item];
  history.value = [item, ...history.value].slice(0, 100);
  if (timer) clearTimeout(timer);
  lastServerNotificationId = Math.max(lastServerNotificationId, item.id);
  timer = setTimeout(() => {
    queue.value.shift();
    timer = undefined;
    if (queue.value.length) {
      timer = setTimeout(() => { queue.value.shift(); timer = undefined; }, 120);
    }
  }, 5200);
}

async function syncNotifications(showNew = true) {
  const playerId = Number(localStorage.getItem('party-player-id')) || undefined;
  if (!playerId) return;
  try {
    const items = await api.getPartyNotifications(playerId);
    const newest = items.length ? items[0].id : 0;
    if (showNew && lastServerNotificationId > 0) {
      const fresh = items.filter(item => item.id > lastServerNotificationId).reverse();
      fresh.forEach(item => pushNotification(item));
    }
    lastServerNotificationId = Math.max(lastServerNotificationId, newest);
    history.value = items;
  } catch {}
}

async function openHistory() {
  historyOpen.value = true;
  historyLoading.value = true;
  try { await syncNotifications(false); }
  finally { historyLoading.value = false; }
}

function formatDate(value?: string) {
  if (!value) return '';
  const normalized = value.includes('Z') ? value : value.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('hu-HU', { month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

onMounted(async () => {
  socket.on('party:notification', pushNotification);
  await syncNotifications(false);
  poller = setInterval(() => syncNotifications(true), 2500);
});
onUnmounted(() => {
  socket.off('party:notification', pushNotification);
  if (timer) clearTimeout(timer);
  if (poller) clearInterval(poller);
});
</script>

<template>
  <button class="party-history-button" @click="openHistory" aria-label="Értesítések előzményei">
    <span>♢</span><b>Értesítések</b>
    <i v-if="history.length">{{ history.length > 99 ? '99+' : history.length }}</i>
  </button>

  <div class="party-notification-center">
    <div class="party-notifications" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="party-notification">
        <article v-for="item in queue" :key="item.id" class="party-notification-card" :class="'notification-'+item.type">
          <div class="party-notification-icon">{{ item.type === 'wheel' ? '◎' : item.type === 'event' ? '✦' : item.type === 'duel' ? '⚔' : '●' }}</div>
          <div class="party-notification-copy">
            <small>{{ item.title ?? 'PARTY CASINO' }}</small>
            <strong>{{ item.message }}</strong>
          </div>
          <button aria-label="Bezárás" @click="queue=queue.filter(entry=>entry.id!==item.id)">×</button>
        </article>
      </TransitionGroup>
    </div>

    <div v-if="historyOpen" class="party-history-backdrop" @click.self="historyOpen=false">
      <section class="party-history-panel">
        <header>
          <div><small>PARTY CASINO</small><h2>Értesítések</h2></div>
          <button @click="historyOpen=false" aria-label="Bezárás">×</button>
        </header>
        <p v-if="historyLoading" class="party-history-empty">Betöltés…</p>
        <p v-else-if="!history.length" class="party-history-empty">Még nincs értesítés.</p>
        <div v-else class="party-history-list">
          <article v-for="item in history" :key="item.id" class="party-history-item" :class="'notification-'+item.type">
            <span class="party-history-icon">{{ item.type === 'wheel' ? '◎' : item.type === 'event' ? '✦' : '●' }}</span>
            <div><small>{{ item.title ?? 'PARTY CASINO' }} · {{ formatDate(item.createdAt) }}</small><strong>{{ item.message }}</strong></div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>