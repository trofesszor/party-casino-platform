<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../services/api';

const router = useRouter();
const playerId = Number(localStorage.getItem('party-player-id'));
const playerName = localStorage.getItem('party-player-name') || '';
const balance = ref(0);
const items = ref<{itemKey:string;name:string;description:string;price:number;quantity:number}[]>([]);
const quests = ref<{id:number;title:string;description:string;status:'ACTIVE'|'COMPLETED'|'SKIPPED'}[]>([]);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const questSkipItem = computed(() => items.value.find(item => item.itemKey === 'QUEST_SKIP'));
const activeQuests = computed(() => quests.value.filter(quest => quest.status === 'ACTIVE'));
type ScratchTicket = {id:number;status:'UNSCRATCHED'|'REVEALED';prizeAmount?:number;outcomeJson?:string|null;createdAt:string};
const scratchTickets = ref<ScratchTicket[]>([]);
const activeTicket = ref<ScratchTicket|null>(null);
const scratchCanvas = ref<HTMLCanvasElement|null>(null);
const scratching = ref(false);
const revealing = ref(false);
const scratchProgress = ref(0);
let scratchContext:CanvasRenderingContext2D|null=null;

async function refresh() {
  if (!playerId || !playerName) { router.replace('/'); return; }
  try {
    const [shop, sideQuests, wallet, tickets] = await Promise.all([
      api.getShop(playerId),
      api.getPlayerSideQuests(playerId),
      api.getPlayerBalance(playerId),
      api.getScratchTickets(playerId),
    ]);
    items.value = shop;
    quests.value = sideQuests;
    balance.value = wallet.tokenBalance;
    scratchTickets.value = tickets;
    if(activeTicket.value) activeTicket.value=scratchTickets.value.find(ticket=>ticket.id===activeTicket.value?.id)??null;
    error.value = '';
  } catch (e:any) { error.value = e.message || 'Nem sikerült betölteni a shopot.'; }
}
async function buy(itemKey:string) {
  if (busy.value) return;
  const item = items.value.find(entry => entry.itemKey === itemKey);
  if (!item || balance.value < item.price) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const purchase=await api.buyShopItem(playerId,itemKey);
    await refresh();
    if(itemKey==='SCRATCH_TICKET'&&purchase.ticketId){activeTicket.value=scratchTickets.value.find(ticket=>ticket.id===purchase.ticketId)??{id:purchase.ticketId,status:'UNSCRATCHED',createdAt:new Date().toISOString()};notice.value='Sok szerencsét! Kapard le a sorsjegyet!';await nextTick();initializeScratchCard();}
    else notice.value = 'Sikeres vásárlás. A tárgy bekerült a készletedbe.';
  } catch (e:any) { error.value = e.message || 'A vásárlás nem sikerült.'; }
  finally { busy.value = false; }
}
function initializeScratchCard(){
 const canvas=scratchCanvas.value;if(!canvas||!activeTicket.value||activeTicket.value.status==='REVEALED')return;
 const rect=canvas.getBoundingClientRect(),ratio=Math.max(1,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);
 const ctx=canvas.getContext('2d');if(!ctx)return;scratchContext=ctx;ctx.scale(ratio,ratio);
 const gradient=ctx.createLinearGradient(0,0,rect.width,rect.height);gradient.addColorStop(0,'#d8dce0');gradient.addColorStop(.28,'#7e858b');gradient.addColorStop(.52,'#e9edf0');gradient.addColorStop(.75,'#8b9298');gradient.addColorStop(1,'#c4c9ce');
 ctx.fillStyle=gradient;ctx.fillRect(0,0,rect.width,rect.height);ctx.fillStyle='rgba(20,25,29,.24)';ctx.font='800 17px sans-serif';ctx.textAlign='center';
 for(let y=25;y<rect.height;y+=34)for(let x=25;x<rect.width;x+=115)ctx.fillText('✦ KAPARD LE ✦',x,y);
 ctx.fillStyle='#343a40';ctx.font='900 23px sans-serif';ctx.fillText('KAPARD LE!',rect.width/2,rect.height/2);scratchProgress.value=0;
}
function scratchStart(event:PointerEvent){if(revealing.value||activeTicket.value?.status==='REVEALED'||!scratchContext)return;scratching.value=true;(event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);scratchMove(event);}
function scratchMove(event:PointerEvent){if(!scratching.value||!scratchContext||!scratchCanvas.value)return;const rect=scratchCanvas.value.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;scratchContext.globalCompositeOperation='destination-out';scratchContext.beginPath();scratchContext.arc(x,y,21,0,Math.PI*2);scratchContext.fill();const pixels=scratchContext.getImageData(0,0,scratchCanvas.value.width,scratchCanvas.value.height).data;let cleared=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<32)cleared++;scratchProgress.value=cleared/(pixels.length/4);if(scratchProgress.value>=0.58)revealTicket();}
function scratchEnd(){scratching.value=false;}
async function revealTicket(){if(revealing.value||!activeTicket.value)return;revealing.value=true;try{const result=await api.revealScratchTicket(playerId,activeTicket.value.id);activeTicket.value={...activeTicket.value,status:'REVEALED',prizeAmount:result.prizeAmount,outcomeJson:JSON.stringify(result.outcome)};await refresh();}catch(e:any){error.value=e.message||'A sorsjegy felfedése nem sikerült.';}finally{revealing.value=false;}}
function openScratchTicket(ticket:ScratchTicket){activeTicket.value=ticket;nextTick(()=>{if(ticket.status==='UNSCRATCHED')initializeScratchCard();});}
function scratchGrid(ticket:ScratchTicket):string[][]{try{return ticket.outcomeJson?JSON.parse(ticket.outcomeJson):[['?','?','?'],['?','?','?'],['?','?','?']];}catch{return [['?','?','?'],['?','?','?'],['?','?','?']];}}
async function skipQuest(questId:number) {
  if (busy.value || !questSkipItem.value?.quantity) return;
  const quest = activeQuests.value.find(entry => entry.id === questId);
  if (!quest || !window.confirm(`Biztosan kihagyod ezt a küldetést?\n\n${quest.title}\n\nA tárgy felhasználásra kerül.`)) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.useShopItem(playerId,'QUEST_SKIP',questId);
    await refresh();
    notice.value = 'A küldetés kihagyva. Később újra megkaphatod.';
  } catch (e:any) { error.value = e.message || 'A tárgy használata nem sikerült.'; }
  finally { busy.value = false; }
}
onMounted(refresh);
</script>

