<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { socket } from '../services/socket';
import { api, type CommunityEvent } from '../services/api';
import type { RouletteState } from '../types';
import RouletteWheel from '../components/RouletteWheel.vue';

type PublicNotification = {id:number;type:string;title:string|null;message:string;createdAt:string};
type ScreenMode = 'roulette'|'wheel'|'slots';
const state = ref<RouletteState|null>(null);
const players = ref<{id:number;name:string}[]>([]);
const notifications = ref<PublicNotification[]>([]);
const events = ref<CommunityEvent[]>([]);
type DisplayWheelState = Awaited<ReturnType<typeof api.getLuckyWheel>> & { spinnerPlayerId?: number|null };
const wheel = ref<DisplayWheelState|null>(null);
const wheelRotation = ref(0);
const wheelTransitionMs = ref(0);
const now = ref(Date.now());
let animatedWheelSpinId: string|null = null;
let wheelClock: ReturnType<typeof setInterval>|undefined;
const activeScreen = ref<ScreenMode>('roulette');
const loading = ref(true);
let refreshTimer: ReturnType<typeof setInterval>|undefined;

const fmt = (value:number) => value.toLocaleString('hu-HU');
const eventPercent = (event:CommunityEvent) => Math.min(100,Math.round(event.currentAmount/Math.max(1,event.targetAmount)*100));
const wheelBackground = computed(() => {
  const segments = wheel.value?.segments.filter(segment=>segment.enabled) ?? [];
  if (!segments.length) return 'conic-gradient(#252a25 0deg 360deg)';
  const colors = ['#b78b39','#263a30','#8d3b42','#293b55','#72523b','#354b45','#755a82','#9a7135','#3c4652','#914d39','#466a61','#62523b'];
  const step=360/segments.length;
  return 'conic-gradient('+segments.map((segment,index)=>`${colors[index%colors.length]} ${index*step}deg ${(index+1)*step}deg`).join(',')+')';
});
const screenLabel = computed(()=>activeScreen.value==='roulette'?'KÖZÖS RULETTASZTAL':activeScreen.value==='wheel'?'SZERENCSEKERÉK':'SLOT GÉP');
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
async function applyWheelState(next:DisplayWheelState){const newSpin=next.status==='SPINNING'&&next.spinId!==wheel.value?.spinId;wheel.value=next;if(newSpin)await animateDisplayWheel(next);else if(next.status!=='SPINNING')settleDisplayWheel(next);}

