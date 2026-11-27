import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import HomeView from './views/HomeView.vue';
import DisplayView from './views/DisplayView.vue';
import RouletteView from './views/RouletteView.vue';
import SlotsView from './views/SlotsView.vue';
import AdminView from './views/AdminView.vue';
import LuckyWheelView from './views/LuckyWheelView.vue';
import LeaderboardView from './views/LeaderboardView.vue';
import ShopView from './views/ShopView.vue';
import VerifyQuestView from './views/VerifyQuestView.vue';
import CommunityEventsView from './views/CommunityEventsView.vue';
import AdminCommunityEventsView from './views/AdminCommunityEventsView.vue';
import './style.css';
import './casino-theme.css';
const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/', component: HomeView },
  { path: '/display', component: DisplayView },
  { path: '/roulette', component: RouletteView },
  { path: '/slots', component: SlotsView },
  { path: '/lucky-wheel', component: LuckyWheelView },
  { path: '/leaderboard', component: LeaderboardView },
  { path: '/shop', component: ShopView },
  { path: '/verify-quest', component: VerifyQuestView },
  { path: '/admin', component: AdminView },
  { path: '/community-events', component: CommunityEventsView },
  { path: '/admin/community-events', component: AdminCommunityEventsView },
] });
createApp(App).use(router).mount('#app');
