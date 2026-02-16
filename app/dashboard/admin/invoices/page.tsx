'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Invoice = {
  id: string
  invoice_number: string | null
  amount: number
  status: 'draft' | 'sent' | 'paid'
  created_at: string

  project_id: string | null
  client_id: string | null

  // deposit metadata
  is_deposit: boolean

  project_name: string | null
  business_name: string | null
}

type ProjectOption = {
  id: string
  name: string
  client_id: string | null
  business_name: string | null

  price_cents: number | null
  deposit_percent: number | null
}

type ClientProfile = {
  name: string | null
  email: string | null
  position: string | null
  address: string | null
  business_name: string | null
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const router = useRouter()
  const openInvoice = (id: string) => {
    router.push(`/dashboard/admin/invoices/${id}`)
  }

  /* -----------------------
     Load Invoices
  ------------------------*/
  useEffect(() => {
    const loadInvoices = async () => {
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
          project_id,
          client_id,
          is_deposit,

          projects:project_id (
            name
          ),

          profiles:client_id (
            business_name
          )
        `
        )
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('Invoice load warning:', error)
      }

      const formatted: Invoice[] = (data || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number ?? null,
        amount: inv.amount,
        status: inv.status,
        created_at: inv.created_at,

        project_id: inv.project_id ?? null,
        client_id: inv.client_id ?? null,

        is_deposit: inv.is_deposit ?? false,

        project_name: inv.projects?.name ?? null,
        business_name: inv.profiles?.business_name ?? null,
      }))

      setInvoices(formatted)
      setLoading(false)
    }

    loadInvoices()
  }, [])

  /* -----------------------
     Send (publish) Invoice
  ------------------------*/
  const sendInvoice = async (invoiceId: string) => {
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'sent' })
      .eq('id', invoiceId)

    if (error) {
      console.error(error)
      alert('Failed to send invoice')
      return
    }

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'sent' } : inv
      )
    )
  }

  if (loading) return <p className="p-8">Loading…</p>

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-gray-500">
            Drafts, sent invoices, and paid invoices live here.
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="bg-black text-white px-4 py-2 rounded-lg"
        >
          + New Invoice
        </button>
      </div>

      {/* Empty State */}
      {invoices.length === 0 && (
        <div className="border border-dashed rounded-xl p-10 text-center text-gray-400">
          No invoices yet ✨
        </div>
      )}

      {/* List */}
      <div className="grid gap-3">
        {invoices.map((inv) => (
          <div
            key={inv.id}
            onClick={() => openInvoice(inv.id)}
            className="border rounded-xl p-4 flex justify-between items-center cursor-pointer hover:border-neutral-600 transition"
          >
            <div>
              <p className="font-medium">
                {(inv.invoice_number ?? 'Draft') + ' • ' + (inv.project_name || 'Project')}
                {inv.is_deposit ? (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-white">
                    Deposit
                  </span>
                ) : null}
              </p>

              <p className="text-sm text-gray-500">
                {inv.business_name || 'Client'}
              </p>

              <p className="text-xs text-gray-400 mt-1">
                {new Date(inv.created_at).toLocaleDateString()}
              </p>
            </div>

            <div className="text-right">
              <p className="font-semibold">
                ${(inv.amount / 100).toFixed(2)}
              </p>

              <p className="text-xs uppercase text-gray-500">
                {inv.status}
              </p>

              {/* IMPORTANT: stop click from opening invoice */}
              {inv.status === 'draft' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    sendInvoice(inv.id)
                  }}
                  className="bg-black text-white px-4 py-2 rounded-lg mt-2"
                >
                  Send to Client
                </button>
              )}

              {inv.status === 'sent' && (
                <p className="text-xs text-gray-500 mt-2">Sent ✅</p>
              )}

              {inv.status === 'paid' && (
                <p className="text-xs text-green-600 mt-2">Paid 💸</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Invoice Modal */}
      {showForm && (
        <CreateInvoiceModal
          onClose={() => setShowForm(false)}
          onCreated={(newInvoice) => setInvoices([newInvoice, ...invoices])}
        />
      )}
    </div>
  )
}

/* -----------------------------------
   Modal (inline for now)
------------------------------------*/

function CreateInvoiceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (i: Invoice) => void
}) {
  const [amount, setAmount] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [saving, setSaving] = useState(false)

  const [isDeposit, setIsDeposit] = useState(false)

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  )

  useEffect(() => {
    const loadProjects = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(
          `
          id,
          name,
          client_id,
          price_cents,
          deposit_percent,
          profiles:client_id (
            business_name
          )
        `
        )
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Load projects error:', error)
        return
      }

      const formatted: ProjectOption[] = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        client_id: p.client_id ?? null,
        business_name: p.profiles?.business_name ?? null,

        price_cents: p.price_cents ?? null,
        deposit_percent: p.deposit_percent ?? 50,
      }))

      setProjects(formatted)
    }

    loadProjects()
  }, [])

  // ✅ Auto-fill amount based on project price + deposit toggle
  useEffect(() => {
    if (!selectedProject?.price_cents) return

    const pct = selectedProject.deposit_percent ?? 50
    const cents = isDeposit
      ? Math.round(selectedProject.price_cents * (pct / 50))
      : selectedProject.price_cents

    setAmount((cents / 100).toFixed(2))
  }, [selectedProject, isDeposit])

  const createInvoice = async () => {
    if (!amount || !projectId) return

    const selected = selectedProject

    if (!selected?.client_id) {
      alert('This project has no client attached yet.')
      return
    }

    const cents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(cents) || cents <= 0) {
      alert('Please enter a valid amount.')
      return
    }

    setSaving(true)

    // ✅ Fetch client profile FIRST (for bill-to snapshot)
    const { data: clientProfile, error: clientErr } = await supabase
      .from('profiles')
      .select('name, email, position, address, business_name')
      .eq('id', selected.client_id)
      .single()

    if (clientErr || !clientProfile) {
      setSaving(false)
      alert('Could not load client details.')
      console.error('Client profile error:', clientErr)
      return
    }

    const p = clientProfile as ClientProfile

    const projectTotal = selected.price_cents ?? cents
    const depositPct = selected.deposit_percent ?? 50

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        project_id: projectId,
        client_id: selected.client_id,
        amount: cents,
        status: 'draft',

        is_deposit: isDeposit,
        project_total_cents: projectTotal,
        deposit_percent_used: isDeposit ? depositPct : null,

        bill_to_name: p.business_name ?? p.name ?? null,
        bill_to_email: p.email ?? null,
        bill_to_position: p.position ?? null,
        bill_to_address: p.address ?? null,
      })
      .select('id, invoice_number, amount, status, created_at, project_id, client_id, is_deposit')
      .single()

    setSaving(false)

    if (error) {
      alert('Error creating invoice')
      console.error('Create invoice error:', error, JSON.stringify(error))
      return
    }

    const formatted: Invoice = {
      id: data.id,
      invoice_number: data.invoice_number ?? null,
      amount: data.amount,
      status: data.status as Invoice['status'],
      created_at: data.created_at,
      project_id: data.project_id ?? null,
      client_id: data.client_id ?? null,

      is_deposit: data.is_deposit ?? false,

      project_name: selected.name ?? null,
      business_name: selected.business_name ?? null,
    }

    onCreated(formatted)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-xl p-6 w-full max-w-md space-y-4">
        <h3 className="font-semibold text-lg text-white">New Invoice</h3>

        {/* Project */}
        <select
          className="w-full border rounded p-2 bg-white"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">Select project</option>

          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.business_name ? ` — ${p.business_name}` : ''}
            </option>
          ))}
        </select>

        {/* Deposit toggle */}
        <div className="flex items-center justify-between">
          <label className="text-white text-sm">Deposit invoice</label>
          <button
            type="button"
            onClick={() => setIsDeposit((v) => !v)}
            className={`px-3 py-1 rounded-full text-sm ${
              isDeposit ? 'bg-white text-black' : 'bg-neutral-800 text-white'
            }`}
          >
            {isDeposit ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Amount */}
        <input
          className="w-full border rounded p-2 bg-white"
          placeholder="Amount (ex: 2500)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3">
          <button onClick={onClose} className="px-3 py-2 text-white/80">
            Cancel
          </button>

          <button
            onClick={createInvoice}
            disabled={saving}
            className="bg-white text-black px-4 py-2 rounded disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}