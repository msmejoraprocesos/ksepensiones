import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import Stripe from 'stripe'
import { createClient } from '@/utils/supabase/server'

// Stripe initialized lazily inside handlers
export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature') ?? ''

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
  let event: Stripe.Event
  try {
    const stripeForWebhook = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-08-26.dahlia' })
    event = stripeForWebhook.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (e: any) {
    console.error('[stripe/webhook] Firma inválida:', e.message)
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 })
  }

  const supabase = createClient()

  // Helper: determinar plan desde price_id
  const planFromPrice = (priceId: string): string => {
    const prices: Record<string, string> = {
      [process.env.STRIPE_PRICE_INDIVIDUAL_MENSUAL  ?? '']: 'individual',
      [process.env.STRIPE_PRICE_INDIVIDUAL_ANUAL    ?? '']: 'individual',
      [process.env.STRIPE_PRICE_EQUIPO_MENSUAL      ?? '']: 'equipo',
      [process.env.STRIPE_PRICE_EQUIPO_ANUAL        ?? '']: 'equipo',
      [process.env.STRIPE_PRICE_ENTERPRISE_MENSUAL  ?? '']: 'enterprise',
      [process.env.STRIPE_PRICE_ENTERPRISE_ANUAL    ?? '']: 'enterprise',
    }
    return prices[priceId] ?? 'individual'
  }

  // Helper: asientos por plan
  const asientosPorPlan = (plan: string): number => ({ individual: 1, equipo: 5, enterprise: 20 }[plan] ?? 1)

  try {
    switch (event.type) {

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = sub.customer as string
        const priceId = sub.items.data[0]?.price.id ?? ''
        const plan = planFromPrice(priceId)
        const vigencia = new Date((sub as any).current_period_end * 1000).toISOString()
        const cancelar = sub.cancel_at_period_end
        await supabase.from('organizaciones')
          .update({
            stripe_subscription_id: sub.id,
            stripe_price_id: priceId,
            plan,
            asientos: asientosPorPlan(plan),
            vigencia_hasta: vigencia,
            cancelar_al_periodo: cancelar,
            activo: ['active', 'trialing'].includes(sub.status),
          })
          .eq('stripe_customer_id', customerId)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await supabase.from('organizaciones')
          .update({
            stripe_subscription_id: null,
            plan: 'individual',
            vigencia_hasta: null,
            activo: false,
          })
          .eq('stripe_customer_id', sub.customer as string)
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        // El periodo de gracia lo maneja vigencia_hasta — no desactivar inmediatamente
        console.warn('[stripe/webhook] Pago fallido para customer:', inv.customer)
        break
      }
    }
  } catch (e: any) {
    console.error('[stripe/webhook] Error procesando evento:', event.type, e.message)
  }

  return NextResponse.json({ received: true })
}

// Stripe necesita el body sin parsear
export const runtime = 'nodejs'
