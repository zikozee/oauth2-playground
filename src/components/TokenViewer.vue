<script setup>
import { ref, watch } from 'vue'
import { decodeJwt, verifyJwtSignature } from '../services/jwt'
import { getPublicKey } from '../services/jwks'
import { showToast } from '../composables/useToast'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  jwt: { type: Boolean, default: false },
})

const visible = ref(false)
const showDecoded = ref(false)

// 'idle' | 'verifying' | 'valid' | 'invalid' | 'error'
const verifyStatus = ref('idle')
const verifyMessage = ref('')
const verifyKid = ref('')

function mask(v) {
  return '•'.repeat(Math.min(v.length, 48))
}

function copy() {
  navigator.clipboard?.writeText(props.value)
  showToast(`${props.label} copied to clipboard`)
}

const decoded = props.jwt ? decodeJwt(props.value) : null

watch(showDecoded, async (open) => {
  if (!open || !decoded || verifyStatus.value !== 'idle') return
  verifyStatus.value = 'verifying'
  try {
    const { key, kid } = await getPublicKey(decoded.header.kid)
    verifyKid.value = kid
    const ok = await verifyJwtSignature(props.value, key)
    verifyStatus.value = ok ? 'valid' : 'invalid'
    verifyMessage.value = ok
      ? "Signature checks out against the authorization server's JWKS."
      : 'Signature does NOT match this key — token may be altered or signed by someone else.'
  } catch (e) {
    verifyStatus.value = 'error'
    verifyMessage.value = `Could not verify: ${e.message}`
  }
})
</script>

<template>
  <div style="margin-bottom: 16px">
    <div class="kv" style="grid-template-columns: 1fr">
      <span class="k">{{ label }}</span>
    </div>
    <div class="mask-row">
      <pre class="block" style="flex: 1; margin: 4px 0">{{ visible ? value : mask(value) }}</pre>
    </div>
    <div class="mask-row" style="margin-top: 6px">
      <button class="btn secondary" @click="visible = !visible">{{ visible ? 'Hide' : 'Show' }}</button>
      <button class="btn secondary" @click="copy">Copy</button>
      <button v-if="jwt && decoded" class="btn secondary" @click="showDecoded = !showDecoded">
        {{ showDecoded ? 'Hide decoded JWT' : 'Decode Access Token' }}
      </button>
    </div>

    <div v-if="showDecoded && decoded" style="margin-top: 12px">
      <div v-if="verifyStatus === 'verifying'" class="alert info">
        Verifying signature against {{ decoded.header.kid }} from /oauth2/jwks…
      </div>
      <div v-else-if="verifyStatus === 'valid'" class="alert ok">
        ✓ Signature verified (kid: {{ verifyKid }}). {{ verifyMessage }}
      </div>
      <div v-else-if="verifyStatus === 'invalid'" class="alert err">
        ✗ Signature invalid (kid: {{ verifyKid }}). {{ verifyMessage }}
      </div>
      <div v-else-if="verifyStatus === 'error'" class="alert err">
        {{ verifyMessage }}
      </div>

      <p class="k" style="font-size: 12px; margin-bottom: 4px">HEADER</p>
      <pre class="block">{{ JSON.stringify(decoded.header, null, 2) }}</pre>
      <p class="k" style="font-size: 12px; margin: 12px 0 4px">PAYLOAD</p>
      <pre class="block">{{ JSON.stringify(decoded.payload, null, 2) }}</pre>
      <p class="k" style="font-size: 12px; margin: 12px 0 4px">SIGNATURE</p>
      <pre class="block">{{ decoded.signature }}</pre>
    </div>
  </div>
</template>
