'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useRef, useState } from 'react'

type Profile = {
  id: string
  full_name: string | null
  company: string | null
  phone: string | null
  website: string | null
  avatar_url: string | null
  last_seen_at: string | null
  updated_at: string | null
}

export default function ClientProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [profile, setProfile] = useState<Profile | null>(null)

  // form fields
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')

  // avatar
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const hydrateForm = (p: Profile) => {
    setFullName(p.full_name ?? '')
    setCompany(p.company ?? '')
    setPhone(p.phone ?? '')
    setWebsite(p.website ?? '')
  }

  const refreshAvatarPreview = async (avatarPath: string | null) => {
    if (!avatarPath) {
      setAvatarPreviewUrl(null)
      return
    }

    const { data, error } = await supabase.storage.from('avatars').createSignedUrl(avatarPath, 60 * 10)
    if (!error && data?.signedUrl) setAvatarPreviewUrl(data.signedUrl)
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setErrorMsg(null)

      const { data: authData, error: authErr } = await supabase.auth.getUser()
      const userId = authData?.user?.id

      if (authErr || !userId) {
        setErrorMsg('You must be signed in.')
        setLoading(false)
        return
      }

      // Ensure a profiles row exists (idempotent)
      const { error: upErr } = await supabase
        .from('profiles')
        .upsert({ id: userId }, { onConflict: 'id' })

      if (upErr) {
        console.error('Profile upsert error:', upErr)
        setErrorMsg('Could not initialize your profile.')
        setLoading(false)
        return
      }

      // Load profile
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, company, phone, website, avatar_url, last_seen_at, updated_at')
        .eq('id', userId)
        .single()

      if (error || !data) {
        console.error('Load profile error:', error)
        setErrorMsg('Could not load your profile.')
        setLoading(false)
        return
      }

      const p = data as Profile
      setProfile(p)
      hydrateForm(p)
      await refreshAvatarPreview(p.avatar_url)

      setLoading(false)
    }

    load()
  }, [])

  const hasChanges = useMemo(() => {
    if (!profile) return false
    return (
      (profile.full_name ?? '') !== fullName ||
      (profile.company ?? '') !== company ||
      (profile.phone ?? '') !== phone ||
      (profile.website ?? '') !== website
    )
  }, [profile, fullName, company, phone, website])

  const saveProfile = async () => {
    if (!profile) return
    setSaving(true)
    setErrorMsg(null)

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (!userId) {
      setErrorMsg('You must be signed in.')
      setSaving(false)
      return
    }

    const payload = {
      id: userId,
      full_name: fullName.trim() || null,
      company: company.trim() || null,
      phone: phone.trim() || null,
      website: website.trim() || null,
      // updated_at is auto-set by trigger, but leaving it doesn’t hurt either way
    }

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('id, full_name, company, phone, website, avatar_url, last_seen_at, updated_at')
      .single()

    setSaving(false)

    if (error || !data) {
      console.error('Save profile error:', error)
      setErrorMsg('Could not save your changes.')
      return
    }

    const p = data as Profile
    setProfile(p)
    hydrateForm(p)
  }

  const onPickAvatar = () => fileRef.current?.click()

  const onAvatarSelected = async (file: File | null) => {
    if (!file) return
    if (!profile) return

    setUploading(true)
    setErrorMsg(null)

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (authErr || !userId) {
        setErrorMsg('You must be signed in.')
        return
      }

      if (!file.type.startsWith('image/')) {
        setErrorMsg('Please upload an image (PNG/JPG).')
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('Max file size is 5MB.')
        return
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${userId}/${Date.now()}.${ext}` // IMPORTANT: folder = userId

      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type,
      })

      if (upErr) {
        console.error('Avatar upload error:', upErr)
        setErrorMsg('Could not upload that image.')
        return
      }

      // Save storage path to profile
      const { data, error: profErr } = await supabase
        .from('profiles')
        .upsert({ id: userId, avatar_url: path }, { onConflict: 'id' })
        .select('id, full_name, company, phone, website, avatar_url, last_seen_at, updated_at')
        .single()

      if (profErr || !data) {
        console.error('Avatar profile update error:', profErr)
        setErrorMsg('Uploaded, but could not save to your profile.')
        return
      }

      const p = data as Profile
      setProfile(p)
      await refreshAvatarPreview(p.avatar_url)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (loading) return <p className="p-8">Loading…</p>

  return (
    <div className="p-8 space-y-6 max-w-[900px] mx-auto">
      <div>
        <p className="text-sm text-gray-500">Profile</p>
        <h1 className="text-3xl font-bold">Your info</h1>
      </div>

      {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}

      {/* Avatar */}
      <div className="border rounded-2xl p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full border overflow-hidden bg-gray-100 flex items-center justify-center">
          {avatarPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPreviewUrl} alt="Profile photo" className="w-full h-full object-cover" />
          ) : (
            <div className="text-xs text-gray-500">No photo</div>
          )}
        </div>

        <div className="flex-1">
          <div className="font-semibold">{fullName || 'Your name'}</div>
          <div className="text-xs text-gray-500">{company || '—'}</div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onAvatarSelected(e.target.files?.[0] ?? null)}
        />

        <button
          type="button"
          onClick={onPickAvatar}
          disabled={uploading}
          className="border rounded-xl px-4 py-2 text-sm hover:border-black disabled:opacity-60"
        >
          {uploading ? 'Uploading…' : 'Change photo'}
        </button>
      </div>

      {/* Fields */}
      <div className="border rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-500 pb-1">Full name</div>
            <input className="border rounded p-2 w-full" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div>
            <div className="text-xs text-gray-500 pb-1">Company</div>
            <input className="border rounded p-2 w-full" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>

          <div>
            <div className="text-xs text-gray-500 pb-1">Phone</div>
            <input className="border rounded p-2 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <div className="text-xs text-gray-500 pb-1">Website</div>
            <input className="border rounded p-2 w-full" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              if (!profile) return
              hydrateForm(profile)
            }}
            className="text-sm underline text-neutral-600 hover:text-black"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={saveProfile}
            disabled={saving || !hasChanges}
            className="bg-black text-white px-4 py-2 rounded-xl text-sm disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Last updated: {profile?.updated_at ? new Date(profile.updated_at).toLocaleString() : '—'}
      </div>
    </div>
  )
}