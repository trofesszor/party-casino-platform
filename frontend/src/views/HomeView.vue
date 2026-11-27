<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, type Duel } from '../services/api';
import type { Player } from '../types';
import CasinoHeader from '../components/CasinoHeader.vue';
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
const verifierPin = ref('');
const verifierQuest = ref<{questId:number;ownerId:number;ownerName:string;title:string;description:string;expiresAt:string}|null>(null);
const verifierBusy = ref(false);
const verifierError = ref('');
const verifierResult = ref('');
let verificationPinPollTimer: ReturnType<typeof setInterval> | undefined;
const photoSession = ref<{questId:number;title:string;sessionId:string;cameraUrl:string;expiresAt:string}|null>(null);
let photoPollTimer: ReturnType<typeof setInterval> | undefined;
let sideQuestCameraWindow:Window|null=null;
const activeSideQuests = ref<SideQuest[]>([]);
type TokenPhotoStatus={enabled:boolean;eligible:boolean;balance:number;balanceThreshold:number;rewardAmount:number;cooldownMinutes:number;dailyLimit:number;dailyUsed:number;dailyRemaining:number;pending:boolean;sessionId:string|null;expiresAt:string|null;reason:string|null};
const tokenPhotoStatus=ref<TokenPhotoStatus|null>(null);
const tokenPhotoSession=ref<{sessionId:string;cameraUrl:string;expiresAt:string;rewardAmount:number}|null>(null);
const tokenPhotoBusy=ref(false);
const tokenPhotoMessage=ref('');
let tokenPhotoPollTimer:ReturnType<typeof setInterval>|undefined;
let tokenCameraWindow:Window|null=null;
async function loadTokenPhotoStatus(){
  if(!player.value)return;
  try{tokenPhotoStatus.value=await api.getTokenPhotoStatus(player.value.id);}
  catch{tokenPhotoStatus.value=null;}
}
async function startTokenPhotoUpload(){
  if(!player.value||tokenPhotoBusy.value)return;
  tokenPhotoBusy.value=true;tokenPhotoMessage.value='';
  tokenCameraWindow=window.open('about:blank','_blank');
  try{
    const session=await api.createTokenPhotoSession(player.value.id);
    tokenPhotoSession.value=session;
    if(tokenCameraWindow)tokenCameraWindow.location.href=session.cameraUrl;
    if(tokenPhotoPollTimer)clearInterval(tokenPhotoPollTimer);
    tokenPhotoPollTimer=setInterval(checkTokenPhotoUpload,2500);
    await loadTokenPhotoStatus();
  }catch(e:any){if(tokenCameraWindow&&!tokenCameraWindow.closed)tokenCameraWindow.close();tokenCameraWindow=null;tokenPhotoMessage.value=e.message||'Nem sikerült elindítani a fotófeltöltést.';await loadTokenPhotoStatus();}
  finally{tokenPhotoBusy.value=false;}
}
async function checkTokenPhotoUpload(){
  if(!player.value||!tokenPhotoSession.value)return;
  if(Date.now()>=Date.parse(tokenPhotoSession.value.expiresAt)){
    if(tokenPhotoPollTimer)clearInterval(tokenPhotoPollTimer);tokenPhotoPollTimer=undefined;tokenPhotoSession.value=null;
    if(tokenCameraWindow&&!tokenCameraWindow.closed)tokenCameraWindow.close();tokenCameraWindow=null;
    tokenPhotoMessage.value='A fotófeltöltési idő lejárt. Próbáld újra később.';await loadTokenPhotoStatus();return;
  }
  try{
    const result=await api.checkTokenPhotoSession(player.value.id,tokenPhotoSession.value.sessionId);
    if(result.completed){
      if(tokenPhotoPollTimer)clearInterval(tokenPhotoPollTimer);tokenPhotoPollTimer=undefined;tokenPhotoSession.value=null;
      if(tokenCameraWindow&&!tokenCameraWindow.closed){tokenCameraWindow.close();window.focus();}tokenCameraWindow=null;
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
async function lookupVerifierPin() {
  if(!player.value || verifierBusy.value) return;
  if(!/^\\d{3}$/.test(verifierPin.value)) { verifierError.value='Pontosan három számjegyet adj meg.'; return; }
  verifierBusy.value=true;verifierError.value='';verifierResult.value='';
  try { verifierQuest.value=await api.getSideQuestVerification(verifierPin.value,player.value.id); }
  catch(e:any) { verifierQuest.value=null; verifierError.value=e.message||'A PIN-kód hibás vagy lejárt.'; }
  finally { verifierBusy.value=false; }
}
async function decideVerifierPin(approve:boolean) {
  if(!player.value||!verifierQuest.value||verifierBusy.value) return;
  verifierBusy.value=true;verifierError.value='';
  try {
    const response=await api.verifySideQuest(verifierPin.value,player.value.id,approve);
    verifierResult.value=response.status==='APPROVED' ? `Jóváhagytad: ${response.questTitle}. A hitelesítő neve: ${response.verifiedByName}.` : 'Elutasítottad a küldetés teljesítését. A küldetés aktív marad.';
    verifierQuest.value=null;verifierPin.value='';
    await loadSideQuests();
  } catch(e:any) { verifierError.value=e.message||'Nem sikerült rögzíteni a döntést.'; }
  finally { verifierBusy.value=false; }
}
function resetVerifierPin() { verifierPin.value='';verifierQuest.value=null;verifierError.value='';verifierResult.value='';}
async function startPhotoQuest(quest:SideQuest) {
  if(!player.value||sideQuestBusy.value)return;
  sideQuestBusy.value=true;sideQuestError.value='';
  sideQuestCameraWindow=window.open('about:blank','_blank');
  try {
    const session=await api.createSideQuestPhotoSession(player.value.id,quest.id);
    photoSession.value={questId:quest.id,title:session.questTitle,sessionId:session.sessionId,cameraUrl:session.cameraUrl,expiresAt:session.expiresAt};
    if(sideQuestCameraWindow)sideQuestCameraWindow.location.href=session.cameraUrl;
    if(photoPollTimer)clearInterval(photoPollTimer);
    photoPollTimer=setInterval(checkPhotoQuestCompletion,2500);
  } catch(e:any) {
    if(sideQuestCameraWindow&&!sideQuestCameraWindow.closed)sideQuestCameraWindow.close();sideQuestCameraWindow=null;
    sideQuestError.value=e.message||'Nem sikerült elindítani a fotófeltöltést.';
  } finally { sideQuestBusy.value=false; }
}
async function checkPhotoQuestCompletion() {
  if(!player.value||!photoSession.value)return;
  if(Date.now()>=Date.parse(photoSession.value.expiresAt)) {
    if(photoPollTimer)clearInterval(photoPollTimer);
    photoPollTimer=undefined;photoSession.value=null;
    if(sideQuestCameraWindow&&!sideQuestCameraWindow.closed)sideQuestCameraWindow.close();sideQuestCameraWindow=null;
    sideQuestError.value='A fotófeltöltési munkamenet lejárt. Indítsd újra a küldetés teljesítését.';
    return;
  }
  try {
    const result=await api.checkSideQuestPhotoSession(player.value.id,photoSession.value.questId,photoSession.value.sessionId);
    if(result.completed) {
      if(photoPollTimer)clearInterval(photoPollTimer);
      photoPollTimer=undefined;photoSession.value=null;
      if(sideQuestCameraWindow&&!sideQuestCameraWindow.closed){sideQuestCameraWindow.close();window.focus();}sideQuestCameraWindow=null;
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
  if(sideQuestCameraWindow&&!sideQuestCameraWindow.closed)sideQuestCameraWindow.close();sideQuestCameraWindow=null;
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

onMounted(() => { loadDuels(); loadSideQuests(); loadTokenPhotoStatus(); duelRefreshTimer = setInterval(loadDuels, 3000); sideQuestRefreshTimer = setInterval(() => { loadSideQuests(); loadTokenPhotoStatus(); }, 5000); });
onUnmounted(() => { if (duelRefreshTimer) clearInterval(duelRefreshTimer); if (sideQuestRefreshTimer) clearInterval(sideQuestRefreshTimer); if (photoPollTimer) clearInterval(photoPollTimer); if(verificationPinPollTimer)clearInterval(verificationPinPollTimer); if(tokenPhotoPollTimer)clearInterval(tokenPhotoPollTimer); });
</script>

<template>
  <main v-if="!player" class="lobby-login">
    <section class="login-card panel">
      <div class="login-brand"><span class="brand-mark">♣</span><span>PARTY<span>CASINO</span></span></div>

      <h1>Csatlakozás a kaszinóhoz</h1>
      <p class="muted">Lépj be a neveddel, és csatlakozz a közös kaszinóhoz.</p>
      <form @submit.prevent="enter">
        <label class="field-label">Játékosnév<input v-model="name" maxlength="24" placeholder="A neved" autocomplete="nickname" autofocus></label>
        <button class="primary lobby-cta" :disabled="busy || !name.trim()">{{ busy ? 'Belépés…' : 'Csatlakozás' }}</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </main>

  <main v-else class="casino-lobby">
    <CasinoHeader />

    <section class="lobby-shell">
      <aside class="lobby-rail">
        <div class="rail-label">Kaszinó</div>
        <button class="rail-item active" @click="router.push('/')"><span>⌂</span><strong>Előtér</strong></button>
        <div class="rail-label rail-label-games">JÁTÉKOK</div>
        <button class="rail-item" @click="router.push('/roulette')"><span>◉</span><strong>Rulett</strong></button>
        <button class="rail-item" @click="router.push('/slots')"><span>✦</span><strong>Slots</strong></button>
        <button class="rail-item" @click="router.push('/lucky-wheel')"><span>◎</span><strong>Szerencsekerék</strong></button>
        <div class="rail-divider"></div>
        <div class="rail-label">EXTRÁK</div>
        <a class="rail-item" href="/verify-quest"><span>✓</span><strong>Quest PIN</strong></a>
      </aside>

      <div class="lobby-main">
        <section class="lobby-hero-card">
          <div class="hero-art" aria-hidden="true">
            <div class="hero-wheel-art"><span>0</span></div>
            <div class="hero-chip hero-chip-red">25</div>
            <div class="hero-chip hero-chip-gold">100</div>
          </div>
          <div class="lobby-hero-copy">
            <span class="hero-kicker"><i></i> A kaszinó nyitva</span>
            <h1>Üdv a <span>kaszinóban!</span></h1>
            <p>Ülj a rulettasztalhoz, vagy hívd ki a többieket egy párbajra.</p>
            <div class="hero-actions">
              <button class="primary hero-primary" @click="router.push('/roulette')">Rulett megnyitása <span>→</span></button>
              <button class="hero-secondary" @click="router.push('/leaderboard')">Ranglista <span aria-hidden="true">↗︎</span></button>
            </div>
          </div>
          <div class="hero-stats">
            <div><small>Egyenleg</small><strong>{{ tokenBalance.toLocaleString('hu-HU') }}</strong><span>CR</span></div>
            <div><small>Aktív párbaj</small><strong>{{ duels.filter(d=>['PENDING','CHOOSE_TYPE','IN_PROGRESS','AWAITING_CONFIRMATION'].includes(d.status)).length }}</strong></div>
            <div><small>Küldetés</small><strong>{{ activeSideQuests.length }}/2</strong></div>
          </div>
        </section>

        <section class="lobby-section">
          <div class="lobby-section-head">
            <div><h2>Válassz játékot</h2></div>
      
          </div>
          <div class="lobby-game-grid">
            <button class="lobby-game-card roulette-card" @click="router.push('/roulette')">
        
              <div class="game-art roulette-art"><span>0</span><b>R</b></div>
              <div class="game-card-copy"><h3>Európai rulett</h3><p>Közös asztal · mindenki ugyanazt az eredményt látja.</p><strong>Játék →</strong></div>
            </button>
            <button class="lobby-game-card slots-card" @click="router.push('/slots')">
        
              <div class="game-art slots-art"><span>7</span><span>★</span><span>7</span></div>
              <div class="game-card-copy"><h3>Lucky Slots</h3><p>Pörgess saját gépet, és próbáld megütni a nagy nyereményt.</p><strong>Játék →</strong></div>
            </button>
            <button class="lobby-game-card wheel-card" @click="router.push('/lucky-wheel')">
        
              <div class="game-art wheel-art"><span>✦</span></div>
              <div class="game-card-copy"><h3>Szerencsekerék</h3><p>Egy pörgetés, egy eredmény, mindenki együtt nézi.</p><strong>Kerék megnyitása →</strong></div>
            </button>
          </div>
        </section>

        <section class="lobby-feature-row">
          <button class="feature-tile events-tile" @click="router.push('/community-events')">
            <div class="feature-tile-art">✦</div><div><h3>Közösségi események</h3><p>Közösen gyűjtitek össze a tokeneket a következő party unlockhoz.</p><strong>Felfedezés →</strong></div>
          </button>
          <button class="feature-tile shop-tile" @click="router.push('/shop')">
            <div class="feature-tile-art">◇</div><div><h3>Kaszinóbolt</h3><p>Quest skip, kaparós sorsjegy és további tárgyak CR-ért.</p><strong>Shop megnyitása →</strong></div>
          </button>
        </section>

        <section v-if="tokenPhotoStatus?.enabled && (tokenPhotoStatus.eligible || tokenPhotoStatus.pending || tokenPhotoSession || tokenPhotoMessage)" class="token-photo-reward panel lobby-reward-card">
          <div class="reward-icon">✦</div>
          <div><h3>Fotóért tokeneket?</h3><p>Ha az egyenleged {{tokenPhotoStatus.balanceThreshold}} CR alatt van, egy fotófeltöltéssel <strong>+{{tokenPhotoStatus.rewardAmount}} CR</strong>-t szerezhetsz.</p><small>Napi lehetőség: {{tokenPhotoStatus.dailyRemaining}} / {{tokenPhotoStatus.dailyLimit}} · Várakozás: {{tokenPhotoStatus.cooldownMinutes}} perc</small></div>
          <div class="reward-action"><button class="primary" :disabled="tokenPhotoBusy || !tokenPhotoStatus.eligible || !!tokenPhotoSession" @click="startTokenPhotoUpload">{{tokenPhotoBusy?'Indítás…':tokenPhotoSession?'Feltöltés folyamatban…':tokenPhotoStatus.eligible?'Fotó feltöltése · +'+tokenPhotoStatus.rewardAmount+' CR':tokenPhotoStatus.pending?'Feltöltés folyamatban…':tokenPhotoStatus.reason==='COOLDOWN'?'Várakozás…':tokenPhotoStatus.reason==='DAILY_LIMIT'?'Napi limit elérve':'Nem elérhető'}}</button><small v-if="tokenPhotoStatus.pending">Már van aktív feltöltésed.</small></div>
          <p v-if="tokenPhotoMessage" class="token-photo-message">{{tokenPhotoMessage}}</p>
        </section>

        <section class="lobby-section activity-section">
          <div class="lobby-section-head">
            <div><h2>Párbajok és küldetések</h2></div>
      
          </div>
          <div class="activity-grid">
            <section class="activity-card panel">
              <header class="activity-card-head"><div><h3>Párbajok</h3></div><span class="activity-count">{{ duels.filter(d=>['PENDING','CHOOSE_TYPE','IN_PROGRESS','AWAITING_CONFIRMATION'].includes(d.status)).length }} AKTÍV</span></header>
              <div class="duel-challenge-bar">
                <select v-model.number="duelOpponentId" aria-label="Párbajellenfél"><option value="">Válassz ellenfelet…</option><option v-for="p in onlinePlayers.filter(p=>p.id!==player?.id)" :key="p.id" :value="p.id">{{ p.name }}</option></select>
                <button class="primary" :disabled="duelBusy || !duelOpponentId" @click="challengePlayer">Kihívás</button>
              </div>
              <p v-if="duelError" class="error">{{ duelError }}</p>
              <div v-if="!duels.filter(d=>!['COMPLETED','REFUSED'].includes(d.status)).length" class="activity-empty"><span>♛</span><strong>Nincs aktív párbaj</strong><small>Hívd ki valamelyik online játékost.</small></div>
              <div v-for="duel in duels.filter(d=>!['COMPLETED','REFUSED'].includes(d.status))" :key="duel.id" class="compact-duel">
                <div class="compact-duel-main"><div class="mini-avatars"><span>{{duel.challengerName.slice(0,1)}}</span><b>VS</b><span>{{duel.opponentName.slice(0,1)}}</span></div><div><strong>{{duel.challengerName}} <small>vs</small> {{duel.opponentName}}</strong><p>{{duel.duelType ? duelTypeLabel(duel.duelType) : duelStatusLabel(duel.status)}}</p></div></div>
                <div v-if="duel.status==='PENDING' && duel.opponentId===player.id" class="compact-actions"><button class="primary" :disabled="duelBusy" @click="respondDuel(duel,true)">Elfogadom</button><button class="ghost" :disabled="duelBusy" @click="respondDuel(duel,false)">Elutasítom</button></div>
                <div v-else-if="duel.status==='PENDING'" class="compact-wait">Válaszra vár</div>
                <div v-else-if="duel.status==='CHOOSE_TYPE' && duel.opponentId===player.id" class="compact-actions"><button v-for="type in duelTypes" :key="type.value" class="ghost" :disabled="duelBusy" @click="setDuelType(duel,type.value)">{{type.label}}</button></div>
                <div v-else-if="duel.status==='CHOOSE_TYPE'" class="compact-wait">Típusválasztásra vár</div>
                <div v-else-if="['IN_PROGRESS','AWAITING_CONFIRMATION'].includes(duel.status)" class="compact-actions"><button class="ghost" :disabled="duelBusy" @click="voteDuelWinner(duel,duel.challengerId)">{{duel.challengerName}} nyert</button><button class="ghost" :disabled="duelBusy" @click="voteDuelWinner(duel,duel.opponentId)">{{duel.opponentName}} nyert</button></div>
              </div>
              <details v-if="duels.some(d=>['COMPLETED','REFUSED'].includes(d.status))" class="compact-history"><summary>Korábbi párbajok · {{duels.filter(d=>['COMPLETED','REFUSED'].includes(d.status)).length}}</summary><div v-for="duel in duels.filter(d=>['COMPLETED','REFUSED'].includes(d.status))" :key="duel.id"><strong>{{duel.challengerName}} vs {{duel.opponentName}}</strong><span>{{duel.status==='COMPLETED' ? '🏆 '+(duel.winnerId===duel.challengerId?duel.challengerName:duel.opponentName)+' · +'+duel.rewardAmount+' CR' : 'Visszautasítva'}}</span></div></details>
            </section>

            <section class="quest-verify-inline panel">
              <div class="quest-verify-inline-head"><span class="quest-verify-icon">✓</span><div><h3>Másik játékos küldetésének ellenőrzése</h3><p>Írd be a 3 jegyű PIN-kódot a teljesítés jóváhagyásához.</p></div></div>
              <form v-if="!verifierQuest && !verifierResult" class="quest-verify-inline-form" @submit.prevent="lookupVerifierPin">
                <input v-model="verifierPin" inputmode="numeric" autocomplete="one-time-code" maxlength="3" pattern="[0-9]{3}" placeholder="000" aria-label="Háromjegyű PIN-kód">
                <button class="primary" :disabled="verifierBusy || verifierPin.length!==3">{{verifierBusy?'Ellenőrzés…':'PIN ellenőrzése'}}</button>
              </form>
              <div v-if="verifierQuest" class="quest-verify-found"><div><strong>{{verifierQuest.ownerName}}</strong> küldetése</div><h4>{{verifierQuest.title}}</h4><p v-if="verifierQuest.description">{{verifierQuest.description}}</p><div class="quest-verify-actions"><button class="primary" :disabled="verifierBusy" @click="decideVerifierPin(true)">{{verifierBusy?'…':'Teljesítés jóváhagyása'}}</button><button class="ghost" :disabled="verifierBusy" @click="decideVerifierPin(false)">Elutasítás</button></div><button class="ghost quest-verify-reset" @click="resetVerifierPin">Másik PIN</button></div>
              <div v-if="verifierResult" class="quest-verify-result"><strong>✓ Visszaigazolás rögzítve</strong><span>{{verifierResult}}</span><button class="ghost" @click="resetVerifierPin">Új PIN</button></div>
              <p v-if="verifierError" class="error">{{verifierError}}</p>
            </section><section class="activity-card panel quest-activity-card">
              <header class="activity-card-head"><div><h3>Küldetések</h3></div><span class="quest-counter">{{activeSideQuests.length}} / 2</span></header>
              <div v-if="activeSideQuests.length" class="quest-mini-list">
                <article v-for="(quest,index) in activeSideQuests" :key="quest.id" class="quest-mini">
                  <div class="quest-mini-number">0{{index+1}}</div><div class="quest-mini-copy"><strong>{{quest.title}}</strong><p>{{quest.description}}</p><small>{{quest.photoEnabled?'📷 FOTO':'✓ PIN ELLENŐRZÉS'}}</small></div>
                  <button class="primary quest-mini-button" :disabled="sideQuestBusy" @click="quest.photoEnabled ? startPhotoQuest(quest) : finishSideQuest(quest)">{{sideQuestBusy?'…':quest.photoEnabled?'Fotó':'PIN'}}</button>
                  <div v-if="verificationPin?.questId===quest.id && verificationPinVisible" class="quest-pin-bubble"><small>AKTÍV PIN</small><strong>{{verificationPin.pin}}</strong></div>
                </article>
              </div>
              <div v-else class="activity-empty"><span>✦</span><strong>Nincs aktív side quest</strong><small>Kérj egy új kihívást a bulihoz.</small></div>
              <div class="quest-footer"><button class="primary" :disabled="sideQuestBusy || activeSideQuests.length>=2" @click="requestSideQuest">{{activeSideQuests.length>=2?'2 / 2 aktív':'+ Új side quest'}}</button><span>{{activeSideQuests.length===2?'Teljesíts vagy hagyj ki egyet.':'Véletlenszerű kihívás, csak neked.'}}</span></div>
              <p v-if="sideQuestError" class="error">{{sideQuestError}}</p>
              <details v-if="sideQuests.some(q=>q.status!=='ACTIVE')" class="compact-history"><summary>Korábbi küldetések</summary><div v-for="quest in sideQuests.filter(q=>q.status!=='ACTIVE')" :key="quest.id"><strong>{{quest.title}}</strong><span>{{quest.status==='SKIPPED'?'Kihagyva':quest.completionMethod==='PHOTO'?'Fotóval teljesítve':'Jóváhagyva'}}</span></div></details>
            </section>
          </div>
        </section>
      </div>
    </section>

    <div v-if="tokenPhotoSession" class="quest-qr-overlay" @click.self="tokenPhotoSession=null">
      <section class="quest-qr-modal panel photo-quest-modal camera-embed-modal">
        <button class="ghost quest-qr-close" @click="tokenPhotoSession=null">✕</button>
        <h2>Fotófeltöltés</h2>
        <p class="muted">Töltsd fel a fotót a Snappin kameráján keresztül. Sikeres ellenőrzés után jóváírjuk a jutalmat.</p>
        <div class="camera-embed-fallback"><p>A Snappin kamerát külön böngészőlapon kell megnyitni a biztonságos feltöltéshez.</p><a class="primary photo-camera-link" :href="tokenPhotoSession.cameraUrl" target="_blank" rel="noopener noreferrer">Snappin kamera megnyitása ↗</a></div>
        <span class="photo-upload-wait"><span class="online-dot"></span> Feltöltés ellenőrzése…</span>
        <button class="ghost" @click="tokenPhotoSession=null">Bezárás</button>
      </section>
    </div>
    <div v-if="photoSession" class="quest-qr-overlay" @click.self="closePhotoSession">
      <section class="quest-qr-modal panel photo-quest-modal">
        <button class="ghost quest-qr-close" @click="closePhotoSession">✕</button>
        <h2>{{ photoSession.title }}</h2>
        <p class="muted">Készítsd el és töltsd fel a küldetés bizonyítékát a beágyazott Snappin kamerában.</p>
        <div class="camera-embed-fallback"><p>A Snappin kamerát külön böngészőlapon kell megnyitni a biztonságos feltöltéshez.</p><a class="primary photo-camera-link" :href="photoSession.cameraUrl" target="_blank" rel="noopener noreferrer">Snappin kamera megnyitása ↗</a></div>
        <small class="muted">Automatikusan ellenőrizzük a feltöltést. Lejárat: {{ new Date(photoSession.expiresAt).toLocaleTimeString() }}</small>
        <span class="photo-upload-wait"><span class="online-dot"></span> Fotófeltöltésre várakozás…</span>
        <button class="ghost" @click="closePhotoSession">Bezárás</button>
      </section>
    </div>
    <footer class="casino-footer">PARTY CASINO <span>•</span> A party minden játékosa ugyanabban a kaszinóban játszik</footer>
  </main>
</template>