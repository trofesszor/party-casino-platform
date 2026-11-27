<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { CreditEconomy, ShopItem, ShopRedemption } from '../types';
import { api } from '../services/api';

const router = useRouter();
const playerId = Number(localStorage.getItem('party-player-id'));
const playerName = localStorage.getItem('party-player-name') || '';
const balance = ref(0);
const items = ref<ShopItem[]>([]);
const economy = ref<CreditEconomy>();
const redemptions = ref<ShopRedemption[]>([]);
const focusedRedemption = ref<ShopRedemption>();
const partyIcons: Record<string, string> = { PARTY_SONG: '♫', PARTY_PHOTO: '◉', PARTY_SNACK: '◈', PARTY_MOCKTAIL: '◇', PARTY_KARAOKE: '♪', PARTY_GAME: '♣' };
const isCoupon = (key: string) => key.startsWith('PARTY_');
const usableCoupons = computed(() => items.value.filter(item => isCoupon(item.itemKey) && item.quantity > 0));
const catalog = computed(() => [
  { name: 'Házibuli-kuponok', items: items.value.filter(item => isCoupon(item.itemKey) && item.enabled) },
  { name: 'Játéktárgyak', items: items.value.filter(item => !isCoupon(item.itemKey) && item.enabled) },
]);
const number = (value: number) => value.toLocaleString('hu-HU');
const receiptTime = (value: string) => new Date(value.replace(' ', 'T') + 'Z').toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' });
const quests = ref<{id:number;title:string;description:string;status:'ACTIVE'|'COMPLETED'|'SKIPPED'}[]>([]);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const questSkipItem = computed(() => items.value.find(item => item.itemKey === 'QUEST_SKIP'));
const activeQuests = computed(() => quests.value.filter(quest => quest.status === 'ACTIVE'));
type ScratchTicket = {id:number;status:'UNSCRATCHED'|'REVEALED';prizeAmount?:number;outcomeJson?:string|null;legacyPrizes?:number;createdAt:string};
const scratchTickets = ref<ScratchTicket[]>([]);
const prizeSymbols = ['🔔', '⭐', '💎', '7️⃣'];
const activeTicket = ref<ScratchTicket|null>(null);
const ticketPrizes = computed(() => activeTicket.value?.legacyPrizes ? economy.value?.legacyScratchPrizes : economy.value?.scratchPrizes);
const scratchCanvas = ref<HTMLCanvasElement|null>(null);
const scratching = ref(false);
const revealing = ref(false);
const scratchProgress = ref(0);
let scratchContext:CanvasRenderingContext2D|null=null;

