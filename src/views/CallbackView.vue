<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { exchangeToken, refreshAccessToken, parseFlowFromState } from '../services/oauth'
import RequestViewer from '../components/RequestViewer.vue'
import TokenViewer from '../components/TokenViewer.vue'
import StepIndicator from '../components/StepIndicator.vue'

const route = useRoute()
const redirectUri = import.meta.env.VITE_REDIRECT_URI

const FLOW_CONFIG = {
  'authorization-code': {
    label: 'Authorization Code',
    backLink: '/authorization-code',
    clientId: import.meta.env.VITE_AC_CLIENT_ID,
    clientSecret: import.meta.env.VITE_AC_CLIENT_SECRET,
  },
  pkce: {
    label: 'PKCE',
    backLink: '/pkce',
    clientId: import.meta.env.VITE_PKCE_CLIENT_ID,
    clientSecret: import.meta.env.VITE_PKCE_CLIENT_SECRET,
  },
}

// Which flow this callback belongs to. The state value the auth server
// echoes back is tagged with the flow name (see services/oauth.js
// randomState) — that's authoritative and immune to sessionStorage races.
// sessionStorage is only consulted as a fallback for the manual paste case
// where there's no query-string state to read yet.
const flow = ref(null)
const flowConfig = computed(() => (flow.value ? FLOW_CONFIG[flow.value] : null))

const code = ref(null)
const stateError = ref(null)
const authError = ref(null)
const exchanging = ref(false)
const exchangeResult = ref(null)
const requestSnapshot = ref(null)
const pasteInput = ref('')
const exchangeError = ref(null)
const codeVerifier = ref(null)

// The live token set shown on screen — set once on a successful exchange,
// then replaced (not appended) on every successful refresh, so repeated
// refreshing always uses the most recent refresh_token, not the original.
const tokens = ref(null)
const refreshing = ref(false)
const refreshError = ref(null)
const refreshResult = ref(null)
const refreshRequestSnapshot = ref(null)
const refreshCount = ref(0)

function checkStateAndSetCode(c, state) {
  const detectedFlow = parseFlowFromState(state)
  if (detectedFlow) flow.value = detectedFlow

  if (flow.value) {
    const expectedState = sessionStorage.getItem(`oauth_state_${flow.value}`)
    if (state && expectedState && state !== expectedState) {
      stateError.value = `state mismatch — expected ${expectedState}, got ${state}`
      return
    }
    if (flow.value === 'pkce') {
      codeVerifier.value = sessionStorage.getItem('oauth_code_verifier_pkce')
    }
  }

  code.value = c
}

onMounted(() => {
  const { code: c, state, error, error_description } = route.query

  if (error) {
    authError.value = error_description || error
    return
  }

  if (!c) return // no code in the URL yet — user will paste it below
  checkStateAndSetCode(c, state)
})

function submitPasted() {
  authError.value = null
  const raw = pasteInput.value.trim()
  if (!raw) return
  try {
    const url = new URL(raw)
    const c = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const err = url.searchParams.get('error')
    if (err) {
      authError.value = url.searchParams.get('error_description') || err
      return
    }
    if (!c) {
      authError.value = 'No "code" parameter found in that URL.'
      return
    }
    checkStateAndSetCode(c, state)
  } catch {
    checkStateAndSetCode(raw, null)
  }
}

function pickFlow(name) {
  flow.value = name
  if (name === 'pkce') {
    codeVerifier.value = sessionStorage.getItem('oauth_code_verifier_pkce')
  }
}

async function exchange() {
  if (flow.value === 'pkce' && !codeVerifier.value) {
    exchangeError.value = 'Cannot exchange: no PKCE code_verifier is available for this session.'
    return
  }
  exchanging.value = true
  exchangeError.value = null
  try {
    const result = await exchangeToken({
      clientId: flowConfig.value.clientId,
      clientSecret: flowConfig.value.clientSecret,
      code: code.value,
      redirectUri,
      codeVerifier: codeVerifier.value,
    })
    exchangeResult.value = result
    requestSnapshot.value = result.requestSnapshot
    if (result.ok && result.json?.successful) {
      tokens.value = result.json.data
    }
  } catch (e) {
    exchangeError.value =
      'Request failed before a response came back — this is almost always CORS: your Spring ' +
      'Authorization Server needs to allow requests from http://127.0.0.1:5173 on the ' +
      '/oauth2/token endpoint. Check the browser console (Network tab) for the exact error. ' +
      `(${e.message})`
  } finally {
    exchanging.value = false
  }
}

