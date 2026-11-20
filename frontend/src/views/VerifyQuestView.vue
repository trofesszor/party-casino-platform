<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../services/api';

const route = useRoute();
const router = useRouter();
const token = String(route.query.token ?? '');
const playerId = Number(localStorage.getItem('party-player-id'));
const quest = ref<{questId:number;ownerId:number;ownerName:string;title:string;description:string;expiresAt:string}|null>(null);
const busy = ref(false);
const error = ref('');
const result = ref('');
const isOwner = computed(() => quest.value?.ownerId === playerId);
const loggedIn = computed(() => Number.isSafeInteger(playerId) && playerId > 0);

onMounted(async () => {
  if (!token) { error.value = 'Hiányzó QR-kód azonosító.'; return; }
  try { quest.value = await api.getSideQuestVerification(token); }
  catch (e:any) { error.value = e.message || 'A QR-kód nem érvényes.'; }
});
async function decide(approve:boolean) {
  if (!quest.value || !loggedIn.value || isOwner.value || busy.value) return;
  busy.value = true; error.value = '';
  try {
    const response = await api.verifySideQuest(token,playerId,approve);
    result.value = response.status === 'APPROVED'
      ? `Jóváhagytad a küldetést. A hitelesítő neve: ${response.verifiedByName}.`
      : 'Elutasítottad a küldetés teljesítését. A küldetés aktív marad.';
    quest.value = null;
  } catch (e:any) { error.value = e.message || 'Nem sikerült rögzíteni a döntést.'; }
  finally { busy.value = false; }
}
</script>

<template>
  <main class="page-shell login-shell">
    <section class="panel login-panel quest-verification-panel">
      <a class="brand" href="/">PARTY<span>CASINO</span></a>
      <p class="eyebrow">SIDE QUEST VERIFICATION</p>
      <template v-if="result">
        <h1>Visszaigazolás rögzítve</h1>
        <p class="muted">{{ result }}</p>
        <button class="primary" @click="router.push('/')">Vissza a főoldalra</button>
      </template>
      <template v-else-if="quest">
        <h1>Küldetés ellenőrzése</h1>
        <p class="muted"><strong>{{ quest.ownerName }}</strong> játékos kéri a teljesítés igazolását.</p>
        <div class="quest-verification-details">
          <h2>{{ quest.title }}</h2>
          <p v-if="quest.description" class="muted">{{ quest.description }}</p>
        </div>
        <p v-if="!loggedIn" class="error">A hitelesítéshez először jelentkezz be a saját játékosoddal ezen az eszközön.</p>
        <p v-else-if="isOwner" class="error">A saját küldetésedet nem igazolhatod. Kérj meg egy másik játékost.</p>
        <div v-else class="quest-verification-actions">
          <button class="primary" :disabled="busy" @click="decide(true)">{{ busy ? 'Feldolgozás…' : 'Teljesítés jóváhagyása' }}</button>
          <button class="ghost" :disabled="busy" @click="decide(false)">Elutasítás</button>
        </div>
        <p class="muted quest-verification-note">A döntés egyszer használható. Jóváhagyás esetén a neved bekerül a küldetés előzményeibe.</p>
      </template>
      <div v-else-if="error" class="quest-verification-error">
        <h1>A QR-kód nem használható</h1>
        <p class="error">{{ error }}</p>
        <p class="muted">A kód 90 másodperc után lejár, és csak egyszer használható.</p>
        <button class="ghost" @click="router.push('/')">Vissza a főoldalra</button>
      </div>
      <p v-if="error && quest" class="error">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.quest-verification-panel { width: min(100%, 520px); gap: 18px; }
.quest-verification-details { padding: 18px; border: 1px solid var(--border, rgba(255,255,255,.12)); border-radius: 14px; background: rgba(255,255,255,.035); }
.quest-verification-details h2 { margin: 0 0 8px; }
.quest-verification-details p { margin: 0; }
.quest-verification-actions { display: grid; gap: 10px; }
.quest-verification-note { font-size: .82rem; }
.quest-verification-error { display: grid; gap: 12px; }
</style>