async function refresh() {
  if (!playerId || !playerName) { router.replace('/'); return; }
  try {
    const [shop, sideQuests, wallet, tickets, credits, receipts] = await Promise.all([
      api.getShop(playerId),
      api.getPlayerSideQuests(playerId),
      api.getPlayerBalance(playerId),
      api.getScratchTickets(playerId),
      api.getEconomy(),
      api.getShopRedemptions(playerId),
    ]);
    items.value = shop;
    economy.value = credits;
    redemptions.value = receipts;
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
  if (!item?.enabled || balance.value < item.price) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const purchase=await api.buyShopItem(playerId,itemKey);
    await refresh();
    window.dispatchEvent(new Event('party-player-changed'));
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
async function redeem(item: ShopItem) {
  if (busy.value || !item.quantity || !window.confirm('Beváltod ezt a kupont a házigazdánál? ' + item.name)) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    focusedRedemption.value = await api.redeemShopCoupon(playerId, item.itemKey);
    await refresh();
    notice.value = 'A kupon beváltva. Mutasd meg a bizonylatot a házigazdának.';
  } catch (cause) {
    await refresh();
    error.value = cause instanceof Error ? cause.message : 'A beváltás sikertelen.';
  } finally {
    busy.value = false;
  }
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
    <p v-if="notice" class="shop-message shop-notice" role="status">{{ notice }}</p>

    <details v-if="economy" class="shop-credit-guide panel">
      <summary><strong>Kreditek és tétlimitek</strong><span>Egyenleg {{ number(balance) }} CR</span></summary>
      <dl>
        <div><dt>Kezdőegyenleg</dt><dd>{{ number(economy.startingCredits) }} CR</dd></div>
        <div><dt>Rulett</dt><dd>{{ number(economy.rouletteMinBet) }}–{{ number(economy.rouletteRoundLimit) }} CR körönként</dd></div>
        <div><dt>Slot</dt><dd>500–{{ number(economy.slotStakeLimit) }} CR pörgetésenként</dd></div>
        <div><dt>Blackjack</dt><dd>{{ economy.blackjackBets.map(number).join(', ') }} CR alaptét</dd></div>
        <div><dt>Szerencsekerék</dt><dd>{{ number(economy.wheelSpinCost) }} CR pörgetésenként</dd></div>
        <div><dt>Párbaj győztese</dt><dd>+{{ number(economy.duelReward) }} CR</dd></div>
        <div v-if="economy.photoReward.enabled"><dt>Fotóküldetés {{ number(economy.photoReward.balanceThreshold) }} CR alatt</dt><dd>+{{ number(economy.photoReward.rewardAmount) }} CR · napi {{ economy.photoReward.dailyLimit }}×</dd></div>
      </dl>
    </details>

    <div class="shop-layout">
      <div class="shop-catalog">
        <section v-for="group in catalog" v-show="group.items.length" :key="group.name" class="shop-section">
          <div class="shop-section-heading"><h2>{{ group.name }}</h2></div>
          <article v-for="item in group.items" :key="item.itemKey" class="shop-item panel">
            <div class="shop-item-icon" aria-hidden="true">{{ partyIcons[item.itemKey] ?? (item.itemKey === 'SCRATCH_TICKET' ? '✦' : '»') }}</div>
            <div class="shop-item-copy">
              <h3>{{ item.name }}</h3>
              <p class="muted">{{ item.description }}</p>
              <small v-if="item.itemKey !== 'SCRATCH_TICKET' && item.quantity">Készleten {{ item.quantity }} db</small>
            </div>
            <div class="shop-item-buy">
              <strong>{{ number(item.price) }} <small>CR</small></strong>
              <button class="primary" :disabled="busy || balance < item.price" @click="buy(item.itemKey)">{{ balance < item.price ? 'Nincs elég CR' : 'Vásárlás' }}</button>
            </div>
          </article>
        </section>
        <p v-if="!items.some(item => item.enabled) && !error" class="shop-empty panel">Jelenleg nincs elérhető termék.</p>
      </div>

      <aside class="shop-player-inventory">
        <section v-if="usableCoupons.length || redemptions.length" class="shop-section">
          <div class="shop-section-heading"><h2>Kuponjaid</h2></div>
          <article v-for="item in usableCoupons" :key="item.itemKey" class="shop-quest-row panel">
            <div><strong>{{ item.name }}</strong><p class="muted">{{ item.quantity }} db</p></div>
            <button class="ghost" :disabled="busy" @click="redeem(item)">Beváltás</button>
          </article>
          <details v-if="redemptions.length" class="shop-credit-guide panel">
            <summary><strong>Beváltási bizonylatok</strong></summary>
            <ul class="shop-receipts">
              <li v-for="receipt in redemptions" :key="receipt.id">
                <button class="ghost" @click="focusedRedemption = receipt">{{ receipt.name }} · #{{ receipt.id }}</button>
              </li>
            </ul>
          </details>
        </section>
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
    <section v-if="focusedRedemption" class="shop-receipt panel" role="status">
      <h2>Beváltási bizonylat #{{ focusedRedemption.id }}</h2>
      <p>{{ focusedRedemption.name }} · {{ playerName }}</p>
      <time>{{ receiptTime(focusedRedemption.redeemedAt) }}</time>
      <button class="ghost" @click="focusedRedemption = undefined">Bezárás</button>
    </section>
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
              <span v-for="(prize, index) in ticketPrizes" :key="prize">{{ prizeSymbols[index] }} <b>{{ number(prize) }} CR</b></span>
            </div>
          </div>
          <div v-if="activeTicket.status==='REVEALED'" class="paper-result" :class="{'paper-result-win':(activeTicket.prizeAmount??0)>0}">
            <strong>{{ activeTicket.prizeAmount ? 'NYERTÉL '+number(activeTicket.prizeAmount)+' CR-T!' : 'EZ MOST NEM NYERT' }}</strong>
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

<style scoped>
.shop-credit-guide { margin: 0 auto 16px; padding: 10px 14px; }
.shop-credit-guide summary { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 44px; cursor: pointer; }
.shop-credit-guide summary strong::before { content: '+ '; color: var(--accent); }
.shop-credit-guide[open] summary strong::before { content: '− '; }
.shop-credit-guide summary span, .shop-credit-guide dd { color: var(--accent); font-variant-numeric: tabular-nums; }
.shop-credit-guide dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr)); gap: 12px; margin: 8px 0; }
.shop-credit-guide dt { color: var(--muted); }
.shop-credit-guide dd { margin: 3px 0 0; }
.shop-catalog, .shop-player-inventory { display: grid; gap: 16px; min-width: 0; align-content: start; }
.shop-layout .scratch-inventory-section { grid-column: auto; }
.shop-receipts { display: grid; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
.shop-receipts button, .shop-receipt button { min-height: 44px; }
.shop-receipt { position: fixed; z-index: 76; inset: auto var(--gutter) max(18px, var(--safe-bottom)) auto; width: min(380px, calc(100% - 2 * var(--gutter))); padding: 16px; overflow-wrap: anywhere; }
.shop-receipt h2 { margin-top: 0; }
.shop-receipt button { display: block; margin-top: 12px; }
@media (max-width: 420px) {
  .shop-item-buy button, .shop-quest-row button { min-height: 44px; }
  .shop-item-copy { min-width: 0; overflow-wrap: anywhere; }
}
</style>
