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
  last_seen_at: string | null
  updated_at: string | null
}

export default function ClientProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState<string>('')

  // modal
  const [editOpen, setEditOpen] = useState(false)

  // form fields
  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')

  // avatar
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const hydrateForm = (p: Profile) => {
    setName(p.name ?? '')
    setBusinessName(p.business_name ?? '')
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
      const userEmail = authData?.user?.email ?? ''
      setEmail(userEmail)

      if (authErr || !userId) {
        setErrorMsg('You must be signed in.')
        setLoading(false)
        return
      }

      // ensure row exists (idempotent)
      const { error: upErr } = await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' })
      if (upErr) {
        setErrorMsg('Could not initialize your profile.')
        setLoading(false)
        return
      }

      // load profile
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, business_name, phone, website, avatar_url, last_seen_at, updated_at')
        .eq('id', userId)
        .single()

      if (error || !data) {
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
    if (!userId) {
      setErrorMsg('You must be signed in.')
      setSaving(false)
      return
    }

    const payload = {
      id: userId,
      name: name.trim() || null,
      business_name: businessName.trim() || null,
      phone: phone.trim() || null,
      website: website.trim() || null,
    }

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('id, name, business_name, phone, website, avatar_url, last_seen_at, updated_at')
      .single()

    setSaving(false)

    if (error || !data) {
      setErrorMsg('Could not save your changes.')
      return
    }

    const p = data as Profile
    setProfile(p)
    hydrateForm(p)
    setEditOpen(false)
  }

  const onPickAvatar = () => fileRef.current?.click()

  const onAvatarSelected = async (file: File | null) => {
    if (!file || !profile) return

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
      const path = `${userId}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type,
      })

      if (upErr) {
        setErrorMsg('Could not upload that image.')
        return
      }

      const { data, error: profErr } = await supabase
        .from('profiles')
        .upsert({ id: userId, avatar_url: path }, { onConflict: 'id' })
        .select('id, name, business_name, phone, website, avatar_url, last_seen_at, updated_at')
        .single()

      if (profErr || !data) {
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

      {/* Profile card */}
      <div className="border rounded-2xl p-5 flex items-start gap-4">
        <div className="w-16 h-16 rounded-full border overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
          {avatarPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPreviewUrl} alt="Profile photo" className="w-full h-full object-cover" />
          ) : (
            <div className="text-xs text-gray-500">No photo</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-lg leading-tight">{profile?.name ?? 'Your name'}</div>
          <div className="text-sm text-gray-600">{profile?.business_name ?? '—'}</div>

          <div className="pt-3 space-y-1 text-sm text-gray-700">
            <div className="flex gap-2">
              <span className="text-gray-500 w-16 shrink-0">Email</span>
              <span className="truncate">{email || '—'}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 w-16 shrink-0">Phone</span>
              <span className="truncate">{profile?.phone ?? '—'}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 w-16 shrink-0">Website</span>
              {profile?.website ? (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate underline text-neutral-700 hover:text-black"
                >
                  {profile.website}
                </a>
              ) : (
                <span>—</span>
              )}
            </div>
          </div>

          <div className="text-xs text-gray-500 pt-3">
            Last updated: {profile?.updated_at ? new Date(profile.updated_at).toLocaleString() : '—'}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
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

          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="bg-black text-white rounded-xl px-4 py-2 text-sm hover:opacity-90"
          >
            Update profile
          </button>
        </div>
      </div>

      {/* Edit modal */}
      {editOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEdit()
          }}
        >
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border overflow-hidden">
            <div className="p-4 border-b flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-gray-500">Edit profile</div>
                <div className="font-semibold">Update your info</div>
              </div>

              <button
                type="button"
                onClick={closeEdit}
                className="text-sm underline text-neutral-600 hover:text-black"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-500 pb-1">Name</div>
                  <input
                    className="border rounded p-2 w-full"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <div className="text-xs text-gray-500 pb-1">Business name</div>
                  <input
                    className="border rounded p-2 w-full"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>

                <div>
                  <div className="text-xs text-gray-500 pb-1">Phone</div>
                  <input
                    className="border rounded p-2 w-full"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div>
                  <div className="text-xs text-gray-500 pb-1">Website</div>
                  <input
                    className="border rounded p-2 w-full"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="border rounded-xl px-4 py-2 text-sm hover:border-black"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={saving || !hasChanges}
                  className="bg-black text-white px-4 py-2 rounded-xl text-sm disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}