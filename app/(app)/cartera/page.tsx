'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import AltaCliente from './AltaCliente'
import RegistrarPago from './RegistrarPago'
import Acuerdos from './Acuerdos'
import { TablaSkeleton } from '@/components/Skeleton'
import { K, nw, num, tarjeta, botonPrimario, franja, halo } from '@/lib/design-tokens'
import {
  cotizar, normalizarTramos, validarTramos, TRAMOS_DEFAULT,
  evaluarCobranza, type TramoPrecio, type EstadoCartera,
} from '@/lib/cartera'

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

const SEMAFORO: Record<EstadoCartera, { txt: string; fg: string; bg: string }> = {
  vigente:       { txt: 'Vigente',       fg: K.green,  bg: K.greenSoft },
  por_vencer:    { txt: 'Por vencer',    fg: K.amber,  bg: K.amberSoft },
  en_tolerancia: { txt: 'En tolerancia', fg: K.orange, bg: K.orangeSoft },
  vencido:       { txt: 'Vencido',       fg: K.red,    bg: K.redSoft },
  sin_contrato:  { txt: 'Sin contrato',  fg: K.muted,  bg: K.paper },
}

const campo: React.CSSProperties = {
  height: 46, border: `1px solid ${K.line}`, borderRadius: 10, padding: '0 12px',
  fontSize: 17, fontFamily: 'inherit', color: K.ink, fontWeight: 600,
  boxSizing: 'border-box', outline: 'none', background: K.card,
}

