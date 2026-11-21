<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, type Duel } from '../services/api';
import type { Player } from '../types';
import { identifyPlayer } from '../services/socket';

const router = useRouter();
const player = ref<Player | null>(null);
const tokenBalance = ref(0);
type SideQuest = { id:number; title:string; description:string; status:'ACTIVE'|'COMPLETED'|'SKIPPED'; assignedAt:string; completedAt:string|null; photoEnabled?:number; completionMethod?:string|null; approvedByName?:string|null; approvedAt?:string|null };
const sideQuests = ref<SideQuest[]>([]);
const sideQuestBusy = ref(false);
const sideQuestError = ref('');
const verificationPin = ref<{questId:number;title:string;pin:string;expiresAt:string}|null>(null);
const verificationPinVisible = ref(false);
let verificationPinPollTimer: ReturnType<typeof setInterval> | undefined;
const photoSession = ref<{questId:number;title:string;sessionId:string;cameraUrl:string;expiresAt:string}|null>(null);
let photoPollTimer: ReturnType<typeof setInterval> | undefined;
const activeSideQuests = ref<SideQuest[]>([]);
type TokenPhotoStatus={enabled:boolean;eligible:boolean;balance:number;balanceThreshold:number;rewardAmount:number;cooldownMinutes:number;dailyLimit:number;dailyUsed:number;dailyRemaining:number;pending:boolean;sessionId:string|null;expiresAt:string|null;reason:string|null};
const tokenPhotoStatus=ref<TokenPhotoStatus|null>(null);
const tokenPhotoSession=ref<{sessionId:string;cameraUrl:string;expiresAt:string;rewardAmount:number}|null>(null);
const tokenPhotoBusy=ref(false);
const tokenPhotoMessage=ref('');
let tokenPhotoPollTimer:ReturnType<typeof setInterval>|undefined;
async function loadTokenPhotoStatus(){
  if(!player.value)return;
  try{tokenPhotoStatus.value=await api.getTokenPhotoStatus(player.value.id);}
  catch{tokenPhotoStatus.value=null;}
}
async function startTokenPhotoUpload(){
  if(!player.value||tokenPhotoBusy.value)return;
  tokenPhotoBusy.value=true;tokenPhotoMessage.value='';
  const cameraTab=window.open('about:blank','_blank');
  try{
    const session=await api.createTokenPhotoSession(player.value.id);
    tokenPhotoSession.value=session;
    if(cameraTab){cameraTab.opener=null;cameraTab.location.href=session.cameraUrl;}
    if(tokenPhotoPollTimer)clearInterval(tokenPhotoPollTimer);
    tokenPhotoPollTimer=setInterval(checkTokenPhotoUpload,2500);
    await loadTokenPhotoStatus();
  }catch(e:any){if(cameraTab)cameraTab.close();tokenPhotoMessage.value=e.message||'Nem sikerült elindítani a fotófeltöltést.';await loadTokenPhotoStatus();}
  finally{tokenPhotoBusy.value=false;}
}
async function checkTokenPhotoUpload(){
  if(!player.value||!tokenPhotoSession.value)return;
  if(Date.now()>=Date.parse(tokenPhotoSession.value.expiresAt)){
    if(tokenPhotoPollTimer)clearInterval(tokenPhotoPollTimer);tokenPhotoPollTimer=undefined;tokenPhotoSession.value=null;
    tokenPhotoMessage.value='A fotófeltöltési idő lejárt. Próbáld újra később.';await loadTokenPhotoStatus();return;
  }
  try{
    const result=await api.checkTokenPhotoSession(player.value.id,tokenPhotoSession.value.sessionId);
    if(result.completed){
      if(tokenPhotoPollTimer)clearInterval(tokenPhotoPollTimer);tokenPhotoPollTimer=undefined;tokenPhotoSession.value=null;
      tokenPhotoMessage.value=`Sikeres feltöltés! +${result.rewardAmount} CR jóváírva.`;
      const balance=await api.getPlayerBalance(player.value.id);tokenBalance.value=balance.tokenBalance;
      await loadTokenPhotoStatus();
    }else if(result.status==='EXPIRED'){
      if(tokenPhotoPollTimer)clearInterval(tokenPhotoPollTimer);tokenPhotoPollTimer=undefined;tokenPhotoSession.value=null;
      tokenPhotoMessage.value='A fotófeltöltési munkamenet lejárt.';await loadTokenPhotoStatus();
    }
  }catch(e:any){if(/nem található|lejárt/i.test(e.message||'')){if(tokenPhotoPollTimer)clearInterval(tokenPhotoPollTimer);tokenPhotoPollTimer=undefined;tokenPhotoSession.value=null;tokenPhotoMessage.value=e.message;await loadTokenPhotoStatus();}}
}

