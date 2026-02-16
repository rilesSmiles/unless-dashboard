import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
})

export async function POST(req: Request) {
  const body = await req.text()

  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('Webhook error:', err.message)

    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }

  // ✅ Handle events later
  switch (event.type) {
    case 'checkout.session.completed':
      console.log('Checkout completed')
      break

    case 'invoice.payment_succeeded':
      console.log('Invoice paid')
      break

    default:
      console.log(`Unhandled event: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}