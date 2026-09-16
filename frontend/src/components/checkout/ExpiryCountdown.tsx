import React, { useEffect, useRef, useState } from 'react'

interface ExpiryCountdownProps {
  expiresInMs: number
  paused: boolean
}

const format = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Anchors on expiresInMs (server-computed remaining time) rather than a
// client-derived deadline, so a skewed local clock can't show a wrong or
// already-expired countdown. Re-anchors on every fresh value from a poll.
const ExpiryCountdown: React.FC<ExpiryCountdownProps> = ({ expiresInMs, paused }) => {
  const deadlineRef = useRef<number>(Date.now() + expiresInMs)
  const [display, setDisplay] = useState(expiresInMs)

  useEffect(() => {
    deadlineRef.current = Date.now() + expiresInMs
    setDisplay(expiresInMs)
  }, [expiresInMs])

  useEffect(() => {
    if (paused) return
    const interval = setInterval(() => {
      setDisplay(Math.max(0, deadlineRef.current - Date.now()))
    }, 1000)
    return () => clearInterval(interval)
  }, [paused])

  if (paused) {
    return (
      <p className="text-sm text-gray-600">
        Payment in progress - checkout time is on hold ({format(display)} remaining)
      </p>
    )
  }

  return (
    <p className="text-sm text-gray-600">
      Time remaining: <span className="font-mono font-medium">{format(display)}</span>
    </p>
  )
}

export default ExpiryCountdown
