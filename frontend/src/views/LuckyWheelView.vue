<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../services/api';
import { socket } from '../services/socket';

type Segment = { id: number; label: string; position: number; enabled: number };
type WheelState = { status: 'IDLE'|'SPINNING'|'RESULT'; spinId: string|null; startedAt: number|null; endsAt: number|null; winner: {id:number;label:string;position:number}|null; segments: Segment[]; durationMs: number; spinCost: number; tokenBalance?: number };
const route = useRoute();
const isDisplay = computed(() => route.query.display === '1');
const state = ref<WheelState|null>(null);
const busy = ref(false);
const playerId = ref(Number(localStorage.getItem('party-player-id')) || 0);
const error = ref('');
const rotation = ref(0);
const transitionMs = ref(7000);
let animatedSpinId: string | null = null;
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval>|undefined;
const colors = ['#b78b39','#263a30','#8d3b42','#293b55','#72523b','#354b45','#755a82','#9a7135','#3c4652','#914d39','#466a61','#62523b'];
const isSpinning = computed(() => state.value?.status === 'SPINNING');
const remaining = computed(() => Math.max(0, (state.value?.endsAt ?? 0) - now.value));
const slices = computed(() => {
  const segments = state.value?.segments ?? [];
  return segments.map((segment,index) => {
    const count = segments.length || 1;
    const start = -90 + index*360/count;
    const end = -90 + (index+1)*360/count;
    const point = (angle:number,radius:number) => [200+radius*Math.cos(angle*Math.PI/180),200+radius*Math.sin(angle*Math.PI/180)];
    const [sx,sy] = point(start,178); const [ex,ey] = point(end,178);
    const large = 360/count > 180 ? 1 : 0;
    const path = `M 200 200 L ${sx} ${sy} A 178 178 0 ${large} 1 ${ex} ${ey} Z`;
    const [tx,ty] = point((start+end)/2,112);
    const words = segment.label.trim().split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > 13 && line) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    return { ...segment, path, tx, ty, color: colors[index%colors.length], angle:(start+end)/2, lines: lines.slice(0,3) };
  });
});
function targetRotation(s: WheelState) {
  if (!s.winner || !s.segments.length) return null;
  const index = s.segments.findIndex(item => item.id === s.winner?.id);
  if (index < 0) return null;
  const center = -90 + (index + .5) * 360 / s.segments.length;
  return (((-90 - center) % 360) + 360) % 360;
}
async function animateSpin(s: WheelState) {
  if (s.status !== 'SPINNING' || !s.spinId || animatedSpinId === s.spinId) return;
  const target = targetRotation(s);
  if (target === null) return;
  animatedSpinId = s.spinId;
  const current = rotation.value;
  const currentModulo = ((current % 360) + 360) % 360;
  const delta = (target - currentModulo + 360) % 360;
  transitionMs.value = Math.max(250, (s.endsAt ?? Date.now()) - Date.now());
  await nextTick();
  // Force the browser to commit the starting transform before applying the long spin.
  const wheel = document.querySelector('.lucky-wheel-svg');
  if (wheel) void (wheel as SVGElement).getBoundingClientRect();
  rotation.value = current + 360 * 10 + delta;
}
function showWinner(s: WheelState) {
  const target = targetRotation(s);
  if (target === null) return;
  transitionMs.value = 0;
  rotation.value = Math.floor(rotation.value / 360) * 360 + target;
}
async function refresh(){ state.value=await api.getLuckyWheel(); if (state.value.status === 'SPINNING') await animateSpin(state.value); else showWinner(state.value); }
async function spin(){
  if(busy.value||isSpinning.value)return;
  busy.value=true;error.value='';
  try{
    if (!playerId.value) throw new Error('A pörgetéshez előbb lépj be a játékosneveddel.');
    const next=await api.spinLuckyWheel(playerId.value);
    state.value=next;
    window.dispatchEvent(new Event('party-player-changed'));
    await animateSpin(next);
  }
  catch(e:any){error.value=e.message;}
  finally{busy.value=false;}
}
function onChanged(next:WheelState){
  const newSpin=next.status==='SPINNING'&&next.spinId!==state.value?.spinId;
  state.value=next;
  if(newSpin) void animateSpin(next);
  else if(next.status!=='SPINNING')showWinner(next);
}
function syncPlayer(){playerId.value=Number(localStorage.getItem('party-player-id'))||0;}
onMounted(()=>{refresh().catch(e=>error.value=e.message);socket.on('lucky-wheel:changed',onChanged);clock=setInterval(()=>now.value=Date.now(),100);window.addEventListener('party-player-changed',syncPlayer);window.addEventListener('storage',syncPlayer);});
onUnmounted(()=>{socket.off('lucky-wheel:changed',onChanged);if(clock)clearInterval(clock);window.removeEventListener('party-player-changed',syncPlayer);window.removeEventListener('storage',syncPlayer);});
</script>

