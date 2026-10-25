import { readable } from 'svelte/store'

export const playerStatusNow = readable(Date.now(), set => {
  set(Date.now())
  const timer = setInterval(() => set(Date.now()), 1000)
  return () => clearInterval(timer)
})
