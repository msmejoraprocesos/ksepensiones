import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { pdf } = await req.json()
    if (!pdf) return NextResponse.json({ error: 'No PDF provided' }, { status: 400 })

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
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
            text: `Eres un experto en seguridad social mexicana. Analiza esta constancia de semanas cotizadas del IMSS y extrae TODA la información disponible.

Responde ÚNICAMENTE con un objeto JSON válido, sin backticks ni texto adicional:

{
  "nombre": "nombre completo del trabajador",
  "nss": "número de seguridad social",
  "fecha_nac": "YYYY-MM-DD",
  "semanas": número total de semanas cotizadas,
  "cotizo_antes_97": true si la fecha de primer empleo (primer_empleo) es ANTERIOR al 1 de julio de 1997 (1997-07-01); false si es igual o posterior a esa fecha,
  "cotizo_despues_97": true o false (lo opuesto a cotizo_antes_97),
  "primer_empleo": "YYYY-MM-DD o null",
  "ultima_cotizacion": "YYYY-MM-DD o null",
  "periodos": [
    {
      "fecha_inicio": "YYYY-MM-DD",
      "fecha_fin": "YYYY-MM-DD",
      "sdi": número en pesos,
      "semanas": número de semanas en este período,
      "patron": "nombre del patrón si aparece"
    }
  ]
}

Los períodos deben estar ordenados cronológicamente del más antiguo al más reciente.
Es crítico extraer correctamente los períodos con sus fechas y salarios para calcular el promedio de las últimas 250 semanas cotizadas.`
          }
        ]
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const data = JSON.parse(clean)
    return NextResponse.json(data)
  } catch (error) {
    console.error('extract-nss error:', error)
    return NextResponse.json({ error: 'Error processing PDF' }, { status: 500 })
  }
}
