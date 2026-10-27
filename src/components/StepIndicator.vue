<script setup>
defineProps({
  steps: { type: Array, required: true }, // [{ label }]
  current: { type: Number, required: true }, // 1-based
})
</script>

<template>
  <div class="steps">
    <span
      v-for="(step, i) in steps"
      :key="step.label"
      class="step"
      :class="{ active: i + 1 === current, done: i + 1 < current }"
    >
      {{ i + 1 }}. {{ step.label }}
    </span>
  </div>
</template>
