<script setup>
import { ref, onMounted, watch } from 'vue'
import ToastNotification from './components/ToastNotification.vue'

const authServer = import.meta.env.VITE_AUTH_SERVER
const theme = ref('dark')

onMounted(() => {
  let saved = null
  try {
    saved = localStorage.getItem('theme')
  } catch {
    // ignore — private browsing / blocked storage
  }
  theme.value = saved === 'light' ? 'light' : 'dark'
  applyTheme()
})

watch(theme, applyTheme)

function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme.value)
  try {
    localStorage.setItem('theme', theme.value)
  } catch {
    // ignore
  }
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div class="topbar">
    <router-link class="brand" to="/">OAuth 2.0 Playground</router-link>
    <div style="display: flex; align-items: center; gap: 10px">
      <span class="badge">{{ authServer }}</span>
      <button class="btn secondary" style="padding: 6px 12px; font-size: 12px" @click="toggleTheme">
        {{ theme === 'dark' ? '☀ Light' : '● Dark' }}
      </button>
    </div>
  </div>
  <router-view />
  <ToastNotification />
</template>