<template>
 <main class="lucky-wheel-page">
  <section class="lucky-wheel-content">
   <header class="wheel-room-heading"><h1>Szerencsekerék</h1><p class="muted wheel-subtitle">Egy pörgetés, közös eredmény.</p></header>
   <div class="wheel-room-grid">
   <section class="wheel-stage panel" aria-label="Szerencsekerék">
    <div class="wheel-pointer"></div>
    <div class="wheel-frame">
     <svg class="lucky-wheel-svg" viewBox="0 0 400 400" :style="{transform:`rotate(${rotation}deg)`,transitionDuration:transitionMs+'ms'}">
      <circle cx="200" cy="200" r="190" fill="#171a19" stroke="#d7b66c" stroke-width="8"/>
      <g v-for="slice in slices" :key="slice.id">
       <path :d="slice.path" :fill="slice.color" stroke="#f4d99a" stroke-width="2"/>
       <text :x="slice.tx" :y="slice.ty" text-anchor="middle" dominant-baseline="middle" :transform="`rotate(${slice.angle+90} ${slice.tx} ${slice.ty})`"><tspan v-for="(line,lineIndex) in slice.lines" :key="lineIndex" :x="slice.tx" :dy="lineIndex===0?`${-(slice.lines.length-1)*0.58}em`:'1.16em'">{{ line }}</tspan></text>
      </g>
      <circle cx="200" cy="200" r="36" fill="#d5ad5e" stroke="#fff0bd" stroke-width="5"/>
      <circle cx="200" cy="200" r="10" fill="#30251a"/>
     </svg>
    </div>
   </section>
   <aside class="wheel-room-controls panel">
    <div class="wheel-status" role="status">
     <span v-if="isSpinning" class="wheel-spinning-label">FOROG A KERÉK · {{ Math.ceil(remaining/1000) }} mp</span>
     <span v-else-if="state?.winner" class="wheel-winner-label">AZ EREDMÉNY</span>
     <span v-else class="wheel-spinning-label">KÉSZEN ÁLL</span>
     <strong v-if="state?.winner&&!isSpinning">{{ state.winner.label }}</strong>
     <strong v-else-if="isSpinning">SOK SZERENCSÉT!</strong>
     <strong v-else>Ki lesz a szerencsés?</strong>
    </div>
    <button v-if="!isDisplay" class="primary wheel-spin-button"  :disabled="busy||isSpinning||!state?.segments?.length||!playerId" @click="spin">{{ isSpinning?'Pörgetés folyamatban…':busy?'Indítás…':!playerId?'LÉPJ BE A PÖRGETÉSHEZ':`MEGPÖRGETÉS · ${state?.spinCost ?? 5} CR` }}</button>
    <p v-else class="wheel-tv-hint">{{ isSpinning?'A pörgetés folyamatban van':'A játékosok telefonjukról indíthatják a pörgetést' }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <details v-if="state?.segments?.length" class="wheel-room-prizes">
      <summary>Kerékmezők <span>{{ state.segments.length }}</span></summary>
      <div class="wheel-segment-list"><span v-for="segment in state.segments" :key="segment.id">{{ segment.label }}</span></div>
    </details>
   </aside>
   </div>
  </section>
 </main>
</template>
