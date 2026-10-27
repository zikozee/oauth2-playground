<!--
  UNUSED — superseded by CallbackView.vue (shared /callback route for both
  Authorization Code and PKCE). Kept only because this workspace folder does
  not allow file deletion. Safe to delete this file manually.
-->
<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { exchangeToken } from '../services/oauth'
import RequestViewer from '../components/RequestViewer.vue'
import TokenViewer from '../components/TokenViewer.vue'
import StepIndicator from '../components/StepIndicator.vue'

const route = useRoute()
const clientId = import.meta.env.VITE_AC_CLIENT_ID
const clientSecret = import.meta.env.VITE_AC_CLIENT_SECRET
const redirectUri = import.meta.env.VITE_AC_REDIRECT_URI

const code = ref(null)
const stateError = ref(null)
const authError = ref(null)
const exchanging = ref(false)
const exchangeResult = ref(null)
const requestSnapshot = ref(null)
const pasteInput = ref('')
const exchangeError = ref(null)

function checkStateAndSetCode(c, state) {
  const expectedState = sessionStorage.getItem('ac_state')
  if (state && expectedState && state !== expectedState) {
    stateError.value = `state mismatch — expected ${expectedState}, got ${state}`
    return
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
    // Accept either a full redirect URL or just the code value.
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
    // Not a URL — treat the whole input as the raw code.
    checkStateAndSetCode(raw, null)
  }
}

async function exchange() {
  exchanging.value = true
  exchangeError.value = null
  try {
    const result = await exchangeToken({
      clientId,
      clientSecret,
      code: code.value,
      redirectUri,
    })
    exchangeResult.value = result
    requestSnapshot.value = result.requestSnapshot
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
</script>

<template>
  <div class="page">
    <router-link to="/authorization-code" style="font-size: 13px">← Back</router-link>
    <h1>Authorization Code — Callback</h1>

    <StepIndicator
      :current="exchangeResult ? 4 : 3"
      :steps="[{ label: 'Authorize' }, { label: 'Login' }, { label: 'Code' }, { label: 'Token' }]"
    />

    <div v-if="stateError" class="alert err">{{ stateError }}</div>
    <div v-if="authError" class="alert err">Authorization error: {{ authError }}</div>

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
        placeholder="https://spring.io/?code=..."
      ></textarea>
      <div style="margin-top: 10px">
        <button class="btn" @click="submitPasted">Continue →</button>
      </div>
    </div>

    <template v-if="code">
      <div class="alert ok">Authorization Successful</div>

      <div class="card">
        <h2>Step 3 — Authorization Code Received</h2>
        <pre class="block">{{ code }}</pre>
        <p style="color: var(--muted); font-size: 13px">
          This is not the access token — it's a short-lived code that must be exchanged for tokens.
        </p>
        <button class="btn" :disabled="exchanging || exchangeResult" @click="exchange">
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
      </div>

      <div v-if="exchangeResult" class="card">
        <template v-if="exchangeResult.ok && exchangeResult.json?.successful">
          <div class="alert ok">Token Exchange Successful</div>
          <div class="kv">
            <span class="k">Token Type</span>
            <span class="v">{{ exchangeResult.json.data.tokenType }}</span>
            <span class="k">Expires In</span>
            <span class="v">{{ exchangeResult.json.data.expiresIn }}s</span>
          </div>
          <TokenViewer label="Access Token" :value="exchangeResult.json.data.accessToken" jwt />
          <TokenViewer label="Refresh Token" :value="exchangeResult.json.data.refreshToken" />
        </template>
        <template v-else>
          <div class="alert err">Token exchange failed (HTTP {{ exchangeResult.status }})</div>
          <pre class="block">{{ JSON.stringify(exchangeResult.json, null, 2) }}</pre>
        </template>
      </div>
    </template>
  </div>
</template>
