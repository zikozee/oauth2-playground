<script setup>
import { computed } from 'vue'

const props = defineProps({
  pkce: { type: Boolean, default: false },
  variant: { type: String, default: 'redirect' }, // 'redirect' | 'direct'
})

const diagram = computed(() => {
  if (props.variant === 'direct') {
    return [
      '        App                Authorization Server',
      '        │                          │',
      '        │  POST /oauth2/token      │',
      '        │  grant_type=custom_...   │',
      '        │  username + password     │',
      '        │ ───────────────────────► │',
      '        │                          │',
      '        │      (validates          │',
      '        │       credentials        │',
      '        │       directly — no      │',
      '        │       browser, no login  │',
      '        │       page, no redirect) │',
      '        │                          │',
      '        │  Access + Refresh Token  │',
      '        │ ◄─────────────────────── │',
    ].join('\n')
  }

  const exchangeLine = props.pkce ? '3. Exchange Code + code_verifier' : '3. Exchange Code'
  return [
    '     Browser              Authorization Server',
    '        │                          │',
    '        │  1. /oauth2/authorize    │',
    '        │ ───────────────────────► │',
    '        │                          │',
    '        │     Login / Consent      │',
    '        │                          │',
    '        │  2. Authorization Code   │',
    '        │ ◄─────────────────────── │',
    '        │                          │',
    `        │  ${exchangeLine}`,
    '        │ ───────────────────────► │',
    '        │                          │',
    '        │  4. Access Token         │',
    '        │ ◄─────────────────────── │',
  ].join('\n')
})
</script>

<template>
  <pre class="block mono" style="line-height: 1.4">{{ diagram }}</pre>
</template>
