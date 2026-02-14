'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminDashboard() {
  const router = useRouter()
  const [name, setName] = useState('')

  useEffect(() => {
    const loadAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        router.push('/dashboard/client')
        return
      }

      setName(profile.name)
    }

    loadAdmin()
  }, [router])

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