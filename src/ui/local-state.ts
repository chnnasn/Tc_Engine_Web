import { ref, watch, type Ref } from 'vue'

export function useLocalState<T>(key: string, initial: T, validate: (value: unknown) => value is T) {
  let value = initial
  try {
    const saved = localStorage.getItem(key)
    const parsed: unknown = saved ? JSON.parse(saved) : null
    if (validate(parsed)) value = parsed
  } catch {
    // Fall back to the provided value when storage is unavailable or corrupt.
  }

  const state = ref(value) as Ref<T>
  const storageError = ref(false)
  watch(state, next => {
    try {
      localStorage.setItem(key, JSON.stringify(next))
      storageError.value = false
    } catch {
      storageError.value = true
    }
  }, { deep: true })

  return { state, storageError }
}
