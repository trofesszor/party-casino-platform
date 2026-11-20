<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
const tokenPhotoSettings=ref({enabled:true,balanceThreshold:50,rewardAmount:10,cooldownMinutes:60,dailyLimit:2});
const tokenPhotoSaving=ref(false);

const password = ref('');
const token = ref(localStorage.getItem('party-admin-token') ?? '');
const players = ref<AdminPlayer[]>([]);
const error = ref('');
const busy = ref(false);
const authenticated = ref(false);

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
    tokenPhotoSettings.value = await api.adminGetTokenPhotoSettings(token.value);
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
        <div class="admin-section-heading"><div><p class="eyebrow">STORE MANAGEMENT</p><h2>Shop termékek</h2><p class="muted">Az inaktív termékek nem jelennek meg a játékosok shopjában, és nem vásárolhatók meg. A már megvásárolt tárgyak a játékosok készletében maradnak.</p></div></div>
        <div v-if="!shopItems.length" class="admin-empty muted">Nincs konfigurált shop termék.</div>
        <div v-for="item in shopItems" :key="item.itemKey" class="side-quest-admin-row">
          <div>
            <strong>{{ item.name }}</strong>
            <p class="muted">{{ item.description }}</p>
            <small>{{ item.price }} CR · {{ item.itemKey }}</small>
            <span class="player-status" :class="{ online: !!item.enabled }">{{ item.enabled ? 'Aktív' : 'Inaktív' }}</span>
          </div>
          <button class="ghost" :disabled="shopSavingKey === item.itemKey" @click="toggleShopItem(item)">{{ shopSavingKey === item.itemKey ? 'Mentés…' : item.enabled ? 'Inaktiválás' : 'Aktiválás' }}</button>
        </div>
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
