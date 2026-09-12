/**
 * Compuerta de elegibilidad — se evalúa tras capturar la constancia,
 * antes de permitir el flujo completo del diagnóstico.
 *
 * Fundamento legal (LSS, última reforma DOF 07-06-2024):
 *  - Art. 218: mín. 52 semanas en régimen obligatorio en los últimos 5 años
 *              al ser dado de baja. Inscripción con el último salario o superior.
 *  - Art. 219: el derecho se PIERDE si no se solicita por escrito dentro de
 *              5 años a partir de la fecha de baja.  ← compuerta dura
 *  - Art. 220: termina por falta de pago de 2 meses o por alta nueva en el
 *              régimen obligatorio.
 *  - Art. 13 fr. I y 5-A fr. XX: Modalidad 10, trabajadores independientes.
 *              No exige cotización previa.
 */

export type Severidad = 'bloqueo' | 'advertencia' | 'info'

export interface Hallazgo {
  via: 'mod40' | 'mod10' | 'general'
  severidad: Severidad
  titulo: string
  detalle: string
  fundamento?: string
}

export interface DatosElegibilidad {
  semanas_netas: number
  cotizando_actualmente: boolean
  fecha_baja?: string | null      // ISO
  semanas_ultimos_5_anios?: number | null
  regimen: 'ley73' | 'ley97'
  edad_actual: number
}

export interface ResultadoElegibilidad {
  mod40_viable: boolean
  mod10_viable: boolean
  mod10_recomendada: boolean
  hallazgos: Hallazgo[]
}

const SEMANAS_MINIMAS_PENSION = 500
const SEMANAS_MINIMAS_CV = 52
const ANIOS_LIMITE_CV = 5

function aniosDesde(fechaISO: string): number {
  const d = new Date(fechaISO)
  if (isNaN(d.getTime())) return NaN
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
}

export function evaluarElegibilidad(d: DatosElegibilidad): ResultadoElegibilidad {
  const h: Hallazgo[] = []
  let mod40 = true
  let mod10 = true

  // ── Modalidad 40 ──────────────────────────────────────────────
  if (d.cotizando_actualmente) {
    mod40 = false
    h.push({
      via: 'mod40', severidad: 'bloqueo',
      titulo: 'El cliente cotiza actualmente',
      detalle: 'La continuación voluntaria requiere haber causado baja del régimen obligatorio. Mientras exista relación laboral vigente no puede ingresar a Modalidad 40.',
      fundamento: 'Art. 218 LSS',
    })
  }

  if (d.fecha_baja) {
    const a = aniosDesde(d.fecha_baja)
    if (!isNaN(a)) {
      if (a > ANIOS_LIMITE_CV) {
        mod40 = false
        h.push({
          via: 'mod40', severidad: 'bloqueo',
          titulo: `Han pasado ${a.toFixed(1)} años desde la baja`,
          detalle: 'El derecho a la continuación voluntaria se pierde si no se ejercita dentro de los 5 años siguientes a la baja.',
          fundamento: 'Art. 219 LSS',
        })
      } else if (a > ANIOS_LIMITE_CV - 1) {
        h.push({
          via: 'mod40', severidad: 'advertencia',
          titulo: `Quedan ${(ANIOS_LIMITE_CV - a).toFixed(1)} años para solicitar`,
          detalle: 'El plazo de 5 años desde la baja está por vencer. La solicitud debe presentarse por escrito antes de esa fecha.',
          fundamento: 'Art. 219 LSS',
        })
      }
    }
  } else {
    h.push({
      via: 'mod40', severidad: 'advertencia',
      titulo: 'Falta la fecha de baja',
      detalle: 'Sin fecha de baja no puede verificarse el plazo de 5 años del Art. 219 ni el requisito de 52 semanas del Art. 218.',
    })
  }

  if (d.semanas_ultimos_5_anios != null && d.semanas_ultimos_5_anios < SEMANAS_MINIMAS_CV) {
    mod40 = false
    h.push({
      via: 'mod40', severidad: 'bloqueo',
      titulo: `Solo ${d.semanas_ultimos_5_anios} semanas en los últimos 5 años`,
      detalle: `Se requieren al menos ${SEMANAS_MINIMAS_CV} semanas acreditadas en el régimen obligatorio en los últimos 5 años previos a la baja.`,
      fundamento: 'Art. 218 LSS',
    })
  }

  if (d.regimen === 'ley97') {
    h.push({
      via: 'mod40', severidad: 'advertencia',
      titulo: 'Régimen Ley 97',
      detalle: 'Modalidad 40 eleva el promedio salarial, pero bajo Ley 97 la pensión depende del saldo acumulado en la Afore. El análisis de cuantía de esta calculadora está construido sobre Ley 73.',
    })
  }

  if (mod40) {
    h.push({
      via: 'mod40', severidad: 'advertencia',
      titulo: 'La continuación se pierde por falta de pago o por reingreso',
      detalle: 'Termina si se dejan de pagar las cuotas durante dos meses consecutivos, o si el asegurado vuelve a ser dado de alta en el régimen obligatorio. Si el cliente planea volver a emplearse, conviene revisar la duración del escenario.',
      fundamento: 'Art. 220 LSS',
    })
    h.push({
      via: 'mod40', severidad: 'advertencia',
      titulo: 'Lo invertido no se reembolsa si fallece antes de resolver',
      detalle: 'Si el cliente muere antes de que se resuelva la pensión, lo aportado no regresa como pensión propia: pasa al régimen de viudez y orfandad, con reglas y montos distintos. Es el riesgo principal de la operación y conviene plantearlo de frente al cliente.',
      fundamento: 'Arts. 127 y 130 LSS',
    })
  }

  // ── Modalidad 10 ──────────────────────────────────────────────
  const faltanSemanas = Math.max(0, SEMANAS_MINIMAS_PENSION - d.semanas_netas)
  const mod10Recomendada = faltanSemanas > 0

  if (mod10Recomendada) {
    h.push({
      via: 'mod10', severidad: 'info',
      titulo: `Faltan ${faltanSemanas} semanas para el mínimo de pensión`,
      detalle: 'Modalidad 40 eleva la cuantía pero no resuelve la elegibilidad. Modalidad 10 suma semanas y no exige cotización previa, por lo que es la vía indicada para alcanzar el requisito.',
      fundamento: 'Art. 13 fr. I LSS',
    })
  }

  if (d.cotizando_actualmente) {
    h.push({
      via: 'mod10', severidad: 'advertencia',
      titulo: 'Compatibilidad con relación laboral vigente',
      detalle: 'Existe interpretación de que Modalidad 10 puede coexistir con una relación subordinada, al considerarse independiente a quien cubre las cuotas. No es criterio firme del IMSS — verificar antes de recomendarla en este caso.',
      fundamento: 'Art. 5-A fr. XX LSS',
    })
  }

  return {
    mod40_viable: mod40,
    mod10_viable: mod10,
    mod10_recomendada: mod10Recomendada,
    hallazgos: h,
  }
}
