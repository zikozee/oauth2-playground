# OAuth 2.0 Playground

A Vue 3 + Vite demo app that walks through three OAuth 2.0 flows step by
step against a real Spring Authorization Server, showing every request and
response instead of letting OAuth happen as an invisible redirect:

- **Authorization Code** — confidential client, client secret sent from the browser (demo only).
- **Authorization Code + PKCE** — adds a generated `code_verifier`/`code_challenge` pair.
- **Custom Grant (Password)** — no browser redirect at all; calls the token endpoint directly with a username, password, and a custom `grant_type`.

Every flow also supports refreshing its access token in place (the backend
rotates the refresh token on each use), and decoding + cryptographically
verifying an access token's signature against the server's JWKS.

See `BUILD_PROMPT.md` for the full backend contract, every design decision,
the exact color palette, and a list of every bug hit while building this
(worth reading before you touch the code).

## Requirements

- **Node.js 20.19+ or 22.12+** (run locally on Node **v26.9.0**). Vite 8
  will refuse to run on older Node versions.
- npm (ships with Node).
- A running Spring Authorization Server at the URL configured in `.env`
  (defaults to `http://127.0.0.1:8080`), with:
  - `http://127.0.0.1:5173/callback` registered as the redirect URI for
    **both** the Authorization Code client (`oidc-client`) and the PKCE
    client (`oidc-client2`) — they share the same URI; this app tells them
    apart from the `state` parameter, not the URL.
  - The Custom Grant client (`oidc-client4`) needs no redirect URI at all —
    it never goes through `/oauth2/authorize`.
  - All three clients need `grant_type=refresh_token` enabled, in addition
    to their primary grant type.
  - CORS enabled for the `http://127.0.0.1:5173` origin on `/oauth2/token`
    and `/oauth2/jwks` (the app calls both directly from browser JS).

## Setup

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:5173`. Use `127.0.0.1`, not `localhost` — the
app will auto-redirect if you type `localhost` by habit, since the two are
different origins as far as the browser's storage is concerned (see
`BUILD_PROMPT.md` Gotcha #10), but starting from `127.0.0.1` directly skips
that extra hop.

## ⚠️ Known issue: `node_modules` does not travel between operating systems

If `node_modules` was installed on a **different OS/architecture** than the
one you're running `npm run dev` on (for example: installed inside a Linux
build sandbox, then run on macOS — or copied from a Windows machine to a
Mac), `npm run dev` / `npm run build` will fail with an error like:

```
Error: Cannot find native binding. npm has a bug related to optional
dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i`
again after removing both package-lock.json and node_modules directory.

cause: Error: Cannot find module '@rolldown/binding-darwin-arm64'
```

This happens because Vite's bundler (`rolldown`) ships platform-specific
native binaries as optional dependencies, and npm's optional-dependency
resolution doesn't always re-resolve them correctly across platforms.

**Fix — reinstall natively on the machine you're actually running on:**

```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

Do this any time you move the project to a different OS, or if a fresh clone
was installed somewhere other than where you're now running it.

## Routes

- `/` — pick a flow.
- `/authorization-code`, `/pkce`, `/custom-grant` — start each flow.
- `/callback` — shared landing page for both Authorization Code and PKCE
  after the backend redirects back.

## Available scripts

- `npm run dev` — start the dev server (`http://127.0.0.1:5173`, bound
  explicitly in `vite.config.js` — see `BUILD_PROMPT.md` gotcha #3 for why).
- `npm run build` — production build to `dist/`.
- `npm run preview` — preview the production build locally.

## Configuration

All non-secret (and, for this demo only, the "secret") config lives in
`.env` as `VITE_*` variables — see that file for each client's ID, secret,
the shared redirect URI, the custom grant type, and scope.
