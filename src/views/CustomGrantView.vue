<script setup>
import { ref, computed } from 'vue'
import { passwordGrantToken, refreshAccessToken } from '../services/oauth'
import RequestViewer from '../components/RequestViewer.vue'
import FlowDiagram from '../components/FlowDiagram.vue'
import TokenViewer from '../components/TokenViewer.vue'
import StepIndicator from '../components/StepIndicator.vue'

const authServer = import.meta.env.VITE_AUTH_SERVER
const clientId = import.meta.env.VITE_PASSWORD_CLIENT_ID
const clientSecret = import.meta.env.VITE_PASSWORD_CLIENT_SECRET
const grantType = import.meta.env.VITE_CUSTOM_GRANT_TYPE
const scope = import.meta.env.VITE_SCOPE
const tokenEndpoint = `${authServer}/oauth2/token`

const username = ref('user')
const password = ref('password')
const showPassword = ref(false)

const requesting = ref(false)
const requestError = ref(null)
const exchangeResult = ref(null)
const requestSnapshot = ref(null)

// Live token set — set on a successful request, replaced on every successful
// refresh so repeated refreshing always uses the latest refresh_token.
const tokens = ref(null)
const refreshing = ref(false)
const refreshError = ref(null)
const refreshResult = ref(null)
const refreshRequestSnapshot = ref(null)
const refreshCount = ref(0)

const previewBody = computed(() => ({
  grant_type: grantType,
  scope,
  username: username.value,
  password: password.value ? '*'.repeat(password.value.length) : '',
}))

async function submit() {
  requesting.value = true
  requestError.value = null
  exchangeResult.value = null
  requestSnapshot.value = null
  try {
    const result = await passwordGrantToken({
      clientId,
      clientSecret,
      grantType,
      username: username.value,
      password: password.value,
    })
    exchangeResult.value = result
    requestSnapshot.value = result.requestSnapshot
    if (result.ok && result.json?.successful) {
      tokens.value = result.json.data
    }
  } catch (e) {
    requestError.value =
      'Request failed before a response came back — this is almost always CORS: your Spring ' +
      'Authorization Server needs to allow requests from http://127.0.0.1:5173 on the ' +
      '/oauth2/token endpoint. Check the browser console (Network tab) for the exact error. ' +
      `(${e.message})`
  } finally {
    requesting.value = false
  }
}

async function refresh() {
  refreshing.value = true
  refreshError.value = null
  try {
    const result = await refreshAccessToken({
      clientId,
      clientSecret,
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
    <router-link to="/" style="font-size: 13px">← Back</router-link>
    <h1>Custom Grant (Password)</h1>

    <StepIndicator :current="exchangeResult ? 2 : 1" :steps="[{ label: 'Build Request' }, { label: 'Token' }]" />

    <div class="alert info">
      This flow never touches the browser's redirect chain. There's no <code>/oauth2/authorize</code>
      call, no login page, no callback — the app sends the user's credentials straight to the token
      endpoint along with a non-standard <code>grant_type</code>.
    </div>

    <FlowDiagram variant="direct" />

    <div class="card">
      <h2>Step 1 — Request Credentials</h2>
      <div class="kv">
        <span class="k">Token Endpoint</span>
        <span class="v mono">{{ tokenEndpoint }}</span>
        <span class="k">client_id</span>
        <span class="v mono">{{ clientId }}</span>
        <span class="k">grant_type</span>
        <span class="v mono">{{ grantType }}</span>
        <span class="k">scope</span>
        <span class="v mono">{{ scope }}</span>
      </div>

      <div class="kv" style="grid-template-columns: 140px 1fr; max-width: 420px">
        <span class="k">Username</span>
        <input
          v-model="username"
          type="text"
          style="background: var(--code-bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-family: inherit"
        />
        <span class="k">Password</span>
        <div class="mask-row">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            style="flex: 1; background: var(--code-bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-family: inherit"
          />
          <button
            type="button"
            class="btn secondary"
            style="padding: 4px 10px; font-size: 12px"
            @click="showPassword = !showPassword"
          >
            {{ showPassword ? 'Hide' : 'Show' }}
          </button>
        </div>
      </div>

      <p style="color: var(--muted); font-size: 13px; margin-top: 12px">Generated Request</p>
      <RequestViewer
        method="POST"
        :url="tokenEndpoint"
        :headers="{ Authorization: `Basic (${clientId}:${'*'.repeat(clientSecret.length)})`, 'Content-Type': 'application/x-www-form-urlencoded' }"
        :body="previewBody"
      />

      <button class="btn" :disabled="requesting" @click="submit" style="margin-top: 12px">
        {{ requesting ? 'Requesting…' : 'Get Token →' }}
      </button>
      <div v-if="requestError" class="alert err" style="margin-top: 12px">{{ requestError }}</div>
    </div>

    <div v-if="requestSnapshot" class="card">
      <h2>Actual Request Sent</h2>
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
          <span class="v">{{ tokens.tokenType }}</span>
          <span class="k">Expires In</span>
          <span class="v">{{ tokens.expiresIn }}s</span>
        </div>
        <TokenViewer label="Access Token" :value="tokens.accessToken" jwt />
        <TokenViewer label="Refresh Token" :value="tokens.refreshToken" />
      </template>
      <template v-else>
        <div class="alert err">Token request failed (HTTP {{ exchangeResult.status }})</div>
        <pre class="block">{{ JSON.stringify(exchangeResult.json, null, 2) }}</pre>
      </template>
    </div>

    <div v-if="tokens" class="card">
      <h2>Refresh Token</h2>
      <p style="color: var(--muted); font-size: 13px">
        Uses the refresh token above to get a new access token without sending the username and
        password again. This backend rotates the refresh token too, so the displayed tokens are
        replaced with the new pair each time — click repeatedly and each click uses whatever the
        latest refresh token is.
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
  </div>
</template>
