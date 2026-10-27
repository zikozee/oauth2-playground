import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AuthorizationCodeView from '../views/AuthorizationCodeView.vue'
import PkceView from '../views/PkceView.vue'
import CallbackView from '../views/CallbackView.vue'
import CustomGrantView from '../views/CustomGrantView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/authorization-code', name: 'authorization-code', component: AuthorizationCodeView },
    { path: '/pkce', name: 'pkce', component: PkceView },
    // Shared callback for both Authorization Code and PKCE — the redirect_uri is
    // identical for both clients on the backend, so this route figures out which
    // flow it's handling from the `state` query param (tagged with the flow name
    // by randomState() in services/oauth.js) rather than from sessionStorage
    // (see CallbackView.vue and the design notes in BUILD_PROMPT.md section 3).
    { path: '/callback', name: 'callback', component: CallbackView },
    { path: '/custom-grant', name: 'custom-grant', component: CustomGrantView },
  ],
})

export default router
