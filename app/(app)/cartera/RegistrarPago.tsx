'use client'
import React, { useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { K, nw, num, botonPrimario } from '@/lib/design-tokens'
import { calcularNuevaVigencia, evaluarCobranza } from '@/lib/cartera'

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fecha = (d: string) => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

const campo: React.CSSProperties = {
  width: '100%', height: 46, border: `1px solid ${K.line}`, borderRadius: 10,
  padding: '0 12px', fontSize: 17, fontFamily: 'inherit', color: K.ink,
  fontWeight: 600, boxSizing: 'border-box', outline: 'none', background: K.card,
}

interface Props {
  org: any
  onListo: () => void
  onCerrar: () => void
}

export default function RegistrarPago({ org, onListo, onCerrar }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [monto, setMonto] = useState<number>(0)
  const [metodo, setMetodo] = useState('Transferencia')
  const [referencia, setReferencia] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const periodicidad: 'mensual' | 'anual' = org.plan === 'anual' ? 'anual' : 'mensual'
  const nuevaVigencia = calcularNuevaVigencia(org.vigencia_hasta, periodicidad)
  const estadoActual = evaluarCobranza(org.vigencia_hasta, org.dias_gracia ?? 5)
  const reactiva = org.activo === false || estadoActual.estado === 'vencido'

  async function registrar() {
    if (monto <= 0) { setError('Captura el monto recibido.'); return }
    setGuardando(true); setError('')

    const { data: contrato } = await supabase
      .from('contratos').select('id').eq('organizacion_id', org.id)
      .eq('estado', 'activo').limit(1).single()

    if (!contrato) {
      setGuardando(false)
      setError('Este cliente no tiene un contrato activo. Da de alta el contrato antes de registrar pagos.')
      return
    }

    const { error: ePago } = await supabase.from('pagos_contrato').insert({
      contrato_id: contrato.id, monto, fecha_pago: new Date().toISOString().slice(0, 10),
      metodo, periodo_cubierto_hasta: nuevaVigencia, referencia: referencia || null,
    })
    if (ePago) { setGuardando(false); setError('No se pudo guardar el pago. ' + ePago.message); return }

    /* Registrar el pago reactiva la cuenta: si estaba suspendida por falta de
       pago, cobrar sin reactivar dejaría al cliente pagando sin acceso. */
    await supabase.from('organizaciones')
      .update({ vigencia_hasta: nuevaVigencia, activo: true })
      .eq('id', org.id)

    /* Un acuerdo pendiente de esta organización se da por cumplido: el pago
       que se prometió acaba de entrar. */
    await supabase.from('acuerdos')
      .update({ estado: 'cumplido' })
      .eq('organizacion_id', org.id)
      .eq('estado', 'pendiente')

    setGuardando(false)
    onListo()
  }

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(13,36,64,.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: K.card, borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>

        <div style={{ padding: '22px 26px', borderBottom: `1px solid ${K.line}` }}>
          <p style={{ fontSize: 24, fontWeight: 700, color: K.ink, margin: 0 }}>Registrar pago</p>
          <p style={{ fontSize: 15, color: K.muted, margin: '4px 0 0' }}>{org.nombre}</p>
        </div>

        <div style={{ padding: '22px 26px' }}>
          <div style={{ background: K.paper, borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, color: K.muted }}>Vigencia actual</span>
              <span style={{ fontSize: 15, color: K.ink, fontWeight: 600, ...nw }}>
                {org.vigencia_hasta ? fecha(org.vigencia_hasta) : 'Sin vigencia'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${K.line}`, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, color: K.muted }}>Queda cubierta hasta</span>
              <span style={{ fontSize: 17, color: K.green, fontWeight: 700, ...nw }}>{fecha(nuevaVigencia)}</span>
            </div>
            {org.vigencia_hasta && estadoActual.diasRestantes < 0 && (
              <p style={{ fontSize: 13, color: K.muted, margin: '10px 0 0', lineHeight: 1.5 }}>
                La vigencia venció hace {Math.abs(estadoActual.diasRestantes)} días, así que el nuevo periodo corre desde hoy y no desde la fecha vencida.
              </p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            <label>
              <span style={{ display: 'block', fontSize: 13, color: K.muted, marginBottom: 5 }}>Monto recibido</span>
              <input type="number" min={0} value={monto || ''} onChange={e => setMonto(Number(e.target.value) || 0)} style={campo} placeholder="0" />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 13, color: K.muted, marginBottom: 5 }}>Método</span>
              <select value={metodo} onChange={e => setMetodo(e.target.value)} style={{ ...campo, cursor: 'pointer' }}>
                {['Transferencia', 'Efectivo', 'Depósito', 'Tarjeta', 'Otro'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>

          <label style={{ display: 'block', marginTop: 12 }}>
            <span style={{ display: 'block', fontSize: 13, color: K.muted, marginBottom: 5 }}>Referencia o folio</span>
            <input value={referencia} onChange={e => setReferencia(e.target.value)} style={campo} placeholder="Opcional" />
          </label>

          {reactiva && (
            <div style={{ marginTop: 16, background: K.greenSoft, borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ fontSize: 15, color: K.ink, margin: 0, lineHeight: 1.55 }}>
                Esta cuenta está suspendida. Al registrar el pago se <strong style={{ color: K.green }}>reactiva</strong> y sus usuarios recuperan el acceso.
              </p>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 16, background: K.redSoft, border: `1px solid ${K.red}33`, borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontSize: 15, color: K.red, margin: 0, lineHeight: 1.5 }}>{error}</p>
            </div>
          )}
        </div>

        <div style={{ padding: '18px 26px', borderTop: `1px solid ${K.line}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ padding: '13px 20px', borderRadius: 10, border: `1px solid ${K.line}`, background: 'transparent', color: K.muted, fontSize: 17, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={registrar} disabled={guardando || monto <= 0}
            style={{ ...botonPrimario, opacity: guardando || monto <= 0 ? .5 : 1, cursor: guardando || monto <= 0 ? 'default' : 'pointer' }}>
            {guardando ? 'Registrando…' : `Registrar ${monto > 0 ? mxn(monto) : 'pago'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