async function loadSideQuests() {
  if (!player.value) return;
  try { sideQuests.value = await api.getPlayerSideQuests(player.value.id); activeSideQuests.value = sideQuests.value.filter(q => q.status === 'ACTIVE'); sideQuestError.value = ''; }
  catch (e:any) { sideQuestError.value = e.message || 'Nem sikerült betölteni a küldetéseket.'; }
}
async function requestSideQuest() {
  if (!player.value || activeSideQuests.value.length >= 2 || sideQuestBusy.value) return;
  sideQuestBusy.value = true; sideQuestError.value = '';
  try { await api.requestSideQuest(player.value.id); await loadSideQuests(); }
  catch (e:any) { sideQuestError.value = e.message; }
  finally { sideQuestBusy.value = false; }
}
async function finishSideQuest(quest:SideQuest) {
  if (!player.value || sideQuestBusy.value) return;
  if (verificationPin.value?.questId === quest.id) {
    verificationPinVisible.value = !verificationPinVisible.value;
    return;
  }
  sideQuestBusy.value = true; sideQuestError.value = '';
  try {
    const response = await api.requestSideQuestVerification(player.value.id,quest.id);
    verificationPin.value = {questId:quest.id,title:quest.title,pin:response.pin,expiresAt:response.expiresAt};
    verificationPinVisible.value = true;
    if(verificationPinPollTimer) clearInterval(verificationPinPollTimer);
    verificationPinPollTimer=setInterval(checkVerificationPinStatus,2000);
  } catch (e:any) { sideQuestError.value = e.message; }
  finally { sideQuestBusy.value = false; }
}
async function checkVerificationPinStatus() {
  if(!player.value||!verificationPin.value)return;
  try {
    const status=await api.getSideQuestVerificationStatus(player.value.id,verificationPin.value.questId);
    if(!status.active) {
      if(verificationPinPollTimer)clearInterval(verificationPinPollTimer);
      verificationPinPollTimer=undefined;
      verificationPin.value=null;
      verificationPinVisible.value=false;
      await loadSideQuests();
    }
  } catch {
    // Keep the displayed PIN during temporary network failures; the server remains authoritative.
  }
}
async function startPhotoQuest(quest:SideQuest) {
  if(!player.value||sideQuestBusy.value)return;
  sideQuestBusy.value=true;sideQuestError.value='';
  const cameraTab=window.open('about:blank','_blank');
  try {
    const session=await api.createSideQuestPhotoSession(player.value.id,quest.id);
    photoSession.value={questId:quest.id,title:session.questTitle,sessionId:session.sessionId,cameraUrl:session.cameraUrl,expiresAt:session.expiresAt};
    if(cameraTab) { cameraTab.opener=null; cameraTab.location.href=session.cameraUrl; }
    if(photoPollTimer)clearInterval(photoPollTimer);
    photoPollTimer=setInterval(checkPhotoQuestCompletion,2500);
  } catch(e:any) {
    if(cameraTab)cameraTab.close();
    sideQuestError.value=e.message||'Nem sikerült elindítani a fotófeltöltést.';
  } finally { sideQuestBusy.value=false; }
}
async function checkPhotoQuestCompletion() {
  if(!player.value||!photoSession.value)return;
  if(Date.now()>=Date.parse(photoSession.value.expiresAt)) {
    if(photoPollTimer)clearInterval(photoPollTimer);
    photoPollTimer=undefined;photoSession.value=null;
    sideQuestError.value='A fotófeltöltési munkamenet lejárt. Indítsd újra a küldetés teljesítését.';
    return;
  }
  try {
    const result=await api.checkSideQuestPhotoSession(player.value.id,photoSession.value.questId,photoSession.value.sessionId);
    if(result.completed) {
      if(photoPollTimer)clearInterval(photoPollTimer);
      photoPollTimer=undefined;photoSession.value=null;
      await loadSideQuests();
    }
  } catch(e:any) {
    if(/lejárt|nem található/i.test(e.message||'')) {
      if(photoPollTimer)clearInterval(photoPollTimer);
      photoPollTimer=undefined;photoSession.value=null;sideQuestError.value=e.message;
    }
  }
}
function closePhotoSession() {
  if(photoPollTimer)clearInterval(photoPollTimer);
  photoPollTimer=undefined;photoSession.value=null;
}
const onlinePlayers = ref<Player[]>([]);
const duels = ref<Duel[]>([]);
const duelOpponentId = ref<number | ''>('');
const duelBusy = ref(false);
const duelError = ref('');
const duelTypes = [
  {value:'SZKANDER',label:'Szkander'},
  {value:'ROCK_PAPER_SCISSORS',label:'Kő-papír-olló · best of 3'},
  {value:'PLANK',label:'Plank'},
  {value:'PUSH_UPS',label:'Fekvő'},
  {value:'DICE',label:'Kockadobás'},
];
function duelTypeLabel(type:string|null) { return duelTypes.find(t=>t.value===type)?.label ?? type ?? 'Nincs kiválasztva'; }
function otherDuelPlayer(duel:Duel) { return duel.challengerId===player.value?.id ? duel.opponentName : duel.challengerName; }
async function loadDuels() {
  if (!player.value) return;
  try { [duels.value,onlinePlayers.value] = await Promise.all([api.getDuels(player.value.id),api.getPlayers()]); }
  catch(e:any) { duelError.value=e.message || 'Nem sikerült betölteni a párbajokat.'; }
}
async function duelAction(action:()=>Promise<any>) {
  if(!player.value||duelBusy.value)return;
  duelBusy.value=true;duelError.value='';
  try { await action(); await loadDuels(); }
  catch(e:any){duelError.value=e.message;}
  finally{duelBusy.value=false;}
}
function challengePlayer() {
  if(typeof duelOpponentId.value!=='number'||!player.value)return;
  return duelAction(()=>api.createDuel(player.value!.id,duelOpponentId.value as number));
}
function respondDuel(duel:Duel,accept:boolean) { return duelAction(()=>api.respondToDuel(player.value!.id,duel.id,accept)); }
function setDuelType(duel:Duel,type:string) { return duelAction(()=>api.chooseDuelType(player.value!.id,duel.id,type)); }
function voteDuelWinner(duel:Duel,winnerId:number) { return duelAction(()=>api.submitDuelWinner(player.value!.id,duel.id,winnerId)); }
let duelRefreshTimer: ReturnType<typeof setInterval> | undefined;
let sideQuestRefreshTimer: ReturnType<typeof setInterval> | undefined;
function duelStatusLabel(status:Duel['status']) {
  return ({PENDING:'Válaszra vár',CHOOSE_TYPE:'Típusválasztás',IN_PROGRESS:'Folyamatban',AWAITING_CONFIRMATION:'Eredmény megerősítése',COMPLETED:'Lezárva',REFUSED:'Visszautasítva'} as Record<string,string>)[status];
}

