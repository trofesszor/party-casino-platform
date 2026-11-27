<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { io } from 'socket.io-client';
import BlackjackCards from '../components/BlackjackCards.vue';
import PlayerWallet from '../components/PlayerWallet.vue';

type Card = { rank: string; suit: string };
type Hand = {
  name: string; mine: boolean; left: boolean; cards: Card[]; total: number; stake: number;
  finished: boolean; result: 'blackjack' | 'won' | 'push' | 'lost' | 'bust' | null;
  payout: number | null; canDouble: boolean;
};
type Seat = {
  position: number;
  occupant: { name: string; mine: boolean; bet: number | null; skipped: boolean; nextRound: boolean } | null;
  hand: Hand | null;
};
type Table = {
  phase: 'betting' | 'playing' | 'results';
  round: number;
  activeSeat: number | null;
  allowedBets: number[];
  balance: number | null;
  nextRoundAt: number | null;
  dealer: Card[];
  dealerHidden: boolean;
  dealerTotal: number | null;
  seats: Seat[];
};
type Command = 'sit' | 'leave' | 'bet' | 'skip' | 'hit' | 'stand' | 'double';

const playerId = Number(localStorage.getItem('party-player-id')) || 0;
const socket = io('/blackjack', { auth: { playerId }, autoConnect: false });
const connected = ref(false);
const table = ref<Table>();
const error = ref('');
const waiting = ref(new Set<number>());
const choices = ref<Record<number, number>>({});
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
const labels = { blackjack: 'Blackjack', won: 'Nyert', push: 'Döntetlen', lost: 'Veszített', bust: 'Besokallt' };
const remaining = computed(() => Math.max(0, Math.ceil(((table.value?.nextRoundAt ?? now.value) - now.value) / 1000)));
const dealerCards = computed(() => {
  const state = table.value;
  return state ? [...state.dealer, ...(state.dealerHidden ? [null] : [])] : [];
});
const active = computed(() => table.value?.seats.find(seat => seat.position === table.value?.activeSeat));
const myTurn = computed(() => table.value?.phase === 'playing' ? active.value?.hand?.mine : active.value?.occupant?.mine);
const turnName = computed(() => active.value?.hand?.name ?? active.value?.occupant?.name);
const busy = computed(() => !connected.value || !active.value || waiting.value.has(active.value.position));
const occupied = computed(() => table.value?.seats.filter(seat => seat.occupant).length ?? 0);
const format = (amount: number) => amount.toLocaleString('hu-HU') + ' CR';

function setTable(next: Table) {
  if (table.value?.balance !== next.balance && next.balance !== null) {
    window.dispatchEvent(new Event('party-player-changed'));
  }
  table.value = next;
}
function onConnect() { connected.value = true; error.value = ''; }
function onDisconnect() { connected.value = false; waiting.value = new Set(); }
function onConnectError() { error.value = 'Az asztal átmenetileg nem érhető el.'; }
function closeTable() { socket.disconnect(); }
function reopenTable() { if (!socket.connected) socket.connect(); }
function showSeat(seat: number) {
  document.getElementById('bj-seat-' + seat)?.scrollIntoView({ block: 'nearest' });
}
function stake(seat: number) { return choices.value[seat] ?? table.value?.allowedBets[0] ?? 2; }

function seatStatus(seat: Seat) {
  if (seat.occupant?.nextRound || table.value?.phase !== 'betting') return 'A következő körben játszik';
  if (seat.occupant?.skipped) return 'Kihagyja a kört';
  if (seat.occupant?.bet) return format(seat.occupant.bet) + ' tét rögzítve';
  return seat.position === active.value?.position ? 'Most tesz tétet' : 'Sorra vár';
}

async function act(action: Command, seat: number) {
  if (!connected.value || waiting.value.has(seat)) return;
  waiting.value.add(seat);
  error.value = '';
  try {
    const reply = await socket.timeout(5000).emitWithAck('blackjack:command', { action, seat, amount: stake(seat) }) as { ok: boolean; error?: string };
    if (!reply.ok) error.value = reply.error || 'A művelet sikertelen.';
  } catch {
    error.value = 'Nem érkezett válasz az asztaltól. Ellenőrizd a széked állapotát.';
  } finally {
    waiting.value.delete(seat);
  }
}
onMounted(() => {
  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('connect_error', onConnectError);
  socket.on('blackjack:state', setTable);
  reopenTable();
  window.addEventListener('pagehide', closeTable);
  window.addEventListener('pageshow', reopenTable);
  clock = setInterval(() => { now.value = Date.now(); }, 250);
});
onUnmounted(() => {
  window.removeEventListener('pagehide', closeTable);
  window.removeEventListener('pageshow', reopenTable);
  clearInterval(clock);
  socket.removeAllListeners();
  closeTable();
});
</script>

