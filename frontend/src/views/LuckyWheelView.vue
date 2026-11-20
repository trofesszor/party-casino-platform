<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../services/api';
import { socket } from '../services/socket';

type Segment = { id: number; label: string; position: number; enabled: number };
type WheelState = { status: 'IDLE'|'SPINNING'|'RESULT'; spinId: string|null; startedAt: number|null; endsAt: number|null; winner: {id:number;label:string;position:number}|null; segments: Segment[]; durationMs: number };
const route = useRoute();
const isDisplay = computed(() => route.query.display === '1');
const state = ref<WheelState|null>(null);
const busy = ref(false);
const error = ref('');
const rotation = ref(0);
const transitionMs = ref(7000);
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
    return { ...segment, path, tx, ty, color: colors[index%colors.length], angle:(start+end)/2 };
  });
});
function rotationForWinner() {
  const s=state.value; if(!s?.winner || !s.segments.length) return;
  const index=s.segments.findIndex(item=>item.id===s.winner?.id);
  if(index<0)return;
  const center=-90+(index+.5)*360/s.segments.length;
  const target=(((-90-center)%360)+360)%360;
  const remainingMs=Math.max(0,(s.endsAt??Date.now())-Date.now());
  transitionMs.value=s.status==='SPINNING'?remainingMs:0;
  rotation.value=2160+target;
}
async function refresh(){ state.value=await api.getLuckyWheel(); rotationForWinner(); }
async function spin(){
  if(busy.value||isSpinning.value)return;
  busy.value=true;error.value='';
  try{state.value=await api.spinLuckyWheel();rotationForWinner();}
  catch(e:any){error.value=e.message;}
  finally{busy.value=false;}
}
function onChanged(next:WheelState){
  const newSpin=next.status==='SPINNING'&&next.spinId!==state.value?.spinId;
  state.value=next;
  if(newSpin){rotation.value=0;requestAnimationFrame(()=>rotationForWinner());}
  else if(next.status!=='SPINNING')rotationForWinner();
}
onMounted(()=>{refresh().catch(e=>error.value=e.message);socket.on('lucky-wheel:changed',onChanged);clock=setInterval(()=>now.value=Date.now(),100);});
onUnmounted(()=>{socket.off('lucky-wheel:changed',onChanged);if(clock)clearInterval(clock);});
</script>

<template>
 <main class="lucky-wheel-page">
  <header class="roulette-header"><a href="/" class="brand">PARTY<span>CASINO</span></a><span class="live-indicator">● {{ isDisplay?'KÖZÖS TV KIJELZŐ':'KÖZÖS SZERENCSEKERÉK' }}</span></header>
  <section class="lucky-wheel-content">
   <p class="eyebrow">PARTY CHALLENGE</p><h1>Szerencse<span>kerék</span></h1>
   <p class="muted wheel-subtitle">Egy kerék, egy pörgetés, mindenki ugyanazt látja.</p>
   <section class="wheel-stage panel">
    <div class="wheel-pointer"></div>
    <div class="wheel-frame">
     <svg class="lucky-wheel-svg" viewBox="0 0 400 400" :style="{transform:`rotate(${rotation}deg)`,transitionDuration:transitionMs+'ms'}">
      <circle cx="200" cy="200" r="190" fill="#171a19" stroke="#d7b66c" stroke-width="8"/>
      <g v-for="slice in slices" :key="slice.id">
       <path :d="slice.path" :fill="slice.color" stroke="#f4d99a" stroke-width="2"/>
       <text :x="slice.tx" :y="slice.ty" text-anchor="middle" dominant-baseline="middle" :transform="`rotate(${slice.angle+90} ${slice.tx} ${slice.ty})`">{{ slice.label }}</text>
      </g>
      <circle cx="200" cy="200" r="36" fill="#d5ad5e" stroke="#fff0bd" stroke-width="5"/>
      <circle cx="200" cy="200" r="10" fill="#30251a"/>
     </svg>
    </div>
    <div class="wheel-status">
     <span v-if="isSpinning" class="wheel-spinning-label">FOROG A KERÉK · {{ Math.ceil(remaining/1000) }} mp</span>
     <span v-else-if="state?.winner" class="wheel-winner-label">AZ EREDMÉNY</span>
     <span v-else class="wheel-spinning-label">KÉSZEN ÁLL</span>
     <strong v-if="state?.winner&&!isSpinning">{{ state.winner.label }}</strong>
     <strong v-else-if="isSpinning">SOK SZERENCSÉT!</strong>
     <strong v-else>Ki lesz a szerencsés?</strong>
    </div>
    <button v-if="!isDisplay" class="primary wheel-spin-button" :disabled="busy||isSpinning||!state?.segments?.length" @click="spin">{{ isSpinning?'Pörgetés folyamatban…':busy?'Indítás…':'KERÉK MEGPÖRGETÉSE' }}</button>
    <p v-else class="wheel-tv-hint">{{ isSpinning?'A pörgetés folyamatban van':'A játékosok telefonjukról indíthatják a pörgetést' }}</p>
    <p v-if="error" class="error">{{ error }}</p>
   </section>
   <div class="wheel-segment-list"><span v-for="segment in state?.segments??[]" :key="segment.id">{{ segment.label }}</span></div>
   <footer>PARTY CASINO · A KERÉK MINDEN ESZKÖZÖN SZINKRONBAN FOROG</footer>
  </section>
 </main>
</template>
