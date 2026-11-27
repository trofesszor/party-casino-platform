<script setup lang="ts">
import { activateGameAudio, useGameAudio } from '../services/game-audio';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { socket } from '../services/socket';
import { api } from '../services/api';
import type { RouletteState } from '../types';
import RouletteWheel from '../components/RouletteWheel.vue';

type ScreenMode = 'roulette' | 'wheel';
const state = ref<RouletteState|null>(null);
const visibleRouletteRound = ref<number | null>(null);
const players = ref<{id:number;name:string}[]>([]);
type DisplayWheelState = Awaited<ReturnType<typeof api.getLuckyWheel>> & { spinnerPlayerId?: number|null };
const wheel = ref<DisplayWheelState|null>(null);
const wheelRotation = ref(0);
const wheelTransitionMs = ref(0);
const now = ref(Date.now());
let animatedWheelSpinId: string|null = null;
let wheelClock: ReturnType<typeof setInterval>|undefined;
const activeScreen = ref<ScreenMode>('roulette');
const soundOn = ref(false);
const tvAudio = useGameAudio(() => soundOn.value);
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let rouletteVersion = 0;
let wheelVersion = 0;
let liveRouletteRound: number | null = null;

const screenLabel = computed(() => activeScreen.value === 'roulette' ? 'Közös rulettasztal' : 'Szerencsekerék');
const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const latestNumbers = computed(() => {
  const current = state.value?.currentRound;
  const history = state.value?.history ?? [];
  if (current?.status !== 'COMPLETED' || current.roundNumber !== visibleRouletteRound.value || current.resultNumber === null) {
    return history.slice(0, 10);
  }
  return [
    { roundNumber: current.roundNumber, resultNumber: current.resultNumber },
    ...history.filter(item => item.roundNumber !== current.roundNumber),
  ].slice(0, 10);
});
const numberColor = (number: number) => number === 0 ? 'green' : redNumbers.has(number) ? 'red' : 'black';
const colorLabels = { green: 'zöld', red: 'piros', black: 'fekete' };

function toggleSound() {
  soundOn.value = !soundOn.value;
  if (soundOn.value) {
    void activateGameAudio().then(() => tvAudio.effect('start'));
    tvAudio.announce('A tévé hangja bekapcsolva.');
  } else tvAudio.stopSpeech();
}

watch(activeScreen, () => tvAudio.stopSpeech());

const wheelSlices = computed(() => {
  const segments = wheel.value?.segments ?? []; const count = segments.length || 1;
  return segments.map((segment,index) => {
    const start=-90+index*360/count, end=-90+(index+1)*360/count;
    const point=(angle:number,radius:number):[number,number]=>[200+radius*Math.cos(angle*Math.PI/180),200+radius*Math.sin(angle*Math.PI/180)];
    const [sx,sy]=point(start,178), [ex,ey]=point(end,178), [tx,ty]=point((start+end)/2,112);
    const large=360/count>180?1:0;
    const palette=['#b78b39','#263a30','#8d3b42','#293b55','#72523b','#354b45','#755a82','#9a7135','#3c4652','#914d39','#466a61','#62523b'];
    return {...segment,path:'M 200 200 L '+sx+' '+sy+' A 178 178 0 '+large+' 1 '+ex+' '+ey+' Z',tx,ty,angle:(start+end)/2,color:palette[index%palette.length]};
  });
});
const currentSpinnerName = computed(() => { const id=wheel.value?.spinnerPlayerId; return id ? players.value.find(player=>player.id===id)?.name ?? 'Egy játékos' : null; });
const isWheelSpinning = computed(()=>wheel.value?.status==='SPINNING');
const wheelRemaining = computed(()=>Math.max(0,(wheel.value?.endsAt??0)-now.value));
function wheelTargetRotation(s:DisplayWheelState){
  if(!s.winner||!s.segments.length)return null;
  const index=s.segments.findIndex(item=>item.id===s.winner?.id); if(index<0)return null;
  const center=-90+(index+.5)*360/s.segments.length; return (((-90-center)%360)+360)%360;
}
async function animateDisplayWheel(s:DisplayWheelState){
  if(s.status!=='SPINNING'||!s.spinId||animatedWheelSpinId===s.spinId)return;
  const target=wheelTargetRotation(s); if(target===null)return;
  animatedWheelSpinId=s.spinId; const current=wheelRotation.value; const modulo=((current%360)+360)%360;
  const delta=(target-modulo+360)%360; wheelTransitionMs.value=Math.max(250,(s.endsAt??Date.now())-Date.now());
  await nextTick(); const svg=document.querySelector('.tv-wheel-svg'); if(svg)void (svg as SVGElement).getBoundingClientRect();
  wheelRotation.value=current+360*9+delta;
}
function settleDisplayWheel(s:DisplayWheelState){const target=wheelTargetRotation(s);if(target===null)return;wheelTransitionMs.value=0;wheelRotation.value=Math.floor(wheelRotation.value/360)*360+target;}
function applyWheelState(next: DisplayWheelState) {
  const previous = wheel.value;
  wheel.value = next;
  if (next.status === 'SPINNING' && (previous?.status !== 'SPINNING' || next.spinId !== previous.spinId)) {
    void animateDisplayWheel(next);
    if (activeScreen.value === 'wheel') {
      tvAudio.effect('start');
      tvAudio.announce('Indul a szerencsekerék.');
    }
  } else if (next.status !== 'SPINNING') {
    settleDisplayWheel(next);
    if (activeScreen.value === 'wheel' && previous?.status === 'SPINNING' && next.status === 'RESULT' && previous.spinId === next.spinId) {
      tvAudio.effect('win');
      if (next.winner) tvAudio.announce('A szerencsekerék eredménye: ' + next.winner.label + '.');
    }
  }
}

