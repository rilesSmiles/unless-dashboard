'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type InvoiceDetail = {
  id: string
  invoice_number: string | null
  amount: number
  status: 'draft' | 'sent' | 'paid'
  created_at: string

  client_id: string | null

  bill_to_name: string | null
  bill_to_email: string | null
  bill_to_position: string | null
  bill_to_address: string | null

  business_name: string | null
  client_name: string | null

  project_name: string | null

  is_deposit: boolean
  project_total_cents: number | null
  deposit_percent_used: number | null
}

export default function AdminInvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('invoices')
        .select(
          `
          id,
          invoice_number,
          amount,
          status,
          created_at,
          client_id,
          bill_to_name,
          bill_to_email,
          bill_to_position,
          bill_to_address,
          is_deposit,
          project_total_cents,
          deposit_percent_used,

          projects:project_id ( name ),
          profiles:client_id ( business_name, name )
        `
        )
        .eq('id', invoiceId)
        .single()

      if (error || !data) {
        console.error('Load invoice error:', error)
        setInvoice(null)
        setLoading(false)
        return
      }

      const project =
        Array.isArray((data as any).projects)
          ? (data as any).projects?.[0]
          : (data as any).projects

      const profile =
        Array.isArray((data as any).profiles)
          ? (data as any).profiles?.[0]
          : (data as any).profiles

      const formatted: InvoiceDetail = {
        id: data.id,
        invoice_number: data.invoice_number ?? null,
        amount: data.amount,
        status: data.status,
        created_at: data.created_at,

        client_id: data.client_id ?? null,

        bill_to_name: data.bill_to_name ?? null,
        bill_to_email: data.bill_to_email ?? null,
        bill_to_position: data.bill_to_position ?? null,
        bill_to_address: data.bill_to_address ?? null,

        business_name: profile?.business_name ?? null,
        client_name: profile?.name ?? null,

        project_name: project?.name ?? null,

        is_deposit: data.is_deposit ?? false,
        project_total_cents: data.project_total_cents ?? null,
        deposit_percent_used: data.deposit_percent_used ?? null,
      }

      setInvoice(formatted)
      setLoading(false)
    }

    load()
  }, [invoiceId])

  const sendToClient = async () => {
    if (!invoice) return

    const { error } = await supabase
      .from('invoices')
      .update({ status: 'sent' })
      .eq('id', invoice.id)

    if (error) {
      alert('Failed to send invoice')
      console.error(error)
      return
    }

    setInvoice((prev) => (prev ? { ...prev, status: 'sent' } : prev))
  }

  const deleteInvoice = async () => {
    if (!invoice) return

    const confirmText = prompt(
      `Type DELETE to permanently delete invoice ${invoice.invoice_number ?? ''}`
    )

    if (confirmText !== 'DELETE') return

    setDeleting(true)

    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoice.id)

    setDeleting(false)

    if (error) {
      alert('Failed to delete invoice')
      console.error(error)
      return
    }

    router.push('/dashboard/admin/invoices')
  }

  if (loading) return <p className="p-8">Loading…</p>
  if (!invoice) return <p className="p-8">Invoice not found</p>

  const titleLeft = invoice.invoice_number ?? 'Draft'
  const titleRight = invoice.project_name ?? 'Project'

  const total = invoice.project_total_cents ?? null
  const depositPct = invoice.deposit_percent_used ?? null
  const showDepositBreakdown = Boolean(invoice.is_deposit && total && depositPct)

  // ✅ What we’ll show in Bill To:
  const billToBusiness = invoice.business_name ?? invoice.bill_to_name ?? '—'
  const billToPerson = invoice.client_name ?? null

  return (
    <div className="p-8 max-w-[1100px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start gap-6">
        <div>
          <p className="text-sm text-gray-500">Invoice</p>

          <h1 className="text-3xl font-bold flex items-center gap-2 flex-wrap">
            {titleLeft} • {titleRight}

            {invoice.is_deposit && (
              <span className="text-xs px-2 py-1 rounded-full bg-neutral-200 text-black">
                Deposit
              </span>
            )}
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Created: {new Date(invoice.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="text-right space-y-2">
          <p className="text-sm uppercase text-gray-500">{invoice.status}</p>

          <p className="text-2xl font-semibold">
            ${(invoice.amount / 100).toFixed(2)}
          </p>

          {showDepositBreakdown && (
            <p className="text-sm text-gray-500">
              {depositPct}% of ${(total! / 100).toFixed(2)}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            {invoice.status === 'draft' && (
              <button
                onClick={sendToClient}
                className="bg-black text-white px-4 py-2 rounded-lg"
              >
                Send to Client
              </button>
            )}

            <button
              onClick={deleteInvoice}
              disabled={deleting}
              className="border border-red-500 text-red-600 px-4 py-2 rounded-lg disabled:opacity-60"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>

          {invoice.status === 'sent' && (
            <p className="text-sm text-gray-500">Sent ✅</p>
          )}

          {invoice.status === 'paid' && (
            <p className="text-sm text-green-600">Paid 💸</p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="border rounded-xl p-4 space-y-2">
          <h3 className="font-semibold">Invoice Details</h3>

          <div className="text-sm text-gray-500">
            <p>Invoice #: {invoice.invoice_number ?? '—'}</p>
            <p>Project: {invoice.project_name ?? '—'}</p>
            {invoice.is_deposit ? <p>Type: Deposit</p> : <p>Type: Standard</p>}
            </div>
            {total && (
            <div className="pt-2 text-sm text-black">
              <p>Project Total:</p>
              <p className="font-bold text-lg">
                ${(total / 100).toFixed(2)}
              </p>
            </div>
          )}
        </div>

        {/* ✅ Bill To */}
        <div className="border rounded-xl p-4 space-y-2">
          <h3 className="font-semibold mb-2">Bill To</h3>

          {/* Business name first */}
          <p className="text-sm font-medium">
            {billToBusiness}
          </p>
<div>
          {/* Person name under it */}
          {billToPerson && (
            <p className="text-sm text-gray-500">
              {billToPerson}
            </p>
          )}

          {/* Position */}
          {invoice.bill_to_position && (
            <p className="text-sm text-gray-500">
              {invoice.bill_to_position}
            </p>
          )}

          {/* Email */}
          {invoice.bill_to_email && (
            <p className="text-sm text-gray-500">
              {invoice.bill_to_email}
            </p>
          )}

          {/* Address */}
          {invoice.bill_to_address && (
            <p className="text-sm text-gray-500 whitespace-pre-line pt-1">
              {invoice.bill_to_address}
            </p>
          )}
          </div>
        </div>

        {/* From */}
        <div className="border rounded-xl p-4 space-y-2">
          <h3 className="font-semibold">From</h3>
          <p className="text-sm">Unless Creative</p>

          <div className="text-sm text-gray-500">
            <p>Riley Schmitz</p>
            <p>Founder & CEO</p>
            <p>admin@unlesscreative.com</p>
            <p>204 Stage Coach Lane</p>
          </div>

        </div>
      </div>
    </div>
  )
}