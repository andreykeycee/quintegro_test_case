import React from 'react'
import { Button } from '@/components/ui/button'

interface PaymentMethodSelectorProps {
  value: 'local_bank' | 'paypal'
  onChange: (method: 'local_bank' | 'paypal') => void
  disabled?: boolean
}

const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({ value, onChange, disabled }) => (
  <div className="flex gap-2 mb-6">
    <Button
      type="button"
      variant={value === 'local_bank' ? 'default' : 'outline'}
      onClick={() => onChange('local_bank')}
      disabled={disabled}
      className="flex-1"
    >
      Card
    </Button>
    <Button
      type="button"
      variant={value === 'paypal' ? 'default' : 'outline'}
      onClick={() => onChange('paypal')}
      disabled={disabled}
      className="flex-1"
    >
      PayPal
    </Button>
  </div>
)

export default PaymentMethodSelector
