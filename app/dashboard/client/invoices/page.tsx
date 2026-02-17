'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'

type InvoiceRow = {
  id: string
  client_id: string
  project_id: string | null
  status: string | null
  is_published: boolean
  amount_cents: number | null
  currency: string | null
  hosted_invoice_url: string | null
  pdf_url: string | null
  stripe_invoice_id: string | null
  due_date: string | null
  created_at: string
  updated_at: string | null
}

// Optional join (if you want to show project name)
// This requires invoices.project_id + projects.id
type InvoiceRowWithProject = InvoiceRow & {
  projects?: { id: string; name: string }[] | null
}

function formatMoney(amountCents: number | null, currency: string | null) {
  if (amountCents == null) return '—'
  const cur = (currency || 'USD').toUpperCase()
  const amount = amountCents / 100
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${cur}`
  }
}

function formatDate(ts: string | null) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ts
  }
}

function statusPill(status: string | null) {
  const s = (status || 'unknown').toLowerCase()
  const base = 'text-[11px] px-2 py-1 rounded-full border'
  if (s === 'paid') return `${base} bg-green-50 border-green-200 text-green-700`
  if (s === 'sent') return `${base} bg-blue-50 border-blue-200 text-blue-700`
  if (s === 'open') return `${base} bg-blue-50 border-blue-200 text-blue-700`
  if (s === 'draft') return `${base} bg-gray-50 border-gray-200 text-gray-600`
  if (s === 'void' || s === 'uncollectible') return `${base} bg-red-50 border-red-200 text-red-700`
  return `${base} bg-gray-50 border-gray-200 text-gray-600`
}

export default function ClientInvoicesPage() {
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [invoices, setInvoices] = useState<InvoiceRowWithProject[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setErrorMsg(null)

      const { data: authData, error: authErr } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (authErr || !userId) {
        setErrorMsg('You must be signed in to view invoices.')
        setLoading(false)
        return
      }

      // IMPORTANT:
      // If RLS policy is: client_id = auth.uid() AND is_published = true,
      // you technically don't need the filters — but keeping them is fine.
      const { data, error } = await supabase
        .from('invoices')
        .select(
          `
          id,
          client_id,
          project_id,
          status,
          is_published,
          amount_cents,
          currency,
          hosted_invoice_url,
          pdf_url,
          stripe_invoice_id,
          due_date,
          created_at,
          projects:projects ( id, name )
        `
        )
        .eq('client_id', userId)
        .eq('is_published', true)
        .order('created_at', { ascending: false })

      if (error) {
  console.error('Load invoices error RAW:', error)

  try {
    console.error('typeof error:', typeof error)
    console.error('constructor:', (error as any)?.constructor?.name)
    console.error('toString:', String(error))
    console.error('own keys:', Object.keys(error as any))
    console.error('own props:', Object.getOwnPropertyNames(error as any))
    console.error('error.message:', (error as any)?.message)
    console.error('error.details:', (error as any)?.details)
    console.error('error.hint:', (error as any)?.hint)
    console.error('error.code:', (error as any)?.code)
    console.error('JSON.stringify(error):', JSON.stringify(error))
  } catch (e) {
    console.error('Could not introspect error:', e)
  }

  setErrorMsg('Could not load your invoices.')
  setInvoices([])
  setLoading(false)
  return
}

      setInvoices((data || []) as InvoiceRowWithProject[])
      setLoading(false)
    }

    load()
  }, [])

  const totalUnpaid = useMemo(() => {
    // Rough: counts anything not paid/void
    const open = invoices.filter((i) => {
      const s = (i.status || '').toLowerCase()
      return s !== 'paid' && s !== 'void' && s !== 'uncollectible'
    })
    const sum = open.reduce((acc, i) => acc + (i.amount_cents || 0), 0)
    const currency = invoices.find((i) => i.currency)?.currency || 'USD'
    return { sum, currency }
  }, [invoices])

  if (loading) return <p className="p-8">Loading…</p>

  return (
    <div className="p-8 space-y-6 max-w-[1100px] mx-auto">
      <div>
        <p className="text-sm text-gray-500">Billing</p>
        <h1 className="text-3xl font-bold">Invoices</h1>
      </div>

      {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}

      {/* Summary */}
      <div className="border rounded-2xl p-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">Outstanding (rough)</div>
          <div className="text-2xl font-semibold">{formatMoney(totalUnpaid.sum, totalUnpaid.currency)}</div>
          <div className="text-xs text-gray-500 pt-1">
            This is a simple estimate based on invoice status.
          </div>
        </div>

        <div className="text-xs text-gray-500 text-right">
          Showing published invoices only
        </div>
      </div>

      {/* List */}
      <div className="border rounded-2xl p-5 space-y-3">
        {invoices.length === 0 ? (
          <div className="text-sm text-gray-500">No invoices yet.</div>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => {
              const projectName = inv.projects?.[0]?.name || (inv.project_id ? 'Project' : null)
              const amount = formatMoney(inv.amount_cents, inv.currency)
              const status = inv.status || 'unknown'

              return (
                <div key={inv.id} className="border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold">{amount}</div>
                        <span className={statusPill(status)}>{status.toUpperCase()}</span>
                        {projectName ? (
                          <span className="text-xs text-gray-500">• {projectName}</span>
                        ) : null}
                      </div>

                      <div className="text-xs text-gray-500 pt-2 flex flex-wrap gap-x-3 gap-y-1">
                        <span>Issued {formatDate(inv.created_at)}</span>
                        <span>•</span>
                        <span>Due {formatDate(inv.due_date)}</span>
                        {inv.stripe_invoice_id ? (
                          <>
                            <span>•</span>
                            <span className="text-gray-400">Stripe: {inv.stripe_invoice_id.slice(0, 10)}…</span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {inv.pdf_url ? (
                        <button
                          type="button"
                          onClick={() => window.open(inv.pdf_url!, '_blank', 'noreferrer')}
                          className="border rounded-xl px-3 py-2 text-sm hover:border-black"
                        >
                          PDF
                        </button>
                      ) : null}

                      {inv.hosted_invoice_url ? (
                        <button
                          type="button"
                          onClick={() => window.open(inv.hosted_invoice_url!, '_blank', 'noreferrer')}
                          className="bg-black text-white rounded-xl px-3 py-2 text-sm"
                        >
                          View / Pay
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="bg-black text-white rounded-xl px-3 py-2 text-sm opacity-50"
                          title="No payment link available yet"
                        >
                          View / Pay
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}