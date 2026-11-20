<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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

async function refresh() {
  if (!playerId || !playerName) { router.replace('/'); return; }
  try {
    const [shop, sideQuests, wallet] = await Promise.all([
      api.getShop(playerId),
      api.getPlayerSideQuests(playerId),
      api.getPlayerBalance(playerId),
    ]);
    items.value = shop;
    quests.value = sideQuests;
    balance.value = wallet.tokenBalance;
    error.value = '';
  } catch (e:any) { error.value = e.message || 'Nem sikerült betölteni a shopot.'; }
}
async function buy(itemKey:string) {
  if (busy.value) return;
  const item = items.value.find(entry => entry.itemKey === itemKey);
  if (!item || balance.value < item.price) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.buyShopItem(playerId,itemKey);
    await refresh();
    notice.value = 'Sikeres vásárlás. A tárgy bekerült a készletedbe.';
  } catch (e:any) { error.value = e.message || 'A vásárlás nem sikerült.'; }
  finally { busy.value = false; }
}
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
    <header class="shop-header">
      <a class="brand" href="/">PARTY<span>CASINO</span></a>
      <div class="shop-header-actions">
        <span class="shop-balance">◈ {{ balance }} CR</span>
        <button class="ghost" @click="router.push('/')">← Vissza</button>
      </div>
    </header>

    <section class="shop-intro">
      <p class="eyebrow">PARTY CASINO · EXTRÁK</p>
      <h1>Játékos <span>shop.</span></h1>
      <p class="muted">Vásárolj hasznos tárgyakat a játék során szerzett CR tokenekből.</p>
    </section>

    <p v-if="error" class="shop-message shop-error">{{ error }}</p>
    <p v-if="notice" class="shop-message shop-notice">{{ notice }}</p>

    <section class="shop-section">
      <div class="shop-section-heading"><div><p class="eyebrow">KÍNÁLAT</p><h2>Elérhető tárgyak</h2></div><span>{{ items.length }} TERMÉK</span></div>
      <article v-for="item in items" :key="item.itemKey" class="shop-item panel">
        <div class="shop-item-icon">⏭</div>
        <div class="shop-item-copy">
          <span class="shop-item-tag">HASZNÁLHATÓ TÁRGY</span>
          <h3>{{ item.name }}</h3>
          <p class="muted">{{ item.description }}</p>
          <small>Készleten: <strong>{{ item.quantity }} db</strong></small>
        </div>
        <div class="shop-item-buy">
          <strong>{{ item.price }} <small>CR</small></strong>
          <button class="primary" :disabled="busy || balance < item.price" @click="buy(item.itemKey)">{{ balance < item.price ? 'Nincs elég CR' : 'Vásárlás' }}</button>
        </div>
      </article>
      <div v-if="!items.length && !error" class="shop-empty panel">Jelenleg nincs elérhető termék.</div>
    </section>

    <section class="shop-section inventory-section">
      <div class="shop-section-heading"><div><p class="eyebrow">SAJÁT TÁRGYAK</p><h2>Készlet és használat</h2></div><span>{{ questSkipItem?.quantity ?? 0 }} KÜLDETÉS KIHAGYÁS</span></div>
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
    <footer>PARTY CASINO <span>•</span> A vásárlások és tárgyhasználatok azonnal érvényesülnek</footer>
  </main>
</template>
