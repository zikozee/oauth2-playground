// OAuth request builders + token exchange against the Spring Authorization Server.

const AUTH_SERVER = import.meta.env.VITE_AUTH_SERVER
const SCOPE = import.meta.env.VITE_SCOPE || 'openid'

// Encodes which flow started the request into the state value itself
// (`<flow>.<random hex>`). The authorization server echoes `state` back
// verbatim on redirect, so this is the one piece of data on the callback
// that's guaranteed to reflect *this* request — unlike sessionStorage, which
// can get overwritten if a second flow is started before the first one's
// callback lands (two tabs, clicking around, etc).
export function randomState(flow) {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  const hex = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
  return flow ? `${flow}.${hex}` : hex
}

const KNOWN_FLOWS = ['authorization-code', 'pkce']

export function parseFlowFromState(state) {
  if (!state) return null
  const [flow] = state.split('.')
  return KNOWN_FLOWS.includes(flow) ? flow : null
}

export function buildAuthorizeUrl({ clientId, redirectUri, state, codeChallenge }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPE.includes('openid') ? SCOPE : `openid ${SCOPE}`,
    redirect_uri: redirectUri,
    state,
  })
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge)
    params.set('code_challenge_method', 'S256')
  }
  return `${AUTH_SERVER}/oauth2/authorize?${params.toString()}`
}

export function loginUrl() {
  return `${AUTH_SERVER}/login`
}

// Posts a token request with HTTP Basic client auth, and returns a display-safe
// snapshot of what was sent alongside the parsed response. Shared by every grant.
async function postToken(clientId, clientSecret, bodyParams) {
  const body = new URLSearchParams(bodyParams)
  const basic = btoa(`${clientId}:${clientSecret}`)

  const res = await fetch(`${AUTH_SERVER}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  })

  const requestSnapshot = {
    url: `${AUTH_SERVER}/oauth2/token`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic} (${clientId}:${'*'.repeat(clientSecret.length)})`,
    },
    body: Object.fromEntries(body.entries()),
  }

  let json
  try {
    json = await res.json()
  } catch {
    json = null
  }

  return { ok: res.ok, status: res.status, json, requestSnapshot }
}

// Exchanges an authorization code for tokens.
// clientId/clientSecret are sent as HTTP Basic auth, matching the backend's
// registered token endpoint auth method (both demo clients require it).
export async function exchangeToken({ clientId, clientSecret, code, redirectUri, codeVerifier }) {
  const params = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  }
  if (codeVerifier) params.code_verifier = codeVerifier
  return postToken(clientId, clientSecret, params)
}

// Uses a refresh token to get a new access token (and, per this backend,
// a new refresh token too — the response is used to replace what's on screen
// so a second refresh uses the latest one, not the original).
// No redirect_uri: it's only meaningful for the authorization_code grant per
// RFC 6749 §6, and this backend accepts refresh requests without it.
export async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  return postToken(clientId, clientSecret, {
    grant_type: 'refresh_token',
    scope: SCOPE.includes('openid') ? SCOPE : `openid ${SCOPE}`,
    refresh_token: refreshToken,
  })
}

// Custom Grant (direct username/password call to the token endpoint).
// No browser redirect, no authorization code — the app calls /oauth2/token
// straight away with the resource owner's credentials and a custom grant_type.
export async function passwordGrantToken({ clientId, clientSecret, grantType, username, password }) {
  return postToken(clientId, clientSecret, {
    grant_type: grantType,
    scope: SCOPE.includes('openid') ? SCOPE : `openid ${SCOPE}`,
    username,
    password,
  })
}
