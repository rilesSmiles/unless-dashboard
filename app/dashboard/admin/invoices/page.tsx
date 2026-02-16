'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Invoice = {
  id: string
  amount: number
  status: string
  created_at: string

  project_name: string | null
  business_name: string | null
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)

  /* -----------------------
     Load Invoices
  ------------------------*/
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

  projects:project_id (
    name
  )
`)
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('Invoice load warning:', error)
      }

      const formatted =
  data?.map((inv: any) => ({
    id: inv.id,
    amount: inv.amount,
    status: inv.status,
    created_at: inv.created_at,

    project_name:
  inv.projects?.name ?? null,
  
    business_name:
      inv.profiles?.[0]?.business_name ?? null,
  })) || []

      setInvoices(formatted)
      setLoading(false)
    }

    loadInvoices()
  }, [])

  if (loading) {
    return <p className="p-8">Loading…</p>
  }

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">
          Invoices
        </h1>

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
            className="border rounded-xl p-4 flex justify-between items-center"
          >
            <div>
              <p className="font-medium">
                {inv.business_name || 'Client'}
              </p>

              <p className="text-sm text-gray-500">
                {inv.project_name || 'Project'}
              </p>
            </div>

            <div className="text-right">
              <p className="font-semibold">
                ${inv.amount / 100}
              </p>

              <p className="text-xs uppercase text-gray-500">
                {inv.status}
              </p>
            </div>
          </div>
        ))}

      </div>

      {/* Create Invoice Modal */}
      {showForm && (
        <CreateInvoiceModal
          onClose={() => setShowForm(false)}
          onCreated={(newInvoice) =>
            setInvoices([newInvoice, ...invoices])
          }
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
  onCreated: (i: any) => void
}) {
  const [amount, setAmount] = useState('')
  const [projectId, setProjectId] = useState('')

  const [projects, setProjects] = useState<any[]>([])

  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name')
      .then(({ data }) => {
        setProjects(data || [])
      })
  }, [])

  const createInvoice = async () => {
    if (!amount || !projectId) return

    const cents = Math.round(
      Number(amount) * 100
    )

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        project_id: projectId,
        amount: cents,
        status: 'draft',
      })
      .select()
      .single()

    if (error) {
      alert('Error creating invoice')
      console.error(error)
      return
    }

    onCreated(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      <div className="bg-neutral-900 rounded-xl p-6 w-full max-w-md space-y-4">

        <h3 className="font-semibold text-lg text-white">
          New Invoice
        </h3>

        {/* Project */}
        <select
          className="w-full border rounded p-2 bg-white"
          value={projectId}
          onChange={(e) =>
            setProjectId(e.target.value)
          }
        >
          <option value="">
            Select project
          </option>

          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Amount */}
        <input
          className="w-full border rounded p-2 bg-white"
          placeholder="Amount (ex: 2500)"
          value={amount}
          onChange={(e) =>
            setAmount(e.target.value)
          }
        />

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3">

          <button
            onClick={onClose}
            className="px-3 py-2"
          >
            Cancel
          </button>

          <button
            onClick={createInvoice}
            className="bg-white text-black px-4 py-2 rounded"
          >
            Create
          </button>

        </div>
      </div>
    </div>
  )
}