<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  method: { type: String, default: '' },
  url: { type: String, default: '' },
  headers: { type: Object, default: null },
  body: { type: Object, default: null },
})

const text = computed(() => {
  const lines = []
  if (props.method) lines.push(`${props.method} ${props.url}`)
  if (props.headers) {
    for (const [k, v] of Object.entries(props.headers)) lines.push(`${k}: ${v}`)
  }
  if (props.body) {
    if (lines.length) lines.push('')
    for (const [k, v] of Object.entries(props.body)) lines.push(`${k}=${v}`)
  }
  return lines.join('\n')
})
</script>

<template>
  <div>
    <p v-if="title" class="kv" style="margin-bottom: 6px">
      <span class="k">{{ title }}</span>
    </p>
    <pre class="block">{{ text }}</pre>
  </div>
</template>
