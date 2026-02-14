'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminDashboard() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadAdmin = async () => {
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
        if (profile.role !== 'admin') {
          router.push('/dashboard/client')
          return
        }

        // 4️⃣ Set state
        setName(profile.name || 'Admin')
        setLoading(false)

      } catch (err: any) {
        console.error(err)
        setError(err.message || 'Something went wrong')
        setLoading(false)
      }
    }

    loadAdmin()
  }, [router])

  // ⏳ Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading dashboard…</p>
      </div>
    )
  }

  // ❌ Error state
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-500">
        {error}
      </div>
    )
  }

  // ✅ Dashboard
  return (
    <div className="p-8">

      <h1 className="text-3xl font-bold">
        Admin Dashboard
      </h1>

      <p className="mt-2 text-gray-600">
        Welcome, {name} 👑
      </p>

      <div className="mt-6 rounded-xl border p-4">
        <p>🚀 Unless HQ Control Panel</p>
        <p>Clients, revenue, projects coming soon…</p>
      </div>

    </div>
  )
}