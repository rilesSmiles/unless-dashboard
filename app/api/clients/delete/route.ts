import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function DELETE(req: Request) {
  try {
    const { clientId } = await req.json() as { clientId: string }

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

    // 1. Delete contacts (cascade should handle it, but be explicit)
    await supabaseAdmin
      .from('client_contacts')
      .delete()
      .eq('client_id', clientId)

    // 2. Delete the profile row
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', clientId)

    if (profileErr) {
      return NextResponse.json(
        { error: 'Failed to delete profile', details: profileErr.message },
        { status: 500 }
      )
    }

    // 3. Delete the Supabase auth user (prevents them from logging in)
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(clientId)

    if (authErr) {
      // Profile is already gone — log but don't hard-fail
      console.warn('Auth user delete warning:', authErr.message)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error', details: err?.message ?? String(err) },
      { status: 500 }
    )
  }
}
