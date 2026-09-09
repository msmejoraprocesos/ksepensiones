import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import Stripe from 'stripe'
import { createClient } from '@/utils/supabase/server'

// Stripe initialized lazily inside handlers

// Precios por plan — configura en tu dashboard de Stripe y pon los price IDs aquí
const PRICE_IDS: Record<string, string> = {
  individual_mensual:  process.env.STRIPE_PRICE_INDIVIDUAL_MENSUAL  ?? '',
  individual_anual:    process.env.STRIPE_PRICE_INDIVIDUAL_ANUAL    ?? '',
  equipo_mensual:      process.env.STRIPE_PRICE_EQUIPO_MENSUAL      ?? '',
  equipo_anual:        process.env.STRIPE_PRICE_EQUIPO_ANUAL        ?? '',
  enterprise_mensual:  process.env.STRIPE_PRICE_ENTERPRISE_MENSUAL  ?? '',
  enterprise_anual:    process.env.STRIPE_PRICE_ENTERPRISE_ANUAL    ?? '',
}

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-08-26.dahlia' })
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { plan, periodo } = await req.json() // plan: 'individual'|'equipo'|'enterprise', periodo: 'mensual'|'anual'
    const priceKey = `${plan}_${periodo}`
    const priceId = PRICE_IDS[priceKey]
    if (!priceId) return NextResponse.json({ error: `Plan no válido: ${priceKey}` }, { status: 400 })

    // Obtener organización del usuario
    const { data: perfil } = await supabase
      .from('perfiles_usuario')
      .select('organizacion_id, nombre, email')
      .eq('id', user.id)
      .single()
    if (!perfil?.organizacion_id) return NextResponse.json({ error: 'Sin organización' }, { status: 400 })

    // Obtener o crear customer de Stripe
    const { data: org } = await supabase
      .from('organizaciones')
      .select('stripe_customer_id, nombre, stripe_subscription_id')
      .eq('id', perfil.organizacion_id)
      .single()

    let customerId = org?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: org?.nombre ?? perfil.nombre ?? 'KSE Cliente',
        metadata: { organizacion_id: perfil.organizacion_id, user_id: user.id },
      })
      customerId = customer.id
      await supabase.from('organizaciones').update({ stripe_customer_id: customerId }).eq('id', perfil.organizacion_id)
    }

    const origin = req.headers.get('origin') ?? 'https://ksepensiones.vercel.app'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/billing?canceled=1`,
      subscription_data: {
        metadata: { organizacion_id: perfil.organizacion_id },
        trial_period_days: org?.stripe_subscription_id ? undefined : 14,
      },
      locale: 'es',
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    console.error('[stripe/checkout]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
