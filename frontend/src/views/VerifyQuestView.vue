<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../services/api';

const router = useRouter();
const playerId = Number(localStorage.getItem('party-player-id'));
const loggedIn = computed(() => Number.isSafeInteger(playerId) && playerId > 0);
const pin = ref('');
const quest = ref<{questId:number;ownerId:number;ownerName:string;title:string;description:string;expiresAt:string}|null>(null);
const busy = ref(false);
const error = ref('');
const result = ref('');
const isOwner = computed(() => quest.value?.ownerId === playerId);

async function lookupPin() {
  if (!loggedIn.value) { error.value = 'Először jelentkezz be a saját játékosoddal.'; return; }
  if (!/^\d{3}$/.test(pin.value)) { error.value = 'Pontosan három számjegyet adj meg.'; return; }
  busy.value = true; error.value = '';
  try { quest.value = await api.getSideQuestVerification(pin.value,playerId); }
  catch (e:any) { quest.value = null; error.value = e.message || 'A PIN-kód hibás vagy lejárt.'; }
  finally { busy.value = false; }
}
async function decide(approve:boolean) {
  if (!quest.value || !loggedIn.value || isOwner.value || busy.value) return;
  busy.value = true; error.value = '';
  try {
    const response = await api.verifySideQuest(pin.value,playerId,approve);
    result.value = response.status === 'APPROVED'
      ? `Jóváhagytad a küldetést. A hitelesítő neve: ${response.verifiedByName}.`
      : 'Elutasítottad a küldetés teljesítését. A küldetés aktív marad.';
    quest.value = null;
  } catch (e:any) { error.value = e.message || 'Nem sikerült rögzíteni a döntést.'; }
  finally { busy.value = false; }
}
function reset() { pin.value = ''; quest.value = null; result.value = ''; error.value = ''; }
</script>

<template>
  <main class="page-shell login-shell">
    <section class="panel login-panel quest-verification-panel">
      <a class="brand" href="/">PARTY<span>CASINO</span></a>
      
      <template v-if="result">
        <h1>Visszaigazolás rögzítve</h1>
        <p class="muted">{{ result }}</p>
        <button class="primary" @click="reset">Új PIN ellenőrzése</button>
        <button class="ghost" @click="router.push('/')">Vissza a főoldalra</button>
      </template>
      <template v-else-if="quest">
        <h1>Küldetés ellenőrzése</h1>
        <p class="muted"><strong>{{ quest.ownerName }}</strong> játékos kéri a teljesítés igazolását.</p>
        <div class="quest-verification-details">
          <h2>{{ quest.title }}</h2>
          <p v-if="quest.description" class="muted">{{ quest.description }}</p>
        </div>
        <p v-if="isOwner" class="error">A saját küldetésedet nem igazolhatod. Kérj meg egy másik játékost.</p>
        <div v-else class="quest-verification-actions">
          <button class="primary" :disabled="busy" @click="decide(true)">{{ busy ? 'Feldolgozás…' : 'Teljesítés jóváhagyása' }}</button>
          <button class="ghost" :disabled="busy" @click="decide(false)">Elutasítás</button>
        </div>
        <p class="muted quest-verification-note">A döntés egyszer használható. Jóváhagyás esetén a neved bekerül a küldetés előzményeibe.</p>
        <button class="ghost" @click="reset">Másik PIN megadása</button>
      </template>
      <template v-else>
        <h1>PIN-kód megadása</h1>
        <p class="muted">Kérd el a küldetést teljesítő játékostól a háromjegyű PIN-kódot, majd írd be ide.</p>
        <form class="quest-pin-form" @submit.prevent="lookupPin">
          <input v-model="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="3" pattern="[0-9]{3}" placeholder="000" aria-label="Háromjegyű PIN-kód">
          <button class="primary" :disabled="busy || pin.length!==3">{{ busy ? 'Ellenőrzés…' : 'PIN ellenőrzése' }}</button>
        </form>
        <p v-if="!loggedIn" class="error">A hitelesítéshez először jelentkezz be a saját játékosoddal.</p>
        <p v-if="error" class="error">{{ error }}</p>
        <p class="muted quest-verification-note">A PIN-kód 90 másodpercig érvényes, és csak egyszer használható.</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.quest-verification-panel { width: min(100%, 520px); gap: 18px; }
.quest-verification-details { padding: 18px; border: 1px solid var(--border, rgba(255,255,255,.12)); border-radius: 14px; background: rgba(255,255,255,.035); }
.quest-verification-details h2 { margin: 0 0 8px; }
.quest-verification-details p { margin: 0; }
.quest-verification-actions,.quest-pin-form { display: grid; gap: 10px; }
.quest-verification-note { font-size: .82rem; }
.quest-pin-form input { width:100%; text-align:center; font-size:2rem; font-weight:700; letter-spacing:.45em; padding:16px; }
</style>