async function refreshData() {
  const rouletteAtRequest = rouletteVersion;
  const wheelAtRequest = wheelVersion;
  const [roulette, playersResult, wheelResult] = await Promise.allSettled([
    api.getRouletteState(),
    api.getPlayers(),
    api.getLuckyWheel(),
  ]);
  if (roulette.status === 'fulfilled' && rouletteAtRequest === rouletteVersion) onRouletteChanged(roulette.value);
  if (playersResult.status === 'fulfilled') players.value = playersResult.value;
  if (wheelResult.status === 'fulfilled' && wheelAtRequest === wheelVersion) onWheelChanged(wheelResult.value);
}
function onRouletteChanged(next: RouletteState) {
  rouletteVersion++;
  const previous = state.value?.currentRound;
  const current = next.currentRound;
  if (previous?.id !== current?.id) visibleRouletteRound.value = null;
  state.value = next;
  if (!previous || !current) return;
  if (current.status === 'BETTING' && previous.id !== current.id && activeScreen.value === 'roulette') {
    tvAudio.effect('start');
    tvAudio.announce('Új rulettkör. A tétek megtehetők.', true);
  }
  if (current.status === 'COMPLETED' && previous.id === current.id && previous.status === 'BETTING') {
    liveRouletteRound = current.roundNumber;
  }
}
function onRouletteLanded(round: number) {
  const current = state.value?.currentRound;
  if (current?.status !== 'COMPLETED' || current.roundNumber !== round) return;
  visibleRouletteRound.value = round;
  if (liveRouletteRound !== round) return;
  liveRouletteRound = null;
  if (activeScreen.value === 'roulette' && current.resultNumber !== null) {
    tvAudio.effect('win');
    tvAudio.announce('A nyerőszám ' + current.resultNumber + '. ' + colorLabels[numberColor(current.resultNumber)] + '.', true);
  }
}
function onPlayersChanged(next: { id: number; name: string }[]) {
  players.value = next;
}
function onWheelChanged(next: DisplayWheelState) {
  wheelVersion++;
  applyWheelState(next);
}
onMounted(()=>{
  void refreshData();
  refreshTimer=setInterval(()=>void refreshData(),5000);
  socket.on('roulette:changed',onRouletteChanged);
  socket.on('players:online',onPlayersChanged);
  socket.on('lucky-wheel:changed',onWheelChanged);
  wheelClock=setInterval(()=>now.value=Date.now(),250);
});
onUnmounted(()=>{
  if(refreshTimer)clearInterval(refreshTimer);
  socket.off('roulette:changed',onRouletteChanged);
  socket.off('players:online',onPlayersChanged);
  socket.off('lucky-wheel:changed',onWheelChanged);
  if(wheelClock)clearInterval(wheelClock);
});
</script>

