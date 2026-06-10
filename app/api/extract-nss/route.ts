import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { base64, mediaType } = await req.json()

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          } as any,
          {
            type: 'text',
            text: `Eres un experto en documentos del IMSS México. Analiza esta Constancia de Semanas Cotizadas y extrae los siguientes datos. Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin explicaciones:

{
  "nombre": "nombre completo del asegurado",
  "nss": "número de seguridad social",
  "curp": "CURP del asegurado",
  "semanas": número total de semanas cotizadas (entero),
  "salario_diario": último salario base de cotización en pesos (número),
  "fecha_nac": "YYYY-MM-DD extraída del CURP (posición 4-9: AAMMDD)"
}

Reglas importantes:
- Las semanas son el TOTAL que aparece en el resumen principal del documento
- El salario_diario es el último salario base de cotización registrado en pesos
- La fecha_nac se extrae del CURP: caracteres 4-9 en formato AAMMDD, conviértela a YYYY-MM-DD
- Si no encuentras algún dato, usa null`
          }
        ]
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const data = JSON.parse(clean)

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    console.error('Extract NSS error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
