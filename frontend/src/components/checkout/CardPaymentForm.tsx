import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCardNumber, luhnValid, isExpiryValid, parseExpiry, detectBrand } from '../../lib/cardFormat'

export interface CardFormValues {
  name: string
  number: string
  cvv: string
  expMonth: number
  expYear: number
}

interface CardPaymentFormProps {
  onSubmit: (card: CardFormValues) => void
  submitting: boolean
}

const CardPaymentForm: React.FC<CardPaymentFormProps> = ({ onSubmit, submitting }) => {
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [error, setError] = useState('')

  const digits = number.replace(/\D/g, '')
  const brand = detectBrand(digits)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Name on card is required')
      return
    }
    if (!luhnValid(digits)) {
      setError('Card number is invalid')
      return
    }
    const parsedExpiry = parseExpiry(expiry)
    if (!parsedExpiry || !isExpiryValid(parsedExpiry.month, parsedExpiry.year)) {
      setError('Card expiry is invalid or in the past')
      return
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      setError('CVV is invalid')
      return
    }

    onSubmit({ name: name.trim(), number: digits, cvv, expMonth: parsedExpiry.month, expYear: parsedExpiry.year })

    // Card data has no reason to linger in React state once it's been sent.
    setNumber('')
    setCvv('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Name on card</label>
        <Input
          autoComplete="cc-name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={submitting}
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Card number
          {brand !== 'unknown' && <span className="ml-2 text-xs text-gray-400 uppercase">{brand}</span>}
        </label>
        <Input
          autoComplete="cc-number"
          inputMode="numeric"
          value={formatCardNumber(number)}
          onChange={e => setNumber(e.target.value)}
          maxLength={23}
          placeholder="4242 4242 4242 4242"
          disabled={submitting}
          required
        />
      </div>
      <div className="flex gap-4">
        <div className="space-y-2 flex-1">
          <label className="text-sm font-medium text-gray-700">Expiry (MM/YY)</label>
          <Input
            autoComplete="cc-exp"
            inputMode="numeric"
            placeholder="12/30"
            value={expiry}
            onChange={e => setExpiry(e.target.value)}
            disabled={submitting}
            required
          />
        </div>
        <div className="space-y-2 w-24">
          <label className="text-sm font-medium text-gray-700">CVV</label>
          <Input
            autoComplete="cc-csc"
            inputMode="numeric"
            maxLength={4}
            value={cvv}
            onChange={e => setCvv(e.target.value.replace(/\D/g, ''))}
            disabled={submitting}
            required
          />
        </div>
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      <Button
        type="submit"
        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
        disabled={submitting}
      >
        {submitting ? 'Processing...' : 'Pay with card'}
      </Button>
    </form>
  )
}

export default CardPaymentForm
