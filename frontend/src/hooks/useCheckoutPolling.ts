import { useEffect } from 'react'

export const POLL_INTERVAL_MS = 2500 // delayMiddleware adds 1.5s to every request - going lower just stacks requests
const MAX_POLL_MS = 6 * 60 * 1000 // safety cap above the payment-pause cap, so a wedged intent can't poll forever

/**
 * Drives Apollo's startPolling/startPolling imperatively from the payment
 * intent's status, rather than a changing pollInterval option, so polling
 * reliably stops on unmount, on a terminal status, or after a safety cap.
 */
export function useCheckoutPolling(
  intentStatus: string | undefined | null,
  startPolling: (ms: number) => void,
  stopPolling: () => void,
) {
  useEffect(() => {
    const active = intentStatus === 'processing' || intentStatus === 'requires_action'
    if (!active) {
      stopPolling()
      return
    }

    startPolling(POLL_INTERVAL_MS)
    const safetyTimer = setTimeout(() => stopPolling(), MAX_POLL_MS)

    return () => {
      clearTimeout(safetyTimer)
      stopPolling()
    }
  }, [intentStatus, startPolling, stopPolling])
}
