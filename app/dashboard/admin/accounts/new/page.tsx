'use client'
console.log('✅ /api/clients/create hit')
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewClientPage() {
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [businessName, setBusinessName] = useState('')
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  const [tempPassword, setTempPassword] = useState('')

const createClient = async () => {
  setError(null)

  if (!email.trim()) {
    setError('Email is required.')
    return
  }

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
try {
  data = JSON.parse(text)
} catch {
  // If it's HTML, show the first bit so we can see what it is
  setError(`Server returned non-JSON:\n${text.slice(0, 200)}`)
  setSaving(false)
  return
}

    if (!res.ok) {
      setError(data?.error + (data?.details ? ` — ${data.details}` : ''))
      setSaving(false)
      return
    }

    router.push('/dashboard/admin/accounts')
  } catch (e: any) {
    setError(e?.message ?? 'Request failed')
  } finally {
    setSaving(false)
  }
}

  return (
    <div className="p-8 max-w-[900px] mx-auto space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold">New Client</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create a client account and profile.
          </p>
        </div>

        <button
          onClick={() => router.push('/dashboard/admin/accounts')}
          className="text-sm underline"
        >
          Back
        </button>
      </div>

      {error && (
        <div className="border border-red-500/40 bg-red-500/10 text-red-300 rounded-xl p-4">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold">Business</h2>

          <input
            className="w-full border rounded p-2"
            placeholder="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />

          <textarea
            className="w-full border rounded p-2 min-h-[90px]"
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div className="border rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold">Contact</h2>

          <input
            className="w-full border rounded p-2"
            placeholder="Contact name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="w-full border rounded p-2"
            placeholder="Position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />

          <input
            className="w-full border rounded p-2"
            placeholder="Email (required)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="w-full border rounded p-2"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">Login Setup (optional)</h2>
        <p className="text-sm text-gray-500">
          If you set a temporary password, you can hand it to them. Otherwise you can add an invite flow later.
        </p>

        <input
          className="w-full border rounded p-2"
          placeholder="Temporary password (optional)"
          value={tempPassword}
          onChange={(e) => setTempPassword(e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={createClient}
          disabled={saving}
          className="bg-black text-white px-5 py-2 rounded-lg disabled:opacity-60"
        >
          {saving ? 'Creating…' : 'Create Client'}
        </button>
      </div>
    </div>
  )
}