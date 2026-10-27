// Tiny global toast singleton — one reactive state shared by every caller,
// so any component can trigger a notification without prop/event plumbing.
import { reactive } from 'vue'

const state = reactive({
  visible: false,
  message: '',
  duration: 2000,
  // Bumped on every call so the toast component can restart its animation
  // even if the same message is shown again while one is already visible.
  key: 0,
})

let hideTimer = null

export function showToast(message, duration = 2000) {
  clearTimeout(hideTimer)
  state.message = message
  state.duration = duration
  state.visible = true
  state.key += 1
  hideTimer = setTimeout(() => {
    state.visible = false
  }, duration)
}

export function useToast() {
  return { toastState: state, showToast }
}
