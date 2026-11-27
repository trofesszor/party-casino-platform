<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { io } from 'socket.io-client';
import BlackjackCards from '../components/BlackjackCards.vue';
import GameAudioControl from '../components/GameAudioControl.vue';
import PlayerWallet from '../components/PlayerWallet.vue';
import { useGameAudio } from '../services/game-audio';

type Card = { rank: string; suit: string };
type Outcome = 'blackjack' | 'won' | 'push' | 'lost' | 'bust';
type Table = {
  phase: 'betting' | 'playing' | 'results';
  round: number;
  revision: number;
  allowedBets: number[];
  balance: number | null;
  dealer: Card[];
  dealerHidden: boolean;
  dealerTotal: number | null;
  hand: { cards: Card[]; total: number; stake: number; result: Outcome | null; payout: number | null; canDouble: boolean } | null;
};
type Command = 'bet' | 'hit' | 'stand' | 'double';

const playerId = Number(localStorage.getItem('party-player-id')) || 0;
const socket = io('/blackjack', { auth: { playerId }, autoConnect: false });
const audio = useGameAudio();
const connected = ref(false);
const table = ref<Table>();
const error = ref('');
const waiting = ref(false);
const stake = ref(1000);
const labels: Record<Outcome, string> = { blackjack: 'Blackjack', won: 'Nyertél', push: 'Döntetlen', lost: 'Az osztó nyert', bust: 'Besokalltál' };
const dealerCards = computed(() => {
  const state = table.value;
  return state ? [...state.dealer, ...(state.dealerHidden ? [null] : [])] : [];
});
const disabled = computed(() => !connected.value || waiting.value);
const format = (amount: number) => amount.toLocaleString('hu-HU') + ' CR';

function setTable(next: Table) {
  const previous = table.value;
  table.value = next;
  if (!next.allowedBets.includes(stake.value)) stake.value = next.allowedBets[0];
  if (previous?.balance !== next.balance && next.balance !== null) window.dispatchEvent(new Event('party-player-changed'));
  if (!previous || !next.hand) return;
  const newRound = previous.round !== next.round;
  if (newRound) audio.effect('start');
  if (next.hand.result && (newRound || previous.phase !== 'results')) {
    const payout = next.hand.payout ?? 0;
    audio.effect(payout > next.hand.stake ? 'win' : 'end');
    audio.announce((newRound ? 'Új osztás. ' : '') + 'Kör vége. ' + labels[next.hand.result] + (payout ? '. Jóváírás: ' + payout + ' kredit.' : '.'));
  } else if (newRound && next.phase === 'playing') {
    audio.announce('Új osztás.');
  }
}

function closeTable() { socket.disconnect(); }
function reopenTable() { if (!socket.connected) socket.connect(); }

async function act(action: Command) {
  const state = table.value;
  if (!state || disabled.value) return;
  waiting.value = true;
  error.value = '';
  try {
    const reply = await socket.timeout(5000).emitWithAck('blackjack:command', {
      action, round: state.round, revision: state.revision, amount: stake.value,
    }) as { ok: boolean; error?: string };
    if (!reply.ok) error.value = reply.error || 'A művelet sikertelen.';
  } catch {
    error.value = 'Nem érkezett válasz az asztaltól.';
  } finally {
    waiting.value = false;
  }
}
onMounted(() => {
  socket.on('connect', () => { connected.value = true; error.value = ''; });
  socket.on('disconnect', () => { connected.value = false; });
  socket.on('connect_error', () => { error.value = 'Az asztal átmenetileg nem érhető el.'; });
  socket.on('blackjack:state', setTable);
  reopenTable();
  window.addEventListener('pagehide', closeTable);
  window.addEventListener('pageshow', reopenTable);
});
onUnmounted(() => {
  window.removeEventListener('pagehide', closeTable);
  window.removeEventListener('pageshow', reopenTable);
  socket.removeAllListeners();
  closeTable();
});
</script>

<template>
  <main class="bj-page">
    <div class="bj-shell">
      <header class="bj-heading">
        <div><h1>Blackjack</h1><p>Saját asztal · Játék az osztó ellen</p></div>
        <GameAudioControl />
      </header>

      <section v-if="table && table.balance !== null" class="bj-table" aria-label="Saját blackjackasztal">
        <div class="bj-table-top">
          <span>{{ table.round ? table.round + '. kör' : 'Első osztás' }}</span>
          <strong>{{ format(table.balance) }}</strong>
        </div>
        <div class="bj-hands">
          <div class="bj-hand">
            <h2>Osztó <span v-if="table.dealerTotal !== null">{{ table.dealerTotal }}</span></h2>
            <BlackjackCards v-if="dealerCards.length" :cards="dealerCards" />
            <p v-else>Az osztásra vár</p>
          </div>
          <div class="bj-hand">
            <h2>A kezed <span v-if="table.hand">{{ table.hand.total }}</span></h2>
            <BlackjackCards v-if="table.hand" :cards="table.hand.cards" />
            <p v-else>Válassz tétet az osztáshoz</p>
          </div>
        </div>
        <div v-if="table.hand" class="bj-summary" role="status" aria-atomic="true">
          <span>Tét {{ format(table.hand.stake) }}</span>
          <template v-if="table.hand.result">
            <strong>{{ labels[table.hand.result] }}</strong>
            <span v-if="table.hand.payout">{{ format(table.hand.payout) }} jóváírás</span>
          </template>
          <strong v-else>Te következel</strong>
        </div>
        <div class="bj-actions">
          <template v-if="table.phase === 'playing'">
            <button class="primary" type="button" :disabled="disabled" @click="act('hit')">Kérek lapot</button>
            <button class="ghost" type="button" :disabled="disabled" @click="act('stand')">Megállok</button>
            <button class="ghost" type="button" :disabled="disabled || !table.hand?.canDouble" @click="act('double')">Duplázok</button>
          </template>
          <template v-else>
            <label class="bj-stake">Tét
              <select v-model="stake" :disabled="disabled">
                <option v-for="amount in table.allowedBets" :key="amount" :value="amount">{{ format(amount) }}</option>
              </select>
            </label>
            <button class="primary" type="button" :disabled="disabled || table.balance < stake" @click="act('bet')">{{ table.round ? 'Új osztás' : 'Lapokat kérek' }}</button>
          </template>
        </div>
        <p v-if="table.phase !== 'playing' && table.balance < stake" class="bj-message">Nincs elég CR a kiválasztott téthez.</p>
      </section>
      <p v-if="!connected" class="bj-message" role="status">Kapcsolódás az asztalhoz…</p>
      <p v-if="error" class="bj-message" role="alert">{{ error }}</p>
      <RouterLink v-if="connected && table?.balance === null" class="primary" to="/">Csatlakozás névvel</RouterLink>

      <PlayerWallet v-if="playerId" inline class="bj-wallet" />
      <details class="bj-rules">
        <summary>Asztalszabályok</summary>
        <p>Az osztó 17-nél megáll. A blackjack 3:2-t fizet, döntetlennél a tét visszajár. Duplázáskor egy lapot kapsz, majd megállsz. Ha bezárod a játékot, a kezed megáll és a kör elszámolódik.</p>
      </details>
    </div>
  </main>
</template>