export default function CarteraPage() {
  const supabase = useMemo(() => createClient(), [])
  const [tramos, setTramos] = useState<TramoPrecio[]>(TRAMOS_DEFAULT)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [usuarios, setUsuarios] = useState(10)
  const [periodicidad, setPeriodicidad] = useState<'mensual' | 'anual'>('mensual')
  const [orgs, setOrgs] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [alta, setAlta] = useState(false)
  const [pagoDe, setPagoDe] = useState<any | null>(null)
  const [suspendiendo, setSuspendiendo] = useState<any | null>(null)

  async function cargar() {
    const { data: o } = await supabase.from('organizaciones').select('id,nombre,plan,asientos,vigencia_hasta,dias_gracia,activo')
    setOrgs(o ?? [])
  }

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from('tramos_precio').select('*').order('hasta', { nullsFirst: false })
      if (t && t.length) setTramos(t.map((r: any) => ({ hasta: r.hasta, precioUsuario: Number(r.precio_usuario) })))
      const { data: o } = await supabase.from('organizaciones').select('id,nombre,plan,asientos,vigencia_hasta,dias_gracia,activo')
      setOrgs(o ?? [])
      setCargando(false)
    })()
  }, [])

  const errores = useMemo(() => validarTramos(tramos), [tramos])
  const cot = useMemo(() => cotizar(usuarios, periodicidad, tramos), [usuarios, periodicidad, tramos])

  const cartera = useMemo(() => orgs.map(o => ({
    ...o, ...evaluarCobranza(o.vigencia_hasta, o.dias_gracia ?? 5),
  })), [orgs])

  const resumen = useMemo(() => {
    const c = (e: EstadoCartera) => cartera.filter(x => x.estado === e).length
    return [
      { label: 'Vigentes', v: c('vigente'), color: K.greenLt },
      { label: 'Por vencer', v: c('por_vencer'), color: '#FCD34D' },
      { label: 'En tolerancia', v: c('en_tolerancia'), color: '#FDBA74' },
      { label: 'Vencidos', v: c('vencido'), color: '#FCA5A5' },
    ]
  }, [cartera])

  async function guardarTramos() {
    if (errores.length) return
    setGuardando(true); setMsg('')
    const orden = normalizarTramos(tramos)
    const { error: e1 } = await supabase.from('tramos_precio').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: e2 } = await supabase.from('tramos_precio')
      .insert(orden.map(t => ({ hasta: t.hasta, precio_usuario: t.precioUsuario })))
    setGuardando(false)
    setMsg(e1 || e2 ? 'No se pudieron guardar los tramos. Revisa que la migración de cartera esté aplicada.' : 'Tabla de precios guardada.')
    if (!e1 && !e2) setTramos(orden)
  }

  const set = (i: number, patch: Partial<TramoPrecio>) =>
    setTramos(p => p.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: 1280, margin: '0 auto' }}>

      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, background: franja() }}>
        <div style={halo()} />
        <div style={{ position: 'relative', padding: '26px 30px 20px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', margin: 0 }}>CARTERA</p>
          <p style={{ fontSize: 'clamp(34px,4vw,52px)', fontWeight: 800, color: '#fff', margin: '8px 0 0', lineHeight: 1, letterSpacing: '-.035em', ...nw, ...num }}>
            {cargando ? '—' : mxn(cartera.filter(c => c.estado !== 'sin_contrato').reduce((s, c) => s + (cotizar(c.asientos ?? 1, 'mensual', tramos).totalMensual), 0))}
          </p>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,.68)', margin: '10px 0 0' }}>
            Ingreso mensual recurrente sobre {cartera.filter(c => c.estado !== 'sin_contrato').length} contratos.
          </p>
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 1, background: 'rgba(255,255,255,.11)' }}>
          {resumen.map(r => (
            <div key={r.label} style={{ background: K.navy900, padding: '16px 22px' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.56)', margin: 0 }}>{r.label}</p>
              <p style={{ fontSize: 26, fontWeight: 700, color: r.color, margin: '2px 0 0', ...num }}>{r.v}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 20, marginTop: 20 }}>

        {/* ── Tabla de precios ─────────────────────────────────── */}
        <div style={tarjeta}>
          <div style={{ padding: '20px 22px 0' }}>
            <p style={{ fontSize: 20, fontWeight: 700, color: K.ink, margin: 0 }}>Tabla de precios por volumen</p>
            <p style={{ fontSize: 13, color: K.muted, margin: '4px 0 16px' }}>
              El último tramo siempre queda abierto: cubre cualquier número de usuarios por encima del anterior.
            </p>
          </div>

          <div style={{ padding: '0 22px' }}>
            {tramos.map((t, i) => {
              const abierto = t.hasta === null
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 44px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 13, color: K.muted, marginBottom: 4 }}>
                      {abierto ? 'Más de' : 'Hasta'}
                    </span>
                    {abierto
                      ? <div style={{ ...campo, display: 'flex', alignItems: 'center', color: K.muted, fontWeight: 500 }}>
                          {i > 0 ? `${(tramos[i - 1].hasta ?? 0) + 1} usuarios` : 'cualquier cantidad'}
                        </div>
                      : <input type="number" min={1} value={t.hasta ?? ''} style={{ ...campo, width: '100%' }}
                          onChange={e => set(i, { hasta: Number(e.target.value) || null })} />}
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 13, color: K.muted, marginBottom: 4 }}>Precio por usuario</span>
                    <input type="number" min={0} step={50} value={t.precioUsuario} style={{ ...campo, width: '100%' }}
                      onChange={e => set(i, { precioUsuario: Number(e.target.value) || 0 })} />
                  </label>
                  <button onClick={() => setTramos(p => p.filter((_, j) => j !== i))}
                    disabled={tramos.length <= 1} aria-label="Quitar tramo"
                    style={{ height: 46, borderRadius: 10, border: `1px solid ${K.line}`, background: K.card, color: K.muted, cursor: tramos.length <= 1 ? 'default' : 'pointer', fontSize: 18, fontFamily: 'inherit', opacity: tramos.length <= 1 ? .4 : 1 }}>×</button>
                </div>
              )
            })}

            <button onClick={() => setTramos(p => [...p.slice(0, -1), { hasta: (p[p.length - 2]?.hasta ?? 0) + 10, precioUsuario: p[p.length - 1].precioUsuario }, p[p.length - 1]])}
              style={{ marginTop: 4, padding: '11px 16px', borderRadius: 10, border: `1px dashed ${K.line}`, background: 'transparent', color: K.navy600, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
              Agregar tramo
            </button>

            {errores.length > 0 && (
              <div style={{ marginTop: 14, background: K.redSoft, border: `1px solid ${K.red}33`, borderRadius: 10, padding: '12px 14px' }}>
                {errores.map((e, i) => <p key={i} style={{ fontSize: 15, color: K.red, margin: i ? '6px 0 0' : 0, lineHeight: 1.5 }}>{e}</p>)}
              </div>
            )}
            {msg && <p style={{ fontSize: 15, color: msg.startsWith('No') ? K.red : K.green, margin: '12px 0 0' }}>{msg}</p>}
          </div>

          <div style={{ padding: '16px 22px 20px' }}>
            <button onClick={guardarTramos} disabled={guardando || errores.length > 0}
              style={{ ...botonPrimario, width: '100%', justifyContent: 'center', opacity: guardando || errores.length ? .5 : 1, cursor: guardando || errores.length ? 'default' : 'pointer' }}>
              {guardando ? 'Guardando…' : 'Guardar tabla de precios'}
            </button>
          </div>
        </div>

        {/* ── Cotizador ────────────────────────────────────────── */}
        <div style={tarjeta}>
          <div style={{ padding: '20px 22px' }}>
            <p style={{ fontSize: 20, fontWeight: 700, color: K.ink, margin: 0 }}>Cotizador</p>
            <p style={{ fontSize: 13, color: K.muted, margin: '4px 0 16px' }}>Usa la tabla de arriba en tiempo real.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, color: K.muted, marginBottom: 4 }}>Usuarios</span>
                <input type="number" min={1} value={usuarios} onChange={e => setUsuarios(Number(e.target.value) || 1)} style={{ ...campo, width: '100%' }} />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 13, color: K.muted, marginBottom: 4 }}>Periodicidad</span>
                <select value={periodicidad} onChange={e => setPeriodicidad(e.target.value as any)} style={{ ...campo, width: '100%', cursor: 'pointer' }}>
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual</option>
                </select>
              </label>
            </div>

            <div style={{ marginTop: 18, background: K.navy900, borderRadius: 12, padding: '20px 22px' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.56)', margin: 0 }}>
                Total {periodicidad}
              </p>
              <p style={{ fontSize: 40, fontWeight: 800, color: '#fff', margin: '4px 0 0', lineHeight: 1, ...nw, ...num }}>
                {mxn(cot.totalPeriodo)}
              </p>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,.68)', margin: '8px 0 0', ...num }}>
                {cot.usuarios} {cot.usuarios === 1 ? 'usuario' : 'usuarios'} × {mxn(cot.precioUsuario)}
              </p>
            </div>

            {periodicidad === 'anual' && cot.ahorroAnual > 0 && (
              <div style={{ marginTop: 10, background: K.greenSoft, borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 15, color: K.ink, margin: 0 }}>
                  Ahorra <strong style={{ color: K.green, ...num }}>{mxn(cot.ahorroAnual)}</strong> al año frente al pago mensual.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Estado de la cartera ───────────────────────────────── */}
      <div style={{ ...tarjeta, marginTop: 20, overflow: 'hidden' }}>
        <div style={{ padding: '20px 22px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 20, fontWeight: 700, color: K.ink, margin: 0 }}>Estado de la cartera</p>
          <button onClick={() => setAlta(true)} style={{ ...botonPrimario, padding: '11px 20px' }}>
            Dar de alta cliente
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ background: K.paper }}>
                {['Cliente', 'Asientos', 'Vence', 'Estado', 'Atraso', ''].map((h, i) => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: K.muted, textAlign: i > 0 ? 'right' : 'left', ...nw }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={6} style={{ padding: 0 }}><TablaSkeleton filas={4} columnas={6} /></td></tr>
              ) : cartera.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '36px 20px', textAlign: 'center', color: K.muted }}>
                  <p style={{ fontSize: 17, margin: 0 }}>Todavía no hay clientes registrados.</p>
                  <button onClick={() => setAlta(true)} style={{ ...botonPrimario, margin: '16px auto 0' }}>Dar de alta el primero</button>
                </td></tr>
              ) : cartera.map(c => {
                const s = SEMAFORO[c.estado as EstadoCartera]
                return (
                  <tr key={c.id} style={{ borderTop: `1px solid ${K.line}` }}>
                    <td style={{ padding: '13px 16px', color: K.ink, fontWeight: 600 }}>{c.nombre}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', color: K.muted, ...num }}>{c.asientos ?? 1}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', color: K.muted, ...nw, ...num }}>
                      {c.vigencia_hasta ? new Date(c.vigencia_hasta).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: s.fg, background: s.bg, padding: '5px 11px', borderRadius: 7, ...nw }}>{s.txt}</span>
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', color: c.diasVencido > 0 ? K.red : K.muted, fontWeight: c.diasVencido > 0 ? 700 : 400, ...nw, ...num }}>
                      {c.diasVencido > 0 ? `${c.diasVencido} días` : '—'}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', ...nw }}>
                      <button onClick={() => setPagoDe(c)}
                        style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${K.line}`, background: K.card, color: K.navy600, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Registrar pago
                      </button>
                      {c.estado === 'vencido' && c.activo !== false && (
                        <button onClick={() => setSuspendiendo(c)}
                          style={{ marginLeft: 8, padding: '8px 14px', borderRadius: 8, border: `1px solid ${K.red}44`, background: K.redSoft, color: K.red, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Suspender
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Acuerdos orgs={orgs} />

      {alta && (
        <AltaCliente
          tramos={tramos}
          onCerrar={() => setAlta(false)}
          onCreado={() => { setAlta(false); cargar() }}
        />
      )}

      {pagoDe && (
        <RegistrarPago
          org={pagoDe}
          onCerrar={() => setPagoDe(null)}
          onListo={() => { setPagoDe(null); cargar() }}
        />
      )}

      {/* La suspension nunca es automatica: el sistema detecta el vencimiento
          y propone, el administrador decide. Puede haber un acuerdo de palabra
          que el sistema no conoce. */}
      {suspendiendo && (
        <div onClick={() => setSuspendiendo(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(13,36,64,.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: K.card, borderRadius: 16, width: '100%', maxWidth: 460, padding: '26px 28px' }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: K.ink, margin: 0 }}>¿Suspender a {suspendiendo.nombre}?</p>
            <p style={{ fontSize: 15, color: K.muted, margin: '10px 0 0', lineHeight: 1.6 }}>
              Lleva {suspendiendo.diasVencido} días vencido pasada la tolerancia. Sus {suspendiendo.asientos ?? 1} usuarios perderán el acceso de inmediato, aunque su información queda intacta y vuelve al registrar el pago.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setSuspendiendo(null)}
                style={{ padding: '13px 20px', borderRadius: 10, border: `1px solid ${K.line}`, background: 'transparent', color: K.muted, fontSize: 17, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                No, dejar activa
              </button>
              <button onClick={async () => {
                await supabase.from('organizaciones').update({ activo: false }).eq('id', suspendiendo.id)
                setSuspendiendo(null); cargar()
              }}
                style={{ padding: '13px 20px', borderRadius: 10, border: 'none', background: K.red, color: 'white', fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Sí, suspender
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
