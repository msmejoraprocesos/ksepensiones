'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { K, nw, num, tarjeta } from '@/lib/design-tokens'
import { diasEntre } from '@/lib/cartera'

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fecha = (d: string) => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

const campo: React.CSSProperties = {
  width: '100%', height: 44, border: `1px solid ${K.line}`, borderRadius: 10,
  padding: '0 12px', fontSize: 15, fontFamily: 'inherit', color: K.ink,
  boxSizing: 'border-box', outline: 'none', background: K.card,
}

/**
 * Acuerdos de palabra.
 *
 * Caso real del negocio: se concede acceso antes de que el pago entre, por
 * acuerdo verbal. Eso vivía en la memoria del administrador y por eso se
 * olvidaba cobrar. Un acuerdo vencido no es lo mismo que una cuenta morosa:
 * el cliente prometió y no cumplió, y esa es otra conversación al llamar.
 */
export default function Acuerdos({ orgs }: { orgs: any[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [lista, setLista] = useState<any[]>([])
  const [nuevo, setNuevo] = useState(false)
  const [form, setForm] = useState({ organizacion_id: '', descripcion: '', monto_comprometido: 0, fecha_compromiso: '' })
  const [error, setError] = useState('')

  async function cargar() {
    const { data } = await supabase.from('acuerdos').select('*').order('fecha_compromiso')
    setLista(data ?? [])
  }
  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pendientes = lista.filter(a => a.estado === 'pendiente')
  const nombreDe = (id: string) => orgs.find(o => o.id === id)?.nombre ?? 'Cliente'

  async function guardar() {
    if (!form.organizacion_id) { setError('Elige el cliente.'); return }
    if (!form.descripcion.trim()) { setError('Describe lo que se acordó.'); return }
    if (!form.fecha_compromiso) { setError('Captura cuándo se comprometió a pagar.'); return }
    const { error: e } = await supabase.from('acuerdos').insert({
      organizacion_id: form.organizacion_id,
      descripcion: form.descripcion.trim(),
      monto_comprometido: form.monto_comprometido || null,
      fecha_compromiso: form.fecha_compromiso,
      estado: 'pendiente',
    })
    if (e) { setError('No se pudo guardar. ' + e.message); return }
    setNuevo(false); setError('')
    setForm({ organizacion_id: '', descripcion: '', monto_comprometido: 0, fecha_compromiso: '' })
    cargar()
  }

  async function marcar(id: string, estado: 'cumplido' | 'incumplido') {
    await supabase.from('acuerdos').update({ estado }).eq('id', id)
    cargar()
  }

  return (
    <div style={{ ...tarjeta, marginTop: 20, overflow: 'hidden' }}>
      <div style={{ padding: '20px 22px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 20, fontWeight: 700, color: K.ink, margin: 0 }}>Acuerdos de palabra</p>
          <p style={{ fontSize: 13, color: K.muted, margin: '4px 0 0' }}>
            Compromisos verbales de pago. Se marcan como cumplidos solos al registrar el pago del cliente.
          </p>
        </div>
        <button onClick={() => setNuevo(v => !v)}
          style={{ padding: '11px 18px', borderRadius: 10, border: `1px solid ${K.line}`, background: nuevo ? K.paper : K.card, color: K.navy600, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', ...nw }}>
          {nuevo ? 'Cancelar' : 'Registrar acuerdo'}
        </button>
      </div>

      {nuevo && (
        <div style={{ padding: '0 22px 18px' }}>
          <div style={{ background: K.paper, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
              <select value={form.organizacion_id} onChange={e => setForm(p => ({ ...p, organizacion_id: e.target.value }))} style={{ ...campo, cursor: 'pointer' }}>
                <option value="">Elige el cliente…</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
              <input type="number" min={0} placeholder="Monto comprometido" value={form.monto_comprometido || ''}
                onChange={e => setForm(p => ({ ...p, monto_comprometido: Number(e.target.value) || 0 }))} style={campo} />
              <input type="date" value={form.fecha_compromiso}
                onChange={e => setForm(p => ({ ...p, fecha_compromiso: e.target.value }))} style={campo} />
            </div>
            <input placeholder="Qué se acordó. Ej. paga la primera semana de octubre tras cobrar a su cliente."
              value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
              style={{ ...campo, marginTop: 10 }} />
            {error && <p style={{ fontSize: 15, color: K.red, margin: '10px 0 0' }}>{error}</p>}
            <button onClick={guardar} style={{ marginTop: 12, padding: '12px 20px', borderRadius: 10, border: 'none', background: K.navy800, color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Guardar acuerdo
            </button>
          </div>
        </div>
      )}

      {pendientes.length === 0 ? (
        <p style={{ padding: '10px 22px 26px', fontSize: 15, color: K.muted, margin: 0 }}>
          Sin compromisos pendientes.
        </p>
      ) : (
        <div style={{ padding: '0 22px 20px' }}>
          {pendientes.map(a => {
            const atraso = diasEntre(a.fecha_compromiso, new Date())
            const vencido = atraso > 0
            return (
              <div key={a.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '16px 18px', marginBottom: 8, borderRadius: 12, background: vencido ? K.redSoft : K.paper, border: vencido ? `1px solid ${K.red}22` : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: vencido ? K.red : K.amber, flexShrink: 0, marginTop: 8 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 17, fontWeight: 600, color: K.ink }}>{nombreDe(a.organizacion_id)}</span>
                    {a.monto_comprometido && (
                      <span style={{ fontSize: 15, color: K.muted, ...num }}>{mxn(Number(a.monto_comprometido))}</span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: vencido ? K.red : K.amber, ...nw }}>
                      {vencido ? `Prometió hace ${atraso} días` : `Vence el ${fecha(a.fecha_compromiso)}`}
                    </span>
                  </div>
                  <p style={{ fontSize: 15, color: K.muted, margin: '4px 0 0', lineHeight: 1.5 }}>{a.descripcion}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => marcar(a.id, 'cumplido')}
                      style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: K.greenSoft, color: K.green, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Ya pagó
                    </button>
                    <button onClick={() => marcar(a.id, 'incumplido')}
                      style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${K.line}`, background: 'transparent', color: K.muted, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      No cumplió
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
