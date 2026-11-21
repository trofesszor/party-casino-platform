<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api, type CommunityEvent, type CommunityActivation } from '../services/api';

const playerId = Number(localStorage.getItem('party-player-id')) || 0;
const playerName = localStorage.getItem('party-player-name') || '';
const events = ref<CommunityEvent[]>([]);
const activations = ref<CommunityActivation[]>([]);
const amounts = ref<Record<number,number>>({});
const busyId = ref<number|null>(null);
const message = ref('');
const error = ref('');
const history = ref<any>(null);
let timer: ReturnType<typeof setInterval>|undefined;
const balance = ref(0);
const fmt = (n:number) => n.toLocaleString('hu-HU');
const percent = (event:CommunityEvent) => Math.min(100,Math.round(event.currentAmount/event.targetAmount*100));
const canJoin = computed(()=>playerId>0);
async function load(){
  try{
    const data=await api.getCommunityEvents();
    events.value=data.events; activations.value=data.recentActivations;
    if(playerId){const wallet=await api.getPlayerBalance(playerId);balance.value=wallet.tokenBalance;}
  }catch(e:any){error.value=e.message||'Az események betöltése nem sikerült.';}
}
async function contribute(event:CommunityEvent){
  const amount=Number(amounts.value[event.id]);
  if(!Number.isSafeInteger(amount)||amount<=0){error.value='Adj meg érvényes tokenmennyiséget.';return;}
  busyId.value=event.id;error.value='';message.value='';
  try{
    const result=await api.contributeCommunityEvent(event.id,playerId,amount);
    balance.value=result.tokenBalance;
    message.value=result.activation?(`Feloldottátok: ${result.activation.title}!`):`Sikeresen hozzájárultál ${fmt(result.contributed)} tokennel.`;
    amounts.value[event.id]=0;await load();
  }catch(e:any){error.value=e.message||'A hozzájárulás nem sikerült.';}
  finally{busyId.value=null;}
}
async function showHistory(event:CommunityEvent){try{history.value={title:event.title,...await api.getCommunityEventHistory(event.id)};}catch(e:any){error.value=e.message;}}
onMounted(()=>{load();timer=setInterval(load,5000);});
onUnmounted(()=>{if(timer)clearInterval(timer);});
</script>

<template>
  <main class="community-page">
    <header class="community-topbar"><a class="brand" href="/">PARTY<span>CASINO</span></a><div><span v-if="playerName" class="community-balance">{{fmt(balance)}} CR</span><a class="ghost" href="/">Vissza</a></div></header>
    <section class="community-hero"><p class="eyebrow">WORK TOGETHER · UNLOCK TOGETHER</p><h1>Community <span>Events</span></h1><p class="muted">A közösség együtt gyűjti össze a tokeneket, hogy feloldja a következő közös élményt.</p></section>
    <p v-if="message" class="community-message success">{{message}}</p><p v-if="error" class="community-message error">{{error}}</p>
    <section class="community-section"><div class="community-section-heading"><div><p class="eyebrow">LIVE FUNDRAISERS</p><h2>Aktív események</h2></div><span>{{events.length}} AKTÍV</span></div>
      <div v-if="!events.length" class="panel community-empty">Jelenleg nincs aktív közösségi esemény. Nézz vissza később!</div>
      <article v-for="event in events" :key="event.id" class="panel community-event-card">
        <div class="community-event-top"><div><span class="community-event-tag">{{event.isSecret?'✦ FELoldva':event.repeatMode==='ONCE'?'EGYSZERI':event.repeatMode==='COOLDOWN'?'COOLDOWN':'ISMÉTELHETŐ'}}</span><h3>{{event.title}}</h3></div><strong>{{percent(event)}}%</strong></div>
        <p class="muted">{{event.description}}</p>
        <div class="community-progress"><span :style="{width:percent(event)+'%'}"></span></div>
        <div class="community-progress-meta"><strong>{{fmt(event.currentAmount)}} <small>/ {{fmt(event.targetAmount)}} CR</small></strong><span>{{event.contributorCount}} támogató</span></div>
        <div v-if="event.isSecret" class="community-unlocked-note">✦ Ez a titkos esemény feloldódott – nézzétek meg a részleteket alább!</div>
        <div class="community-contribute" v-else-if="canJoin"><input v-model.number="amounts[event.id]" type="number" min="1" :max="balance" placeholder="Token mennyiség"><button class="primary" :disabled="busyId===event.id||balance<1" @click="contribute(event)">{{busyId===event.id?'Küldés…':'Hozzájárulás →'}}</button></div>
        <p v-else-if="!event.isSecret" class="muted">A hozzájáruláshoz lépj be játékosként.</p>
        <button class="community-history-link" @click="showHistory(event)">Hozzájárulások és előzmények →</button>
      </article>
    </section>
    <section class="community-section"><div class="community-section-heading"><div><p class="eyebrow">UNLOCKED</p><h2>Legutóbb feloldva</h2></div></div>
      <div v-if="!activations.length" class="panel community-empty">Még nem oldottatok fel közösségi eseményt.</div>
      <article v-for="activation in activations" :key="activation.id" class="panel community-activation"><span>✦</span><div><h3>{{activation.title}}</h3><p>{{activation.description}}</p><small>{{fmt(activation.totalContributions)}} CR · {{activation.participantCount}} résztvevő · {{new Date(activation.activatedAt+'Z').toLocaleString('hu-HU')}}</small></div></article>
    </section>
    <div v-if="history" class="community-modal-backdrop" @click.self="history=null"><section class="panel community-history-modal"><button class="ghost community-modal-close" @click="history=null">Bezárás</button><p class="eyebrow">EVENT HISTORY</p><h2>{{history.title}}</h2><h3>Top támogatók</h3><p v-for="(p,i) in history.leaderboard" :key="p.playerName" class="muted">#{{i+1}} {{p.playerName}} · {{fmt(p.totalAmount)}} CR</p><h3>Aktiválások</h3><p v-for="a in history.activations" :key="a.id" class="muted">{{new Date(a.activatedAt+'Z').toLocaleString('hu-HU')}} · {{fmt(a.totalContributions)}} CR · {{a.participantCount}} fő</p><h3>Legutóbbi hozzájárulások</h3><p v-for="c in history.contributions" :key="c.id" class="muted">{{c.playerName}} · {{fmt(c.amount)}} CR</p></section></div>
  </main>
</template>
