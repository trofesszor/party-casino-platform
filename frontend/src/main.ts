import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import HomeView from './views/HomeView.vue';
import DisplayView from './views/DisplayView.vue';
import RouletteView from './views/RouletteView.vue';
import SlotsView from './views/SlotsView.vue';
import './style.css';
const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/', component: HomeView },
  { path: '/display', component: DisplayView },
  { path: '/roulette', component: RouletteView },
  { path: '/slots', component: SlotsView },
] });
createApp(App).use(router).mount('#app');
