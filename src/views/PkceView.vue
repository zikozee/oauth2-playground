<script setup>
import { ref, onMounted } from 'vue'
import { buildAuthorizeUrl, randomState } from '../services/oauth'
import { generatePkcePair } from '../services/pkce'
import RequestViewer from '../components/RequestViewer.vue'
import FlowDiagram from '../components/FlowDiagram.vue'
import StepIndicator from '../components/StepIndicator.vue'

const clientId = import.meta.env.VITE_PKCE_CLIENT_ID
const redirectUri = import.meta.env.VITE_REDIRECT_URI
const scope = import.meta.env.VITE_SCOPE

const codeVerifier = ref('')
const codeChallenge = ref('')
const ready = ref(false)

onMounted(async () => {
  const pair = await generatePkcePair()
  codeVerifier.value = pair.codeVerifier
  codeChallenge.value = pair.codeChallenge
  ready.value = true
})

function start() {
  // Flow-specific storage keys so this never touches the Authorization Code
  // flow's own in-flight state if both are started before either callback lands.
  const state = randomState('pkce')
  sessionStorage.setItem('oauth_state_pkce', state)
  sessionStorage.setItem('oauth_code_verifier_pkce', codeVerifier.value)
  const url = buildAuthorizeUrl({ clientId, redirectUri, state, codeChallenge: codeChallenge.value })
  window.location.href = url
}
</script>

<template>
  <div class="page">
    <router-link to="/" style="font-size: 13px">← Back</router-link>
    <h1>Authorization Code + PKCE</h1>

    <StepIndicator
      :current="1"
      :steps="[{ label: 'Generate PKCE' }, { label: 'Login' }, { label: 'Code' }, { label: 'Token' }]"
    />

    <FlowDiagram pkce />

    <div class="card">
      <h2>Step 1 — Generate PKCE Parameters</h2>
      <div v-if="ready" class="kv">
        <span class="k">code_verifier</span>
        <span class="v mono">{{ codeVerifier }}</span>
        <span class="k">code_challenge</span>
        <span class="v mono">{{ codeChallenge }}</span>
        <span class="k">challenge_method</span>
        <span class="v mono">S256</span>
      </div>
      <p style="color: var(--muted); font-size: 13px">
        The verifier is generated in-browser with Web Crypto, hashed with SHA-256, then
        Base64URL-encoded into the challenge. The verifier is kept in sessionStorage and never
        sent until the token exchange.
      </p>
    </div>

    <div class="card">
      <h2>Step 2 — Authorization Request</h2>
      <div class="kv">
        <span class="k">client_id</span>
        <span class="v mono">{{ clientId }}</span>
        <span class="k">scope</span>
        <span class="v mono">{{ scope }}</span>
        <span class="k">redirect_uri</span>
        <span class="v mono">{{ redirectUri }}</span>
      </div>

      <RequestViewer
        v-if="ready"
        title="Generated Request"
        method="GET"
        :url="buildAuthorizeUrl({ clientId, redirectUri, state: '<generated-on-click>', codeChallenge })"
      />

      <button class="btn" :disabled="!ready" @click="start">Start Authorization →</button>
    </div>
  </div>
</template>