<template>
  <main class="bj-page">
    <div class="bj-shell">
      <header class="bj-heading">
        <div><h1>Blackjack</h1><p>Közös asztal · {{ occupied }} / 6 foglalt szék</p></div>
        <div v-if="table && table.balance !== null" class="bj-balance"><span>Egyenleg</span><strong>{{ format(table.balance) }}</strong></div>
        <RouterLink v-if="!playerId" class="primary" to="/">Csatlakozás névvel</RouterLink>
      </header>
      <p v-if="error" class="bj-alert" role="alert">{{ error }}</p>
      <p v-if="!connected" class="bj-alert" role="status">Kapcsolódás az asztalhoz…</p>

      <section v-if="table" class="bj-table" aria-label="Hatüléses blackjackasztal">
        <div class="bj-dealer">
          <div class="bj-dealer-head">
            <h2>Osztó<span v-if="table.dealerTotal !== null">{{ table.dealerTotal }}</span></h2>
            <small>{{ table.round }}. kör</small>
          </div>
          <BlackjackCards v-if="dealerCards.length" :cards="dealerCards" />
        </div>

        <div class="bj-turn" :class="{ 'bj-turn-mine': myTurn }">
          <div class="bj-turn-copy" role="status" aria-atomic="true">
            <template v-if="active">
              <span class="bj-turn-phase">{{ table.phase === 'betting' ? 'Tétválasztás' : 'Játékos köre' }}</span>
              <button class="bj-current-link" type="button" @click="showSeat(active.position)">{{ active.position }}. szék · {{ myTurn ? 'Te következel' : turnName }} <span aria-hidden="true">↓</span></button>
              <span v-if="active.hand">Kézérték {{ active.hand.total }}</span>
            </template>
            <template v-else-if="table.phase === 'results'">
              <span class="bj-turn-phase">Eredmények</span>
              <strong>Következő kör {{ remaining }} mp múlva</strong>
            </template>
            <strong v-else>Foglalj egy szabad széket.</strong>
          </div>
          <div v-if="active && myTurn" :key="active.position" class="bj-actions">
            <template v-if="table.phase === 'betting'">
              <select aria-label="Tét összege" :value="stake(active.position)" :disabled="busy"
                @change="choices[active.position] = Number(($event.target as HTMLSelectElement).value)">
                <option v-for="amount in table.allowedBets" :key="amount" :value="amount">{{ format(amount) }}</option>
              </select>
              <button class="primary" type="button" :disabled="busy || (table.balance ?? 0) < stake(active.position)" @click="act('bet', active.position)">Tétet teszek</button>
              <button class="ghost" type="button" :disabled="busy" @click="act('skip', active.position)">Kihagyom</button>
            </template>
            <template v-else>
              <button class="primary" type="button" :disabled="busy" @click="act('hit', active.position)">Kérek lapot</button>
              <button class="ghost" type="button" :disabled="busy" @click="act('stand', active.position)">Megállok</button>
              <button class="ghost" type="button" :disabled="busy || !active.hand?.canDouble" @click="act('double', active.position)">Duplázok</button>
            </template>
          </div>
        </div>

        <div class="bj-seats">
          <article v-for="seat in table.seats" :key="seat.position" class="bj-seat" :id="'bj-seat-' + seat.position"
            :class="{ 'bj-seat-active': seat.position === active?.position, 'bj-seat-owned': seat.occupant?.mine, 'bj-seat-empty': !seat.occupant && !seat.hand }">
            <header class="bj-seat-head">
              <div class="bj-seat-identity">
                <span class="bj-seat-number" :aria-label="seat.position + '. szék'">{{ seat.position }}</span>
                <div class="bj-seat-name">
                  <small v-if="seat.position === active?.position">Soron</small>
                  <small v-else-if="seat.occupant?.mine">Saját szék</small>
                  <h3>{{ seat.occupant?.name || 'Szabad' }}</h3>
                </div>
              </div>
              <button v-if="seat.occupant?.mine" class="bj-link" type="button" :disabled="!connected || waiting.has(seat.position)" @click="act('leave', seat.position)">Felállok</button>
              <button v-else-if="!seat.occupant" class="bj-link" type="button" :disabled="!playerId || !connected || waiting.has(seat.position)" @click="act('sit', seat.position)">Leülök</button>
            </header>

            <div v-if="seat.hand" class="bj-hand">
              <div class="bj-hand-meta">
                <span>{{ seat.hand.left ? seat.hand.name + ' · előző kéz' : format(seat.hand.stake) + ' tét' }}</span>
                <strong>{{ seat.hand.total }}</strong>
              </div>
              <BlackjackCards :cards="seat.hand.cards" />
              <div v-if="seat.hand.result" class="bj-result" :class="{ 'bj-gain': (seat.hand.payout ?? 0) > seat.hand.stake }">
                <strong>{{ labels[seat.hand.result] }}</strong>
                <span>{{ format(seat.hand.payout ?? 0) }} jóváírás</span>
              </div>
              <p v-else-if="seat.hand.left" class="bj-seat-status">A kéz automatikusan megállt.</p>
              <p v-else-if="seat.hand.finished" class="bj-seat-status">Döntés kész</p>
              <p v-else class="bj-seat-status">{{ seat.position === active?.position ? 'Most játszik' : 'Sorra vár' }}</p>
            </div>

            <p v-else-if="seat.occupant" class="bj-seat-status">{{ seatStatus(seat) }}</p>
          </article>
        </div>
      </section>

      <PlayerWallet inline class="bj-wallet" />
      <details class="bj-rules">
        <summary>Asztalszabályok</summary>
        <p>A foglalt székek számsorrendben teszik meg a tétet és játsszák le a kezüket. Minden szék külön tétet és lapokat kap. Az osztó 17-nél megáll. A blackjack 3:2-t fizet, döntetlennél a tét visszajár. Duplázáskor egy lapot kapsz, majd megállsz.</p>
        <p>Osztás előtt felállva visszakapod a téted. Osztás után a kezed megáll és a kör végén elszámoljuk. Ugyanez történik, ha bezárod az oldalt.</p>
      </details>
    </div>
  </main>
</template>
