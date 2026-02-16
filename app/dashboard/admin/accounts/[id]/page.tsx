'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Client = {
  id: string
  business_name: string | null
  name: string | null
  position: string | null
  email: string | null
  phone: string | null
  address: string | null
  role: string | null
}

type Contact = {
  id: string
  client_id: string
  name: string | null
  position: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
  created_at: string
}

type Project = {
  id: string
  name: string
  client_id: string | null
  project_type: string | null
  created_at: string
}

type Invoice = {
  id: string
  invoice_number: string | null
  amount: number
  status: 'draft' | 'sent' | 'paid'
  created_at: string
  client_id: string | null
}

export default function AdminAccountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])

  const [loading, setLoading] = useState(true)

  const [showAddContact, setShowAddContact] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

  const [deletingClient, setDeletingClient] = useState(false)
  const [busyContactId, setBusyContactId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      // 1) Client
      const { data: c, error: cErr } = await supabase
        .from('profiles')
        .select('id, business_name, name, position, email, phone, address, role')
        .eq('id', clientId)
        .single()

      if (cErr || !c) {
        console.error('Load client error:', cErr)
        setClient(null)
        setLoading(false)
        return
      }

      // 2) Contacts
      const { data: contactData, error: contactErr } = await supabase
        .from('client_contacts')
        .select('id, client_id, name, position, email, phone, is_primary, created_at')
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })

      if (contactErr) console.error('Load contacts error:', contactErr)

      // 3) Projects
      const { data: projectData, error: projectErr } = await supabase
        .from('projects')
        .select('id, name, client_id, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

      if (projectErr) console.error('Load projects error:', projectErr)

      // 4) Outstanding invoices
      const { data: invoiceData, error: invoiceErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, amount, status, created_at, client_id')
        .eq('client_id', clientId)
        .in('status', ['draft', 'sent'])
        .order('created_at', { ascending: false })

      if (invoiceErr) console.error('Load invoices error:', invoiceErr)

      setClient(c as Client)
      setContacts((contactData || []) as Contact[])
      setProjects((projectData || []) as Project[])
      setInvoices((invoiceData || []) as Invoice[])
      setLoading(false)
    }

    load()
  }, [clientId])

  const primaryContact = useMemo(() => {
    return contacts.find((c) => c.is_primary) ?? contacts[0] ?? null
  }, [contacts])

  // ✅ + button actions (go to creation flows)
  const goToCreateInvoice = () => {
    router.push(`/dashboard/admin/invoices?clientId=${clientId}&openNew=1`)
  }

  // NOTE: If your "create project" route is different, change it here.
  const goToCreateProject = () => {
    router.push(`/dashboard/admin/projects/new?clientId=${clientId}`)
  }

  const deleteContact = async (contactId: string) => {
    const ok = confirm('Delete this contact?')
    if (!ok) return

    setBusyContactId(contactId)

    const { error } = await supabase
      .from('client_contacts')
      .delete()
      .eq('id', contactId)

    setBusyContactId(null)

    if (error) {
      alert('Failed to delete contact')
      console.error(error)
      return
    }

    setContacts((prev) => prev.filter((c) => c.id !== contactId))
  }

  const deleteClient = async () => {
    if (!client) return

    const typed = prompt(
      `Type DELETE to permanently delete ${client.business_name ?? 'this client'}`
    )
    if (typed !== 'DELETE') return

    setDeletingClient(true)

    // optional: delete contacts first (depends on your FK rules)
    await supabase
      .from('client_contacts')
      .delete()
      .eq('client_id', clientId)

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', clientId)

    setDeletingClient(false)

    if (error) {
      alert('Failed to delete client')
      console.error(error)
      return
    }

    router.push('/dashboard/admin/accounts')
  }

  if (loading) return <p className="p-8">Loading…</p>
  if (!client) return <p className="p-8">Client not found</p>

  const displayName =
    client.business_name ?? primaryContact?.name ?? client.name ?? 'Client'

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-sm text-gray-500">Account</p>
          <h1 className="text-3xl font-bold">{displayName}</h1>

          <p className="text-sm text-gray-500 mt-1">
            {client.address ? (
              <span className="whitespace-pre-line">{client.address}</span>
            ) : (
              '—'
            )}
          </p>
        </div>

        <button
          onClick={() => router.push('/dashboard/admin/accounts')}
          className="text-sm underline text-neutral-600 hover:text-black"
        >
          Back to Accounts
        </button>
      </div>

      {/* Top grid */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Profile */}
        <div className="border rounded-2xl p-5 space-y-2">
          <h2 className="font-semibold">Client Profile</h2>

          <div className="text-sm text-gray-600 space-y-1">
            <p>
              Business:{' '}
              <span className="text-black">{client.business_name ?? '—'}</span>
            </p>
            <p>
              Primary:{' '}
              <span className="text-black">
                {primaryContact?.name ?? client.name ?? '—'}
              </span>
              {(primaryContact?.position ?? client.position)
                ? ` • ${primaryContact?.position ?? client.position}`
                : ''}
            </p>
            <p>
              Email:{' '}
              <span className="text-black">
                {primaryContact?.email ?? client.email ?? '—'}
              </span>
            </p>
            <p>
              Phone:{' '}
              <span className="text-black">
                {primaryContact?.phone ?? client.phone ?? '—'}
              </span>
            </p>
          </div>
        </div>

        {/* Outstanding invoices */}
        <div className="border rounded-2xl p-5 relative">
          <h2 className="font-semibold mb-3">Outstanding Invoices</h2>

          {/* ✅ + goes to invoice create flow */}
          <button
            onClick={goToCreateInvoice}
            className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-black text-white flex items-center justify-center hover:opacity-90"
            title="Create invoice"
          >
            +
          </button>

          {invoices.length === 0 ? (
            <p className="text-sm text-gray-500">None 🎉</p>
          ) : (
            <div className="space-y-2">
              {invoices.slice(0, 6).map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => router.push(`/dashboard/admin/invoices/${inv.id}`)}
                  className="w-full text-left rounded-xl border px-4 py-3 hover:border-neutral-500 transition"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">
                        {inv.invoice_number ?? 'Draft Invoice'}
                      </p>
                      <p className="text-xs uppercase text-gray-500">
                        {inv.status}
                      </p>
                    </div>

                    <p className="text-sm font-semibold">
                      ${(inv.amount / 100).toFixed(2)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="border rounded-2xl p-5 relative">
          <h2 className="font-semibold mb-3">Projects</h2>

          {/* ✅ + goes to project create flow */}
          <button
            onClick={goToCreateProject}
            className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-black text-white flex items-center justify-center hover:opacity-90"
            title="Create project"
          >
            +
          </button>

          {projects.length === 0 ? (
            <p className="text-sm text-gray-500">No projects yet</p>
          ) : (
            <div className="space-y-2">
              {projects.slice(0, 7).map((p) => (
                <button
                  key={p.id}
                  onClick={() => router.push(`/dashboard/admin/projects/${p.id}`)}
                  className="w-full text-left rounded-xl border px-4 py-3 hover:border-neutral-500 transition"
                >
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-gray-500">
                    {p.project_type ?? '—'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contacts */}
      <div className="border rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">Contacts</h2>
            <p className="text-sm text-gray-500">
              Add multiple people at this organization.
            </p>
          </div>

          <button
            onClick={() => setShowAddContact(true)}
            className="bg-black text-white px-4 py-2 rounded-lg"
          >
            + Add contact
          </button>
        </div>

        {contacts.length === 0 ? (
          <p className="text-sm text-gray-500">No contacts yet</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="group border rounded-xl p-4 flex justify-between gap-4 hover:border-neutral-500 transition"
              >
                <div>
                  <p className="font-medium">
                    {c.name ?? '—'}
                    {c.is_primary && (
                      <span className="ml-2 text-xs px-2 py-1 rounded-full bg-neutral-200">
                        Primary
                      </span>
                    )}
                  </p>

                  <p className="text-sm text-gray-500">{c.position ?? '—'}</p>

                  <p className="text-sm text-gray-500">
                    {c.email ?? ''}
                    {c.email && c.phone ? ' • ' : ''}
                    {c.phone ?? ''}
                  </p>
                </div>

                {/* hover actions */}
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => setEditingContact(c)}
                    className="text-sm border px-3 py-2 rounded-lg"
                    title="Edit contact"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => deleteContact(c.id)}
                    disabled={busyContactId === c.id}
                    className="text-sm text-red-600 border border-red-500 px-3 py-2 rounded-lg disabled:opacity-50"
                    title="Delete contact"
                  >
                    {busyContactId === c.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete client */}
      <div className="pt-2">
        <button
          onClick={deleteClient}
          disabled={deletingClient}
          className="border border-red-500 text-red-600 px-4 py-2 rounded-lg disabled:opacity-60"
        >
          {deletingClient ? 'Deleting client…' : 'Delete client'}
        </button>
      </div>

      {/* Add Contact Modal */}
      {showAddContact && (
        <AddContactModal
          clientId={clientId}
          onClose={() => setShowAddContact(false)}
          onAdded={(newContact) => setContacts((prev) => [newContact, ...prev])}
        />
      )}

      {/* Edit Contact Modal */}
      {editingContact && (
        <EditContactModal
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onUpdated={(updated) =>
            setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
          }
        />
      )}
    </div>
  )
}

/* --------------------------
   Add Contact Modal
---------------------------*/
function AddContactModal({
  clientId,
  onClose,
  onAdded,
}: {
  clientId: string
  onClose: () => void
  onAdded: (c: Contact) => void
}) {
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)

    if (!email.trim() && !name.trim()) {
      setError('Add at least a name or email.')
      return
    }

    setSaving(true)

    if (isPrimary) {
      await supabase
        .from('client_contacts')
        .update({ is_primary: false })
        .eq('client_id', clientId)
    }

    const { data, error } = await supabase
      .from('client_contacts')
      .insert({
        client_id: clientId,
        name: name.trim() || null,
        position: position.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        is_primary: isPrimary,
      })
      .select('id, client_id, name, position, email, phone, is_primary, created_at')
      .single()

    setSaving(false)

    if (error || !data) {
      setError('Failed to add contact.')
      console.error(error)
      return
    }

    onAdded(data as Contact)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold">Add Contact</h3>
            <p className="text-sm text-gray-500">
              This will appear under the client’s account.
            </p>
          </div>

          <button onClick={onClose} className="text-sm underline text-gray-600">
            Close
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <input className="w-full border rounded-lg p-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full border rounded-lg p-2" placeholder="Position" value={position} onChange={(e) => setPosition(e.target.value)} />
        <input className="w-full border rounded-lg p-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border rounded-lg p-2" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
          Set as primary contact
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-black text-white px-4 py-2 rounded-lg disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------
   Edit Contact Modal
---------------------------*/
function EditContactModal({
  contact,
  onClose,
  onUpdated,
}: {
  contact: Contact
  onClose: () => void
  onUpdated: (c: Contact) => void
}) {
  const [name, setName] = useState(contact.name ?? '')
  const [position, setPosition] = useState(contact.position ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [isPrimary, setIsPrimary] = useState(contact.is_primary)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    setSaving(true)

    if (isPrimary) {
      await supabase
        .from('client_contacts')
        .update({ is_primary: false })
        .eq('client_id', contact.client_id)
    }

    const { data, error } = await supabase
      .from('client_contacts')
      .update({
        name: name.trim() || null,
        position: position.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        is_primary: isPrimary,
      })
      .eq('id', contact.id)
      .select('id, client_id, name, position, email, phone, is_primary, created_at')
      .single()

    setSaving(false)

    if (error || !data) {
      setError('Failed to update contact.')
      console.error(error)
      return
    }

    onUpdated(data as Contact)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold">Edit Contact</h3>
            <p className="text-sm text-gray-500">Update this person’s details.</p>
          </div>

          <button onClick={onClose} className="text-sm underline text-gray-600">
            Close
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <input className="w-full border rounded-lg p-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full border rounded-lg p-2" placeholder="Position" value={position} onChange={(e) => setPosition(e.target.value)} />
        <input className="w-full border rounded-lg p-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border rounded-lg p-2" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
          Set as primary contact
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-black text-white px-4 py-2 rounded-lg disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}