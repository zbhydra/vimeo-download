export interface SendCodeCooldownController {
  isActive(): boolean
  reset(): void
  start(): void
}

function formatCountdownLabel(baseLabel: string, remainingSeconds: number): string {
  return `${baseLabel} (${remainingSeconds}s)`
}

export function createSendCodeCooldown(
  button: HTMLButtonElement,
  baseLabel: string,
  durationSeconds = 60
): SendCodeCooldownController {
  let remainingSeconds = 0
  let timerId: number | null = null

  const renderIdle = (): void => {
    button.disabled = false
    button.textContent = baseLabel
  }

  const clearTimer = (): void => {
    if (timerId === null) {
      return
    }

    window.clearInterval(timerId)
    timerId = null
  }

  const reset = (): void => {
    clearTimer()
    remainingSeconds = 0
    renderIdle()
  }

  const start = (): void => {
    clearTimer()
    remainingSeconds = durationSeconds
    button.disabled = true
    button.textContent = formatCountdownLabel(baseLabel, remainingSeconds)

    timerId = window.setInterval(() => {
      remainingSeconds -= 1

      if (remainingSeconds <= 0) {
        reset()
        return
      }

      button.textContent = formatCountdownLabel(baseLabel, remainingSeconds)
    }, 1000)
  }

  renderIdle()

  return {
    isActive: () => timerId !== null,
    reset,
    start
  }
}
