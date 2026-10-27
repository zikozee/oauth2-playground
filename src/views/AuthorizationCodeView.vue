<script setup>
import { buildAuthorizeUrl, randomState } from '../services/oauth'
import RequestViewer from '../components/RequestViewer.vue'
import FlowDiagram from '../components/FlowDiagram.vue'
import StepIndicator from '../components/StepIndicator.vue'

const authServer = import.meta.env.VITE_AUTH_SERVER
const clientId = import.meta.env.VITE_AC_CLIENT_ID
const redirectUri = import.meta.env.VITE_REDIRECT_URI
const scope = import.meta.env.VITE_SCOPE
const authorizeEndpoint = `${authServer}/oauth2/authorize`

function start() {
  // Flow-specific storage key so this never touches the PKCE flow's own
  // in-flight state if both are started before either callback lands.
  const state = randomState('authorization-code')
  sessionStorage.setItem('oauth_state_authorization-code', state)
  const url = buildAuthorizeUrl({ clientId, redirectUri, state })
  window.location.href = url
}

const previewUrl = buildAuthorizeUrl({ clientId, redirectUri, state: '<generated-on-click>' })
</script>

<template>
  <div class="page">
    <router-link to="/" style="font-size: 13px">← Back</router-link>
    <h1>Authorization Code Flow</h1>

    <StepIndicator
      :current="1"
      :steps="[{ label: 'Authorize' }, { label: 'Login' }, { label: 'Code' }, { label: 'Token' }]"
    />

    <FlowDiagram />

    <div class="card">
      <h2>Step 1 — Authorization Request</h2>
      <div class="kv">
        <span class="k">Authorization Endpoint</span>
        <span class="v mono">{{ authorizeEndpoint }}</span>
        <span class="k">client_id</span>
        <span class="v mono">{{ clientId }}</span>
        <span class="k">scope</span>
        <span class="v mono">{{ scope }}</span>
        <span class="k">redirect_uri</span>
        <span class="v mono">{{ redirectUri }}</span>
      </div>

      <RequestViewer title="Generated Request" :url="previewUrl" method="GET" />

      <p style="color: var(--muted); font-size: 13px">
        A random <code>state</code> value (tagged with this flow's name) is generated and stored
        in sessionStorage right before redirecting, then verified when the callback returns.
      </p>

      <button class="btn" @click="start">Start Authorization →</button>
    </div>
  </div>
</template>
