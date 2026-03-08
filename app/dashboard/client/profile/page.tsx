'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useRef, useState } from 'react'

type Profile = {
  id: string
  name: string | null
  business_name: string | null
  phone: string | null
  website: string | null
  avatar_url: string | null
  updated_at: string | null
}

export default function ClientProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // form fields
  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')

  const hydrateForm = (p: Profile) => {
    setName(p.name ?? '')
    setBusinessName(p.business_name ?? '')
    setPhone(p.phone ?? '')
    setWebsite(p.website ?? '')
  }

  const refreshAvatarPreview = async (avatarPath: string | null) => {
    if (!avatarPath) { setAvatarPreviewUrl(null); return }
    const { data } = await supabase.storage.from('avatars').createSignedUrl(avatarPath, 600)
    if (data?.signedUrl) setAvatarPreviewUrl(data.signedUrl)
  }

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      const userEmail = authData?.user?.email ?? ''
      setEmail(userEmail)
      if (!userId) { setLoading(false); return }

      await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' })

      const { data } = await supabase
        .from('profiles')
        .select('id, name, business_name, phone, website, avatar_url, updated_at')
        .eq('id', userId)
        .single()

      if (data) {
        const p = data as Profile
        setProfile(p)
        hydrateForm(p)
        await refreshAvatarPreview(p.avatar_url)
      }
      setLoading(false)
    }
    load()
  }, [])

  const hasChanges = useMemo(() => {
    if (!profile) return false
    return (
      (profile.name ?? '') !== name ||
      (profile.business_name ?? '') !== businessName ||
      (profile.phone ?? '') !== phone ||
      (profile.website ?? '') !== website
    )
  }, [profile, name, businessName, phone, website])

  const closeEdit = () => {
    setEditOpen(false)
    setErrorMsg(null)
    if (profile) hydrateForm(profile)
  }

  const saveProfile = async () => {
    if (!profile) return
    setSaving(true)
    setErrorMsg(null)
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (!userId) { setSaving(false); return }

    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        name: name.trim() || null,
        business_name: businessName.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
      }, { onConflict: 'id' })
      .select('id, name, business_name, phone, website, avatar_url, updated_at')
      .single()

    setSaving(false)
    if (error || !data) { setErrorMsg('Could not save changes.'); return }

    const p = data as Profile
    setProfile(p)
    hydrateForm(p)
    setSavedAt(new Date())
    setEditOpen(false)
  }

  const onAvatarSelected = async (file: File | null) => {
    if (!file || !profile) return
    setUploading(true)
    setErrorMsg(null)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (!userId) return
      if (!file.type.startsWith('image/')) { setErrorMsg('Please upload an image.'); return }
      if (file.size > 5 * 1024 * 1024) { setErrorMsg('Max file size is 5MB.'); return }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) { setErrorMsg('Could not upload image.'); return }
      const { data } = await supabase
        .from('profiles')
        .upsert({ id: userId, avatar_url: path }, { onConflict: 'id' })
        .select('id, name, business_name, phone, website, avatar_url, updated_at')
        .single()
      if (data) { setProfile(data as Profile); await refreshAvatarPreview(path) }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading…</div>

  const initials = profile?.name
    ? profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : email?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">

      {/* ── Header ── */}
      <div className="px-6 pt-10 pb-8" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}>
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-mono uppercase tracking-widest mb-4" style={{ color: '#7EC8A0' }}>
            Unless Creative — Client Portal
          </p>
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/20 flex items-center justify-center shrink-0"
              style={{ background: '#1A3428' }}
            >
              {avatarPreviewUrl ? (
                <img src={avatarPreviewUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-xl font-bold">{initials}</span>
              )}
            </div>
            <div>
              <h1 className="text-2xl text-white">{profile?.name ?? 'Your Profile'}</h1>
              {profile?.business_name && (
                <p className="text-sm mt-0.5" style={{ color: '#7EC8A0' }}>{profile.business_name}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-4">
        {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}

        {/* ── Info Card ── */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-neutral-900">Your Info</h3>
            <button
              onClick={() => setEditOpen(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl transition text-white"
              style={{ background: '#F04D3D' }}
            >
              Edit
            </button>
          </div>

          <div className="space-y-3">
            {[
              { label: 'Name', value: profile?.name },
              { label: 'Email', value: email },
              { label: 'Business', value: profile?.business_name },
              { label: 'Phone', value: profile?.phone },
              { label: 'Website', value: profile?.website, isLink: true },
            ].map(({ label, value, isLink }) => (
              <div key={label} className="flex items-start gap-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 w-16 shrink-0 pt-0.5">{label}</span>
                {isLink && value ? (
                  <a
                    href={value}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium underline truncate"
                    style={{ color: '#F04D3D' }}
                  >
                    {value}
                  </a>
                ) : (
                  <span className="text-sm text-neutral-700">{value || '—'}</span>
                )}
              </div>
            ))}
          </div>

          {savedAt && (
            <p className="text-xs text-neutral-400 mt-4">
              Saved {savedAt.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* ── Avatar Card ── */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-neutral-900">Profile Photo</h3>
              <p className="text-xs text-neutral-400 mt-0.5">PNG or JPG, max 5MB</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-neutral-200 flex items-center justify-center" style={{ background: '#f5f5f5' }}>
                {avatarPreviewUrl ? (
                  <img src={avatarPreviewUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-neutral-400">{initials}</span>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onAvatarSelected(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-xs font-semibold px-3 py-2 rounded-xl border border-neutral-200 hover:border-neutral-400 transition disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Change photo'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Sign out ── */}
        <button
          onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
          className="w-full text-sm text-neutral-400 hover:text-red-500 transition py-2"
        >
          Sign out
        </button>

      </div>

      {/* ── Edit Modal ── */}
      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeEdit() }}
        >
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <p className="font-bold text-neutral-900">Update your info</p>
              <button onClick={closeEdit} className="text-sm text-neutral-400 hover:text-black transition">Close</button>
            </div>
            <div className="p-5 space-y-4">
              {[
                { label: 'Name', value: name, set: setName, placeholder: 'Your full name' },
                { label: 'Business Name', value: businessName, set: setBusinessName, placeholder: 'Your company name' },
                { label: 'Phone', value: phone, set: setPhone, placeholder: '+1 (403) 000-0000' },
                { label: 'Website', value: website, set: setWebsite, placeholder: 'https://yoursite.com' },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label}>
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 block mb-1">{label}</label>
                  <input
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder={placeholder}
                    className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              ))}
              {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
              <div className="flex gap-3 justify-end pt-1">
                <button onClick={closeEdit} className="text-sm text-neutral-400 hover:text-black transition px-3 py-2">
                  Cancel
                </button>
                <button
                  onClick={saveProfile}
                  disabled={saving || !hasChanges}
                  className="text-sm font-semibold px-5 py-2 rounded-xl text-white transition disabled:opacity-50"
                  style={{ background: '#F04D3D' }}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