async function refreshData(){
  const results=await Promise.allSettled([
    api.getRouletteState(),
    api.getPlayers(),
    api.getPartyNotifications(),
    api.getCommunityEvents(),
    api.getLuckyWheel()
  ]);
  if(results[0].status==='fulfilled') state.value=results[0].value;
  if(results[1].status==='fulfilled') players.value=results[1].value;
  if(results[2].status==='fulfilled') notifications.value=results[2].value.slice(0,30);
  if(results[3].status==='fulfilled') events.value=results[3].value.events;
  if(results[4].status==='fulfilled') await applyWheelState(results[4].value as DisplayWheelState);
  loading.value=false;
}
function onRouletteChanged(next:RouletteState){state.value=next;}
function onPlayersChanged(next:{id:number;name:string}[]){players.value=next;}
function onWheelChanged(next:DisplayWheelState){void applyWheelState(next);}
function onPublicNotification(next:PublicNotification){
  // The TV is a public surface. Never render targeted/private player messages.
  if((next as any).audiencePlayerId || (next as any).playerId) return;
  if(!next.message) return;
  if(!notifications.value.some(item=>item.id===next.id)) notifications.value=[next,...notifications.value].slice(0,30);
}
function formatTime(value:string){const date=new Date(value.includes('Z')?value:value.replace(' ','T')+'Z');return Number.isNaN(date.getTime())?'':date.toLocaleTimeString('hu-HU',{hour:'2-digit',minute:'2-digit'});}
onMounted(()=>{
  void refreshData();
  refreshTimer=setInterval(()=>void refreshData(),5000);
  socket.on('roulette:changed',onRouletteChanged);
  socket.on('players:online',onPlayersChanged);
  socket.on('party:notification',onPublicNotification);
  socket.on('lucky-wheel:changed',onWheelChanged);
  wheelClock=setInterval(()=>now.value=Date.now(),250);
});
onUnmounted(()=>{
  if(refreshTimer)clearInterval(refreshTimer);
  socket.off('roulette:changed',onRouletteChanged);
  socket.off('players:online',onPlayersChanged);
  socket.off('party:notification',onPublicNotification);
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
      <aside class="tv-sidebar">
        <section class="tv-panel tv-notification-panel">
          <header class="tv-panel-heading"><div><small>LIVE FEED</small><h2>Értesítések</h2></div><span class="tv-live-pill"><i></i> LIVE</span></header>
          <div class="tv-notification-list">
            <article v-for="item in notifications" :key="item.id" class="tv-notification-item" :class="'tv-notice-'+item.type">
              <span class="tv-notice-icon">{{item.type==='wheel'?'◎':item.type==='event'?'✦':item.type==='duel'?'⚔':item.type==='slots'?'🎰':item.type==='roulette'?'🎯':item.type==='leaderboard'?'♛':'◆'}}</span>
              <div><small>{{item.title||'PARTY CASINO'}} <time>{{formatTime(item.createdAt)}}</time></small><strong>{{item.message}}</strong></div>
            </article>
            <p v-if="!notifications.length" class="tv-panel-empty">{{loading?'Értesítések betöltése…':'Még nincs új értesítés.'}}</p>
          </div>
        </section>

        <section class="tv-panel tv-events-panel">
          <header class="tv-panel-heading"><div><small>WORK TOGETHER</small><h2>Közösségi események</h2></div><span class="tv-event-count">{{events.length}}</span></header>
          <div class="tv-event-list">
            <article v-for="event in events" :key="event.id" class="tv-event-item">
              <div class="tv-event-title"><div><span v-if="event.isSecret" class="tv-secret-tag">✦ TITKOS</span><small v-else>{{event.repeatMode==='ONCE'?'EGYSZERI':event.repeatMode==='COOLDOWN'?'COOLDOWN':'ISMÉTELHETŐ'}}</small><h3>{{event.isSecret?'Rejtett esemény':event.title}}</h3></div><b>{{eventPercent(event)}}%</b></div>
              <p>{{event.isSecret?'A részletek egyelőre titkosak.':event.description}}</p>
              <div class="tv-progress"><span :style="{width:eventPercent(event)+'%'}"></span></div>
              <div class="tv-event-meta"><strong>{{fmt(event.currentAmount)}} <small>/ {{fmt(event.targetAmount)}} CR</small></strong><span>{{event.contributorCount}} támogató</span></div>
            </article>
            <p v-if="!events.length" class="tv-panel-empty">{{loading?'Események betöltése…':'Jelenleg nincs aktív közösségi esemény.'}}</p>
          </div>
        </section>
      </aside>

      <section class="tv-main-screen">
        <div class="tv-screen-toolbar">
          <div><small>NOW SHOWING</small><h1>{{screenLabel}}</h1></div>
          <nav class="tv-screen-switcher" aria-label="Kijelző tartalma">
            <button :class="{active:activeScreen==='roulette'}" @click="activeScreen='roulette'">◉ Rulett</button>
            <button :class="{active:activeScreen==='wheel'}" @click="activeScreen='wheel'">◎ Szerencsekerék</button>
            <button :class="{active:activeScreen==='slots'}" @click="activeScreen='slots'">▥ Slot</button>
          </nav>
        </div>

        <section v-if="activeScreen==='roulette'" class="tv-game-content tv-roulette-screen">
          <template v-if="state?.currentRound">
            <p class="tv-game-eyebrow">KÖZÖS RULETTASZTAL · {{state.currentRound.status==='BETTING'?'FOGADÁS':'EREDMÉNY'}}</p>
            <h2>{{state.currentRound.status==='BETTING'?'Tétek leadása folyamatban':'A kör eredménye'}}</h2>
            <RouletteWheel :result-number="state.currentRound.resultNumber" :previous-result-number="state.history[0]?.resultNumber??null" :spinning="state.currentRound.status==='COMPLETED'" :round-number="state.currentRound.roundNumber"/>
            <div class="tv-game-stats"><span><b>{{players.length}}</b> online játékos</span><span><b>{{state.bets.length}}</b> leadott tét</span></div>
            <div class="tv-bet-list"><div v-for="bet in state.bets" :key="bet.playerId" class="tv-bet-row"><strong>{{bet.playerName}}</strong><span>{{bet.betType==='NUMBER'?bet.betValue:bet.betValue==='red'?'Piros':'Fekete'}}</span><b v-if="state.currentRound.status==='COMPLETED'" :class="{winner:state.winners.some(w=>w.playerId===bet.playerId)}">{{state.winners.some(w=>w.playerId===bet.playerId)?'NYERT':'—'}}</b></div></div>
          </template>
          <div v-else class="tv-empty-game"><span>◉</span><h2>Hamarosan indul az első rulettkör</h2><p>A játékosok a telefonjukról csatlakozhatnak az asztalhoz.</p></div>
        </section>

        <section v-else-if="activeScreen==='wheel'" class="tv-game-content tv-wheel-screen">
          <p class="tv-game-eyebrow">PARTY CHALLENGE · KÖZÖS PÖRGETÉS</p><h2>Szerencsekerék</h2>
          <div class="tv-wheel-stage">
            <div class="tv-wheel-pointer"></div>
            <svg class="tv-wheel-svg" viewBox="0 0 400 400" :style="{transform:'rotate('+wheelRotation+'deg)',transitionDuration:wheelTransitionMs+'ms'}">
              <circle cx="200" cy="200" r="190" fill="#171a19" stroke="#d7b66c" stroke-width="8"/>
              <g v-for="slice in wheelSlices" :key="slice.id"><path :d="slice.path" :fill="slice.color" stroke="#f4d99a" stroke-width="2"/><text :x="slice.tx" :y="slice.ty" text-anchor="middle" dominant-baseline="middle" :transform="'rotate('+(slice.angle+90)+' '+slice.tx+' '+slice.ty+')'">{{slice.label}}</text></g>
              <circle cx="200" cy="200" r="36" fill="#d5ad5e" stroke="#fff0bd" stroke-width="5"/><circle cx="200" cy="200" r="10" fill="#30251a"/>
            </svg>
          </div>
          <div class="tv-wheel-player" v-if="wheel?.status==='SPINNING'"><small>ÉPPEN Ő PÖRGET</small><strong>{{currentSpinnerName||'Játékos betöltése…'}}</strong><span v-if="wheelRemaining>0">{{Math.ceil(wheelRemaining/1000)}} mp van hátra</span></div>
          <div class="tv-wheel-result" v-if="wheel?.winner&&!isWheelSpinning"><small>LEGUTÓBBI EREDMÉNY</small><strong>{{wheel.winner.label}}</strong></div>
          <p class="tv-game-caption">{{wheel?.status==='SPINNING'?'A kerék forog…':wheel?.status==='RESULT'?'A pörgetés véget ért.':'A játékosok telefonjukról indíthatják a pörgetést.'}}</p>
        </section>

        <section v-else class="tv-game-content tv-slots-screen">
          <p class="tv-game-eyebrow">PARTY CASINO ORIGINAL · 3 REEL SLOT</p><h2>LUCKY <span>7</span></h2>
          <div class="tv-slot-machine"><div class="tv-slot-marquee">★ &nbsp; LUCKY 7 &nbsp; ★</div><div class="tv-slot-reels"><span>🍒</span><span>🔔</span><span>💎</span></div><div class="tv-slot-payline">★ &nbsp; GOOD LUCK &nbsp; ★</div></div>
          <p class="tv-game-caption">A slot gép a játékosok saját telefonján játszható.</p>
        </section>
        <footer class="tv-footer"><span>PARTY CASINO</span><strong>VÁLASSZ JÁTÉKOT. CSATLAKOZZ. JÁTSSZ.</strong></footer>
      </section>
    </div>
  </main>
</template>
