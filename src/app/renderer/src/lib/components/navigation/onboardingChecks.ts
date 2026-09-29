type OnboardingChecks = {
  account(): Promise<void>
  settings(): Promise<void>
  game(): Promise<boolean>
  binding(): Promise<void>
}

export function startOnboardingChecks(checks: OnboardingChecks) {
  let active = true
  let pending = false

  async function checkBinding() {
    const running = await checks.game()
    if (active && running) await checks.binding()
  }

  async function refresh(): Promise<void> {
    if (!active || pending) return
    pending = true
    try { await Promise.allSettled([checks.account(), checks.settings(), checkBinding()]) }
    finally { pending = false }
  }

  const timer = setInterval(() => void refresh(), 10_000)
  void refresh()
  return { refresh, stop() { active = false; clearInterval(timer) } }
}
