<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../services/api';
import type { Player } from '../types';

type AdminPlayer = Player & { online: boolean };
type TokenTransaction = { id: number; amount: number; balanceAfter: number; type: string; description: string; createdAt: string };
const balanceInputs = ref<Record<number, number>>({});
const transactions = ref<TokenTransaction[]>([]);
const selectedPlayer = ref<number | null>(null);
const actionError = ref('');
const wheelSegments = ref<{label:string;enabled:boolean}[]>([]);
const wheelSaving = ref(false);
type PoolQuest = { id:number; title:string; description:string; enabled:number; photoEnabled:number };
const sideQuestPool = ref<PoolQuest[]>([]);
const newQuestTitle = ref('');
const newQuestDescription = ref('');
const newQuestPhotoEnabled = ref(false);
const sideQuestSaving = ref(false);
type AdminShopItem = { itemKey:string; name:string; description:string; price:number; enabled:number };
const shopItems = ref<AdminShopItem[]>([]);
const shopSavingKey = ref('');
const gameSettings=ref({wheelSpinCost:5,wheelSpinDurationMs:7000,rouletteBettingSeconds:20,rouletteResultSeconds:5,rouletteMaxBet:100,duelReward:10,maxActiveSideQuests:2,questPinExpirySeconds:90,scratchLossPercent:60,scratch10Percent:25,scratch25Percent:10,scratch50Percent:4,scratch100Percent:1,roulettePayoutNumber:35,roulettePayoutSplit:17,roulettePayoutStreet:11,roulettePayoutCorner:8,roulettePayoutSixLine:5,roulettePayoutDozen:2,roulettePayoutColumn:2,roulettePayoutColor:1,roulettePayoutOddEven:1,roulettePayoutLowHigh:1});
const gameSettingsSaving=ref(false);
const tokenPhotoSettings=ref({enabled:true,balanceThreshold:50,rewardAmount:10,cooldownMinutes:60,dailyLimit:2});
const tokenPhotoSaving=ref(false);
const defaultPlayerTokens=ref(100);
const defaultTokensSaving=ref(false);
const resetBusy=ref(false);
const resetMessage=ref('');
type CasinoStats={sessionId:number;startedAt:string;endedAt:string|null;playerCount:number;transactionCount:number;tokensSpent:number;tokensWon:number;topWinner:{name:string;amount:number}|null;mostActive:{name:string;actions:number}|null;richestPlayer:{name:string;balance:number}|null;biggestWin:{name:string;amount:number;description:string}|null;rouletteRounds:number;rouletteBets:number;rouletteTokens:number;completedDuels:number;duelChampion:{name:string;wins:number}|null;questsAssigned:number;questsCompleted:number;scratchTickets:number;scratchRevealed:number;scratchWins:number;scratchPrizes:number;photoRewards:number};
const casinoStats=ref<{current:CasinoStats|null;lastCompleted:CasinoStats|null}>({current:null,lastCompleted:null});
const statsLoading=ref(false);
const statsExporting=ref(false);
const statsMode=ref<'current'|'last'>('current');
const displayedStats=computed(()=>statsMode.value==='last'?(casinoStats.value.lastCompleted??casinoStats.value.current):casinoStats.value.current);


const password = ref('');
const token = ref(localStorage.getItem('party-admin-token') ?? '');
const players = ref<AdminPlayer[]>([]);
const error = ref('');
const busy = ref(false);
const authenticated = ref(false);

