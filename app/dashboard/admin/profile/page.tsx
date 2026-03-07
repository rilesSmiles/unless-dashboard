'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  role: string | null
  business_name: string | null
  position: string | null
  avatar_url: string | null
  updated_at: string | null
}

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // form state
  const [name, setName]               = useState('')
  const [email, setEmail]             = useState('')
  const [phone, setPhone]             = useState('')
  const [position, setPosition]       = useState('')
  const [businessName, setBusinessName] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (data) {
        setProfile(data)
        setName(data.name ?? '')
        setEmail(data.email ?? user.email ?? '')
        setPhone(data.phone ?? '')
        setPosition(data.position ?? '')
        setBusinessName(data.business_name ?? '')

        // resolve avatar signed URL if stored in Supabase storage
        if (data.avatar_url) {
          if (data.avatar_url.startsWith('http')) {
            setAvatarUrl(data.avatar_url)
          } else {
            const { data: signed } = await supabase.storage
              .from('avatars')
              .createSignedUrl(data.avatar_url, 3600)
            setAvatarUrl(signed?.signedUrl ?? null)
          }
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!profile) return
    setError(null)
    setSaving(true)

    const { error: err } = await supabase
      .from('profiles')
      .update({
        name:          name.trim() || null,
        email:         email.trim() || null,
        phone:         phone.trim() || null,
        position:      position.trim() || null,
        business_name: businessName.trim() || null,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', profile.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setProfile((p) => p ? { ...p, name: name.trim() || null, updated_at: new Date().toISOString() } : p)
  }

  const handleAvatarUpload = async (file: File) => {
    if (!profile) return
    setAvatarUploading(true)

    const ext  = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) { setAvatarUploading(false); setError(upErr.message); return }

    const { data: signed } = await supabase.storage
      .from('avatars')
      .createSignedUrl(path, 3600)

    const url = signed?.signedUrl ?? null

    await supabase.from('profiles').update({ avatar_url: path, updated_at: new Date().toISOString() }).eq('id', profile.id)

    setAvatarUrl(url)
    setAvatarUploading(false)
  }

  const initials = name.trim()
    ? name.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : (email?.[0] ?? '?').toUpperCase()

  const roleLabel = (r: string | null) => {
    if (!r) return null
    return r.charAt(0).toUpperCase() + r.slice(1)
  }

  if (loading) return <div className="p-8 text-neutral-400 text-sm">Loading profile…</div>
  if (!profile) return (
    <div className="p-8 text-neutral-500 text-sm">
      No profile found. Make sure you&apos;re signed in.
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-50 pb-32">

      {/* Header */}
      <div className="bg-black px-6 pt-10 pb-10">
        <div className="max-w-2xl mx-auto flex items-end gap-6">

          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-2xl overflow-hidden cursor-pointer border-2 border-neutral-800 hover:border-amber-400 transition group relative"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                  <span className="text-white text-xl font-bold">{initials}</span>
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <span className="text-white text-xs font-medium">
                  {avatarUploading ? '…' : 'Change'}
                </span>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f) }}
            />
          </div>

          <div className="flex-1 pb-1">
            <div className="flex items-center gap-2 mb-1">
              {profile.role && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  {roleLabel(profile.role)}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white">
              {name || 'Your Profile'}
            </h1>
            {businessName && <p className="text-neutral-400 text-sm mt-0.5">{businessName}</p>}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-4">

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        {/* Personal info */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold text-neutral-900">Personal Info</h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full Name" value={name} onChange={setName} placeholder="Jane Smith" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="jane@company.com" type="email" />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 403 555 0100" type="tel" />
            <Field label="Title / Role" value={position} onChange={setPosition} placeholder="e.g. Brand Strategist" />
          </div>
        </div>

        {/* Company */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold text-neutral-900">Company</h2>
          <Field label="Business / Company Name" value={businessName} onChange={setBusinessName} placeholder="Unless Creative" />
        </div>

        {/* Save */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-neutral-400">
            {profile.updated_at ? `Last updated ${fmtDateTime(profile.updated_at)}` : 'Never saved'}
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-black text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-neutral-800 transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>

        {/* Account info — read only */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-3">
          <h2 className="font-semibold text-neutral-900">Account</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-500">Account ID</span>
              <span className="font-mono text-xs text-neutral-400">{profile.id}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-500">Role</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                profile.role === 'admin'
                  ? 'bg-amber-50 text-amber-700'
                  : profile.role === 'contractor'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-neutral-100 text-neutral-600'
              }`}>
                {roleLabel(profile.role) ?? 'Client'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-neutral-500">Last seen</span>
              <span className="text-neutral-400 text-xs">
                {profile.updated_at ? fmtDateTime(profile.updated_at) : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Password reset */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-neutral-900">Password</h2>
              <p className="text-sm text-neutral-400 mt-0.5">Send a reset link to your email</p>
            </div>
            <PasswordResetButton email={email} />
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Field ─────────────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 bg-white"
      />
    </div>
  )
}

// ─── Password Reset ────────────────────────────────────────────────────────────
function PasswordResetButton({ email }: { email: string }) {
  const [sent, setSent]     = useState(false)
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!email) return
    setSending(true)
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    })
    setSending(false)
    setSent(true)
    setTimeout(() => setSent(false), 5000)
  }

  return (
    <button
      onClick={send}
      disabled={sending || !email}
      className="text-sm font-medium px-4 py-2 border border-neutral-200 rounded-xl hover:border-black hover:text-black text-neutral-500 transition disabled:opacity-50"
    >
      {sending ? 'Sending…' : sent ? '✓ Link sent' : 'Send reset link'}
    </button>
  )
}
