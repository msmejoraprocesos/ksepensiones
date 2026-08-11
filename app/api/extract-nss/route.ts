import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'

const client = new Anthropic()

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const inicio = Date.now()
  let asesorId: string | null = null
  let exitoso = true
  let errorMsg: string | null = null
  let tokensEntrada = 0
  let tokensSalida = 0

  try {
    const { pdf, asesor_id, cliente_id } = await req.json()
    asesorId = asesor_id ?? null
    if (!pdf) return NextResponse.json({ error: 'No PDF provided' }, { status: 400 })

    // Rate limiting: 30 llamadas por asesor por día
    if (asesorId) {
      const rl = await checkRateLimit(asesorId, 'extract-nss')
      if (!rl.permitido) {
        return NextResponse.json({
          error: `Alcanzaste el límite diario de ${rl.limite} lecturas de constancia. Se restablece a medianoche.`,
          llamadas: rl.llamadas, limite: rl.limite
        }, { status: 429 })
      }
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document' as any,
            source: { type: 'base64', media_type: 'application/pdf', data: pdf }
          } as any,
          {
            type: 'text',
            text: `Eres un experto en seguridad social mexicana. Analiza esta constancia de semanas cotizadas del IMSS y extrae TODA la información disponible.\n\nResponde ÚNICAMENTE con un objeto JSON válido, sin backticks ni texto adicional:\n\n{\n  \"nombre\": \"nombre completo del trabajador\",\n  \"nss\": \"número de seguridad social\",\n  \"fecha_nac\": \"YYYY-MM-DD\",\n  \"semanas\": número total de semanas cotizadas,\n  \"cotizo_antes_97\": true si la fecha de primer empleo (primer_empleo) es ANTERIOR al 1 de julio de 1997 (1997-07-01); false si es igual o posterior a esa fecha,\n  \"cotizo_despues_97\": true o false (lo opuesto a cotizo_antes_97),\n  \"primer_empleo\": \"YYYY-MM-DD o null\",\n  \"ultima_cotizacion\": \"YYYY-MM-DD o null\",\n  \"fecha_emision\": \"YYYY-MM-DD\",\n  \"periodos\": [\n    {\n      \"fecha_inicio\": \"YYYY-MM-DD\",\n      \"fecha_fin\": \"YYYY-MM-DD\",\n      \"sdi\": número en pesos,\n      \"semanas\": número de semanas en este período,\n      \"patron\": \"nombre del patrón si aparece\"\n    }\n  ]\n}`
          }
        ]
      }]
    })

    // Registrar tokens
    tokensEntrada = response.usage?.input_tokens ?? 0
    tokensSalida = response.usage?.output_tokens ?? 0

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const data = JSON.parse(clean)

    return NextResponse.json(data)
  } catch (error: any) {
    exitoso = false
    errorMsg = error?.message ?? 'Error desconocido'
    console.error('extract-nss error:', error)
    return NextResponse.json({ error: 'Error processing PDF', detail: errorMsg }, { status: 500 })
  } finally {
    // Registrar uso de IA sin bloquear la respuesta
    if (asesorId && (tokensEntrada > 0 || !exitoso)) {
      const logData = { asesorId, tokensEntrada, tokensSalida, exitoso, errorMsg, duracion: Date.now() - inicio }
      // No await — fire and forget para no bloquear al cliente
      Promise.resolve().then(async () => {
        try {
          const db = getAdminClient()
          const { data: perfil } = await db.from('perfiles_usuario').select('organizacion_id').eq('id', logData.asesorId).single()
          await db.from('uso_ia').insert({
            asesor_id: logData.asesorId,
            organizacion_id: perfil?.organizacion_id ?? null,
            tipo: 'extraccion_constancia',
            tokens_entrada: logData.tokensEntrada,
            tokens_salida: logData.tokensSalida,
            modelo: 'claude-sonnet-4-6',
            exitoso: logData.exitoso,
            error_msg: logData.errorMsg,
            duracion_ms: logData.duracion,
          })
        } catch (e) {
          console.error('Error logging uso_ia:', e)
        }
      })
    }
  }
}