<template>
  <main class="shop-page">

    <section class="shop-intro">
      
      <h1>Kaszinóbolt</h1>
      <p class="muted">Vásárolj hasznos tárgyakat a játék során szerzett CR tokenekből.</p>
    </section>

    <p v-if="error" class="shop-message shop-error">{{ error }}</p>
    <p v-if="notice" class="shop-message shop-notice">{{ notice }}</p>

    <div class="shop-layout">
    <section class="shop-section">
      <div class="shop-section-heading"><div><h2>Elérhető tárgyak</h2></div><span>{{ items.length }} TERMÉK</span></div>
      <article v-for="item in items" :key="item.itemKey" class="shop-item panel">
        <div class="shop-item-icon"><span v-if="item.itemKey === 'SCRATCH_TICKET'">🎟️</span><span v-else>⏭</span></div>
        <div class="shop-item-copy">
          <span class="shop-item-tag">{{ item.itemKey === 'SCRATCH_TICKET' ? 'AZONNALI NYEREMÉNY' : 'HASZNÁLHATÓ TÁRGY' }}</span>
          <h3>{{ item.name }}</h3>
          <p class="muted">{{ item.description }}</p>
          <small v-if="item.itemKey !== 'SCRATCH_TICKET'">Készleten: <strong>{{ item.quantity }} db</strong></small><small v-else>Öt lehetséges eredmény · akár 100 CR</small>
        </div>
        <div class="shop-item-buy">
          <strong>{{ item.price }} <small>CR</small></strong>
          <button class="primary" :disabled="busy || balance < item.price" @click="buy(item.itemKey)">{{ balance < item.price ? 'Nincs elég CR' : 'Vásárlás' }}</button>
        </div>
      </article>
      <div v-if="!items.length && !error" class="shop-empty panel">Jelenleg nincs elérhető termék.</div>
    </section>

    <aside class="shop-player-inventory">
    <section class="shop-section inventory-section">
      <div class="shop-section-heading"><div><h2>Készlet és használat</h2></div><span>{{ questSkipItem?.quantity ?? 0 }} KÜLDETÉS KIHAGYÁS</span></div>
      <div v-if="!questSkipItem?.quantity" class="shop-empty panel">Még nincs használható tárgyad. Vásárolj egy küldetéskihagyást a fenti shopban.</div>
      <template v-else>
        <p class="shop-inventory-note">Válaszd ki, melyik aktív side questet szeretnéd kihagyni. Minden használat 1 tárgyba kerül.</p>
        <article v-for="quest in activeQuests" :key="quest.id" class="shop-quest-row panel">
          <div><span class="eyebrow">AKTÍV SIDE QUEST</span><strong>{{ quest.title }}</strong><p v-if="quest.description" class="muted">{{ quest.description }}</p></div>
          <button class="danger-button" :disabled="busy" @click="skipQuest(quest.id)">Kihagyás · 1 db</button>
        </article>
        <div v-if="!activeQuests.length" class="shop-empty panel">Nincs aktív side quested. A tárgyaid megmaradnak, amíg nem használod fel őket.</div>
      </template>
    </section>

    <section v-if="scratchTickets.length" class="shop-section scratch-inventory-section">
      <div class="shop-section-heading"><div><h2>Sorsjegyeid</h2></div><span>{{ scratchTickets.filter(ticket=>ticket.status==='UNSCRATCHED').length }} FELKAPARATLAN</span></div>
      <div class="scratch-ticket-list"><button v-for="ticket in scratchTickets" :key="ticket.id" class="scratch-ticket-mini" @click="openScratchTicket(ticket)"><span>✦</span><strong>{{ ticket.status==='UNSCRATCHED'?'LEKAPARÁSRA VÁR':'FELFEDVE' }}</strong><small>#{{ ticket.id }}</small></button></div>
    </section>
    </aside>
    </div>
    <div v-if="activeTicket" class="scratch-overlay" @click.self="activeTicket=null">
      <section class="scratch-modal panel">
        <button class="ghost scratch-close" @click="activeTicket=null">✕</button>
        <div class="scratch-modal-heading"><span>PARTY CASINO · INSTANT WIN</span><h2>Kapard és <em>nyerj!</em></h2><p>Találd meg a nyereményedet a lekaparható mező alatt.</p></div>
        <div class="scratch-ticket-paper" :class="{'ticket-winner':activeTicket.status==='REVEALED' && (activeTicket.prizeAmount??0)>0,'ticket-loser':activeTicket.status==='REVEALED' && !activeTicket.prizeAmount}">
          <div class="paper-topline"><span>PARTY CASINO PRESENTS</span><span>NO. {{ String(activeTicket.id).padStart(6,'0') }}</span></div>
          <div class="paper-masthead"><div class="paper-seal">♛</div><div><small>AZ IGAZI BULIHOZ</small><h3>FŐNYEREMÉNY</h3><b>KAPARÓS SORSJEGY</b></div><div class="paper-badge">EXTRA<br>KIADÁS</div></div>
          <div class="paper-subtitle"><span>3 EGYFORMA JEL = NYEREMÉNY</span><span>AZONNALI JÁTÉK</span></div>
          <div class="scratch-play-area">
            <div class="scratch-symbol-grid">
              <div v-for="(row,rowIndex) in scratchGrid(activeTicket)" :key="rowIndex" class="scratch-symbol-row">
                <div v-for="(symbol,colIndex) in row" :key="colIndex" class="scratch-symbol-cell" :class="{'symbol-winning':activeTicket.status==='REVEALED' && row[0]===row[1] && row[1]===row[2]}">
                  <span>{{ symbol }}</span><small>{{ rowIndex*3+colIndex+1 }}</small>
                </div>
              </div>
            </div>
            <canvas v-if="activeTicket.status==='UNSCRATCHED'" ref="scratchCanvas" class="scratch-surface" @pointerdown="scratchStart" @pointermove="scratchMove" @pointerup="scratchEnd" @pointercancel="scratchEnd"></canvas>
          </div>
          <div class="paper-rules">
            <div><strong>HOGYAN NYERHETSZ?</strong><span>Keress 3 egyforma szimbólumot egy vízszintes sorban.</span></div>
            <div class="paper-prize-table">
              <span>🔔 <b>10 CR</b></span><span>⭐ <b>25 CR</b></span><span>💎 <b>50 CR</b></span><span>7️⃣ <b>100 CR</b></span>
            </div>
          </div>
          <div v-if="activeTicket.status==='REVEALED'" class="paper-result" :class="{'paper-result-win':(activeTicket.prizeAmount??0)>0}">
            <strong>{{ activeTicket.prizeAmount ? 'NYERTÉL '+activeTicket.prizeAmount+' CR-T!' : 'EZ MOST NEM NYERT' }}</strong>
            <span>{{ activeTicket.prizeAmount ? 'A nyereményedet jóváírtuk az egyenlegeden.' : 'Legközelebb talán a szerencse melléd áll.' }}</span>
          </div>
          <div class="paper-bottomline"><span>PARTY CASINO · JÁTÉKOS KIADÁS</span><span>★ SOK SZERENCSÉT ★</span></div>
        </div>
        <p v-if="activeTicket.status==='UNSCRATCHED'" class="scratch-instruction">Kapard le a mező legalább 58%-át, hogy felfedd mind a 9 mezőt.</p>
        <button v-else class="primary scratch-done" @click="activeTicket=null">Bezárás</button>
      </section>
    </div>
    <footer>PARTY CASINO <span>•</span> A vásárlások és tárgyhasználatok azonnal érvényesülnek</footer>
  </main>
</template>
