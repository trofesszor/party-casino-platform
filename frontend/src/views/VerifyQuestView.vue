<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
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
const video = ref<HTMLVideoElement|null>(null);
const cameraError = ref('');
const cameraActive = ref(false);
let cameraStream: MediaStream|null = null;
let scanFrame = 0;
const isOwner = computed(() => quest.value?.ownerId === playerId);
const loggedIn = computed(() => Number.isSafeInteger(playerId) && playerId > 0);

async function startCamera() {
  cameraError.value = '';
  if (!navigator.mediaDevices?.getUserMedia) { cameraError.value = 'A kamera HTTPS kapcsolaton vagy localhost címen érhető el.'; return; }
  if (!(window as any).BarcodeDetector) { cameraError.value = 'Ez a böngésző nem támogatja a beépített QR-olvasót. Próbáld Chrome vagy Edge böngészőben.'; return; }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    cameraActive.value = true;
    await new Promise(resolve => requestAnimationFrame(() => resolve(true)));
    if (video.value) { video.value.srcObject = cameraStream; await video.value.play(); scanQr(); }
  } catch (e:any) { stopCamera(); cameraError.value = e.name === 'NotAllowedError' ? 'A kamera használatát engedélyezned kell a böngészőben.' : (e.message || 'Nem sikerült elindítani a kamerát.'); }
}
async function scanQr() {
  const Detector = (window as any).BarcodeDetector;
  if (!Detector || !video.value || !cameraActive.value) return;
  try {
    const detector = new Detector({formats:['qr_code']});
    const codes = await detector.detect(video.value);
    const raw = codes?.[0]?.rawValue;
    if (raw) {
      stopCamera();
      try {
        const scanned = new URL(raw, window.location.origin);
        const scannedToken = scanned.searchParams.get('token');
        if (scannedToken) window.location.href = window.location.origin + '/verify-quest?token=' + encodeURIComponent(scannedToken);
        else cameraError.value = 'A beolvasott QR-kód nem érvényes küldetés-hitelesítő link.';
      } catch { cameraError.value = 'A beolvasott QR-kód nem érvényes link.'; }
      return;
    }
  } catch { /* Ignore undecodable frames and keep scanning. */ }
  if (cameraActive.value) scanFrame = requestAnimationFrame(scanQr);
}
function stopCamera() {
  cameraActive.value = false;
  if (scanFrame) cancelAnimationFrame(scanFrame);
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  if (video.value) video.value.srcObject = null;
}
onMounted(async () => {
  if (!token) return;
  try { quest.value = await api.getSideQuestVerification(token); }
  catch (e:any) { error.value = e.message || 'A QR-kód nem érvényes.'; }
});
onUnmounted(stopCamera);
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
      <template v-if="!token && !result">
        <h1>QR-kód beolvasása</h1>
        <p class="muted">Olvasd be a küldetést kérő játékos telefonján megjelenő QR-kódot a teljesítés ellenőrzéséhez.</p>
        <div v-if="cameraActive" class="quest-camera-frame"><video ref="video" playsinline muted></video><span class="quest-camera-target"></span></div>
        <button v-if="!cameraActive" class="primary" @click="startCamera">Kamera megnyitása</button>
        <button v-else class="ghost" @click="stopCamera">Kamera leállítása</button>
        <p v-if="cameraError" class="error">{{ cameraError }}</p>
        <p class="muted quest-verification-note">A kamera használatához engedélyezd a hozzáférést. HTTPS vagy localhost szükséges.</p>
      </template>
      <template v-else-if="result">
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

.quest-camera-frame{position:relative;width:100%;aspect-ratio:4/5;max-height:420px;overflow:hidden;border-radius:16px;background:#050607;border:1px solid #ffffff22}
.quest-camera-frame video{width:100%;height:100%;object-fit:cover}
.quest-camera-target{position:absolute;left:50%;top:50%;width:min(68vw,250px);height:min(68vw,250px);transform:translate(-50%,-50%);border:3px solid var(--accent);border-radius:18px;box-shadow:0 0 0 999px #0005,inset 0 0 20px #0004}
</style>