async function loadCasinoStatistics(){
  statsLoading.value=true;
  try{casinoStats.value=await api.adminCasinoStatistics(token.value);}
  catch(e:any){actionError.value=e.message||'A statisztikák betöltése nem sikerült.';}
  finally{statsLoading.value=false;}
}
function formatStatDate(value:string){return new Date(value).toLocaleString('hu-HU',{dateStyle:'medium',timeStyle:'short'});}
async function exportStatisticsImage(){
  const s=displayedStats.value;if(!s)return;
  statsExporting.value=true;
  try{
    const width=1200,height=1500,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('A kép exportálása nem támogatott ebben a böngészőben.');
    const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,'#111827');gradient.addColorStop(.55,'#24143d');gradient.addColorStop(1,'#101114');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
    const glow=ctx.createRadialGradient(950,100,10,950,100,500);glow.addColorStop(0,'rgba(190,70,255,.24)');glow.addColorStop(1,'rgba(190,70,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    const text=(value:string,x:number,y:number,size:number,color='#f7f4ff',weight='600')=>{ctx.font=`${weight} ${size}px Arial`;ctx.fillStyle=color;ctx.fillText(value,x,y);};
    const card=(x:number,y:number,w:number,h:number)=>{ctx.fillStyle='rgba(255,255,255,.075)';ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,w,h,24);ctx.fill();ctx.stroke();};
    text('PARTY CASINO',72,90,28,'#d7a7ff','700');text('THE NIGHT IN NUMBERS',72,175,58);
    text('A buli statisztikái',74,225,28,'#c7bfd5','400');
    text(`#${s.sessionId}  ·  ${formatStatDate(s.startedAt)}`,74,270,20,'#aaa2b8','400');
    const metrics=[['JÁTÉKOSOK',String(s.playerCount)],['TRANZAKCIÓK',String(s.transactionCount)],['LEJÁTSZOTT RULETTKÖR',String(s.rouletteRounds)],['RULETTFOGADÁSOK',String(s.rouletteBets)],['PÁRBAJOK',String(s.completedDuels)],['TELJESÍTETT KÜLDETÉSEK',String(s.questsCompleted)],['KAPARÓS SORSJEGYEK',String(s.scratchTickets)],['FOTÓJUTALMAK',String(s.photoRewards)]];
    metrics.forEach((m,i)=>{const col=i%2,row=Math.floor(i/2),x=72+col*540,y=325+row*145;card(x,y,500,112);text(m[0],x+28,y+42,17,'#bcb2cc','600');text(m[1],x+28,y+88,38);});
    card(72,930,1040,230);text('AZ ÉJSZAKA LEGNAGYOBB SZTÁRJA',105,985,18,'#c9a3ff','700');
    text(s.topWinner?.name??'Még nincs nyertes adat',105,1040,34);text(s.topWinner?`+${s.topWinner.amount.toLocaleString('hu-HU')} CR összes nyeremény`:'',105,1080,20,'#bcb2cc','400');
    text('LEGAKTÍVABB JÁTÉKOS',650,985,18,'#c9a3ff','700');text(s.mostActive?.name??'—',650,1040,30);text(s.mostActive?`${s.mostActive.actions} tranzakció`:'',650,1080,20,'#bcb2cc','400');
    card(72,1190,1040,150);
    text('A KASZINÓBAN MEGFORDULT',105,1240,18,'#c9a3ff','700');
    text(`${s.tokensSpent.toLocaleString('hu-HU')} CR tét · ${s.tokensWon.toLocaleString('hu-HU')} CR nyeremény · ${s.questsCompleted}/${s.questsAssigned} küldetés`,105,1295,22);
    text('KÖSZI, HOGY JÁTSZOTTATOK!',105,1400,26,'#e4c8ff','700');
    const link=document.createElement('a');link.download=`party-casino-stats-${s.sessionId}.png`;link.href=canvas.toDataURL('image/png');link.click();
  }catch(e:any){actionError.value=e.message||'Nem sikerült elkészíteni a statisztikai képet.';}
  finally{statsExporting.value=false;}
}

async function loadPlayers() {
  if (!token.value) return;
  try {
    players.value = await api.adminPlayers(token.value);
    balanceInputs.value = Object.fromEntries(players.value.map(player => [player.id, player.tokenBalance ?? 0]));
    authenticated.value = true;
    const wheel = await api.adminGetLuckyWheelSegments(token.value);
    wheelSegments.value = wheel.map(segment => ({ label: segment.label, enabled: !!segment.enabled }));
    sideQuestPool.value = await api.adminSideQuestPool(token.value);
    shopItems.value = await api.adminShopItems(token.value);
    gameSettings.value = await api.adminGetGameSettings(token.value);
    tokenPhotoSettings.value = await api.adminGetTokenPhotoSettings(token.value);
    defaultPlayerTokens.value = (await api.adminGetDefaultPlayerTokens(token.value)).defaultTokens;
    await loadCasinoStatistics();
    localStorage.setItem('party-admin-token', token.value);
  } catch {
    token.value = '';
    authenticated.value = false;
    localStorage.removeItem('party-admin-token');
  }
}

