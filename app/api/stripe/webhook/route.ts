import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-01-28.clover' })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  // Handle payment success
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    const invoiceId = pi.metadata?.invoiceId

    if (invoiceId) {
      const now = new Date().toISOString()
      const { error } = await supabaseAdmin
        .from('invoices')
        .update({ status: 'paid', paid_at: now, updated_at: now })
        .eq('id', invoiceId)

      if (error) {
        console.error('Failed to mark invoice paid:', error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }
      console.log(`✓ Invoice ${invoiceId} marked paid via Stripe PaymentIntent ${pi.id}`)
    }
  }

  // Handle payment failure (optional — resets intent so client can retry)
  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent
    console.log(`✗ Payment failed for invoice ${pi.metadata?.invoiceId}: ${pi.last_payment_error?.message}`)
  }

  return NextResponse.json({ received: true })
}
