<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { socket } from '../services/socket';

type NotificationItem = {
  id: number;
  type?: 'event'|'wheel'|'system';
  title?: string;
  message: string;
};

const queue = ref<NotificationItem[]>([]);
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

function pushNotification(payload: Partial<NotificationItem>) {
  if (!payload.message) return;
  const item: NotificationItem = { id: nextId++, type: payload.type ?? 'system', title: payload.title, message: payload.message };
  queue.value = [...queue.value.slice(-2), item];
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    queue.value.shift();
    timer = undefined;
    if (queue.value.length) {
      timer = setTimeout(() => {
        queue.value.shift();
        timer = undefined;
      }, 120);
    }
  }, 5200);
}

onMounted(() => socket.on('party:notification', pushNotification));
onUnmounted(() => {
  socket.off('party:notification', pushNotification);
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="party-notifications" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="party-notification">
      <article v-for="item in queue" :key="item.id" class="party-notification-card" :class="'notification-'+item.type">
        <div class="party-notification-icon">{{ item.type === 'wheel' ? '◎' : item.type === 'event' ? '✦' : '●' }}</div>
        <div class="party-notification-copy">
          <small>{{ item.title ?? 'PARTY CASINO' }}</small>
          <strong>{{ item.message }}</strong>
        </div>
        <button aria-label="Bezárás" @click="queue=queue.filter(entry=>entry.id!==item.id)">×</button>
      </article>
    </TransitionGroup>
  </div>
</template>
