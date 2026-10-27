<script setup>
import { loginUrl } from '../services/oauth'
</script>

<template>
  <div class="page">
    <h1>OAuth 2.0 Playground</h1>
    <p style="color: var(--muted)">
      Learn how OAuth 2.0 authorization flows work by stepping through each request against
      a real Spring Authorization Server.
    </p>

    <div class="grid-2">
      <div class="flow-card">
        <h3>Authorization Code</h3>
        <p>Confidential client. Client id + secret are used during the token exchange.</p>
        <router-link class="btn" to="/authorization-code">Explore Flow →</router-link>
      </div>
      <div class="flow-card">
        <h3>Authorization Code + PKCE</h3>
        <p>Uses a generated code_verifier / code_challenge pair instead of relying on a static secret alone.</p>
        <router-link class="btn" to="/pkce">Explore Flow →</router-link>
      </div>
      <div class="flow-card">
        <h3>Custom Grant (Password)</h3>
        <p>No browser redirect at all — calls the token endpoint directly with a username, password, and a custom grant_type.</p>
        <router-link class="btn" to="/custom-grant">Explore Flow →</router-link>
      </div>
    </div>

    <div class="card" style="margin-top: 24px">
      <h2 style="margin-top: 0">Manual login</h2>
      <p style="color: var(--muted); font-size: 14px">
        Starting either flow above should redirect you to the login page automatically if you
        aren't authenticated yet. You can also open it directly:
      </p>
      <a class="btn secondary" :href="loginUrl()" target="_blank" rel="noopener">Open Login Page</a>
    </div>
  </div>
</template>
