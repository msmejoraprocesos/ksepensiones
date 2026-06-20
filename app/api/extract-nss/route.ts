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
Es crítico extraer correctamente los períodos con sus fechas y salarios para calcular el promedio de las últimas 250 semanas cotizadas.

REGLA CRÍTICA sobre los períodos — léela con cuidado:
Las constancias del IMSS listan, para cada patrón, una tabla de "Tipo de movimiento" con eventos como ALTA, REINGRESO, MODIFICACION DE SALARIO y BAJA, cada uno con su propia fecha y Salario Base. Un mismo patrón/empleo puede tener VARIAS modificaciones de salario mientras el trabajador seguía empleado ahí — esto es muy común.
NO generes un solo período por cada bloque de alta-baja usando solo el salario final o el que aparece arriba de la tabla. En vez de eso, DEBES generar UN período distinto por cada tramo de salario constante, cortando en cada fecha de "MODIFICACION DE SALARIO":
- El período 1 va de la fecha de ALTA/REINGRESO hasta el día anterior a la primera "MODIFICACION DE SALARIO" (o hasta la BAJA si no hay modificaciones), con el salario de esa alta.
- Cada modificación de salario abre un nuevo período (desde su fecha hasta la siguiente modificación o la baja), con el nuevo salario.
- No omitas ningún período, ni siquiera si su fecha es muy antigua y parece poco relevante — el sistema decide después cuáles caen dentro de las últimas 250 semanas, tu trabajo es extraer el historial completo y exacto.
- Si dos bloques de alta-baja consecutivos del mismo patrón tienen exactamente el mismo salario y son continuos (la baja de uno coincide con el alta del siguiente, o están muy cerca), puedes mantenerlos como períodos separados — no es necesario fusionarlos, pero tampoco perder ninguno.`
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
