'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ─── Types ────────────────────────────────────────────────────────────────────
type LineItem = {
  id: string; description: string; quantity: number; unit_price_cents: number; sort_order: number
}
type Invoice = {
  id: string; invoice_number: string | null; status: string
  bill_to_name: string | null; bill_to_email: string | null
  bill_to_position: string | null; bill_to_address: string | null
  due_date: string | null; paid_at: string | null; notes: string | null
  tax_rate: number; service_fee_rate: number; amount_cents: number | null
  is_deposit: boolean; is_published: boolean
  project_name: string | null; business_name: string | null
  created_at: string; updated_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtMoney = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  sent:    { label: 'Outstanding', bg: '#F04D3D10', text: '#F04D3D', dot: '#F04D3D' },
  paid:    { label: 'Paid',        bg: '#f0fdf4',   text: '#16a34a', dot: '#22c55e' },
  overdue: { label: 'Overdue',     bg: '#fff1f2',   text: '#e11d48', dot: '#fb7185' },
  draft:   { label: 'Draft',       bg: '#f5f5f5',   text: '#999',    dot: '#ccc' },
}

// ─── Payment Form (inner — needs Elements context) ────────────────────────────
function PaymentForm({ invoiceId, total, onSuccess }: { invoiceId: string; total: number; onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePay = async () => {
    if (!stripe || !elements) return
    setPaying(true)
    setError(null)

    const { error: submitErr } = await elements.submit()
    if (submitErr) { setError(submitErr.message ?? 'Card error'); setPaying(false); return }

    const { error: confirmErr } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/dashboard/client/invoices/${invoiceId}?paid=1`,
      },
    })

    if (confirmErr) {
      setError(confirmErr.message ?? 'Payment failed. Please try again.')
      setPaying(false)
    } else {
      // Payment succeeded (no redirect needed)
      onSuccess()
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="text-red-500 text-sm shrink-0">⚠</span>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button
        onClick={handlePay}
        disabled={paying || !stripe}
        className="w-full py-3.5 rounded-xl text-white font-semibold text-sm transition disabled:opacity-50"
        style={{ background: paying ? '#999' : '#F04D3D' }}
      >
        {paying ? 'Processing…' : `Pay ${fmtMoney(total)} now`}
      </button>
      <p className="text-xs text-neutral-400 text-center flex items-center justify-center gap-1.5">
        <span>🔒</span> Secured by Stripe — Unless Creative never stores your card details
      </p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Stripe payment state
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loadingPayment, setLoadingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)
  const [showPayForm, setShowPayForm] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (!userId) { setNotFound(true); setLoading(false); return }

      const [{ data: inv }, { data: items }] = await Promise.all([
        supabase
          .from('invoices')
          .select(`*, projects:project_id(name), profiles:client_id(business_name)`)
          .eq('id', id)
          .eq('client_id', userId)
          .eq('is_published', true)
          .single(),
        supabase
          .from('invoice_line_items')
          .select('*')
          .eq('invoice_id', id)
          .order('sort_order'),
      ])

      if (!inv) { setNotFound(true); setLoading(false); return }

      const project_name = (Array.isArray(inv.projects) ? inv.projects[0] : inv.projects)?.name ?? null
      const business_name = (Array.isArray(inv.profiles) ? inv.profiles[0] : inv.profiles)?.business_name ?? null
      setInvoice({ ...inv, project_name, business_name })
      setLineItems(items ?? [])
      setLoading(false)

      // If redirected back from Stripe with ?paid=1
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('paid') === '1') {
        setPaid(true)
      }
    }
    load()
  }, [id])

  const initializePayment = async () => {
    if (!invoice) return
    setLoadingPayment(true)
    setPaymentError(null)
    try {
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.clientSecret) {
        setPaymentError(data.error ?? 'Could not initialize payment.')
        setLoadingPayment(false)
        return
      }
      setClientSecret(data.clientSecret)
      setShowPayForm(true)
    } catch {
      setPaymentError('Network error. Please try again.')
    }
    setLoadingPayment(false)
  }

  const handlePaymentSuccess = () => {
    setPaid(true)
    setShowPayForm(false)
    setInvoice((p) => p ? { ...p, status: 'paid', paid_at: new Date().toISOString() } : p)
  }

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading invoice…</div>
  if (notFound || !invoice) return (
    <div className="p-8 text-center space-y-3">
      <p className="text-sm text-neutral-400">Invoice not found.</p>
      <button onClick={() => router.push('/dashboard/client/invoices')} className="text-sm underline" style={{ color: '#F04D3D' }}>← Back to invoices</button>
    </div>
  )

  const subtotal = lineItems.reduce((s, i) => s + Math.round(i.quantity * i.unit_price_cents), 0)
  const taxRate = Number(invoice.tax_rate ?? 0)
  const taxAmount = Math.round(subtotal * taxRate)
  const serviceFeeRate = Number(invoice.service_fee_rate ?? 0.007)
  const serviceFeeAmount = Math.round(subtotal * serviceFeeRate)
  const total = subtotal + taxAmount + serviceFeeAmount

  const sc = STATUS_CONFIG[paid ? 'paid' : invoice.status] ?? STATUS_CONFIG['sent']
  const isPaid = paid || invoice.status === 'paid'
  const isPayable = !isPaid && ['sent', 'overdue'].includes(invoice.status)

  const stripeAppearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#F04D3D',
      colorBackground: '#ffffff',
      colorText: '#1a1a1a',
      colorDanger: '#e11d48',
      fontFamily: 'system-ui, sans-serif',
      borderRadius: '12px',
      spacingUnit: '4px',
    },
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-16">

      {/* Top bar */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <button onClick={() => router.push('/dashboard/client/invoices')}
            className="text-sm text-neutral-500 hover:text-black transition flex items-center gap-1">
            ← Invoices
          </button>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
              style={{ background: sc.bg, color: sc.text }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
              {sc.label}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* ── Paid confirmation banner ── */}
        {isPaid && (
          <div className="rounded-2xl px-6 py-4 flex items-center gap-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-green-800">Payment received — thank you!</p>
              <p className="text-sm text-green-600">
                {invoice.paid_at ? `Paid on ${fmtDate(invoice.paid_at)}` : 'This invoice has been paid.'}
              </p>
            </div>
          </div>
        )}

        {/* ── Payment form ── */}
        {isPayable && !showPayForm && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="font-bold text-neutral-900 text-lg">Ready to pay?</h2>
              <p className="text-sm text-neutral-500 mt-1">
                {fmtMoney(total)} due {invoice.due_date ? `by ${fmtDate(invoice.due_date)}` : 'now'}.
              </p>
            </div>
            {paymentError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{paymentError}</p>
            )}
            <button
              onClick={initializePayment}
              disabled={loadingPayment}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-sm transition disabled:opacity-50"
              style={{ background: '#F04D3D' }}
            >
              {loadingPayment ? 'Loading…' : `Pay ${fmtMoney(total)} →`}
            </button>
            <div className="flex items-start gap-3 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3">
              <span className="text-base mt-0.5">💸</span>
              <div>
                <p className="text-xs font-semibold text-neutral-700">Prefer to pay by e-transfer?</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Send to <span className="font-medium text-neutral-700">rileymelinaschmitz@gmail.com</span> with your invoice number in the message. Once received, your invoice will be marked as paid.
                </p>
              </div>
            </div>
          </div>
        )}

        {isPayable && showPayForm && clientSecret && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-neutral-900 text-lg">Enter payment details</h2>
              <button onClick={() => setShowPayForm(false)} className="text-xs text-neutral-400 hover:text-black transition">Cancel</button>
            </div>
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: stripeAppearance, locale: 'en-CA' }}
            >
              <PaymentForm invoiceId={invoice.id} total={total} onSuccess={handlePaymentSuccess} />
            </Elements>
          </div>
        )}

        {/* ── Invoice document ── */}
        <div className="bg-white rounded-3xl shadow-sm border border-neutral-200 overflow-hidden">

          {/* Header */}
          <div className="bg-black px-8 py-8 flex items-start justify-between gap-8">
            <div>
              <p className="text-white text-2xl font-bold tracking-tight">Unless Creative</p>
              <p className="text-neutral-400 text-sm mt-1">Brand Strategy Consultancy</p>
              <p className="text-neutral-500 text-xs mt-3">Calgary, AB</p>
              <p className="text-neutral-500 text-xs">admin@unlesscreative.com</p>
            </div>
            <div className="text-right">
              <p className="text-neutral-400 text-xs uppercase tracking-widest font-medium">
                {invoice.is_deposit ? 'Deposit Invoice' : 'Invoice'}
              </p>
              <p className="text-3xl font-bold mt-1" style={{ color: '#F04D3D' }}>{invoice.invoice_number ?? '—'}</p>
              <div className="mt-4 space-y-1">
                <div className="flex items-center justify-end gap-3">
                  <span className="text-neutral-500 text-xs">Issue Date</span>
                  <span className="text-neutral-300 text-xs">{fmtDate(invoice.created_at)}</span>
                </div>
                {invoice.due_date && (
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-neutral-500 text-xs">Due Date</span>
                    <span className={`text-xs font-medium ${invoice.status === 'overdue' ? 'text-red-400' : 'text-neutral-300'}`}>
                      {fmtDate(invoice.due_date)}
                    </span>
                  </div>
                )}
                {isPaid && invoice.paid_at && (
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-neutral-500 text-xs">Paid</span>
                    <span className="text-green-400 text-xs font-medium">{fmtDate(invoice.paid_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bill To / Project */}
          <div className="px-8 py-7 grid sm:grid-cols-2 gap-8 border-b border-neutral-100">
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Bill To</p>
              <div className="space-y-0.5">
                <p className="font-semibold text-neutral-900">{invoice.bill_to_name || '—'}</p>
                {invoice.bill_to_position && <p className="text-sm text-neutral-500">{invoice.bill_to_position}</p>}
                {invoice.bill_to_email && <p className="text-sm text-neutral-500">{invoice.bill_to_email}</p>}
                {invoice.bill_to_address && <p className="text-sm text-neutral-400 whitespace-pre-line">{invoice.bill_to_address}</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Project</p>
              <div className="space-y-1">
                {invoice.project_name && <p className="font-semibold text-neutral-900">{invoice.project_name}</p>}
                {invoice.business_name && <p className="text-sm text-neutral-500">{invoice.business_name}</p>}
                {!invoice.project_name && <p className="text-sm text-neutral-400">—</p>}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="px-8 py-7">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="text-left text-xs font-bold text-neutral-400 uppercase tracking-wider pb-3 w-full">Description</th>
                  <th className="text-right text-xs font-bold text-neutral-400 uppercase tracking-wider pb-3 px-4 whitespace-nowrap">Qty</th>
                  <th className="text-right text-xs font-bold text-neutral-400 uppercase tracking-wider pb-3 px-4 whitespace-nowrap">Rate</th>
                  <th className="text-right text-xs font-bold text-neutral-400 uppercase tracking-wider pb-3 whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {lineItems.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-neutral-400">No line items.</td></tr>
                )}
                {lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4"><span className="text-sm text-neutral-800">{item.description || '—'}</span></td>
                    <td className="py-3 px-4 text-right"><span className="text-sm text-neutral-600">{item.quantity}</span></td>
                    <td className="py-3 px-4 text-right"><span className="text-sm text-neutral-600">{fmtMoney(item.unit_price_cents)}</span></td>
                    <td className="py-3 text-right"><span className="text-sm font-medium text-neutral-900">{fmtMoney(Math.round(item.quantity * item.unit_price_cents))}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-8 pb-7">
            <div className="ml-auto w-full max-w-xs space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Subtotal</span>
                <span className="font-medium">{fmtMoney(subtotal)}</span>
              </div>
              {taxRate > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">GST ({(taxRate * 100).toFixed(1)}%)</span>
                  <span className="font-medium">{fmtMoney(taxAmount)}</span>
                </div>
              )}
              {serviceFeeRate > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Service Fee ({(serviceFeeRate * 100).toFixed(2)}%)</span>
                  <span className="font-medium">{fmtMoney(serviceFeeAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-neutral-200 pt-3 mt-1">
                <span className="font-bold text-neutral-900 text-base">Total</span>
                <span className="font-bold text-neutral-900 text-xl">{fmtMoney(total)}</span>
              </div>
              {isPaid && (
                <div className="flex items-center justify-between text-green-600 text-sm font-medium pt-1">
                  <span>Amount Paid</span>
                  <span>{fmtMoney(total)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="px-8 pb-7 border-t border-neutral-100 pt-6">
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Notes</p>
              <p className="text-sm text-neutral-600 whitespace-pre-line leading-relaxed">{invoice.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="bg-neutral-50 border-t border-neutral-100 px-8 py-5 flex items-center justify-between">
            <p className="text-xs text-neutral-400">Unless Creative · Calgary, AB · admin@unlesscreative.com</p>
            <p className="text-xs text-neutral-300">Thank you for your business.</p>
          </div>
        </div>

        <button onClick={() => router.push('/dashboard/client/invoices')}
          className="text-xs text-neutral-400 hover:text-black transition">
          ← Back to all invoices
        </button>
      </div>
    </div>
  )
}
