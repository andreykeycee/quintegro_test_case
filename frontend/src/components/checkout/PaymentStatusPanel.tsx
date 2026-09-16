import React from 'react'
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type PaymentStatusView = 'pending' | 'action_required' | 'succeeded' | 'failed' | 'canceled' | 'expired'

interface PaymentStatusPanelProps {
  view: PaymentStatusView
  failureMessage?: string | null
  approvalUrl?: string | null
  amount?: number | null
  onBackToCart?: () => void
  onViewOrders?: () => void
}

const PaymentStatusPanel: React.FC<PaymentStatusPanelProps> = ({ view, failureMessage, approvalUrl, amount, onBackToCart, onViewOrders }) => {
  if (view === 'pending') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        <p className="text-gray-700 font-medium">Processing your payment...</p>
        <p className="text-sm text-gray-500">This can take a few seconds.</p>
      </div>
    )
  }

  if (view === 'action_required') {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <Clock className="h-10 w-10 text-blue-600" />
        <p className="text-gray-700 font-medium">Continue in the PayPal window to complete your payment.</p>
        {approvalUrl && (
          <Button
            onClick={() => { window.location.href = approvalUrl }}
            className="bg-[#0070ba] hover:bg-[#005ea6] text-white"
          >
            Continue to PayPal
          </Button>
        )}
      </div>
    )
  }

  if (view === 'succeeded') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <p className="text-gray-900 font-semibold text-lg">Payment successful</p>
        {amount != null && (
          <p className="text-sm text-gray-600">You paid ${amount.toFixed(2)}. Your order is confirmed.</p>
        )}
        {onViewOrders && (
          <Button onClick={onViewOrders} className="mt-2 bg-blue-600 hover:bg-blue-700 text-white">
            View your orders
          </Button>
        )}
      </div>
    )
  }

  if (view === 'expired') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <XCircle className="h-10 w-10 text-gray-400" />
        <p className="text-gray-700 font-medium">This checkout window has expired.</p>
        {onBackToCart && (
          <Button variant="outline" onClick={onBackToCart}>Back to cart</Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <XCircle className="h-10 w-10 text-red-500" />
      <p className="text-gray-900 font-medium">{view === 'canceled' ? 'Payment canceled.' : 'Payment declined.'}</p>
      {failureMessage && <p className="text-sm text-gray-500">{failureMessage}</p>}
      <p className="text-sm text-gray-600 mt-2">You can edit your cart or try another payment method below.</p>
    </div>
  )
}

export default PaymentStatusPanel
