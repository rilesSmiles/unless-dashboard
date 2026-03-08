'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewClientPage() {
  const router = useRouter()
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [name, setName]               = useState('')
  const [position, setPosition]       = useState('')
  const [email, setEmail]             = useState('')
  const [phone, setPhone]             = useState('')
  const [address, setAddress]         = useState('')
  const [tempPassword, setTempPassword] = useState('')

  const createClient = async () => {
    setError(null)
    if (!email.trim()) { setError('Email is required.'); return }
    setSaving(true)

    try {
      const res = await fetch('/api/clients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          tempPassword: tempPassword.trim() || undefined,
          business_name: businessName.trim() || undefined,
          name: name.trim() || undefined,
          position: position.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        }),
      })

      const text = await res.text()
      let data: any = null
      try { data = JSON.parse(text) } catch {
        setError(`Server error: ${text.slice(0, 200)}`); setSaving(false); return
      }

      if (!res.ok) { setError(data?.error + (data?.details ? ` — ${data.details}` : '')); setSaving(false); return }
      router.push('/dashboard/admin/accounts')
    } catch (e: any) {
      setError(e?.message ?? 'Request failed')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-32">

      {/* Header */}
      <div className="bg-black px-6 pt-10 pb-8">
        <div className="max-w-2xl mx-auto flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-1">Unless Creative</p>
            <h1 className="text-3xl font-bold text-white">New Client</h1>
            <p className="text-neutral-500 text-sm mt-1">Create a client account and profile.</p>
          </div>
          <button onClick={() => router.push('/dashboard/admin/accounts')}
            className="text-sm text-neutral-500 hover:text-white transition pb-1">
            ← Back
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-4">

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        {/* Business */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-neutral-900">Business</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Company / Business Name" value={businessName} onChange={setBusinessName} placeholder="Acme Corp" />
            <div />
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Address</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, Calgary, AB" rows={2}
                className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10" />
            </div>
          </div>
        </div>

        {/* Primary contact */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-neutral-900">Primary Contact</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full Name" value={name} onChange={setName} placeholder="Jane Smith" />
            <Field label="Title / Position" value={position} onChange={setPosition} placeholder="CEO" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="jane@company.com" type="email" required />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 403 555 0100" type="tel" />
          </div>
        </div>

        {/* Portal access */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-3">
          <div>
            <h2 className="font-semibold text-neutral-900">Portal Access</h2>
            <p className="text-sm text-neutral-400 mt-0.5">
              Set a temporary password to give the client access now, or leave blank to send an invite later.
            </p>
          </div>
          <Field label="Temporary Password" value={tempPassword} onChange={setTempPassword}
            placeholder="Leave blank to invite later" type="password" />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button onClick={() => router.push('/dashboard/admin/accounts')}
            className="text-sm text-neutral-500 hover:text-black transition px-4 py-2.5">
            Cancel
          </button>
          <button onClick={createClient} disabled={saving || !email.trim()}
            className="bg-black text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-neutral-800 transition disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Client →'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
        {label} {required && <span className="text-red-400 normal-case font-normal">*</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 bg-white" />
    </div>
  )
}
