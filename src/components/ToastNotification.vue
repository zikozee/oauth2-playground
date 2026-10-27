<script setup>
import { useToast } from '../composables/useToast'

const { toastState } = useToast()
</script>

<template>
  <Transition name="toast-fade">
    <div v-if="toastState.visible" class="toast" :key="toastState.key">
      <span>{{ toastState.message }}</span>
      <div class="toast-bar-track">
        <div
          class="toast-bar-fill"
          :style="{ animationDuration: `${toastState.duration}ms` }"
        ></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 10px;
  padding: 12px 16px;
  min-width: 200px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  z-index: 1000;
  font-size: 14px;
}

.toast-bar-track {
  margin-top: 8px;
  height: 3px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}

.toast-bar-fill {
  height: 100%;
  width: 100%;
  background: var(--accent);
  transform-origin: left;
  animation-name: toast-shrink;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

@keyframes toast-shrink {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
