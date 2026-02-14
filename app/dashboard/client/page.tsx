'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ClientDashboard() {
  const router = useRouter()

  const [name, setName] = useState('')
    const [business_name, setBusiness] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadClient = async () => {
      try {
        // 1️⃣ Get user
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError

        if (!user) {
          router.push('/login')
          return
        }

        // 2️⃣ Get profile
        const { data: profile, error: profileError } =
          await supabase
            .from('profiles')
            .select('name, role')
            .eq('id', user.id)
            .single()

        if (profileError) throw profileError

        if (!profile) {
          throw new Error('Profile not found')
        }

        // 3️⃣ Check role
        if (profile.role !== 'client') {
          router.push('/dashboard/admin')
          return
        }

        // 4️⃣ Set state
        setName(profile.name || 'Client')
        setLoading(false)



      } catch (err: any) {
        console.error(err)
        setError(err.message || 'Something went wrong')
        setLoading(false)
      }
    }

    loadClient()
  }, [router])

  // ⏳ Loading
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading your dashboard…</p>
      </div>
    )
  }

  // ❌ Error
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-500">
        {error}
      </div>
    )
  }

  // ✅ Client UI
  return (
    <div className="p-8">

      <h1 className="text-3xl font-bold">
        {business_name} Dashboard
      </h1>

      <p className="mt-2 text-gray-600">
        Welcome, {name} ✨
      </p>

      <div className="mt-6 rounded-xl border p-4 space-y-2">
        <p>📁 Your Projects</p>
        <p>💬 Messages from Unless</p>
        <p>📄 Contracts & Files</p>
        <p>📊 Progress Tracking</p>
      </div>

    </div>
  )
}