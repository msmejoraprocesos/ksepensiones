export const dynamic = 'force-dynamic'
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

const fmtMXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { asesor_id, cliente_id, datos, escenarios, periodos, sdiPromedio, sys, pdfConfig } = body

    if (!asesor_id) return NextResponse.json({ error: 'Falta asesor_id' }, { status: 400 })

    // Rate limit: 20 PDFs inteligentes por día
    const rl = await checkRateLimit(asesor_id, 'pdf-inteligente')
    if (!rl.permitido) {
      return NextResponse.json({
        ok: false,
        error: `Límite diario de ${rl.limite} diagnósticos PDF alcanzado. Se restablece a medianoche.`
      }, { status: 429 })
    }

    // Escenario recomendado
    const escRec = escenarios?.find((e: any) => e.recomendado) ?? escenarios?.[escenarios.length - 1]
    const escBase = escenarios?.[0]
    const mejora = escRec && escBase ? escRec.pension_mensual - escBase.pension_mensual : 0
    const pctMejora = escBase?.pension_mensual > 0 ? (mejora / escBase.pension_mensual * 100).toFixed(0) : '0'

    // Bloques activos en el PDF
    const bloqueActivos: string[] = pdfConfig?.secciones
      ?.filter((s: any) => s.visible)
      ?.sort((a: any, b: any) => a.orden - b.orden)
      ?.map((s: any) => s.id) ?? [
      'situacion', 'sin_mod40', 'con_mod40', 'comparativa', 'proximos'
    ]

    // Escenarios para prompt
    const escStr = escenarios?.filter((e: any) => e.mod40_meses > 0).slice(0, 3).map((e: any, i: number) =>
      `  Escenario ${i + 1}: ${e.mod40_umas} UMAs · ${e.mod40_meses} meses → Pensión ${fmtMXN(e.pension_mensual)}/mes · Inversión ${fmtMXN(e.costo_total)} · ROI ${e.roi} meses${e.recomendado ? ' ★ RECOMENDADO' : ''}`
    ).join('\n')

    const prompt = `Eres Sofía, experta en pensiones IMSS de KSE Pensiones. Genera el contenido narrativo de un diagnóstico PDF para el cliente.

DATOS DEL CLIENTE:
- Nombre: ${datos?.nombre_trabajador || 'el asegurado'}
- Régimen: Ley ${datos?.ley || '73'}
- Edad actual: ${datos?.edad_actual || '?'} años · Edad de retiro: ${datos?.edad_min_pension || 60} años
- Semanas cotizadas: ${datos?.semanas_totales || 0} (${datos?.semanas_descontadas || 0} descontadas = ${(datos?.semanas_totales || 0) - (datos?.semanas_descontadas || 0)} netas)
- SDI promedio 250 semanas: ${fmtMXN(sdiPromedio)}/día
- Cónyuge: ${datos?.tiene_conyuge ? 'Sí' : 'No'} · Hijos < 16: ${datos?.num_hijos || 0} · Padres: ${datos?.num_padres || 0}
- Ingreso objetivo: ${fmtMXN(datos?.ingreso_objetivo || 0)}/mes

RESULTADOS DEL CÁLCULO:
- Pensión sin Mod.40: ${fmtMXN(escBase?.pension_mensual || 0)}/mes
- Pensión con estrategia recomendada: ${fmtMXN(escRec?.pension_mensual || 0)}/mes
- Mejora: +${fmtMXN(mejora)}/mes (+${pctMejora}%)
- Inversión neta: ${fmtMXN(escRec?.inversion_neta || 0)}
- ROI: ${escRec?.roi || 0} meses
- Ganancia a 80 años: ${fmtMXN(escRec?.ganancia_a80 || 0)}

ESCENARIOS:
${escStr}

UMA 2026: $${sys?.UMA_DIARIA || 117.31}/día · PMG: ${fmtMXN(sys?.PMG_L73 || 10636.54)}/mes

BLOQUES QUE TENDRÁ EL PDF (genera contenido SOLO para los que aparecen):
${bloqueActivos.join(', ')}

Genera un JSON con narrativa personalizada, directa y que ayude al cliente a TOMAR DECISIONES.
Usa números concretos. Habla de consecuencias reales.

Responde ÚNICAMENTE con este JSON válido (sin markdown):
{
  "apertura": "2 frases presentando el diagnóstico personalizado para este cliente",
  "bloques": {
    ${bloqueActivos.includes('situacion') ? `"situacion": {
      "texto": "2-3 frases sobre la situación actual: semanas, edad, SDI. Sé evaluativo: ¿va bien, justo, o en riesgo?"
    },` : ''}
    ${bloqueActivos.includes('sin_mod40') ? `"sin_mod40": {
      "texto": "2 frases sobre qué le pasaría sin actuar. Usa números. Menciona si alcanza o no su objetivo de ${fmtMXN(datos?.ingreso_objetivo || 0)}."
    },` : ''}
    ${bloqueActivos.includes('con_mod40') || bloqueActivos.includes('bar_pension') ? `"con_mod40": {
      "texto_antes": "1-2 frases presentando la estrategia y la mejora de ${pctMejora}%",
      "texto_despues": "1 frase sobre el ROI y por qué es una buena inversión"
    },` : ''}
    ${bloqueActivos.includes('gauge') ? `"gauge": {
      "texto": "2 frases sobre lo que significa recuperar la inversión en ${escRec?.roi || 0} meses. Contextualiza: ¿es bueno, normal, rápido?"
    },` : ''}
    ${bloqueActivos.includes('timeline') ? `"timeline": {
      "texto": "2 frases sobre el cronograma. ¿Tiene tiempo suficiente? ¿Hay urgencia?"
    },` : ''}
    ${bloqueActivos.includes('area_flujos') ? `"area_flujos": {
      "texto": "2-3 frases sobre lo que significa la ganancia acumulada a 80 años. Ponlo en contexto de vida real."
    },` : ''}
    ${bloqueActivos.includes('comparativa') || bloqueActivos.includes('table_escenarios') ? `"comparativa": {
      "texto": "2-3 frases comparando los escenarios y justificando por qué el recomendado es el óptimo para este caso específico"
    },` : ''}
    ${bloqueActivos.includes('table_cuantias') ? `"cuantias": {
      "texto": "1-2 frases explicando en términos simples cómo se calculó la pensión (cuantía básica + incrementos + asignaciones)"
    },` : ''}
    ${bloqueActivos.includes('table_sdi') ? `"sdi": {
      "texto": "1 frase sobre el significado del SDI promedio y de dónde viene"
    },` : ''}
    ${bloqueActivos.includes('financiamiento') || bloqueActivos.includes('table_fin') ? `"financiamiento": {
      "texto_antes": "1-2 frases sobre el esquema de financiamiento y qué significa para el flujo mensual del cliente",
      "texto_despues": "1 frase sobre lo que pasa cuando termina el crédito"
    },` : ''}
    "proximos_pasos": {
      "texto": "1 frase introductoria",
      "pasos": ["acción 1 concreta", "acción 2 concreta", "acción 3 concreta"]
    }
  },
  "recomendacion_final": "2-3 frases de cierre con la recomendación clara y un llamado a la acción"
}`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: 'Experto en pensiones IMSS México. Responde SOLO con JSON válido, sin markdown, sin texto antes o después.',
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ ok: false, error: 'Sofía no devolvió JSON válido' }, { status: 500 })

    const sofiaOutput = JSON.parse(match[0])

    // Log uso IA — fire and forget
    if (asesor_id) {
      Promise.resolve().then(async () => {
        try {
          const db = getAdmin()
          const { data: perfil } = await db.from('perfiles_usuario').select('organizacion_id').eq('id', asesor_id).single()
          await db.from('uso_ia').insert({
            asesor_id,
            organizacion_id: perfil?.organizacion_id ?? null,
            cliente_id: cliente_id ?? null,
            tipo: 'pdf_inteligente',
            tokens_entrada: response.usage?.input_tokens ?? 0,
            tokens_salida: response.usage?.output_tokens ?? 0,
            modelo: 'claude-sonnet-4-6',
            exitoso: true,
            duracion_ms: 0,
          })
        } catch {}
      })
    }

    return NextResponse.json({ ok: true, sofiaOutput })
  } catch (e: any) {
    console.error('[pdf-inteligente]', e.message)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
