import React, { useEffect, useRef, useState } from 'react'
import { useParams, useHistory, useLocation, Redirect } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { Loader2 } from 'lucide-react'
import { GET_CHECKOUT_ORDER } from '../graphql/queries'
import { CREATE_PAYMENT_INTENT, CONFIRM_PAYMENT_INTENT, CANCEL_PAYMENT_INTENT } from '../graphql/mutations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PaymentMethodSelector from '../components/checkout/PaymentMethodSelector'
import CardPaymentForm, { CardFormValues } from '../components/checkout/CardPaymentForm'
import PayPalPaymentForm, { PayPalFormValues } from '../components/checkout/PayPalPaymentForm'
import PaymentStatusPanel, { PaymentStatusView } from '../components/checkout/PaymentStatusPanel'
import ExpiryCountdown from '../components/checkout/ExpiryCountdown'
import OrderSum from '../components/OrderSum'
import { useCheckoutPolling, POLL_INTERVAL_MS } from '../hooks/useCheckoutPolling'
import { newIdempotencyKey } from '../lib/idempotency'

type CheckoutView = 'loading' | 'method_select' | PaymentStatusView

// Pure function of server state - no local status machine, so refresh and
// browser-back-from-PayPal both fall out for free.
function deriveView(order: any): CheckoutView {
  if (order.status === 'finished') return 'succeeded'

  const intent = order.paymentIntent
  if (order.status === 'created') {
    if (intent && order.expiresInMs && (intent.status === 'failed' || intent.status === 'canceled')) {
      return intent.status === 'failed' ? 'failed' : 'canceled'
    }
    return 'expired'
  }

  // submited
  if (!intent) return 'method_select'
  if (intent.status === 'processing') return 'pending'
  if (intent.status === 'requires_action') return 'action_required'
  return 'method_select'
}

const CheckoutPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>()
  const history = useHistory()
  const location = useLocation()
  const queryParams = new URLSearchParams(location.search)
  const paypalReturn = queryParams.get('paypal')
  const paypalIntentId = queryParams.get('intent')

  const isAuthenticated = !!localStorage.getItem('auth_token')

  const [method, setMethod] = useState<'local_bank' | 'paypal'>('local_bank')
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey())
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [staleError, setStaleError] = useState<string | null>(null)
  const consecutiveFailuresRef = useRef(0)
  const paypalHandledRef = useRef(false)

  const { data, previousData, error, startPolling, stopPolling } = useQuery(GET_CHECKOUT_ORDER, {
    variables: { orderId },
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: false,
    errorPolicy: 'all',
    skip: !isAuthenticated,
  })

  // The chaos test middleware fails ~1 in 5 requests. A single failed poll
  // is noise, not a real problem - only flag it after 3 in a row, and keep
  // rendering the last good data in the meantime.
  useEffect(() => {
    if (error) {
      consecutiveFailuresRef.current += 1
      if (consecutiveFailuresRef.current >= 3) {
        setStaleError('Having trouble reaching the server. Retrying...')
      }
    } else if (data) {
      consecutiveFailuresRef.current = 0
      setStaleError(null)
    }
  }, [data, error])

  const order = data?.order ?? previousData?.order
  const intentStatus = order?.paymentIntent?.status

  useCheckoutPolling(intentStatus, startPolling, stopPolling)

  const [createPaymentIntent, { loading: creating }] = useMutation(CREATE_PAYMENT_INTENT)
  const [confirmPaymentIntent] = useMutation(CONFIRM_PAYMENT_INTENT)
  const [cancelPaymentIntent] = useMutation(CANCEL_PAYMENT_INTENT)

  // PayPal return leg: confirm (or cancel) exactly once, then strip the
  // query params so a refresh doesn't replay it.
  useEffect(() => {
    if (!order || paypalHandledRef.current) return
    if (!paypalReturn || !paypalIntentId) return

    paypalHandledRef.current = true
    const mutation = paypalReturn === 'cancel'
      ? cancelPaymentIntent({ variables: { orderId, intentId: paypalIntentId } })
      : confirmPaymentIntent({ variables: { orderId, intentId: paypalIntentId } })

    mutation
      .catch((err: Error) => setSubmitError(err.message))
      .finally(() => {
        history.replace(`/checkout/${orderId}`)
        startPolling(POLL_INTERVAL_MS)
      })
  }, [order, paypalReturn, paypalIntentId, orderId, confirmPaymentIntent, cancelPaymentIntent, history, startPolling])

  if (!isAuthenticated) {
    return <Redirect to="/login" />
  }

  if (!order) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const view = deriveView(order)

  const handleMethodChange = (m: 'local_bank' | 'paypal') => {
    setMethod(m)
    setIdempotencyKey(newIdempotencyKey())
    setSubmitError(null)
  }

  // The view derives from the polled order query, not from the mutation
  // result, so a synchronously-created intent needs the poll kicked off
  // immediately - a single one-shot refetch() would itself be vulnerable to
  // the chaos test middleware's 1-in-5 failure rate and could leave the form
  // stuck showing. Starting the interval instead is self-healing: any one
  // failed poll just gets retried 2.5s later.
  const handleSubmitCard = (card: CardFormValues) => {
    setSubmitError(null)
    createPaymentIntent({
      variables: { input: { orderId, provider: 'local_bank', idempotencyKey, card } },
    })
      .then(() => startPolling(POLL_INTERVAL_MS))
      .catch((err: Error) => setSubmitError(err.message))
  }

  const handleSubmitPayPal = (paypal: PayPalFormValues) => {
    setSubmitError(null)
    createPaymentIntent({
      variables: { input: { orderId, provider: 'paypal', idempotencyKey, paypal } },
    }).then(res => {
      const approvalUrl = res.data?.createPaymentIntent?.details?.approvalUrl
      if (approvalUrl) {
        window.location.href = approvalUrl
      } else {
        startPolling(POLL_INTERVAL_MS)
      }
    }).catch((err: Error) => setSubmitError(err.message))
  }

  const renderPaymentForm = () => (
    <>
      <PaymentMethodSelector value={method} onChange={handleMethodChange} disabled={creating} />
      {method === 'local_bank'
        ? <CardPaymentForm onSubmit={handleSubmitCard} submitting={creating} />
        : <PayPalPaymentForm onSubmit={handleSubmitPayPal} submitting={creating} />}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mt-4">
          <p className="text-sm text-red-600">{submitError}</p>
        </div>
      )}
    </>
  )

  return (
    <div className="max-w-lg mx-auto py-8">
      <Card className="shadow-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold text-gray-900">Checkout - Order #{orderId}</CardTitle>
          {order.expiresInMs != null && (
            <ExpiryCountdown expiresInMs={order.expiresInMs} paused={!!order.paymentPaused} />
          )}
        </CardHeader>
        <CardContent>
          {staleError && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
              <p className="text-sm text-yellow-700">{staleError}</p>
            </div>
          )}

          {view !== 'method_select' && view !== 'failed' && view !== 'canceled' && (
            <PaymentStatusPanel
              view={view as PaymentStatusView}
              approvalUrl={order.paymentIntent?.details?.approvalUrl}
              amount={order.paymentIntent?.amount}
              onBackToCart={() => history.push('/order')}
              onViewOrders={() => history.push('/order')}
            />
          )}

          {view === 'method_select' && renderPaymentForm()}

          {(view === 'failed' || view === 'canceled') && (
            <>
              <PaymentStatusPanel view={view} failureMessage={order.paymentIntent?.failureMessage} />
              <div className="mt-4">{renderPaymentForm()}</div>
              <div className="mt-4 text-center">
                <Button variant="ghost" onClick={() => history.push('/order')}>Edit cart instead</Button>
              </div>
            </>
          )}

          {view === 'method_select' && order.products?.length > 0 && (
            <div className="mt-2">
              <OrderSum orderId={order.orderId} products={order.products} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default CheckoutPage
