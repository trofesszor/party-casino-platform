<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../services/api';

type Transaction = { id: number; amount: number; balanceAfter: number; type: string; description: string; createdAt: string };
const route = useRoute();
const playerId = ref(Number(localStorage.getItem('party-player-id')) || 0);
const balance = ref(0);
const history = ref<Transaction[]>([]);
const expanded = ref(false);
const loadingHistory = ref(false);
const error = ref('');
let refreshTimer: ReturnType<typeof setInterval> | undefined;
const visible = computed(() => playerId.value > 0 && route.path !== '/admin' && route.path !== '/display' && route.query.display !== '1');
const formattedBalance = computed(() => balance.value.toLocaleString('hu-HU'));
function syncPlayer() {
  const nextId = Number(localStorage.getItem('party-player-id')) || 0;
  if (nextId !== playerId.value) {
    playerId.value = nextId;
    balance.value = 0;
    history.value = [];
    expanded.value = false;
  }
}
async function refreshBalance() {
  syncPlayer();
  if (!playerId.value) return;
  try { balance.value = (await api.getPlayerBalance(playerId.value)).tokenBalance; }
  catch { /* transient network errors should not hide the wallet */ }
}
async function loadHistory() {
  if (!playerId.value) return;
  loadingHistory.value = true;
  error.value = '';
  try {
    history.value = await api.getPlayerTransactions(playerId.value);
    await refreshBalance();
  } catch (e: any) { error.value = e.message || 'Nem sikerült betölteni az előzményeket.'; }
  finally { loadingHistory.value = false; }
}
async function toggleHistory() {
  expanded.value = !expanded.value;
  if (expanded.value) await loadHistory();
}
function formatDate(value: string) {
  const date = new Date(value.includes('Z') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('hu-HU', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
watch(() => route.fullPath, () => { syncPlayer(); });
onMounted(() => {
  refreshBalance();
  refreshTimer = setInterval(refreshBalance, 4000);
  window.addEventListener('storage', syncPlayer);
});
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  window.removeEventListener('storage', syncPlayer);
});
</script>

<template>
  <aside v-if="visible" class="player-wallet" :class="{ expanded }">
    <button class="wallet-summary" @click="toggleHistory" :aria-expanded="expanded">
      <span class="wallet-coin">C</span>
      <span class="wallet-copy"><small>EGYENLEGED</small><strong>{{ formattedBalance }} <em>CR</em></strong></span>
      <span class="wallet-chevron">{{ expanded ? '−' : '+' }}</span>
    </button>
    <section v-if="expanded" class="wallet-history">
      <header><div><small>SAJÁT FIÓK</small><h3>Tranzakciók</h3></div><button class="wallet-close" @click="expanded=false" aria-label="Bezárás">×</button></header>
      <p v-if="loadingHistory" class="wallet-empty">Betöltés…</p>
      <p v-else-if="error" class="wallet-error">{{ error }}</p>
      <p v-else-if="!history.length" class="wallet-empty">Még nincs tranzakciód.</p>
      <div v-else class="wallet-transactions">
        <article v-for="item in history" :key="item.id" class="wallet-transaction">
          <span class="wallet-transaction-icon" :class="{ positive: item.amount > 0, negative: item.amount < 0 }">{{ item.amount > 0 ? '+' : '−' }}</span>
          <span class="wallet-transaction-copy"><strong>{{ item.description }}</strong><small>{{ formatDate(item.createdAt) }}</small></span>
          <span class="wallet-transaction-amount" :class="{ positive: item.amount > 0, negative: item.amount < 0 }">{{ item.amount > 0 ? '+' : '' }}{{ item.amount }} CR</span>
        </article>
      </div>
      <footer>EGYENLEG <strong>{{ formattedBalance }} CR</strong></footer>
    </section>
  </aside>
</template>
