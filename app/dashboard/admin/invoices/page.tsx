'use client'

import { useEffect, useState } from 'react'

import { supabase } from '@/lib/supabase'

type Invoice = {
  id: string
  amount: number
  status: 'draft' | 'sent' | 'paid'
  created_at: string

  project_id: string | null
  client_id: string | null

  business_name: string | null
  project_name: string | null
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  /* ----------------------------
     Load Invoices
  -----------------------------*/
  useEffect(() => {
    const loadInvoices = async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          id,
          amount,
          status,
          created_at,
          project_id,
          client_id,

          projects (
            name
          ),

          profiles (
            business_name
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Load invoices error:', error)
        setLoading(false)
        return
      }

      const formatted: Invoice[] = (data || []).map(
        (invoice: any) => ({
          id: invoice.id,
          amount: invoice.amount,
          status: invoice.status,
          created_at: invoice.created_at,

          project_id: invoice.project_id,
          client_id: invoice.client_id,

          project_name: invoice.projects?.name ?? null,
          business_name:
            invoice.profiles?.business_name ?? null,
        })
      )

      setInvoices(formatted)
      setLoading(false)
    }

    loadInvoices()
  }, [])

  /* ----------------------------
     Stripe Checkout
  -----------------------------*/
  const startCheckout = async (invoiceId: string) => {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoiceId,
      }),
    })

    const data = await res.json()

    if (data.url) {
      window.location.href = data.url
    }
  }

  if (loading) {
    return <p className="p-8">Loading…</p>
  }

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-neutral-500 mt-1">
          Manage and send client invoices
        </p>
      </div>

      {/* Empty */}
      {invoices.length === 0 && (
        <p className="text-neutral-400">
          No invoices yet.
        </p>
      )}

      {/* Invoices */}
      <div className="space-y-4">

        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="border border-neutral-800 rounded-xl p-5 flex justify-between items-center bg-neutral-900"
          >

            {/* Info */}
            <div className="space-y-1">

              <p className="font-medium">
                {invoice.business_name || 'Client'}
              </p>

              <p className="text-sm text-neutral-400">
                {invoice.project_name || 'No project'}
              </p>

              <p className="text-xs text-neutral-500">
                {new Date(
                  invoice.created_at
                ).toLocaleDateString()}
              </p>
            </div>

            {/* Amount + Status */}
            <div className="text-right space-y-2">

              <p className="font-semibold text-lg">
                ${(invoice.amount / 100).toFixed(2)}
              </p>

              <span
                className={`text-xs px-3 py-1 rounded-full
                  ${
                    invoice.status === 'paid'
                      ? 'bg-green-900 text-green-300'
                      : invoice.status === 'sent'
                      ? 'bg-blue-900 text-blue-300'
                      : 'bg-neutral-800 text-neutral-400'
                  }
                `}
              >
                {invoice.status}
              </span>

              {/* Pay Button */}
              {invoice.status !== 'paid' && (
                <button
                  onClick={() =>
                    startCheckout(invoice.id)
                  }
                  className="block w-full mt-2 bg-black text-white px-4 py-2 rounded-lg hover:bg-neutral-800 transition"
                >
                  Send / Pay
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}