<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type CommunityEventAdmin } from '../services/api';
const token=ref(localStorage.getItem('party-admin-token')||'');
const events=ref<CommunityEventAdmin[]>([]);
const error=ref('');const busy=ref(false);const editingId=ref<number|null>(null);
const form=ref({title:'',description:'',targetAmount:500,repeatMode:'ONCE' as 'ONCE'|'REPEATABLE'|'COOLDOWN',cooldownMinutes:60,minContribution:1,maxContribution:null as number|null,isSecret:false,active:true});
const fmt=(n:number)=>n.toLocaleString('hu-HU');
async function load(){if(!token.value){error.value='Admin bejelentkezés szükséges. Lépj be az admin felületen.';return;}try{events.value=await api.adminCommunityEvents(token.value);}catch(e:any){error.value=e.message;}}
function reset(){editingId.value=null;form.value={title:'',description:'',targetAmount:500,repeatMode:'ONCE',cooldownMinutes:60,minContribution:1,maxContribution:null,isSecret:false,active:true};}
function edit(e:CommunityEventAdmin){editingId.value=e.id;form.value={title:e.title,description:e.description,targetAmount:e.targetAmount,repeatMode:e.repeatMode,cooldownMinutes:e.cooldownMinutes,minContribution:e.minContribution,maxContribution:e.maxContribution,isSecret:!!e.isSecret,active:!!e.active};window.scrollTo({top:0,behavior:'smooth'});}
async function save(){busy.value=true;error.value='';try{if(editingId.value)await api.adminUpdateCommunityEvent(token.value,editingId.value,form.value);else await api.adminCreateCommunityEvent(token.value,form.value);reset();await load();}catch(e:any){error.value=e.message;}finally{busy.value=false;}}
async function toggle(e:CommunityEventAdmin){try{await api.adminToggleCommunityEvent(token.value,e.id,!e.active);await load();}catch(x:any){error.value=x.message;}}
async function activate(e:CommunityEventAdmin){if(!confirm(`Manuálisan aktiválod ezt az eseményt: ${e.title}?`))return;try{await api.adminActivateCommunityEvent(token.value,e.id);await load();}catch(x:any){error.value=x.message;}}
async function remove(e:CommunityEventAdmin){if(!confirm(`Véglegesen törlöd: ${e.title}? Az előzményei is törlődnek.`))return;try{await api.adminDeleteCommunityEvent(token.value,e.id);await load();}catch(x:any){error.value=x.message;}}
onMounted(load);
</script>
<template>
<main class="community-page community-admin-page">
<header class="community-topbar"><a class="brand" href="/">PARTY<span>CASINO</span></a><div><a class="ghost" href="/admin">Vezérlőpult</a><a class="ghost" href="/">Kaszinó</a></div></header>
<section class="community-hero"><h1>Community <span>Events</span></h1><p class="muted">Közösségi célok, titkos meglepetések és aktiválási előzmények kezelése.</p></section>
<p v-if="error" class="community-message error">{{error}}</p>
<section class="panel community-editor"><div class="community-section-heading"><div><h2>{{editingId?'Esemény szerkesztése':'Új közösségi esemény'}}</h2></div><button v-if="editingId" class="ghost" @click="reset">Mégse</button></div>
<form @submit.prevent="save" class="community-form">
<label>Esemény neve<input v-model="form.title" maxlength="80" required placeholder="Everybody Drinks"></label>
<label>Leírás<textarea v-model="form.description" maxlength="500" rows="3" placeholder="Mi történik, ha feloldjátok?"></textarea></label>
<div class="community-form-grid"><label>Célösszeg (CR)<input v-model.number="form.targetAmount" type="number" min="1" required></label><label>Ismétlődés<select v-model="form.repeatMode"><option value="ONCE">Egyszeri</option><option value="REPEATABLE">Ismételhető</option><option value="COOLDOWN">Cooldown után</option></select></label><label>Cooldown (perc)<input v-model.number="form.cooldownMinutes" type="number" min="0" max="10080" :disabled="form.repeatMode!=='COOLDOWN'"></label><label>Minimum hozzájárulás<input v-model.number="form.minContribution" type="number" min="1"></label><label>Maximum hozzájárulás (üres = nincs)<input v-model.number="form.maxContribution" type="number" min="1" placeholder="Nincs limit"></label></div>
<label class="community-check"><input v-model="form.isSecret" type="checkbox"> Secret event – a játékosok nem látják a gyűjtés alatt</label>
<label class="community-check"><input v-model="form.active" type="checkbox"> Aktív, hozzájárulást fogad</label>
<button class="primary" :disabled="busy||!form.title.trim()">{{busy?'Mentés…':editingId?'Módosítások mentése':'Esemény létrehozása'}}</button>
</form></section>
<section class="community-section"><div class="community-section-heading"><div><h2>Összes esemény</h2></div><button class="ghost" @click="load">Frissítés</button></div>
<article v-for="e in events" :key="e.id" class="panel community-admin-event"><div><div class="community-event-top"><h3>{{e.isSecret?'🔒 ':''}}{{e.title}}</h3><span class="community-event-tag">{{e.completed?'TELJESÍTVE':e.active?'AKTÍV':'INAKTÍV'}}</span></div><p class="muted">{{e.description}}</p><p class="muted">{{fmt(e.currentAmount)}} / {{fmt(e.targetAmount)}} CR · {{e.contributorCount}} támogató · {{e.activationCount}} aktiválás · {{e.repeatMode}}</p></div><div class="community-admin-actions"><button class="ghost" @click="edit(e)">Szerkesztés</button><button class="ghost" @click="toggle(e)">{{e.active?'Szüneteltetés':'Aktiválás'}}</button><button class="primary" @click="activate(e)">Manuális feloldás</button><button class="danger-button" @click="remove(e)">Törlés</button></div></article>
<div v-if="!events.length" class="panel community-empty">Még nincs esemény létrehozva.</div></section>
</main>
</template>