<template>
  <main class="tv-dashboard">
    <header class="tv-topbar">
      <a href="/" class="tv-brand">PARTY<span>CASINO</span></a>
      <div class="tv-live"><i></i> PARTY LIVE <span>·</span> {{players.length}} JÁTÉKOS ONLINE</div>
      <a class="tv-exit" href="/">VISSZA A LOBBYBA ↗</a>
    </header>

    <div class="tv-layout">
      <section class="tv-main-screen">
        <div class="tv-screen-toolbar">
          <h1>{{ screenLabel }}</h1>
          <button type="button" class="tv-sound" aria-label="TV-hang" :aria-pressed="soundOn" @click="toggleSound">
            {{ soundOn ? 'Hang be' : 'Hang indítása' }}
          </button>
          <nav class="tv-screen-switcher" aria-label="Kijelző tartalma">
            <button type="button" :aria-pressed="activeScreen === 'roulette'" :class="{active:activeScreen==='roulette'}" @click="activeScreen='roulette'">Rulett</button>
            <button type="button" :aria-pressed="activeScreen === 'wheel'" :class="{active:activeScreen==='wheel'}" @click="activeScreen='wheel'">Szerencsekerék</button>
          </nav>
        </div>

        <section v-if="activeScreen==='roulette'" class="tv-game-content tv-roulette-screen">
          <template v-if="state?.currentRound">
            <h2>{{state.currentRound.status==='BETTING'?'Tétek leadása folyamatban':visibleRouletteRound === state.currentRound.roundNumber ? 'A kör eredménye' : 'A golyó pályán van'}}</h2>
            <div class="tv-art-stage tv-roulette-art">
              <RouletteWheel :result-number="state.currentRound.resultNumber" :previous-result-number="state.history[0]?.resultNumber??null" :spinning="state.currentRound.status==='COMPLETED'" :round-number="state.currentRound.roundNumber" :completed-at="state.currentRound.completedAt" :result-seconds="state.resultSeconds" @landed="onRouletteLanded"/>
            </div>
            <section class="tv-results" aria-label="Nyerőszám-előzmények">
              <h3>Legutóbbi nyerőszámok</h3>
              <ol v-if="latestNumbers.length" aria-live="polite">
                <li v-for="item in latestNumbers" :key="item.roundNumber" :class="numberColor(item.resultNumber)"
                  :aria-label="item.roundNumber + '. kör, ' + item.resultNumber + ', ' + colorLabels[numberColor(item.resultNumber)]">
                  {{ item.resultNumber }}
                </li>
              </ol>
              <p v-else>Még nincs lezárt kör.</p>
            </section>
          </template>
          <div v-else class="tv-empty-game"><span>◉</span><h2>Hamarosan indul az első rulettkör</h2><p>A játékosok a telefonjukról csatlakozhatnak az asztalhoz.</p></div>
        </section>

        <section v-else class="tv-game-content tv-wheel-screen">
          <h2>Szerencsekerék</h2>
          <div class="tv-art-stage">
          <div class="tv-wheel-stage">
            <div class="tv-wheel-pointer"></div>
            <svg class="tv-wheel-svg" viewBox="0 0 400 400" :style="{transform:'rotate('+wheelRotation+'deg)',transitionDuration:wheelTransitionMs+'ms'}">
              <circle cx="200" cy="200" r="190" fill="#171a19" stroke="#d7b66c" stroke-width="8"/>
              <g v-for="slice in wheelSlices" :key="slice.id"><path :d="slice.path" :fill="slice.color" stroke="#f4d99a" stroke-width="2"/><text :x="slice.tx" :y="slice.ty" text-anchor="middle" dominant-baseline="middle" :transform="'rotate('+(slice.angle+90)+' '+slice.tx+' '+slice.ty+')'">{{slice.label}}</text></g>
              <circle cx="200" cy="200" r="36" fill="#d5ad5e" stroke="#fff0bd" stroke-width="5"/><circle cx="200" cy="200" r="10" fill="#30251a"/>
            </svg>
          </div>
          </div>
          <div class="tv-wheel-player" v-if="wheel?.status==='SPINNING'"><small>ÉPPEN Ő PÖRGET</small><strong>{{currentSpinnerName||'Játékos betöltése…'}}</strong><span v-if="wheelRemaining>0">{{Math.ceil(wheelRemaining/1000)}} mp van hátra</span></div>
          <div class="tv-wheel-result" v-if="wheel?.winner&&!isWheelSpinning"><small>LEGUTÓBBI EREDMÉNY</small><strong>{{wheel.winner.label}}</strong></div>
          <p class="tv-game-caption">{{wheel?.status==='SPINNING'?'A kerék forog…':wheel?.status==='RESULT'?'A pörgetés véget ért.':'A játékosok telefonjukról indíthatják a pörgetést.'}}</p>
        </section>

      </section>
    </div>
  </main>
</template>

<style scoped>
:global(html:has(.tv-dashboard)),
:global(body:has(.tv-dashboard)) {
  overflow: clip;
  overscroll-behavior: none;
  scrollbar-gutter: auto;
}