async function refresh() {
  refreshing.value = true
  refreshError.value = null
  try {
    const result = await refreshAccessToken({
      clientId: flowConfig.value.clientId,
      clientSecret: flowConfig.value.clientSecret,
      refreshToken: tokens.value.refreshToken,
    })
    refreshResult.value = result
    refreshRequestSnapshot.value = result.requestSnapshot
    if (result.ok && result.json?.successful) {
      tokens.value = result.json.data
      refreshCount.value += 1
    }
  } catch (e) {
    refreshError.value =
      'Request failed before a response came back — this is almost always CORS: your Spring ' +
      'Authorization Server needs to allow requests from http://127.0.0.1:5173 on the ' +
      '/oauth2/token endpoint. Check the browser console (Network tab) for the exact error. ' +
      `(${e.message})`
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <div class="page">
    <router-link :to="flowConfig ? flowConfig.backLink : '/'" style="font-size: 13px">← Back</router-link>
    <h1>{{ flowConfig ? flowConfig.label : 'OAuth' }} — Callback</h1>

    <StepIndicator
      v-if="flowConfig"
      :current="exchangeResult ? 4 : 3"
      :steps="[{ label: 'Authorize' }, { label: 'Login' }, { label: 'Code' }, { label: 'Token' }]"
    />

    <div v-if="stateError" class="alert err">{{ stateError }}</div>
    <div v-if="authError" class="alert err">Authorization error: {{ authError }}</div>

    <div v-if="code && !flowConfig" class="card">
      <h2>Which flow was this?</h2>
      <p style="color: var(--muted); font-size: 13px">
        This is a shared callback for both Authorization Code and PKCE, and this browser session
        doesn't have a record of which one you started (e.g. a fresh tab, or sessionStorage was
        cleared). Pick which flow sent you here so the right client can be used for the token
        exchange.
      </p>
      <div class="mask-row">
        <button class="btn secondary" @click="pickFlow('authorization-code')">Authorization Code</button>
        <button class="btn secondary" @click="pickFlow('pkce')">PKCE</button>
      </div>
    </div>

    <div v-if="!code" class="card">
      <h2>Paste the redirect</h2>
      <p style="color: var(--muted); font-size: 13px">
        No authorization code was found in this page's URL. If your Spring server redirected
        you somewhere else, copy the full URL from the address bar (it will contain
        <code>?code=...</code>) and paste it below to continue the demo.
      </p>
      <textarea
        v-model="pasteInput"
        rows="3"
        style="width: 100%; background: var(--code-bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px; font-family: inherit"
        placeholder="http://127.0.0.1:5173/callback?code=..."
      ></textarea>
      <div style="margin-top: 10px">
        <button class="btn" @click="submitPasted">Continue →</button>
      </div>
    </div>

    <div v-if="code && flow === 'pkce' && !codeVerifier" class="card">
      <div class="alert err">
        No PKCE <code>code_verifier</code> found in sessionStorage for this flow — exchanging
        this code would fail with "code_verifier is missing or invalid" from the backend, so the
        Exchange button below is disabled. This happens when the tab that generated the verifier
        (Step 1 on the PKCE page) isn't the one this callback landed in, or storage was cleared
        in between. Go back and start the PKCE flow again in one continuous run, without
        switching tabs or reloading in between.
      </div>
      <router-link class="btn secondary" to="/pkce">← Restart PKCE flow</router-link>
    </div>

    <template v-if="code && flowConfig">
      <div class="alert ok">Authorization Successful</div>

      <div class="card">
        <h2>Step 3 — Authorization Code Received</h2>
        <pre class="block">{{ code }}</pre>
        <p v-if="flow === 'pkce'" style="color: var(--muted); font-size: 13px">
          Stored verifier for this session: <code>{{ codeVerifier || '(none found)' }}</code>
        </p>
        <p v-else style="color: var(--muted); font-size: 13px">
          This is not the access token — it's a short-lived code that must be exchanged for tokens.
        </p>
        <button
          class="btn"
          :disabled="exchanging || exchangeResult || (flow === 'pkce' && !codeVerifier)"
          @click="exchange"
        >
          {{ exchanging ? 'Exchanging…' : 'Exchange Code for Token →' }}
        </button>
        <div v-if="exchangeError" class="alert err" style="margin-top: 12px">{{ exchangeError }}</div>
      </div>

      <div v-if="requestSnapshot" class="card">
        <h2>Step 4 — Token Exchange</h2>
        <RequestViewer
          :method="requestSnapshot.method"
          :url="requestSnapshot.url"
          :headers="requestSnapshot.headers"
          :body="requestSnapshot.body"
        />
        <p v-if="flow === 'pkce'" style="color: var(--muted); font-size: 13px">
          Note: this demo's backend still requires client Basic auth even on the PKCE client
          (<code>oidc-client2</code>). A pure public-client PKCE setup would drop the secret
          entirely and rely on <code>code_verifier</code> alone — that's a backend registration
          choice, not something the frontend can change.
        </p>
      </div>

      <div v-if="exchangeResult" class="card">
        <template v-if="exchangeResult.ok && exchangeResult.json?.successful">
          <div class="alert ok">Token Exchange Successful</div>
          <div class="kv">
            <span class="k">Token Type</span>
            <span class="v">{{ tokens.tokenType }}</span>
            <span class="k">Expires In</span>
            <span class="v">{{ tokens.expiresIn }}s</span>
          </div>
          <TokenViewer label="Access Token" :value="tokens.accessToken" jwt />
          <TokenViewer label="Refresh Token" :value="tokens.refreshToken" />
        </template>
        <template v-else>
          <div class="alert err">Token exchange failed (HTTP {{ exchangeResult.status }})</div>
          <pre class="block">{{ JSON.stringify(exchangeResult.json, null, 2) }}</pre>
        </template>
      </div>

      <div v-if="tokens" class="card">
        <h2>Step 5 — Refresh Token</h2>
        <p style="color: var(--muted); font-size: 13px">
          Uses the refresh token above to get a new access token without going through
          <code>/oauth2/authorize</code> or login again. This backend rotates the refresh token
          too, so the displayed tokens are replaced with the new pair each time — you can click
          this repeatedly, and each click uses whatever the latest refresh token is.
        </p>
        <button class="btn" :disabled="refreshing" @click="refresh">
          {{ refreshing ? 'Refreshing…' : 'Get New Access Token using Refresh Token →' }}
        </button>
        <span v-if="refreshCount" style="color: var(--muted); font-size: 12px; margin-left: 10px">
          Refreshed {{ refreshCount }} time{{ refreshCount === 1 ? '' : 's' }}
        </span>
        <div v-if="refreshError" class="alert err" style="margin-top: 12px">{{ refreshError }}</div>

        <template v-if="refreshRequestSnapshot">
          <p style="color: var(--muted); font-size: 13px; margin-top: 16px">Last Refresh Request</p>
          <RequestViewer
            :method="refreshRequestSnapshot.method"
            :url="refreshRequestSnapshot.url"
            :headers="refreshRequestSnapshot.headers"
            :body="refreshRequestSnapshot.body"
          />
        </template>

        <div v-if="refreshResult && !(refreshResult.ok && refreshResult.json?.successful)" class="alert err" style="margin-top: 12px">
          Refresh failed (HTTP {{ refreshResult.status }})
          <pre class="block">{{ JSON.stringify(refreshResult.json, null, 2) }}</pre>
        </div>
      </div>
    </template>
  </div>
</template>