const name = ref('');
const error = ref('');
const busy = ref(false);

const savedPlayerId = Number(localStorage.getItem('party-player-id'));
const savedPlayerName = localStorage.getItem('party-player-name');
if (savedPlayerId > 0 && savedPlayerName) {
  player.value = { id: savedPlayerId, name: savedPlayerName, joinedAt: '', tokenBalance: 0 };
  name.value = savedPlayerName;
  identifyPlayer(savedPlayerId);
  loadSideQuests();
  loadDuels();
  loadTokenPhotoStatus();
  api.getPlayerBalance(savedPlayerId).then(balance => tokenBalance.value = balance.tokenBalance).catch(() => {});
}


async function enter() {
  const trimmedName = name.value.trim();
  if (!trimmedName) return;

  error.value = '';
  busy.value = true;

  try {
    player.value = await api.joinPlayer(trimmedName);
    name.value = player.value.name;
    tokenBalance.value = player.value.tokenBalance ?? 0;
    localStorage.setItem('party-player-name', player.value.name);
    localStorage.setItem('party-player-id', String(player.value.id));
    window.dispatchEvent(new Event('party-player-changed'));
    identifyPlayer(player.value.id);
    await loadSideQuests();
    await loadDuels();
    await loadTokenPhotoStatus();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
function logout() {
  identifyPlayer(null);
  localStorage.removeItem('party-player-id');
  localStorage.removeItem('party-player-name');
  window.dispatchEvent(new Event('party-player-changed'));
  sideQuests.value = [];
  if(verificationPinPollTimer)clearInterval(verificationPinPollTimer);
  verificationPinPollTimer=undefined;verificationPin.value=null;verificationPinVisible.value=false;
  player.value = null;
  tokenBalance.value = 0;
  name.value = '';
  error.value = '';
}
onMounted(() => { loadDuels(); loadSideQuests(); loadTokenPhotoStatus(); duelRefreshTimer = setInterval(loadDuels, 3000); sideQuestRefreshTimer = setInterval(() => { loadSideQuests(); loadTokenPhotoStatus(); }, 5000); });
onUnmounted(() => { if (duelRefreshTimer) clearInterval(duelRefreshTimer); if (sideQuestRefreshTimer) clearInterval(sideQuestRefreshTimer); if (photoPollTimer) clearInterval(photoPollTimer); if(verificationPinPollTimer)clearInterval(verificationPinPollTimer); if(tokenPhotoPollTimer)clearInterval(tokenPhotoPollTimer); });
</script>

<template>
  <main v-if="!player" class="page-shell login-shell">
    <section class="join-panel panel login-panel">
      <div>
        <p class="eyebrow">PARTY CASINO</p>
        <h1>Hogy hívnak?</h1>
        <p class="muted">Add meg a neved a belépéshez.</p>
      </div>

      <form @submit.prevent="enter">
        <input v-model="name" maxlength="24" placeholder="A neved" autocomplete="nickname" autofocus>
        <button class="primary" :disabled="busy || !name.trim()">
          {{ busy ? 'Belépés...' : 'Belépés →' }}
        </button>
      </form>

      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </main>

  <main v-else class="page-shell">
    <header class="topbar">
      <a class="brand" href="/">PARTY<span>CASINO</span></a>
      <nav><a href="/shop">Shop</a><a href="/leaderboard">Ranglista</a><a href="/verify-quest">PIN ellenőrzés</a><a href="/display" target="_blank">TV kijelző ↗</a><button class="ghost exit-button" @click="logout">Kilépés</button></nav>
    </header>

    <section class="hero dashboard-hero">
      <div><p class="eyebrow">A TE HELYI KASZINÓD</p><h1>Játékra <span>fel.</span></h1><p class="muted">Játssz, versenyezz, gyűjts tokeneket.</p></div>
      <a class="hero-leaderboard" href="/leaderboard">Ranglista megtekintése <span>↗</span></a>
    </section>

    <section class="welcome panel dashboard-welcome">
      <div>
        <p class="eyebrow">JÁTÉKOS · PARTY CASINO</p>
        <h2>Szia, {{ player.name }}!</h2>
        <p class="muted">A játékasztalok készen állnak. Melyikkel kezded?</p>
      </div>
      <div class="welcome-status"><span class="online-dot"></span><span>Csatlakozva</span></div>
    </section>

    <section class="section-heading game-section-heading">
      <div><p class="eyebrow">JÁTÉKTEREM</p><h2>Válassz játékot</h2></div>
      <span class="section-hint">3 elérhető játék</span>
    </section>

    <div class="game-grid">
      <button class="game-card panel" @click="router.push('/roulette')">
        <span class="game-icon">🎡</span>
        <h3>Rulettasztal</h3>
        <p class="muted">Közös asztal, automatikus körök. Mindenki ugyanarra az eredményre játszik.</p>
        <span class="game-link">Játék megnyitása →</span>
      </button>

      <button class="game-card panel" @click="router.push('/slots')">
        <span class="game-icon">🎰</span>
        <h3>Slot machine</h3>
        <p class="muted">Egyéni pörgetések. Minden játékos külön játszik.</p>
        <span class="game-link">Játék megnyitása →</span>
      </button>

      <button class="game-card panel" @click="router.push('/lucky-wheel')">
        <span class="game-icon">🎡</span>
        <h3>Szerencsekerék</h3>
        <p class="muted">Közös party kihívások. Egy játékos pörget, mindenki ugyanazt látja.</p>
        <span class="game-link">Kerék megnyitása →</span>
      </button>

      <button class="game-card panel community-game-card" @click="router.push('/community-events')">
        <span class="game-icon">🌐</span>
        <h3>Community Events</h3>
        <p class="muted">Dolgozzatok össze, járuljatok hozzá tokenekkel, és oldjatok fel közös party eseményeket.</p>
        <span class="game-link">Események megnyitása →</span>
      </button>

      <button class="game-card panel shop-game-card" @click="router.push('/shop')">
        <span class="game-icon">🛍️</span>
        <h3>Shop</h3>
        <p class="muted">Vásárolj tárgyakat CR tokenekért, és használd őket a side questjeidnél.</p>
        <span class="game-link">Shop megnyitása →</span>
      </button>
    </div>

    <section v-if="tokenPhotoStatus?.enabled && (tokenPhotoStatus.eligible || tokenPhotoStatus.pending || tokenPhotoSession || tokenPhotoMessage)" class="token-photo-reward panel">
      <div><p class="eyebrow">SNAPPIN · TOKEN REWARD</p><h2>Fotóért tokeneket?</h2><p class="muted">Ha az egyenleged {{tokenPhotoStatus.balanceThreshold}} CR alatt van, egy fotófeltöltéssel {{tokenPhotoStatus.rewardAmount}} CR-t szerezhetsz.</p><small class="muted">Napi lehetőség: {{tokenPhotoStatus.dailyRemaining}} / {{tokenPhotoStatus.dailyLimit}} · Feltöltések közötti várakozás: {{tokenPhotoStatus.cooldownMinutes}} perc.</small></div>
      <div class="token-photo-reward-action"><button class="primary" :disabled="tokenPhotoBusy || !tokenPhotoStatus.eligible || !!tokenPhotoSession" @click="startTokenPhotoUpload">{{tokenPhotoBusy?'Indítás…':tokenPhotoSession?'Feltöltés folyamatban…':tokenPhotoStatus.eligible?'📷 Fotó feltöltése · +'+tokenPhotoStatus.rewardAmount+' CR':tokenPhotoStatus.pending?'Feltöltés folyamatban…':tokenPhotoStatus.reason==='COOLDOWN'?'Várakozás a következő feltöltésig':tokenPhotoStatus.reason==='DAILY_LIMIT'?'Napi limit elérve':'Jelenleg nem elérhető'}}</button><span v-if="tokenPhotoStatus.pending" class="muted">Már van aktív feltöltésed.</span></div>
      <p v-if="tokenPhotoMessage" class="token-photo-message">{{tokenPhotoMessage}}</p>
    </section>
    <div class="dashboard-activity-grid">
    <section class="duels-panel panel">
      <div class="duels-heading"><div><p class="eyebrow">PLAYER CHALLENGES</p><h2>Párbajok</h2><p class="muted">Hívd ki egy játékost, mérjétek össze a tudásotokat, majd közösen erősítsétek meg az eredményt.</p></div><span class="duel-live-count">{{ duels.filter(d=>['PENDING','CHOOSE_TYPE','IN_PROGRESS','AWAITING_CONFIRMATION'].includes(d.status)).length }} AKTÍV</span></div>
      <div class="duel-challenge-form">
        <select v-model.number="duelOpponentId">
          <option value="">Válassz ellenfelet…</option>
          <option v-for="p in onlinePlayers.filter(p=>p.id!==player?.id)" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button class="primary" :disabled="duelBusy || !duelOpponentId" @click="challengePlayer">Kihívás párbajra</button>
      </div>
      <p v-if="duelError" class="error">{{ duelError }}</p>
      <div v-if="!duels.length" class="duel-empty">Még nincs párbajod. Hívd ki az egyik játékost!</div>
      <div v-for="duel in duels.filter(d=>!['COMPLETED','REFUSED'].includes(d.status))" :key="duel.id" class="duel-card">
        <div class="duel-card-top"><div><span class="eyebrow">PÁRBAJ #{{duel.id}}</span><h3>{{duel.challengerName}} <span>VS</span> {{duel.opponentName}}</h3></div><span class="duel-status" :class="'status-'+duel.status.toLowerCase()">{{duelStatusLabel(duel.status)}}</span></div>
        <p v-if="duel.duelType" class="duel-type-label">{{duelTypeLabel(duel.duelType)}}</p>
        <div v-if="duel.status==='PENDING' && duel.challengerId===player.id" class="duel-waiting">Várakozás a kihívás elfogadására vagy visszautasítására.</div>
        <div v-if="duel.status==='PENDING' && duel.opponentId===player.id" class="duel-action-row"><span>Elfogadod a kihívást?</span><button class="primary" :disabled="duelBusy" @click="respondDuel(duel,true)">Elfogadom</button><button class="ghost" :disabled="duelBusy" @click="respondDuel(duel,false)">Visszautasítom</button></div>
        <div v-if="duel.status==='CHOOSE_TYPE' && duel.opponentId===player.id" class="duel-type-picker"><span>Válaszd ki a párbaj típusát:</span><div><button v-for="type in duelTypes" :key="type.value" class="ghost" :disabled="duelBusy" @click="setDuelType(duel,type.value)">{{type.label}}</button></div></div>
        <div v-if="duel.status==='CHOOSE_TYPE' && duel.challengerId===player.id" class="duel-waiting">A másik játékos kiválasztja a párbaj típusát.</div>
        <div v-if="duel.status==='IN_PROGRESS'" class="duel-vote-area">
          <strong>Ki nyerte a párbajt?</strong>
          <p class="muted">Játsszátok le a párbajt, majd mindketten válasszátok ki a győztest.</p>
          <div>
            <button class="ghost" :disabled="duelBusy" @click="voteDuelWinner(duel,duel.challengerId)">{{duel.challengerName}} nyert</button>
            <button class="ghost" :disabled="duelBusy" @click="voteDuelWinner(duel,duel.opponentId)">{{duel.opponentName}} nyert</button>
          </div>
        </div>
        <div v-if="duel.status==='AWAITING_CONFIRMATION'" class="duel-vote-area">
          <p v-if="duel.challengerWinnerId || duel.opponentWinnerId" class="muted">A győztesre leadott szavazatok: {{duel.challengerWinnerId?'kihívó ✓':'kihívó –'}} · {{duel.opponentWinnerId?'ellenfél ✓':'ellenfél –'}}</p>
          <strong>Ki nyerte a párbajt?</strong>
          <div><button class="ghost" :disabled="duelBusy" @click="voteDuelWinner(duel,duel.challengerId)">{{duel.challengerName}} nyert</button><button class="ghost" :disabled="duelBusy" @click="voteDuelWinner(duel,duel.opponentId)">{{duel.opponentName}} nyert</button></div>
          <small>Mindkét játékosnak ugyanazt a győztest kell megjelölnie.</small>
        </div>
        <div v-if="duel.status==='COMPLETED'" class="duel-result">
          <strong>🏆 {{duel.winnerId===duel.challengerId?duel.challengerName:duel.opponentName}} nyert</strong>
          <span>Ellenfél: {{otherDuelPlayer(duel)}} · Típus: {{duelTypeLabel(duel.duelType)}}</span>
          <span>+{{duel.rewardAmount}} CR · {{duel.loserId===player.id?'Neked kell innod!':'A vesztesnek innia kell.'}}</span>
        </div>
        <div v-if="duel.status==='REFUSED'" class="duel-waiting">A kihívást visszautasították.</div>
      </div>
      <details v-if="duels.some(d=>['COMPLETED','REFUSED'].includes(d.status))" class="duel-history">
        <summary>Korábbi párbajok · {{ duels.filter(d=>['COMPLETED','REFUSED'].includes(d.status)).length }}</summary>
        <div class="duel-history-list">
          <article v-for="duel in duels.filter(d=>['COMPLETED','REFUSED'].includes(d.status))" :key="duel.id" class="duel-card duel-history-card">
            <div class="duel-card-top"><div><span class="eyebrow">PÁRBAJ #{{duel.id}}</span><h3>{{duel.challengerName}} <span>VS</span> {{duel.opponentName}}</h3></div><span class="duel-status" :class="'status-'+duel.status.toLowerCase()">{{duelStatusLabel(duel.status)}}</span></div>
            <p v-if="duel.duelType" class="duel-type-label">{{duelTypeLabel(duel.duelType)}}</p>
            <div v-if="duel.status==='COMPLETED'" class="duel-result">
              <strong>🏆 {{duel.winnerId===duel.challengerId?duel.challengerName:duel.opponentName}} nyert</strong>
              <span>Ellenfél: {{otherDuelPlayer(duel)}} · Típus: {{duelTypeLabel(duel.duelType)}}</span>
              <span>+{{duel.rewardAmount}} CR · {{duel.loserId===player.id?'Neked kellett innod!':'A vesztesnek innia kellett.'}}</span>
            </div>
            <div v-else class="duel-waiting">A kihívást visszautasították.</div>
          </article>
        </div>
      </details>
      <button class="ghost duel-refresh" @click="loadDuels">Párbajok frissítése</button>
    </section>

    <section class="side-quests-panel panel">
      <div class="side-quests-heading">
        <div><p class="eyebrow">EXTRA CHALLENGES</p><h2>Side quests</h2><p class="muted">Vállalj titkos küldetéseket a buli alatt.</p></div>
        <div class="side-quest-counter"><strong>{{ activeSideQuests.length }}/2</strong><small>AKTÍV</small></div>
      </div>
      <div v-if="activeSideQuests.length" class="side-quest-grid">
        <article v-for="(quest,index) in activeSideQuests" :key="quest.id" class="side-quest-card">
          <span class="side-quest-number">SIDE QUEST 0{{ index+1 }}</span>
          <h3>{{ quest.title }}</h3>
          <p v-if="quest.description">{{ quest.description }}</p>
          <button class="primary side-quest-complete" :disabled="sideQuestBusy" @click="quest.photoEnabled ? startPhotoQuest(quest) : finishSideQuest(quest)">{{ sideQuestBusy ? 'Feldolgozás…' : quest.photoEnabled ? '📷 Fotó feltöltése' : verificationPin?.questId===quest.id ? (verificationPinVisible ? 'PIN-kód elrejtése' : 'PIN-kód megjelenítése') : 'PIN-kód kérése' }}</button>
          <div v-if="verificationPin?.questId===quest.id && verificationPinVisible" class="side-quest-active-pin">
            <span class="eyebrow">AKTÍV PIN-KÓD</span>
            <strong>{{ verificationPin.pin }}</strong>
            <small>90 másodpercig érvényes, vagy a másik játékos jóváhagyásáig/elutasításáig.</small>
          </div>
        </article>
      </div>
      <div v-else class="side-quest-empty">Még nincs aktív küldetésed. Kérj egy véletlenszerű kihívást!</div>
      <div class="side-quest-actions">
        <button class="primary" :disabled="sideQuestBusy || activeSideQuests.length >= 2" @click="requestSideQuest">{{ sideQuestBusy ? 'Feldolgozás…' : activeSideQuests.length >= 2 ? 'Elérted a 2 aktív küldetést' : '+ Új side quest kérése' }}</button>
        <span class="muted">{{ activeSideQuests.length === 2 ? 'Teljesíts vagy hagyj ki egy küldetést, hogy újat kérhess.' : 'A shopban vásárolt tárggyal kihagyhatod a küldetést.' }}</span>
      </div>
      <p v-if="sideQuestError" class="error">{{ sideQuestError }}</p>
      <div v-if="sideQuests.some(q => q.status !== 'ACTIVE')" class="side-quest-completed">
        <h3>Teljesített küldetések</h3>
        <div v-for="quest in sideQuests.filter(q => q.status !== 'ACTIVE')" :key="quest.id"><span>{{ quest.title }}</span><small>{{ quest.status === 'SKIPPED' ? '↷ Kihagyva' : quest.completionMethod === 'PHOTO' ? '✓ Fotóval teljesítve · Snappin' : `✓ Jóváhagyta: ${quest.approvedByName || 'ismeretlen'}` }}</small></div>
      </div>
    </section>


    </div>

    <div v-if="photoSession" class="quest-qr-overlay" @click.self="closePhotoSession">
      <section class="quest-qr-modal panel photo-quest-modal">
        <button class="ghost quest-qr-close" @click="closePhotoSession">✕</button>
        <p class="eyebrow">SNAPPIN PHOTO VERIFICATION</p>
        <h2>{{ photoSession.title }}</h2>
        <p class="muted">A Snappin kamerát új böngészőlapon nyitottuk meg. Készítsd el és töltsd fel a küldetés bizonyítékát, majd térj vissza ide. A küldetés automatikusan teljesül, amint a Snappin visszaigazolja a fotót.</p>
        <a class="primary photo-camera-link" :href="photoSession.cameraUrl" target="_blank" rel="noopener noreferrer">Snappin kamera megnyitása ↗</a>
        <small class="muted">Készítsd el a fotót a kamerában. A feltöltés állapotát automatikusan ellenőrizzük. Lejárat: {{ new Date(photoSession.expiresAt).toLocaleTimeString() }}</small>
        <span class="photo-upload-wait"><span class="online-dot"></span> Fotófeltöltésre várakozás…</span>
        <button class="ghost" @click="closePhotoSession">Bezárás</button>
      </section>
    </div>
    <footer>PARTY CASINO <span>•</span> Helyi hálózaton futó party platform</footer>
  </main>
</template>
