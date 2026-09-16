import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface PayPalFormValues {
  payerEmail: string
}

interface PayPalPaymentFormProps {
  onSubmit: (paypal: PayPalFormValues) => void
  submitting: boolean
}

const PayPalPaymentForm: React.FC<PayPalPaymentFormProps> = ({ onSubmit, submitting }) => {
  const [payerEmail, setPayerEmail] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(payerEmail)) {
      setError('Enter a valid email address')
      return
    }
    onSubmit({ payerEmail: payerEmail.trim() })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">PayPal email</label>
        <Input
          type="email"
          value={payerEmail}
          onChange={e => setPayerEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={submitting}
          required
        />
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      <Button
        type="submit"
        className="w-full h-11 bg-[#0070ba] hover:bg-[#005ea6] text-white font-medium"
        disabled={submitting}
      >
        {submitting ? 'Redirecting...' : 'Continue to PayPal'}
      </Button>
    </form>
  )
}

export default PayPalPaymentForm
