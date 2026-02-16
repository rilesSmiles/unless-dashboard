'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Invoice = {
  id: string
  amount: number
  status: string
  created_at: string
  project_name: string | null
}

export default function ClientInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('invoices')
        .select(`
          id,
          amount,
          status,
          created_at,
          projects ( name )
        `)
        .eq('client_id', user.id)
        .in('status', ['sent', 'paid'])
        .order('created_at', { ascending: false })

      if (error) console.error(error)

      const formatted = (data || []).map((inv: any) => ({
        id: inv.id,
        amount: inv.amount,
        status: inv.status,
        created_at: inv.created_at,
        project_name: inv.projects?.[0]?.name ?? null,
      }))

      setInvoices(formatted)
      setLoading(false)
    }

    load()
  }, [])

  const payInvoice = async (invoiceId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ invoiceId }),
    })

    const data = await res.json()
    if (data.url) window.location.href = data.url
    else alert('Checkout failed')
  }

  if (loading) return <p className="p-8">Loading…</p>

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Invoices</h1>

      {invoices.map(inv => (
        <div key={inv.id} className="border rounded-xl p-4 flex justify-between">
          <div>
            <p className="font-medium">{inv.project_name || 'Project'}</p>
            <p className="text-sm text-gray-500">{inv.status}</p>
          </div>

          <div className="text-right">
            <p className="font-semibold">${(inv.amount / 100).toFixed(2)}</p>

            {inv.status !== 'paid' && (
              <button
                onClick={() => payInvoice(inv.id)}
                className="bg-black text-white px-4 py-2 rounded-lg mt-2"
              >
                Pay
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}