.tv-dashboard {
  --tv-gap: clamp(6px, 1.3vmin, 18px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  gap: var(--tv-gap);
  padding: 0 max(var(--tv-gap), env(safe-area-inset-right)) max(var(--tv-gap), env(safe-area-inset-bottom)) max(var(--tv-gap), env(safe-area-inset-left));
  overflow: clip;
}

.tv-topbar { min-height: 0; height: clamp(36px, 7.5dvh, 76px); gap: 8px; }
.tv-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  height: auto;
  min-height: 0;
  gap: var(--tv-gap);
  padding: 0;
  overflow: clip;
}

.tv-main-screen {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  order: 0;
  height: auto;
  min-height: 0;
  min-width: 0;
  gap: clamp(3px, 1vmin, 12px);
  padding: clamp(7px, 2vmin, 22px);
  overflow: clip;
}

.tv-screen-toolbar {
  align-items: center;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding-bottom: clamp(3px, 1vmin, 12px);
}
.tv-screen-toolbar h1 { flex: 1; margin: 0; font-size: clamp(.8rem, 2.15vmin, 1.3rem); }
.tv-sound {
  min-height: 44px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: var(--control-radius);
  background: var(--surface);
  color: var(--text);
  font-size: clamp(.73rem, 1.6vmin, .9rem);
}
.tv-sound[aria-pressed='true'] { color: var(--accent); }
.tv-screen-toolbar button:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
.tv-screen-switcher { width: auto; max-width: 100%; padding: 2px; gap: 2px; overflow: clip; }
.tv-screen-switcher button {
  min-height: clamp(27px, 6vmin, 44px);
  padding: 4px clamp(3px, 1vmin, 10px);
  font-size: clamp(.64rem, 1.5vmin, .85rem);
}
.tv-screen-switcher button.active { color: var(--on-accent); background: var(--accent); }

.tv-game-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: clamp(2px, .8vmin, 9px);
  padding: 0;
  min-height: 0;
  overflow: clip;
}
.tv-game-content > h2 {
  margin: 0;
  font-size: clamp(.95rem, 3.2vmin, 2rem);
  line-height: 1.14;
}
.tv-game-content > h2, .tv-game-caption, .tv-wheel-player, .tv-wheel-result, .tv-results { flex: none; }
.tv-game-caption, .tv-wheel-player, .tv-wheel-result { margin: 0; }
.tv-art-stage {
  container-type: size;
  display: grid;
  place-items: center;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  overflow: clip;
}
.tv-roulette-art :deep(.roulette-rotor) { width: min(100cqi, 560px); padding: 0; }
.tv-roulette-art :deep(.rotor-plinth) {
  width: min(96cqi, 510px, max(0px, 100cqb - 29px));
}
.tv-roulette-art :deep(canvas) { filter: none; }
.tv-roulette-art :deep(.rotor-caption) { min-height: 28px; font-size: clamp(.68rem, 1.65vmin, .95rem); }
.tv-roulette-art :deep(.rotor-caption strong) { min-width: 25px; min-height: 25px; }
.tv-wheel-stage { width: min(94cqi, 500px, 90cqb); margin: 0; }
.tv-wheel-pointer { top: 0; border-top-width: clamp(8px, 3cqb, 28px); }
.tv-wheel-player { padding: 3px 10px; gap: 1px; }
.tv-wheel-player strong, .tv-wheel-result strong { font-size: clamp(.8rem, 2.5vmin, 1.35rem); line-height: 1.1; }
.tv-wheel-result { gap: 1px; }
.tv-results {
  display: grid;
  justify-items: center;
  gap: 5px;
  width: 100%;
  min-width: 0;
  padding: clamp(3px, 1.4vmin, 14px) 0;
  border-top: 1px solid var(--line);
}
.tv-results h3, .tv-results p { margin: 0; }
.tv-results h3 { color: var(--text); font-size: clamp(.79rem, 2.1vmin, 1.35rem); }
.tv-results p { color: var(--muted); font-size: .85rem; }
.tv-results ol {
  display: flex;
  justify-content: center;
  gap: clamp(3px, .9vmin, 12px);
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}
.tv-results li {
  display: grid;
  place-items: center;
  flex: 0 1 clamp(23px, 6vmin, 64px);
  min-width: 0;
  aspect-ratio: 1;
  border: 1px solid oklch(93% .04 88 / .32);
  border-radius: 50%;
  color: white;
  font-size: clamp(.77rem, 2.9vmin, 1.9rem);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.tv-results li:first-child { border-color: var(--accent); }
.tv-results .red { background-color: oklch(43% .157 21); }
.tv-results .black { background-color: oklch(19% .023 260); }
.tv-results .green { background-color: oklch(40% .115 155); }

@media (max-width: 420px) {
  .tv-screen-switcher { flex-basis: 100%; }
  .tv-screen-switcher button { min-height: 38px; }
}
</style>
