import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'

const client = new Anthropic()

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { messages, asesor_id, contexto_cliente } = await req.json()
    if (!messages || !asesor_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const rl = await checkRateLimit(asesor_id, 'sofia-chat')
    if (!rl.permitido) {
      return NextResponse.json({
        error: `Alcanzaste el límite de ${rl.limite} mensajes diarios con Sofía. Se restablece a medianoche.`
      }, { status: 429 })
    }

    const systemPrompt = `Eres Sofía, la asistente de inteligencia artificial de KSE Pensiones. Eres experta en:
- Ley del Seguro Social 1973 (Ley 73) — pensiones, semanas cotizadas, Modalidad 40
- Cálculo de pensiones: cuantía básica, incrementos anuales, asignaciones familiares
- Modalidad 40 y su impacto en la pensión
- Estrategias previsionales para trabajadores en México
- CRM y gestión de cartera de clientes de asesoría pensional

Responde siempre en español, de forma clara y profesional. Cuando el asesor pregunte sobre un cliente específico, usa los datos del contexto para dar respuestas precisas. Si no tienes suficientes datos, pídelos de forma concisa. Sé directa y útil — el asesor trabaja con clientes reales.${contexto_cliente ? `\n\nCONTEXTO DEL CLIENTE ACTUAL:\n${JSON.stringify(contexto_cliente, null, 2)}` : ''}`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    })

    const texto = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')

    try {
      const admin = getAdmin()
      await admin.from('uso_ia').insert({
        asesor_id,
        endpoint: 'sofia-chat',
        tokens_entrada: response.usage.input_tokens,
        tokens_salida: response.usage.output_tokens,
        costo_usd: (response.usage.input_tokens / 1_000_000 * 3) + (response.usage.output_tokens / 1_000_000 * 15),
        duracion_ms: 0,
      })
    } catch {}

    return NextResponse.json({ respuesta: texto, llamadas: rl.llamadas, limite: 50 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