async function login() {
  if (!password.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await api.adminLogin(password.value);
    token.value = result.token;
    password.value = '';
    await loadPlayers();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function saveBalance(player: AdminPlayer) {
  actionError.value = '';
  const balance = Number(balanceInputs.value[player.id]);
  if (!Number.isSafeInteger(balance) || balance < 0) { actionError.value = 'Érvénytelen tokenmennyiség.'; return; }
  try {
    await api.adminSetBalance(token.value, player.id, balance);
    await loadPlayers();
    if (selectedPlayer.value === player.id) transactions.value = await api.adminTransactions(token.value, player.id);
  } catch (e: any) { actionError.value = e.message; }
}

async function showTransactions(player: AdminPlayer) {
  selectedPlayer.value = selectedPlayer.value === player.id ? null : player.id;
  transactions.value = selectedPlayer.value ? await api.adminTransactions(token.value, player.id) : [];
}

function addWheelSegment() { if (wheelSegments.value.length < 24) wheelSegments.value.push({ label: 'Új mező', enabled: true }); }
function removeWheelSegment(index: number) { wheelSegments.value.splice(index, 1); }
function moveWheelSegment(index: number, direction: number) { const target=index+direction; if(target<0||target>=wheelSegments.value.length)return; const [item]=wheelSegments.value.splice(index,1); wheelSegments.value.splice(target,0,item); }
async function saveWheel() {
  wheelSaving.value=true; actionError.value='';
  try { const result=await api.saveLuckyWheel(token.value,wheelSegments.value); wheelSegments.value=result.map((segment:any)=>({label:segment.label,enabled:!!segment.enabled})); }
  catch(e:any){actionError.value=e.message;}
  finally{wheelSaving.value=false;}
}

async function toggleShopItem(item: AdminShopItem) {
  shopSavingKey.value = item.itemKey;
  actionError.value = '';
  try {
    const updated = await api.adminSetShopItemEnabled(token.value, item.itemKey, !item.enabled);
    item.enabled = updated.enabled;
  } catch (e:any) {
    actionError.value = e.message || 'A termék állapotának módosítása nem sikerült.';
  } finally {
    shopSavingKey.value = '';
  }
}

async function saveCasinoGameSettings(){
  const s=gameSettings.value;
  const odds=s.scratchLossPercent+s.scratch10Percent+s.scratch25Percent+s.scratch50Percent+s.scratch100Percent;
  if(odds!==100){actionError.value='A kaparós sorsjegy esélyeinek összege pontosan 100% legyen.';return;}
  gameSettingsSaving.value=true;actionError.value='';
  try{gameSettings.value=await api.adminSaveGameSettings(token.value,s);}
  catch(e:any){actionError.value=e.message||'A játékszabályok mentése nem sikerült.';}
  finally{gameSettingsSaving.value=false;}
}
async function saveShopItem(item:AdminShopItem){
  shopSavingKey.value=item.itemKey;actionError.value='';
  try{const updated=await api.adminUpdateShopItem(token.value,item);Object.assign(item,updated);}
  catch(e:any){actionError.value=e.message||'A shop termék mentése nem sikerült.';}
  finally{shopSavingKey.value='';}
}

async function saveDefaultPlayerTokens(){
  defaultTokensSaving.value=true;actionError.value='';
  try{defaultPlayerTokens.value=(await api.adminSetDefaultPlayerTokens(token.value,defaultPlayerTokens.value)).defaultTokens;}
  catch(e:any){actionError.value=e.message||'Az alapértelmezett tokenmennyiség mentése nem sikerült.';}
  finally{defaultTokensSaving.value=false;}
}

async function saveTokenPhotoSettings(){
  tokenPhotoSaving.value=true;actionError.value='';
  try{tokenPhotoSettings.value=await api.adminSaveTokenPhotoSettings(token.value,tokenPhotoSettings.value);}
  catch(e:any){actionError.value=e.message||'Nem sikerült menteni a fotófeltöltési beállításokat.';}
  finally{tokenPhotoSaving.value=false;}
}

async function addSideQuest() {
  if (!newQuestTitle.value.trim()) return;
  sideQuestSaving.value = true;
  actionError.value = '';
  try {
    await api.adminAddSideQuest(token.value, newQuestTitle.value, newQuestDescription.value, newQuestPhotoEnabled.value);
    newQuestTitle.value = '';
    newQuestDescription.value = '';
    newQuestPhotoEnabled.value = false;
    sideQuestPool.value = await api.adminSideQuestPool(token.value);
  } catch (e:any) { actionError.value = e.message; }
  finally { sideQuestSaving.value = false; }
}
async function toggleQuestEnabled(quest:PoolQuest){
  const enabled=!quest.enabled;sideQuestSaving.value=true;actionError.value='';
  try{const updated=await api.adminSetSideQuestEnabled(token.value,quest.id,!!enabled);quest.enabled=updated.enabled;}
  catch(e:any){actionError.value=e.message||'Nem sikerült módosítani a küldetés állapotát.';}
  finally{sideQuestSaving.value=false;}
}
async function toggleQuestPhoto(quest:PoolQuest) {
  const enabled=!quest.photoEnabled;
  sideQuestSaving.value=true; actionError.value='';
  try {
    const updated=await api.adminSetSideQuestPhotoEnabled(token.value,quest.id,enabled);
    quest.photoEnabled=updated.photoEnabled;
  } catch(e:any) { actionError.value=e.message||'Nem sikerült módosítani a fotós teljesítést.'; }
  finally { sideQuestSaving.value=false; }
}
async function deleteSideQuest(questId:number) {
  if (!confirm('Biztosan törlöd ezt a side questet a poolból?')) return;
  try {
    await api.adminDeleteSideQuest(token.value, questId);
    sideQuestPool.value = await api.adminSideQuestPool(token.value);
  } catch (e:any) { actionError.value = e.message; }
}

async function resetPlayerData(){
  actionError.value='';
  resetMessage.value='';
  const confirmation=window.prompt('Ez véglegesen törli az összes játékost és minden játékoshoz tartozó adatot. A folytatáshoz írd be: RESET');
  if(confirmation!=='RESET')return;
  resetBusy.value=true;
  try{
    const result=await api.adminResetPlayerData(token.value);
    selectedPlayer.value=null;
    transactions.value=[];
    players.value=[];
    balanceInputs.value={};
    resetMessage.value=`Sikeres visszaállítás. Törölt játékosok: ${result.deletedPlayers}.`;
    await loadPlayers();
    await loadCasinoStatistics();
  }catch(e:any){actionError.value=e.message||'A játékosadatok törlése nem sikerült.';}
  finally{resetBusy.value=false;}
}

async function logout() {
  try { if (token.value) await api.adminLogout(token.value); } catch { /* local logout still applies */ }
  token.value = '';
  authenticated.value = false;
  players.value = [];
  localStorage.removeItem('party-admin-token');
}

onMounted(loadPlayers);
</script>

<template>
  <main class="admin-page">
    <header class="admin-topbar">
      <a class="brand" href="/">PARTY<span>CASINO</span></a>
      <span class="admin-label">ADMINISTRATION</span>
    </header>

    <section v-if="!authenticated" class="admin-login panel">
      <p class="eyebrow">RESTRICTED AREA</p>
      <h1>Admin <span>login</span></h1>
      <p class="muted">Add meg az admin jelszót a vezérlőpult eléréséhez.</p>
      <form @submit.prevent="login">
        <input v-model="password" type="password" autocomplete="current-password" placeholder="Admin jelszó" autofocus>
        <button class="primary" :disabled="busy || !password">{{ busy ? 'Belépés...' : 'Belépés' }}</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
      <a class="admin-back" href="/">Vissza a kaszinóba</a>
    </section>

    <section v-else class="admin-content">
      <div class="admin-heading">
        <div><p class="eyebrow">CONTROL PANEL</p><h1>Admin <span>dashboard</span></h1><p class="muted">Játékosok és aktivitási adatok.</p></div>
        <button class="ghost" @click="logout">Kilépés</button>
      </div>

      <div class="admin-stat-grid">
        <article class="panel admin-stat"><span>ÖSSZES JÁTÉKOS</span><strong>{{ players.length }}</strong></article>
        <article class="panel admin-stat"><span>ONLINE JÁTÉKOS</span><strong>{{ players.filter(p => p.online).length }}</strong></article>
      </div>

      <section class="panel admin-wheel-editor admin-statistics-editor">
        <div class="admin-section-heading"><div><p class="eyebrow">THE NIGHT IN NUMBERS</p><h2>Kaszinó statisztikák</h2><p class="muted">A legutóbbi újraindítás óta gyűjtött adatok. A lezárt buli statisztikái újraindítás után is megmaradnak.</p></div><button class="ghost" :disabled="statsLoading" @click="loadCasinoStatistics">{{statsLoading?'Frissítés…':'Frissítés'}}</button></div>
        <div class="stats-mode-row"><button class="ghost" :class="{active:statsMode==='current'}" @click="statsMode='current'">Jelenlegi buli</button><button class="ghost" :class="{active:statsMode==='last'}" :disabled="!casinoStats.lastCompleted" @click="statsMode='last'">Előző buli</button></div>
        <div v-if="!displayedStats" class="muted admin-empty">Még nincsenek statisztikák.</div>
        <template v-else>
          <div class="casino-stats-preview">
            <div class="casino-stats-cover"><span>PARTY CASINO</span><strong>THE NIGHT<br>IN NUMBERS</strong><small>#{{displayedStats.sessionId}} · {{formatStatDate(displayedStats.startedAt)}}</small></div>
            <div class="casino-stats-grid">
              <article><small>Játékosok</small><strong>{{displayedStats.playerCount}}</strong></article>
              <article><small>Tranzakciók</small><strong>{{displayedStats.transactionCount}}</strong></article>
              <article><small>Rulettkörök</small><strong>{{displayedStats.rouletteRounds}}</strong></article>
              <article><small>Rulettfogadások</small><strong>{{displayedStats.rouletteBets}}</strong></article>
              <article><small>Párbajok</small><strong>{{displayedStats.completedDuels}}</strong></article>
              <article><small>Teljesített küldetések</small><strong>{{displayedStats.questsCompleted}}</strong></article>
              <article><small>Kapart sorsjegyek</small><strong>{{displayedStats.scratchTickets}}</strong></article>
              <article><small>Fotójutalmak</small><strong>{{displayedStats.photoRewards}}</strong></article>
            </div>
            <div class="casino-stats-highlights">
              <div><small>Legnagyobb össznyeremény</small><strong>{{displayedStats.topWinner?.name||'—'}}</strong><span>{{displayedStats.topWinner?'+'+displayedStats.topWinner.amount+' CR':'Nincs adat'}}</span></div>
              <div><small>Legaktívabb játékos</small><strong>{{displayedStats.mostActive?.name||'—'}}</strong><span>{{displayedStats.mostActive?.actions||0}} tranzakció</span></div>
              <div><small>Legnagyobb egyedi nyeremény</small><strong>{{displayedStats.biggestWin?.name||'—'}}</strong><span>{{displayedStats.biggestWin?.amount||0}} CR</span></div>
              <div><small>Párbajbajnok</small><strong>{{displayedStats.duelChampion?.name||'—'}}</strong><span>{{displayedStats.duelChampion?.wins||0}} győzelem</span></div>
            </div>
            <div class="casino-stats-footer"><span>{{displayedStats.tokensSpent.toLocaleString('hu-HU')}} CR tét</span><span>{{displayedStats.tokensWon.toLocaleString('hu-HU')}} CR nyeremény</span><span>{{displayedStats.scratchWins}} kaparós nyeremény</span></div>
          </div>
          <button class="primary stats-export-button" :disabled="statsExporting" @click="exportStatisticsImage">{{statsExporting?'Kép készítése…':'Statisztika exportálása PNG-ként'}}</button>
        </template>
      </section>
      <section class="panel admin-wheel-editor admin-reset-editor">
        <div class="admin-section-heading"><div><p class="eyebrow">NEW GAME</p><h2>Kaszinó újraindítása</h2><p class="muted">Törli az összes játékost, egyenleget, tranzakciót, fogadást, párbajt, sorsjegyet, készletet és játékoshoz tartozó küldetéselőzményt. A side quest pool, kerékmezők, shop termékek és admin beállítások megmaradnak.</p></div></div>
        <p class="error">Figyelem: ez a művelet végleges, és minden játékosadatot töröl.</p>
        <button class="ghost danger" :disabled="resetBusy" @click="resetPlayerData">{{resetBusy?'Visszaállítás…':'Játékosadatok törlése és új játék indítása'}}</button>
        <p v-if="resetMessage" class="muted">{{resetMessage}}</p>
      </section>
      <section class="panel admin-players">
        <div class="admin-section-heading"><div><p class="eyebrow">PLAYER DATABASE</p><h2>Játékosok</h2></div><button class="ghost" @click="loadPlayers">Frissítés</button></div>
        <div v-if="!players.length" class="muted admin-empty">Még nincs regisztrált játékos.</div>
        <div v-else class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Állapot</th><th>Játékos</th><th>Azonosító</th><th>Csatlakozott</th><th>Tokenegyenleg</th><th>Műveletek</th></tr></thead>
            <tbody>
              <template v-for="player in players" :key="player.id">
              <tr>
                <td><span class="player-status" :class="{online:player.online}">{{ player.online ? 'Online' : 'Offline' }}</span></td>
                <td class="player-name">{{ player.name }}</td>
                <td>#{{ player.id }}</td>
                <td>{{ new Date(player.joinedAt).toLocaleString() }}</td>
                <td><input class="admin-token-input" type="number" min="0" step="1" v-model.number="balanceInputs[player.id]"></td>
                <td><button class="ghost" @click="saveBalance(player)">Mentés</button> <button class="ghost" @click="showTransactions(player)">Előzmények</button></td>
              </tr>
              <tr v-if="selectedPlayer === player.id"><td colspan="6"><strong>Token tranzakciók</strong><div v-if="!transactions.length" class="muted">Nincs tranzakció.</div><div v-for="tx in transactions" :key="tx.id" class="admin-transaction"><span>{{ new Date(tx.createdAt).toLocaleString() }} · {{ tx.description }}</span><b :class="{ winner: tx.amount > 0 }">{{ tx.amount > 0 ? '+' : '' }}{{ tx.amount }} → {{ tx.balanceAfter }}</b></div></td></tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel admin-wheel-editor">
        <div class="admin-section-heading"><div><p class="eyebrow">PARTY GAME</p><h2>Szerencsekerék mezői</h2><p class="muted">A módosítások azonnal megjelennek minden telefonon és a TV-n.</p></div><button class="ghost" @click="addWheelSegment" :disabled="wheelSegments.length>=24">+ Új mező</button></div>
        <div v-for="(segment,index) in wheelSegments" :key="index" class="admin-wheel-row"><span class="admin-wheel-index">{{ index+1 }}</span><input v-model="segment.label" maxlength="48" placeholder="Mező felirata"><label><input v-model="segment.enabled" type="checkbox"> Aktív</label><button class="ghost" @click="moveWheelSegment(index,-1)" :disabled="index===0">↑</button><button class="ghost" @click="moveWheelSegment(index,1)" :disabled="index===wheelSegments.length-1">↓</button><button class="ghost danger" @click="removeWheelSegment(index)">Törlés</button></div>
        <button class="primary" :disabled="wheelSaving||wheelSegments.length<2" @click="saveWheel">{{wheelSaving?'Mentés…':'Kerék mentése'}}</button>
      </section>
      <section class="panel admin-wheel-editor admin-shop-editor">
        <div class="admin-section-heading"><div><p class="eyebrow">STORE MANAGEMENT</p><h2>Shop termékek</h2><p class="muted">Itt módosíthatod a termékek nevét, leírását, árát és elérhetőségét.</p></div></div>
        <div v-for="item in shopItems" :key="item.itemKey" class="side-quest-admin-row shop-admin-edit-row">
          <div class="shop-admin-edit-fields">
            <strong>{{item.itemKey}}</strong>
            <label>Megnevezés<input v-model="item.name" maxlength="80"></label>
            <label>Leírás<textarea v-model="item.description" maxlength="300" rows="2"></textarea></label>
            <label>Ár (CR)<input v-model.number="item.price" type="number" min="0" max="2000000" step="1"></label>
            <span class="player-status" :class="{online:!!item.enabled}">{{item.enabled?'Aktív':'Inaktív'}}</span>
          </div>
          <div class="shop-admin-actions">
            <button class="primary" :disabled="shopSavingKey===item.itemKey" @click="saveShopItem(item)">{{shopSavingKey===item.itemKey?'Mentés…':'Termék mentése'}}</button>
            <button class="ghost" :disabled="shopSavingKey===item.itemKey" @click="toggleShopItem(item)">{{item.enabled?'Inaktiválás':'Aktiválás'}}</button>
          </div>
        </div>
      </section>
      <section class="panel admin-wheel-editor admin-game-settings-editor">
        <div class="admin-section-heading"><div><p class="eyebrow">GAME RULES</p><h2>Játékmenet beállításai</h2><p class="muted">A módosítások mentés után a backend által futtatott játékszabályokra érvényesek. A már folyamatban lévő körök és párbajok a korábban rögzített adatokkal zárulnak.</p></div></div>
        <div class="game-settings-grid">
          <label>Szerencsekerék ára (CR)<input v-model.number="gameSettings.wheelSpinCost" type="number" min="0" max="100000"></label>
          <label>Szerencsekerék animáció (ms)<input v-model.number="gameSettings.wheelSpinDurationMs" type="number" min="1000" max="60000" step="500"></label>
          <label>Rulett fogadási idő (mp)<input v-model.number="gameSettings.rouletteBettingSeconds" type="number" min="5" max="120"></label>
          <label>Rulett eredményidő (mp)<input v-model.number="gameSettings.rouletteResultSeconds" type="number" min="1" max="30"></label>
          <label>Maximális rulett tét (CR)<input v-model.number="gameSettings.rouletteMaxBet" type="number" min="1" max="1000000"></label>
          <label>Párbaj győzelmi jutalom (CR)<input v-model.number="gameSettings.duelReward" type="number" min="0" max="1000000"></label>
          <label>Max. aktív side quest / játékos<input v-model.number="gameSettings.maxActiveSideQuests" type="number" min="1" max="10"></label>
          <label>PIN érvényesség (mp)<input v-model.number="gameSettings.questPinExpirySeconds" type="number" min="15" max="600"></label>
        </div>
        <div class="admin-subheading"><strong>Kaparós sorsjegy nyerési esélyek</strong><span class="muted">Az összegnek pontosan 100%-nak kell lennie.</span></div>
        <div class="game-settings-grid scratch-odds-grid">
          <label>Nem nyer (%)<input v-model.number="gameSettings.scratchLossPercent" type="number" min="0" max="100"></label>
          <label>10 CR (%)<input v-model.number="gameSettings.scratch10Percent" type="number" min="0" max="100"></label>
          <label>25 CR (%)<input v-model.number="gameSettings.scratch25Percent" type="number" min="0" max="100"></label>
          <label>50 CR (%)<input v-model.number="gameSettings.scratch50Percent" type="number" min="0" max="100"></label>
          <label>100 CR (%)<input v-model.number="gameSettings.scratch100Percent" type="number" min="0" max="100"></label>
        </div>
        <p class="muted">Jelenlegi összesített esély: {{gameSettings.scratchLossPercent+gameSettings.scratch10Percent+gameSettings.scratch25Percent+gameSettings.scratch50Percent+gameSettings.scratch100Percent}}%</p>
        <div class="admin-subheading"><strong>Rulett nyereményszorzók</strong><span class="muted">A tét visszajár, plusz a megadott szorzó szerinti nyeremény.</span></div>
        <div class="game-settings-grid scratch-odds-grid">
          <label>Szám (0–36)<input v-model.number="gameSettings.roulettePayoutNumber" type="number" min="1" max="1000"></label>
          <label>Split<input v-model.number="gameSettings.roulettePayoutSplit" type="number" min="1" max="1000"></label>
          <label>Street<input v-model.number="gameSettings.roulettePayoutStreet" type="number" min="1" max="1000"></label>
          <label>Corner<input v-model.number="gameSettings.roulettePayoutCorner" type="number" min="1" max="1000"></label>
          <label>Six line<input v-model.number="gameSettings.roulettePayoutSixLine" type="number" min="1" max="1000"></label>
          <label>Tucat<input v-model.number="gameSettings.roulettePayoutDozen" type="number" min="1" max="1000"></label>
          <label>Oszlop<input v-model.number="gameSettings.roulettePayoutColumn" type="number" min="1" max="1000"></label>
          <label>Szín<input v-model.number="gameSettings.roulettePayoutColor" type="number" min="1" max="1000"></label>
          <label>Páros / páratlan<input v-model.number="gameSettings.roulettePayoutOddEven" type="number" min="1" max="1000"></label>
          <label>Kicsi / nagy<input v-model.number="gameSettings.roulettePayoutLowHigh" type="number" min="1" max="1000"></label>
        </div>
        <button class="primary" :disabled="gameSettingsSaving" @click="saveCasinoGameSettings">{{gameSettingsSaving?'Mentés…':'Játékszabályok mentése'}}</button>
      </section>
      <section class="panel admin-wheel-editor admin-default-tokens-editor">
        <div class="admin-section-heading"><div><p class="eyebrow">PLAYER ECONOMY</p><h2>Kezdő tokenegyenleg</h2><p class="muted">Ennyi tokent kap minden újonnan regisztráló játékos. A módosítás csak a később csatlakozó játékosokra érvényes, a meglévő egyenlegeket nem változtatja meg.</p></div></div>
        <div class="token-photo-admin-settings">
          <label>Alapértelmezett tokenmennyiség (CR)<input v-model.number="defaultPlayerTokens" type="number" min="0" max="2000000000" step="1"></label>
        </div>
        <button class="primary" :disabled="defaultTokensSaving || !Number.isSafeInteger(defaultPlayerTokens) || defaultPlayerTokens<0 || defaultPlayerTokens>2000000000" @click="saveDefaultPlayerTokens">{{defaultTokensSaving?'Mentés…':'Kezdő tokenegyenleg mentése'}}</button>
      </section>
      <section class="panel admin-wheel-editor admin-token-photo-editor">
        <div class="admin-section-heading"><div><p class="eyebrow">PLAYER REWARDS</p><h2>Fotófeltöltés tokenekért</h2><p class="muted">Automatikus jutalom Snappin-fotó sikeres feltöltése után. A limitet a szerver ellenőrzi.</p></div></div>
        <div class="token-photo-admin-settings">
          <label class="admin-photo-quest-option"><input v-model="tokenPhotoSettings.enabled" type="checkbox"> Jutalomrendszer aktív</label>
          <label>Tokenegyenleg küszöb<input v-model.number="tokenPhotoSettings.balanceThreshold" type="number" min="0" max="2000000000"></label>
          <label>Jutalom (CR)<input v-model.number="tokenPhotoSettings.rewardAmount" type="number" min="1" max="1000000"></label>
          <label>Várakozási idő (perc)<input v-model.number="tokenPhotoSettings.cooldownMinutes" type="number" min="0" max="10080"></label>
          <label>Napi feltöltési limit<input v-model.number="tokenPhotoSettings.dailyLimit" type="number" min="1" max="24"></label>
        </div>
        <p class="muted">A játékos csak a küszöbérték alatti egyenleggel jogosult. Egyidejűleg egy aktív feltöltése lehet; az indított feltöltés a napi limitbe beleszámít, akkor is, ha nem fejezi be.</p>
        <button class="primary" :disabled="tokenPhotoSaving" @click="saveTokenPhotoSettings">{{tokenPhotoSaving?'Mentés…':'Fotójutalom beállításainak mentése'}}</button>
      </section>
      <section class="panel admin-wheel-editor admin-side-quest-editor">
        <div class="admin-section-heading"><div><p class="eyebrow">SIDE QUEST SYSTEM</p><h2>Side quest pool</h2><p class="muted">A játékosok véletlenszerűen kapnak egy küldetést ebből a listából. Egy játékosnak legfeljebb 2 aktív küldetése lehet.</p></div></div>
        <form class="side-quest-admin-form" @submit.prevent="addSideQuest">
          <input v-model="newQuestTitle" maxlength="120" placeholder="Side quest címe" required>
          <textarea v-model="newQuestDescription" maxlength="500" rows="3" placeholder="Rövid leírás / teljesítési feltétel (opcionális)"></textarea>
          <label class="admin-photo-quest-option"><input v-model="newQuestPhotoEnabled" type="checkbox"> Fotóval teljesíthető (Snappin)</label>
          <button class="primary" :disabled="sideQuestSaving || !newQuestTitle.trim()">{{ sideQuestSaving ? 'Mentés…' : '+ Küldetés hozzáadása' }}</button>
        </form>
        <div v-if="!sideQuestPool.length" class="admin-empty muted">A pool még üres. Adj hozzá néhány side questet.</div>
        <div v-for="quest in sideQuestPool" :key="quest.id" class="side-quest-admin-row">
          <div><strong>{{ quest.title }}</strong><p v-if="quest.description" class="muted">{{ quest.description }}</p>
            <label class="admin-photo-quest-option"><input type="checkbox" :checked="!!quest.enabled" :disabled="sideQuestSaving" @change="toggleQuestEnabled(quest)"> Küldetés aktív</label>
            <label class="admin-photo-quest-option"><input type="checkbox" :checked="!!quest.photoEnabled" :disabled="sideQuestSaving" @change="toggleQuestPhoto(quest)"> Fotóval teljesíthető · {{ quest.photoEnabled ? 'Snappin fotó' : '3 jegyű PIN' }}</label>
          </div>
          <button class="ghost danger" @click="deleteSideQuest(quest.id)">Törlés</button>
        </div>
      </section>
      <p v-if="actionError" class="error">{{ actionError }}</p>
      <p class="admin-footnote">A játékosadatok jelenleg az azonosítót, nevet, csatlakozás idejét és online állapotot tartalmazzák. További statisztikák később bővíthetők.</p>
    </section>
  </main>
</template>
