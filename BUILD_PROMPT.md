# Rebuild Prompt: OAuth 2.0 Playground (Vue 3 + Vite)

Paste this whole document to an AI coding assistant (or follow it yourself) to
recreate this project from scratch. It captures the backend contract, every
design decision, the exact files built, and every bug that was hit and fixed
along the way.

## 1. What this is

A teaching/demo single-page app built with Vue 3 + Vite that walks through
three OAuth 2.0 flows against a real Spring Authorization Server, step by
step, so a
non-technical viewer can see every request and response instead of OAuth
happening as an invisible redirect:

- **Authorization Code** (confidential client, client secret sent from the
  browser — acceptable only because this is strictly a demo).
- **Authorization Code + PKCE** (adds a code_verifier/code_challenge pair).
- **Custom Grant (Password)** — a non-redirect flow: the app calls the token
  endpoint directly with a username/password and a custom `grant_type`, no
  browser redirect, login page, or callback involved.

Each flow shows: the authorize request being built (redirect flows only), the
redirect to the Spring login page (redirect flows only), the authorization
code received on callback (redirect flows only), the token exchange/request,
the resulting access/refresh tokens (masked by default), and a JWT decode +
**real signature verification** against the server's JWKS.

## 2. Backend contract (as provided by the user)

Authorization server base URL: `http://127.0.0.1:8080` (equivalently
`http://localhost:8080` — the app standardizes on `127.0.0.1` throughout, see
Gotcha #3 below for why).

### 2a. Authorization Code flow

- Client: `oidc-client` / secret `secret` (confidential client; secret is
  bundled in frontend code — explicitly OK'd by the user for demo purposes
  only).
- Login page: `GET http://127.0.0.1:8080/login`
- Authorize request:
  `GET http://127.0.0.1:8080/oauth2/authorize?response_type=code&client_id=oidc-client&scope=openid&redirect_uri=<redirect_uri>`
- Registered redirect URI: originally `https://spring.io` (placeholder used
  during design), later updated to `http://127.0.0.1:5173/authorization-code/callback`,
  and **finally consolidated to a single shared URI**,
  `http://127.0.0.1:5173/callback`, registered on the backend for both this
  client and the PKCE client below (see section 3 for why).
- Token exchange:

```
curl --location 'http://127.0.0.1:8080/oauth2/token' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--header 'Authorization: Basic b2lkYy1jbGllbnQ6c2VjcmV0' \
--data-urlencode 'grant_type=authorization_code' \
--data-urlencode 'scope=openid profile' \
--data-urlencode 'code=<code>' \
--data-urlencode 'redirect_uri=<redirect_uri>'
```

- Response shape (always this envelope):

```json
{
  "successful": true,
  "messageType": "SUCCESS",
  "data": {
    "expiresIn": 1199,
    "accessToken": "<JWT>",
    "tokenType": "Bearer",
    "refreshToken": "<opaque token>"
  }
}
```

### 2b. Authorization Code + PKCE flow

- Client: `oidc-client2` / secret `secret2`. **Important deviation from
  textbook PKCE**: this backend still requires HTTP Basic client
  authentication (`Authorization: Basic base64(oidc-client2:secret2)`) on the
  token exchange even though it's the "PKCE" client — that's a backend
  registration choice (likely still registered as a confidential client), not
  something fixable from the frontend. The app sends the secret and displays
  a note explaining a pure public-client PKCE setup wouldn't need it.
- Authorize request adds:
  `code_challenge=<S256 challenge>&code_challenge_method=S256`
- Registered redirect URI: originally `https://spring.io`, later
  `http://127.0.0.1:5173/pkce/callback`, and now the same shared
  `http://127.0.0.1:5173/callback` used by the Authorization Code client
  above — Spring validates `redirect_uri` per client, so two different
  clients can share the identical URI with no conflict.
- Token exchange adds `code_verifier=<verifier>` to the body (still with the
  Basic auth header, per above).
- Same response envelope as 2a.

### 2c. Custom Grant (Password) flow — direct, no browser redirect

- Client: `oidc-client4` / secret `secret4`.
- This flow **does not begin from the browser**. There's no
  `/oauth2/authorize` call, no login page, no callback route. The app calls
  the token endpoint directly, once, with the resource owner's credentials
  and a non-standard `grant_type`:

```
curl --location 'http://127.0.0.1:8080/oauth2/token' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--header 'Authorization: Basic b2lkYy1jbGllbnQ0OnNlY3JldDQ=' \
--data-urlencode 'grant_type=custom_oauth_grant' \
--data-urlencode 'scope=openid profile' \
--data-urlencode 'username=user' \
--data-urlencode 'password=password'
```

- `grant_type` is `custom_oauth_grant` (not the standard `password` grant —
  keep it configurable via `.env` since it's backend-specific).
- Same response envelope as 2a/2b:

```json
{
  "successful": true,
  "messageType": "SUCCESS",
  "data": {
    "expiresIn": 1199,
    "accessToken": "<JWT>",
    "tokenType": "Bearer",
    "refreshToken": "<opaque token>"
  }
}
```

- No redirect URI is involved at all for this flow — nothing to register on
  the backend beyond the client itself.

### 2d. JWKS endpoint (for signature verification)

`GET http://127.0.0.1:8080/oauth2/jwks` →

```json
{
  "keys": [
    { "kty": "RSA", "e": "AQAB", "kid": "<uuid>", "n": "<base64url modulus>" }
  ]
}
```

Used to verify the RS256 signature on decoded access tokens client-side via
the Web Crypto API — real cryptographic verification, not just base64
decoding.

### 2e. CORS requirement (flag to the user, backend-side, not frontend-fixable)

The Vue app runs on `http://127.0.0.1:5173`; the auth server is on
`http://127.0.0.1:8080` — different origins. The browser's `fetch()` calls to
`/oauth2/token` and `/oauth2/jwks` are cross-origin, so **Spring Security must
allow the `http://127.0.0.1:5173` origin (CORS) on those two endpoints**, or
the browser blocks the response and the app shows a CORS-pointing error
(see Gotcha #4). This applies to the Custom Grant flow too, since it also
calls `/oauth2/token` via `fetch()` from the browser.

### 2f. Refresh token grant — one per flow, same endpoint

Every flow's response includes a `refreshToken`. All three clients also
support `grant_type=refresh_token` against the same `/oauth2/token` endpoint,
with the same Basic auth pattern as their respective flow:

```
curl --location 'http://127.0.0.1:8080/oauth2/token' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--header 'Authorization: Basic <base64(client_id:client_secret)>' \
--data-urlencode 'grant_type=refresh_token' \
--data-urlencode 'scope=openid' \
--data-urlencode 'refresh_token=<refresh_token>'
```

Same response envelope as 2a/2b/2c — including a **new** `refreshToken`
(this backend rotates it on every refresh, so a second refresh must use the
one from the *previous* refresh response, not the original).

The user's sample curls for this also included `redirect_uri=https://spring.io`
(a leftover from the old placeholder redirect URI, before the app's redirect
URIs were consolidated — see section 3). **`redirect_uri` was deliberately
left out** of this app's refresh requests: per RFC 6749 §6, `redirect_uri` is
only meaningful for the `authorization_code` grant, and the fact that the
sample curl worked with an unrelated/stale value strongly suggests this
backend ignores it for `refresh_token` anyway. If a future backend does
validate it for this grant, add it back using `VITE_REDIRECT_URI`.

## 3. Design decisions

- **Both redirect-based flows share a single callback route and redirect
  URI**: `http://127.0.0.1:5173/callback`, registered on the backend for
  both `oidc-client` and `oidc-client2`. (Earlier in this project's history
  each flow had its own callback path —
  `/authorization-code/callback`/`/pkce/callback` — this was later
  consolidated on request. If you're rebuilding fresh, just go straight to
  the shared route; there's no reason to build the split version first.)
- **The flow is identified from the `state` value, not from sessionStorage
  alone** — see Gotcha #8 for why the first version of this (a plain
  `sessionStorage.setItem('oauth_flow', ...)` marker, with shared
  `oauth_state`/`oauth_code_verifier` keys used by both flows) was buggy:
  starting one flow before the other's callback landed would silently
  overwrite the other's markers, causing the wrong client to be used for the
  token exchange or the PKCE verifier to go missing. The fix, and the
  correct way to build this from scratch:
  - `randomState(flow)` in `services/oauth.js` returns `` `${flow}.${randomHex}` ``
    — the flow name is baked into the `state` value itself.
  - Each flow uses its **own** sessionStorage keys, never shared: Authorization
    Code writes `oauth_state_authorization-code`; PKCE writes `oauth_state_pkce`
    and `oauth_code_verifier_pkce`. Starting one flow never touches the
    other's keys.
  - On callback, `parseFlowFromState(route.query.state)` reads the flow
    straight off the value the authorization server echoed back — this is
    authoritative and immune to races, since it didn't come from mutable
    local storage at all. sessionStorage is then only used as a secondary
    lookup: to fetch the *matching* flow's expected state (for the
    mismatch check) and, for PKCE, its stored verifier.
  - A "Which flow was this?" chooser (two buttons) only appears when there's
    no `state` to read at all — i.e. the code was pasted in manually rather
    than arriving via a real redirect (see the pasted-URL fallback below).
- PKCE `code_verifier` is generated in-browser with the Web Crypto API
  (`crypto.getRandomValues` + SHA-256 + Base64URL), stored in
  `sessionStorage` under its own flow-scoped key (`oauth_code_verifier_pkce`),
  and never sent until the token exchange.
- Tokens are masked by default with a Show/Hide toggle and a Copy button.
- The access token can be decoded (header/payload/signature) and the
  signature is verified for real against the JWKS — shows a ✓/✗ banner.
- No client-side framework state library — plain `ref()`/`reactive()` is
  enough for this app's size.
- Dark theme by default with a light theme toggle for demo/presentation
  purposes, remembered via `localStorage`.
- **Color palette (exact values, so a rebuild doesn't have to guess)** — all
  defined as CSS custom properties on `:root` (dark, default) and overridden
  under `:root[data-theme="light"]`:

  | token | dark | light | used for |
  |---|---|---|---|
  | `--bg` | `#0f1115` | `#f7f8fa` | page background |
  | `--panel` | `#171a21` | `#ffffff` | card backgrounds |
  | `--panel-2` | `#1e222b` | `#f1f3f6` | nested/secondary panels (flow cards) |
  | `--border` | `#2a2f3a` | `#dde1e8` | all borders |
  | `--text` | `#e6e8ec` | `#1a1d24` | body text |
  | `--muted` | `#8a90a0` | `#5b6270` | secondary/label text |
  | `--accent` | `#2dd4bf` (teal-400) | `#0d9488` (teal-600) | links, primary buttons, active step, focus-style accents |
  | `--accent-2` | `#a78bfa` | `#7c3aed` | defined for future secondary-accent use; not currently consumed anywhere |
  | `--accent-soft` | `rgba(45, 212, 191, 0.12)` | `rgba(13, 148, 136, 0.1)` | `.alert.info` background tint |
  | `--ok` | `#4ade80` | `#16a34a` | success states |
  | `--err` | `#f87171` | `#dc2626` | error states |
  | `--code-bg` | `#0b0d12` | `#f1f3f6` | `pre.block` / raw-text inputs |

  **History**: the accent started as a blue (`#6ea8fe` dark / `#2563eb`
  light) and was deliberately changed to teal after the user found the
  "deep blue" used on every primary button unpleasant and asked for
  something "more relaxing" that still works on both themes. Teal at a
  similar lightness/saturation level to the original blue was a drop-in
  swap — no other CSS needed to change, because every button/link/border
  already referenced `var(--accent)` rather than a hardcoded color, and the
  `.alert.info` tint was pulled out into its own `--accent-soft` token at
  the same time (it had been a hardcoded blue-tinted `rgba()` that didn't
  track the accent color at all). If asked to change the accent again,
  follow the same pattern: pick a color at roughly the same lightness as
  what it's replacing (dark theme wants something light enough to read
  against `#0f1115`; light theme wants something dark enough to read
  against `#f7f8fa` and against the fixed near-black `.btn` text color,
  `#0f1115`, used on top of it), and update `--accent-soft`'s rgba to match.
- All non-secret config lives in `.env` as `VITE_*` variables — nothing
  hardcoded across components.
- The Custom Grant view still shows a flow diagram like the other two, but a
  distinct "direct call" variant (`FlowDiagram` component's `variant="direct"`
  prop) — a straight two-party sequence (App ↔ Authorization Server) with no
  login-page/browser hop, to make the "no redirect" difference visually
  obvious next to the other two flows.
- The username/password inputs on that view are pre-filled with the demo
  backend's test credentials (`user`/`password`) purely for convenience —
  they're still editable fields, not hardcoded into the request.
- **Copy feedback is a single global toast, not per-component state.** A
  `useToast()` composable (`composables/useToast.js`) holds one reactive
  singleton (`{ visible, message, duration, key }`) with a module-level
  `showToast(message, duration)` function — any component calls `showToast()`
  directly, no props/events/provide-inject needed. `ToastNotification.vue` is
  mounted once in `App.vue` (outside `<router-view>`, so it survives
  navigation) and renders a fixed bottom-right card with a progress bar whose
  width animates from 100% to 0% over `duration` via a CSS `@keyframes`
  animation (`animation-duration` bound to the toast's `duration`), then
  hides itself when a `setTimeout` matching that duration fires. `TokenViewer`'s
  `copy()` calls `showToast(`${label} copied to clipboard`)` after writing to
  the clipboard.
- **Refresh token UI is a repeatable action, not a one-shot step.** Unlike
  "Exchange Code for Token" (disabled after one success — a code is
  single-use), the "Get New Access Token using Refresh Token" button stays
  enabled after use, because you can refresh again immediately. Each flow's
  view keeps a single `tokens` ref holding `{ accessToken, refreshToken,
  tokenType, expiresIn }` — set once after the initial exchange succeeds,
  then **replaced** (not appended to) after every successful refresh, so
  `TokenViewer` always displays the latest pair and a subsequent refresh
  click uses the newest `refreshToken`, not the original one. A small
  "Refreshed N times" counter next to the button makes the rotation visible
  during a demo. The refresh request/response gets its own mini
  `RequestViewer` + error block, separate from the original exchange's, so
  both are visible at once.

## 4. Project structure

```
auth_vue/
├── .env
├── .gitignore
├── index.html
├── package.json
├── vite.config.js
├── README.md                (Node version, setup, cross-OS node_modules warning)
├── BUILD_PROMPT.md          (this file)
└── src/
    ├── main.js
    ├── App.vue              (topbar, brand link, auth-server badge, theme toggle)
    ├── style.css            (dark + light theme CSS variables, shared component styles)
    ├── router/
    │   └── index.js
    ├── services/
    │   ├── oauth.js         (buildAuthorizeUrl, randomState, parseFlowFromState, loginUrl, exchangeToken, refreshAccessToken, passwordGrantToken)
    │   ├── pkce.js           (generatePkcePair — verifier/challenge via Web Crypto)
    │   ├── jwt.js            (decodeJwt, verifyJwtSignature)
    │   └── jwks.js           (fetchJwks, getPublicKey — imports a CryptoKey by kid)
    ├── composables/
    │   └── useToast.js       (global toast singleton — showToast(message, duration))
    ├── components/
    │   ├── StepIndicator.vue
    │   ├── RequestViewer.vue (renders method/url/headers/body as plain text)
    │   ├── TokenViewer.vue   (mask/show/copy → toast, decode, signature verification UI)
    │   ├── FlowDiagram.vue   (ASCII sequence diagram; `variant="redirect"` default, `variant="direct"` for Custom Grant)
    │   └── ToastNotification.vue (mounted once in App.vue; shrinking-progress-bar toast)
    └── views/
        ├── HomeView.vue                 (flow picker + manual login link)
        ├── AuthorizationCodeView.vue    (step 1: builds + shows authorize request)
        ├── PkceView.vue                 (steps 1–2: generate PKCE, build authorize request)
        ├── CallbackView.vue             (shared callback for both redirect flows — see section 3)
        └── CustomGrantView.vue          (single-page flow — form, request preview, direct token call, result)
```

## 5. Build steps, in order

1. **Scaffold**: `npm create vite@latest . -- --template vue` in the target
   folder, then `npm install vue-router@4`, then `npm install`. This leaves
   behind the template's own demo files —
   `src/components/HelloWorld.vue`, `src/assets/{hero.png,vite.svg,vue.svg}`,
   and `public/icons.svg` — which nothing in this project imports (only
   `HelloWorld.vue` references them, and `HelloWorld.vue` itself is never
   imported by `App.vue` or any route). `public/favicon.svg` is the one
   scaffold file that **is** used (referenced by `index.html`'s `<link
   rel="icon">`) — don't remove that one. Delete the unused ones for a clean
   rebuild; they were only left in place in the original build because this
   project's workspace folder doesn't allow file deletion (see Gotcha #9).
2. **Router** (`src/router/index.js`): routes for `/`, `/authorization-code`,
   `/pkce`, a single shared `/callback` (used by both redirect flows — see
   section 3), and `/custom-grant` (no callback route needed for this one —
   see below), using `createWebHistory()`. **Then wire it into the app** —
   this is easy to skip and nothing catches it at build time (see Gotcha
   #12): edit the scaffold's `src/main.js` (it exists from step 1, untouched
   so far) to import the router and add `.use(router)` before
   `.mount('#app')`:

```js
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

createApp(App).use(router).mount('#app')
```
3. **`.env`** (this is the exact, current file — reproduce it verbatim,
   comments included, not just the values):

```
VITE_AUTH_SERVER=http://127.0.0.1:8080

# Shared redirect URI — registered on the backend for BOTH oidc-client and
# oidc-client2. The callback route figures out which flow it's handling from
# the `state` query param (tagged with the flow name), not sessionStorage
# alone — see CallbackView.vue and BUILD_PROMPT.md section 3.
VITE_REDIRECT_URI=http://127.0.0.1:5173/callback

# Authorization Code (confidential client) — demo only, secret is bundled in code
VITE_AC_CLIENT_ID=oidc-client
VITE_AC_CLIENT_SECRET=secret

# Authorization Code + PKCE
VITE_PKCE_CLIENT_ID=oidc-client2
VITE_PKCE_CLIENT_SECRET=secret2

# Custom Grant (direct username/password call to the token endpoint — no browser redirect)
VITE_PASSWORD_CLIENT_ID=oidc-client4
VITE_PASSWORD_CLIENT_SECRET=secret4
VITE_CUSTOM_GRANT_TYPE=custom_oauth_grant

VITE_SCOPE=openid profile
```

4. **`vite.config.js`**: set `server.host = '127.0.0.1'` and
   `server.port = 5173` explicitly (see Gotcha #3).
5. **`src/services/pkce.js`**: `randomString()`, `sha256()`,
   `generatePkcePair()` — Base64URL encode helper for both the verifier and
   the SHA-256 digest.
6. **`src/services/oauth.js`**: `randomState(flow)` (returns
   `` `${flow}.${randomHex}` `` — bakes the flow name into the state value
   itself, see section 3/Gotcha #8), `parseFlowFromState(state)` (reads it
   back out, validated against a known-flows list — `['authorization-code',
   'pkce']`; Custom Grant is deliberately excluded since it never reaches
   this callback), `buildAuthorizeUrl()` (adds
   `code_challenge`/`code_challenge_method=S256` only when a challenge
   is passed in), `loginUrl()`. Every place a `scope` value is sent
   (`buildAuthorizeUrl`, `refreshAccessToken`, `passwordGrantToken` — but
   *not* `exchangeToken`, which sends no `scope` at all, matching this
   backend's actual requirement) applies the same small safety net:
   `SCOPE.includes('openid') ? SCOPE : \`openid ${SCOPE}\`` — guarantees the
   `openid` scope is present even if `VITE_SCOPE` is ever reconfigured
   without it. A shared internal `postToken()` helper does
   the actual Basic-auth + form-urlencoded POST to `/oauth2/token` and
   returns `{ ok, status, json, requestSnapshot }` for display (never throws
   swallowed — see Gotcha #4); its `requestSnapshot.headers.Authorization`
   is the *real* `Basic <base64>` value (needed so `RequestViewer` shows a
   working request) with a human-readable annotation appended for the
   demo audience — `` `Basic ${basic} (${clientId}:${'*'.repeat(clientSecret.length)})` ``
   — a masked `clientId:secret` pair in parentheses, not a redaction (the
   base64 before it still trivially decodes to the real secret; this is a
   demo, not a security boundary). `exchangeToken()` (authorization_code
   grant, with optional `code_verifier`), `refreshAccessToken()`
   (refresh_token grant — `grant_type`, `scope`, `refresh_token`,
   deliberately no `redirect_uri`, see section 2f), and
   `passwordGrantToken()` (the custom grant — `grant_type`, `scope`,
   `username`, `password`, no code or redirect_uri at all) all call through
   `postToken()`.
7. **`src/services/jwt.js`**: `decodeJwt()` (base64url decode of header/
   payload, non-verifying) and `verifyJwtSignature(token, cryptoKey)` using
   `crypto.subtle.verify`.
8. **`src/services/jwks.js`**: `fetchJwks()` (cached), `getPublicKey(kid)` —
   finds the matching key by `kid` (falls back to the first key), imports it
   via `crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash:
   'SHA-256' }, false, ['verify'])`.
9. **`composables/useToast.js` + `components/ToastNotification.vue`**: build
   this before `TokenViewer` since it depends on it. `useToast.js` is a
   module-level `reactive()` singleton plus a `showToast(message, duration =
   2000)` export — no Pinia/provide-inject needed for something this small.
   `ToastNotification.vue` reads that singleton, renders a fixed
   bottom-right card when `visible`, with a bar whose fill uses a CSS
   `@keyframes` scaleX(1)→scaleX(0) animation bound to `animation-duration:
   ${duration}ms`; a `setTimeout` of the same duration flips `visible` back
   to `false`. Mount `<ToastNotification />` once in `App.vue`, after
   `<router-view>`, so it persists across route changes instead of being
   torn down/recreated per page.
10. **Components** (prop contracts below are exact — nothing else in this
    file specifies them, so don't improvise different shapes):
    - `StepIndicator` — props `steps: Array` (`[{ label }]`) and
      `current: Number` (**1-based**). Renders one `.step` pill per entry;
      a step is `.active` when `index + 1 === current` and `.done` when
      `index + 1 < current`.
    - `RequestViewer` (build the display string in a `computed()`, not
      inline in the template — see Gotcha #1) — props `title` (optional
      label line above the block), `method`, `url`, `headers: Object`,
      `body: Object`. Rendered text format, in order: a `METHOD URL` line
      (only if `method` is set); then one `key: value` line per header;
      then, if both headers and body are present, a blank line; then one
      `key=value` line per body entry — joined with `\n` into a single
      `<pre class="block">`.
    - `FlowDiagram` (same — ASCII art built in a `computed()`) — props
      `variant` (`'redirect'` default, used by both authorize-based flows,
      or `'direct'`, a two-party sequence with no login/browser hop, used
      by Custom Grant) and `pkce: Boolean` (redirect variant only — when
      true, changes the diagram's step-3 line from `"3. Exchange Code"` to
      `"3. Exchange Code + code_verifier"`; PkceView passes `pkce`,
      AuthorizationCodeView doesn't).
    - `TokenViewer` (mask/show/copy — `copy()` calls `showToast()` after
      writing to the clipboard — + a `watch()` on "show decoded" that
      triggers JWKS fetch + signature verification and shows a ✓/✗/error
      banner — shared by all three flows). Guard the watcher so it only
      verifies once per mount: skip the fetch/verify work if a status other
      than the initial `'idle'` is already set, so toggling "Decode Access
      Token" closed and open again re-shows the cached ✓/✗ instantly
      instead of re-fetching the JWKS and flashing "Verifying…" again.
11. **Views**: `HomeView` (three flow cards + manual login link to
    `${VITE_AUTH_SERVER}/login`), `AuthorizationCodeView`/`PkceView` (build
    and preview the authorize URL; on "Start Authorization",
    `AuthorizationCodeView` calls `randomState('authorization-code')` and
    stores it under `oauth_state_authorization-code`; `PkceView` calls
    `randomState('pkce')`, stores it under `oauth_state_pkce`, and stores the
    verifier under `oauth_code_verifier_pkce` — each flow's own keys, never
    shared — then redirects via `window.location.href`).
12. **`CallbackView.vue`** (shared by both Authorization Code and PKCE):
    - A `FLOW_CONFIG` map keyed by `'authorization-code'`/`'pkce'` holding
      each flow's display label, "back" link, client id, and client secret.
    - On mount, read `route.query` for `code`/`state`/`error`. Pass `state`
      through `parseFlowFromState()` first — **this determines the flow**,
      not sessionStorage. Once the flow is known, look up
      `oauth_state_<flow>` to check for a state mismatch, and for PKCE, pull
      the verifier from `oauth_code_verifier_pkce`.
    - If no `code` is present yet, show the **"paste the redirect" fallback**
      (textarea, parses `code`/`state`/`error` out of a pasted URL via
      `new URL()`, same as before) — pasting a URL still goes through
      `parseFlowFromState()` the same way.
    - If a `code` is present but the `state` has no parseable flow prefix
      (e.g. the code was pasted in with no `state` at all), show a small
      "Which flow was this?" chooser with two buttons instead of guessing.
    - "Exchange Code for Token" button calls `exchangeToken()` with the
      looked-up client id/secret (+ verifier if PKCE) wrapped in
      `try/catch/finally` (Gotcha #4) and displays the request snapshot via
      `RequestViewer`, then the result via `TokenViewer` (or a formatted
      error block on failure). On success, store the response's `data` in a
      `tokens` ref (see section 3) rather than reading tokens straight out of
      `exchangeResult` in the template.
    - A "Step 5 — Refresh Token" card appears once `tokens` is set (i.e.
      after any successful exchange or refresh): a `refresh()` function calls
      `refreshAccessToken()` with the same flow's client id/secret and
      `tokens.value.refreshToken`, same `try/catch/finally` + CORS-error
      pattern, and on success **overwrites** `tokens.value` with the new
      pair and increments a `refreshCount` ref. The button has no
      `exchangeResult`-style one-shot disable — it stays clickable so the
      person can refresh repeatedly and watch the token (and refresh token)
      change each time.
13. **`CustomGrantView.vue`** (Custom Grant / Password flow — single page,
    no callback route):
    - An `alert info` banner up top explaining there's no redirect for this
      one, then `<FlowDiagram variant="direct" />`.
    - A small form (username/password inputs, pre-filled `user`/`password`)
      plus a live `RequestViewer` preview of the request that's about to be
      sent (password masked in the preview). The password input has its own
      Show/Hide toggle (defaults to masked `type="password"`, a button flips
      it to `type="text"`) — the same show/hide pattern used for tokens in
      `TokenViewer`, applied here to the credential input itself.
    - "Get Token" button calls `passwordGrantToken()` wrapped in
      `try/catch/finally` (same CORS-pointing error pattern as Gotcha #4),
      shows the actual request sent via `RequestViewer`, then the result via
      `TokenViewer` on success or a formatted error block on failure; on
      success, stores the response's `data` in a `tokens` ref, same pattern
      as `CallbackView.vue`.
    - Same repeatable "Refresh Token" card as `CallbackView.vue`, using this
      flow's own `clientId`/`clientSecret` (`oidc-client4`/`secret4`).
14. **`App.vue`**: topbar with brand link, a badge showing the auth server
    URL, a light/dark theme toggle button that sets
    `document.documentElement.dataset.theme` and persists to `localStorage`
    (wrapped in try/catch in case storage is blocked), and `<ToastNotification
    />` mounted after `<router-view>`.
15. **`src/style.css`**: CSS custom properties on `:root` for the dark theme,
    overridden under `:root[data-theme="light"]` for the light theme — use
    the exact values in the color palette table in section 3, not
    approximations. Shared styles for `.card`, `.btn`, `.kv`, `.steps`,
    `.alert`, `pre.block`, etc. Nothing hardcodes a color outside these
    variables — that discipline is what made the later accent-color swap
    (section 3's palette entry) a two-line change instead of a
    find-and-replace across every component. The toast's own styling lives
    scoped inside `ToastNotification.vue` rather than here, since it's a
    self-contained overlay component.
16. **`.gitignore`**: `node_modules`, `dist`, `.DS_Store`.
17. **`index.html`**: title set to "OAuth 2.0 Playground", plus an inline
    `<script>` somewhere in `<head>` that redirects `localhost` → the
    equivalent `127.0.0.1` URL before any Vue code runs (see Gotcha #10 —
    build this in from the start rather than discovering the bug later).
    Placement within `<head>` relative to the `meta`/`link`/`title` tags
    doesn't matter — they're inert markup, not scripts — only that it runs
    before the body's `<script type="module" src="/src/main.js">`, which it
    does anywhere in `<head>`. The actual file has it *after* the
    meta/link/title tags, not literally first.
18. **`README.md`**: Node version requirement (see Gotcha #5 — always state
    the version actually used on the target machine, not a build sandbox's
    version), setup instructions, and the cross-OS `node_modules` warning
    called out explicitly, not just buried in this file.
19. Verify with `npm run build` (should produce a `dist/` with no errors),
    then `npm run dev` and manually walk all three flows, including
    refreshing at least twice in a row on each to confirm token rotation
    displays correctly.

## 6. Gotchas hit while building this — don't repeat them

1. **`import.meta.env` cannot be used directly inside a Vue template
   interpolation** (`{{ import.meta.env.FOO }}`) — the Vue SFC compiler
   parses template expressions outside module scope and throws
   `import.meta may appear only with 'sourceType: "module"'`. Fix: assign
   `const foo = import.meta.env.FOO` in `<script setup>` and reference `foo`
   in the template instead. This applies to any single interpolation, not
   just repeated use.

2. **Fragile multi-line template interpolation inside `<pre>` blocks with
   `v-if`/`<template>` mixed in** produced weird whitespace and was hard to
   reason about (`RequestViewer`, `FlowDiagram`). Fix: build the exact
   display string in a `computed()` in `<script setup>` and interpolate the
   single computed value in the template.

3. **Vite's dev server default binding**: on some systems Vite listening on
   `localhost` only binds the IPv6 loopback (`::1`), so
   `http://127.0.0.1:5173` gets `ERR_CONNECTION_REFUSED` even though
   `http://localhost:5173` works. Since OAuth `redirect_uri`s must match
   **exactly** what's registered on the backend (which used `127.0.0.1`),
   this breaks the callback. Fix: in `vite.config.js`, set
   `server: { host: '127.0.0.1', port: 5173 }` explicitly.

4. **Token exchange fetch failures hung the UI forever on "Exchanging…"**:
   the original code did `const result = await exchangeToken(...)` with no
   try/catch — if `fetch()` itself threw (most commonly a CORS block, since
   the token/JWKS endpoints are on a different origin than the app), the
   `exchanging` ref was never reset to `false` and no error was ever shown.
   Fix: wrap the call in `try/catch/finally`, reset `exchanging.value = false`
   in `finally`, and show a specific message pointing at CORS as the likely
   cause with the raw error message included.

5. **Cross-platform `node_modules`**: running `npm install` for this project
   inside a Linux sandbox (e.g. an agent's build environment) and then trying
   to run it on macOS (or vice versa) breaks native optional dependencies
   (specifically `rolldown`'s platform-specific binding used by Vite) with
   `Cannot find native binding`. Fix: always run `npm install` natively on
   the machine you intend to run `npm run dev`/`npm run build` on. If you
   copy a project between environments, `rm -rf node_modules
   package-lock.json && npm install` fresh on the target machine.

6. **Chrome DevTools auto-probing breaks Spring Security's saved-request
   redirect**: when Chrome DevTools is open on the `127.0.0.1:8080` origin
   (the login page), Chrome automatically issues a request to
   `/.well-known/appspecific/com.chrome.devtools.json`. Since that path also
   requires authentication on this backend, Spring Security redirects it to
   `/login` and caches it as the "continue to after login" target
   (`RequestCache`). After a successful login, the browser lands on that
   bogus devtools probe URL (a 404 Whitelabel Error Page) instead of
   continuing back through `/oauth2/authorize` to the app's callback. This is
   **not a bug in the app** — the Spring session cookie is already set at
   this point, so the fix is just to go back to the app
   (`http://127.0.0.1:5173/authorization-code` or `/pkce`) and click "Start
   Authorization" again; it completes immediately without re-prompting for
   login, landing on the shared `/callback` route. To avoid it happening
   again, don't have DevTools' Network tab open on the `8080` origin while
   clicking "Start Authorization".

7. **PKCE token exchange still required client Basic auth** in this
   particular backend setup, contrary to the textbook "public client, no
   secret" PKCE model — see section 2b. Don't assume PKCE means no secret;
   always match what the backend actually requires.

8. **A shared redirect_uri means the callback URL alone can't tell you which
   flow you're in — and a naive fix (a single shared sessionStorage marker)
   is actively buggy, not just incomplete.** The first version of the merged
   callback used one flat `sessionStorage.setItem('oauth_flow', ...)` marker
   plus shared `oauth_state`/`oauth_code_verifier` keys for both flows. That
   broke in exactly the way you'd expect once someone actually used it: click
   "Authorization Code," then (before that redirect round-trip finishes —
   easy to do when login is already cached and the redirect is near-instant,
   or by using two tabs) click "PKCE" too, and the second `start()` overwrites
   the first's `oauth_flow`/`oauth_state` markers. Worse, the Authorization
   Code flow's `start()` was explicitly doing
   `sessionStorage.removeItem('oauth_code_verifier')` to "clean up," which
   wipes out an in-flight PKCE verifier if PKCE was started first. Net effect:
   the callback would sometimes resolve to the wrong flow entirely (wrong
   client id/secret used for the token exchange), and PKCE exchanges would
   sometimes fail with a missing/invalid `code_verifier`. **Don't build the
   shared-marker version at all — go straight to the fix:**
   - Bake the flow name into the `state` value itself:
     `randomState(flow)` → `` `${flow}.${randomHex}` ``. The authorization
     server echoes `state` back verbatim on redirect, so
     `parseFlowFromState(route.query.state)` on the callback is authoritative
     — it reflects *this specific request*, not whatever the last thing
     written to shared storage happened to be.
   - Give each flow **its own** sessionStorage keys, never shared:
     `oauth_state_authorization-code` for Authorization Code;
     `oauth_state_pkce` and `oauth_code_verifier_pkce` for PKCE. Starting one
     flow must never write to, read from, or clear the other flow's keys.
   - Only fall back to a manual "Which flow was this?" chooser when there's
     no `state` to parse at all (the paste-a-raw-code path with no query
     string), never as the primary mechanism.

9. **This workspace folder doesn't allow file deletion.** When
   `AuthorizationCallbackView.vue`/`PkceCallbackView.vue` were made obsolete
   by the merge into `CallbackView.vue`, `rm` on them failed with "Operation
   not permitted." They were left in place with a big `UNUSED` HTML comment
   at the top instead. If you're rebuilding from scratch (rather than editing
   this existing project), you won't hit this — just never create the
   per-flow callback views in the first place and go straight to the shared
   one.

10. **`localhost` and `127.0.0.1` are different origins to the browser, and
    `sessionStorage` is scoped per-origin.** Even though `vite.config.js`
    binds the dev server to `127.0.0.1` (Gotcha #3), the underlying TCP
    listener doesn't care what `Host` header the browser sends — visiting
    `http://localhost:5173/...` still loads the app fine. But since every
    `redirect_uri` in this project is registered as `127.0.0.1`, if you start
    the PKCE flow from a tab on `localhost:5173`, the `code_verifier` gets
    written to `localhost:5173`'s sessionStorage — then the redirect lands on
    `127.0.0.1:5173/callback`, a completely separate storage bucket, and the
    verifier reads back as `null`. The token exchange then fails on the
    backend with something like *"code_verifier is missing or invalid for
    registered client"*. Confusingly, no state-mismatch error shows either,
    because that check only fires when both the received and expected state
    values are non-null — here the expected-state lookup is also `null`, so
    the check is silently skipped. Symptoms: works fine sometimes, fails
    "randomly" other times, depending on which hostname the person happened
    to type or click through with. Fix: add a tiny inline script anywhere in
    `index.html`'s `<head>` (before any Vue code runs — see step 17 on why
    exact position within `<head>` doesn't matter) that checks
    `window.location.hostname === 'localhost'` and does a
    `window.location.replace(...)` to the equivalent `127.0.0.1` URL, so it's
    impossible to end up on the wrong origin by habit. When diagnosing a
    "PKCE verifier missing" report, the first question to ask is which
    hostname was in the address bar when "Start Authorization" was clicked.

11. **Code comments describing an old design silently go stale once the
    design changes underneath them, and nothing forces you to notice.**
    After Gotcha #8's fix (flow detected from `state`, not a shared
    sessionStorage marker), two comments were left behind still describing
    the pre-fix behavior: the one above the `/callback` route in
    `router/index.js`, and the one above `VITE_REDIRECT_URI` in `.env` —
    both still said "figures out which flow it's handling via a
    sessionStorage marker," which was exactly the bug that had just been
    fixed. Neither comment caused a runtime bug (they're just prose), but
    both would actively mislead anyone reading the code to understand the
    current design, including a future rebuild working from this file. This
    was only caught by a deliberate full-file audit, not by any test or
    build step. Lesson: when a fix changes *how* something works, grep for
    comments near the changed code (not just the code itself) before calling
    the fix done — and if you're doing a rebuild-fidelity pass like the one
    that caught this, treat comments as claims to verify against the actual
    code, not as documentation to trust.

12. **Wiring the router into `main.js` is easy to silently skip, and nothing
    at build time catches it.** `npm create vite@latest` (step 1) generates
    a default `src/main.js` that just does
    `createApp(App).mount('#app')` — no router. Step 2 builds
    `src/router/index.js`, but building the router file doesn't wire it in;
    that's a separate edit to `main.js` (`import router from './router'` +
    `.use(router)` before `.mount()`). Skip it and `vite build` still
    succeeds — `<router-view>`/`<router-link>` aren't build-time-checked
    against a registered plugin, they just silently fail to resolve at
    runtime, so the topbar renders but the page below it is blank and the
    flow-card links do nothing. This was caught by a from-scratch
    rebuild-and-diff test (see section 8), not by `npm run build`, because a
    successful build doesn't prove the app actually routes — only manually
    loading the dev server and clicking through the routes does. Don't treat
    "the build passed" as sufficient verification for this class of bug.

## 7. Explicit non-goals / things intentionally not done

- No production hardening (this is a teaching demo — secrets in frontend
  code, no logout flow, no PKCE-without-secret purity, no automatic
  access-token expiry countdown or auto-refresh — refreshing is always a
  manual click, on purpose, so the demo audience sees the request happen).
- No state management library (Pinia, etc.) — even the global toast is just
  a module-level `reactive()` singleton, not a full store.
- No component library, no CSS framework — intentionally minimal, hand-rolled
  CSS with custom properties for theming.
- No automated tests were written; verification was manual build checks
  (`npm run build`) plus walking the flows in-browser.

## 8. How to hand this to an AI assistant later

Give it: this whole file, plus confirmation of whichever backend contract
details have since changed (client ids/secrets, redirect URIs, whether CORS
is now configured on `/oauth2/token` and `/oauth2/jwks`, whether the PKCE
client still requires Basic auth, whether `refresh_token` is still enabled
for all three clients and still ignores `redirect_uri`). Ask it to follow
section 5 in order and cross-check section 6 before considering the build
done.

This file has been checked against the actual codebase twice, by two
different methods, and both caught real bugs the other missed:

1. **Read-and-cross-check audit**: every source file read and compared
   against every claim this file makes about it. Caught the stale comments
   in Gotcha #11 and the missing color-palette specifics — but missed the
   stale `.env` snippet duplicated inside this file's own step 3 (ironic,
   given that's exactly the failure mode Gotcha #11 is about) and the
   missing `main.js` router-wiring step, because reading files side-by-side
   with prose doesn't force you to actually *execute* the prose as
   instructions.
2. **From-scratch rebuild-and-diff test**: in a throwaway folder, build the
   project following only this file (section 5, in order, using no other
   source of truth), `npm run build` it, then `diff -r` the result against
   the real project. This is the stronger test, because it catches exactly
   the kind of gap the first method misses — anywhere this file is silent,
   ambiguous, or stale, the rebuild either diverges or (for the `main.js`
   case) doesn't work at all despite a clean build. It's what caught Gotcha
   #12 and the gaps fixed in steps 3, 6, and 10. `npm run build` succeeding
   is not sufficient evidence the rebuild is correct — it doesn't exercise
   routing, storage, or network calls — so also skim the rebuilt files for
   logic differences (not just diff noise like comments/whitespace) before
   trusting the result, the same way this pass did.

If you've made several changes since the last time this file was updated,
do **both** passes again rather than assuming incremental edits kept it
accurate — they catch different classes of drift.
