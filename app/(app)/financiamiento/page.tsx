'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B', NARANJA = '#F05B21', VERDE = '#2E8B57'
const fmtMXN  = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const fmtFecha = (s: string | null) => { if (!s) return '—'; const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) }

const ESTATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  pendiente:  { bg: '#FFFBEB', color: '#92400E', label: 'Pendiente' },
  activo:     { bg: '#EFF6FF', color: '#1D4ED8', label: 'Activo' },
  liquidado:  { bg: '#F0FDF4', color: '#065F46', label: 'Liquidado' },
  cancelado:  { bg: '#FEF2F2', color: '#991B1B', label: 'Cancelado' },
}

function Badge({ estatus }: { estatus: string }) {
  const c = ESTATUS_COLORS[estatus] ?? { bg: '#F4F6FB', color: '#6B7280', label: estatus }
  return <span style={{ padding: '2px 8px', background: c.bg, color: c.color, fontSize: '11px', fontWeight: 700, border: `1px solid ${c.color}30` }}>{c.label}</span>
}

function FinanciamientoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [tab, setTab] = useState<'lista' | 'detalle' | 'instituciones' | 'corrida'>('lista')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)

  const [financiamientos, setFinanciamientos] = useState<any[]>([])
  const [filtroEstatus, setFiltroEstatus] = useState('todos')
  const [selFin, setSelFin] = useState<any>(null)
  const [pagos, setPagos] = useState<any[]>([])

  const [instituciones, setInstituciones] = useState<any[]>([])
  const [showNuevaInst, setShowNuevaInst] = useState(false)
  const [formInst, setFormInst] = useState({ nombre: '', tasa_anual: 32.2, plazo_max_meses: 60, tipo: 'banco', notas: '' })
  const [guardandoInst, setGuardandoInst] = useState(false)

  const [corrMonto, setCorrMonto] = useState(100000)
  const [corrPlazo, setCorrPlazo] = useState(36)
  const [corrTasa, setCorrTasa] = useState(32.2)
  const [corrInstId, setCorrInstId] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      Promise.all([loadFinanciamientos(session.user.id), loadInstituciones(session.user.id)]).then(() => setLoading(false))
    })
    if (searchParams.get('fin')) setTab('detalle')
  }, [])

  async function loadFinanciamientos(uid: string) {
    const { data } = await supabase.from('financiamientos')
      .select('*, clientes(nombre), instituciones_financieras(nombre)')
      .eq('asesor_id', uid).order('created_at', { ascending: false })
    if (data) setFinanciamientos(data.map((f: any) => ({ ...f, cliente_nombre: f.clientes?.nombre ?? '—', institucion_nombre: f.instituciones_financieras?.nombre ?? '—' })))
  }

  async function loadInstituciones(uid: string) {
    const { data } = await supabase.from('instituciones_financieras').select('*').eq('asesor_id', uid).order('nombre')
    if (data) setInstituciones(data)
  }

  async function openDetalle(fin: any) {
    setSelFin(fin)
    const { data } = await supabase.from('pagos_financiamiento').select('*').eq('financiamiento_id', fin.id).order('numero_pago')
    setPagos(data ?? [])
    setTab('detalle')
  }

  async function cambiarEstatus(id: string, estatus: string) {
    await supabase.from('financiamientos').update({ estatus, updated_at: new Date().toISOString() }).eq('id', id)
    await loadFinanciamientos(userId)
    setSelFin((prev: any) => prev ? { ...prev, estatus } : null)
  }

  async function marcarPago(pagoId: string, pagado: boolean) {
    await supabase.from('pagos_financiamiento').update({ estatus: pagado ? 'pagado' : 'pendiente', fecha_real: pagado ? new Date().toISOString().slice(0, 10) : null }).eq('id', pagoId)
    if (selFin) { const { data } = await supabase.from('pagos_financiamiento').select('*').eq('financiamiento_id', selFin.id).order('numero_pago'); setPagos(data ?? []) }
  }

  async function guardarInstitucion() {
    setGuardandoInst(true)
    await supabase.from('instituciones_financieras').insert({ asesor_id: userId, ...formInst, notas: formInst.notas || null })
    await loadInstituciones(userId)
    setShowNuevaInst(false)
    setFormInst({ nombre: '', tasa_anual: 32.2, plazo_max_meses: 60, tipo: 'banco', notas: '' })
    setGuardandoInst(false)
  }

  const tasaMensual = corrTasa / 100 / 12
  const cuotaCorr = tasaMensual > 0 ? corrMonto * (tasaMensual * Math.pow(1 + tasaMensual, corrPlazo)) / (Math.pow(1 + tasaMensual, corrPlazo) - 1) : corrMonto / corrPlazo
  const totalCorr = cuotaCorr * corrPlazo
  const tablaCorr = Array.from({ length: corrPlazo }, (_, i) => {
    const saldoAnt = i === 0 ? corrMonto : corrMonto * Math.pow(1 + tasaMensual, i) - cuotaCorr * (Math.pow(1 + tasaMensual, i) - 1) / tasaMensual
    const interes = saldoAnt * tasaMensual
    const capital = cuotaCorr - interes
    const saldo = Math.max(0, saldoAnt - capital)
    return { n: i + 1, cuota: cuotaCorr, interes, capital, saldo }
  })

  const finActivos = financiamientos.filter(f => f.estatus === 'activo')
  const totalCartera = finActivos.reduce((s: number, f: any) => s + f.monto_total, 0)
  const comisionesPendientes = financiamientos.filter((f: any) => !f.comision_cobrada && f.comision_monto > 0).reduce((s: number, f: any) => s + f.comision_monto, 0)
  const comisionesCobradas = financiamientos.filter((f: any) => f.comision_cobrada).reduce((s: number, f: any) => s + f.comision_monto, 0)
  const finFiltrados = filtroEstatus === 'todos' ? financiamientos : financiamientos.filter((f: any) => f.estatus === filtroEstatus)

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#9CA3AF' }}>Cargando...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#F4F6FB' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #E5E7EB', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: '800', color: AZUL, margin: 0 }}>Financiamiento</h1>
          <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>Créditos autorizados · Seguimiento · Instituciones</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['lista', 'instituciones', 'corrida'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', background: tab === t ? AZUL : '#F4F6FB', color: tab === t ? 'white' : '#6B7280', border: `1px solid ${tab === t ? AZUL : '#E5E7EB'}`, fontSize: '12px', fontWeight: (tab === t ? '700' : '400'), cursor: 'pointer', fontFamily: 'inherit' }}>
              {t === 'lista' ? '📋 Financiamientos' : t === 'instituciones' ? '🏦 Instituciones' : '🧮 Corrida'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 24px' }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Total financiamientos', value: financiamientos.length.toString(), color: AZUL },
            { label: 'Cartera activa', value: fmtMXN(totalCartera), color: NARANJA },
            { label: 'Comisiones por cobrar', value: fmtMXN(comisionesPendientes), color: '#DC2626' },
            { label: 'Comisiones cobradas', value: fmtMXN(comisionesCobradas), color: VERDE },
          ].map((k, i) => (
            <div key={i} style={{ background: 'white', border: '1px solid #E5E7EB', borderLeft: `3px solid ${k.color}`, padding: '12px 16px' }}>
              <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{k.label}</div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* LISTA */}
        {tab === 'lista' && (
          <div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
              {['todos', 'pendiente', 'activo', 'liquidado', 'cancelado'].map(e => (
                <button key={e} onClick={() => setFiltroEstatus(e)} style={{ padding: '5px 12px', background: filtroEstatus === e ? AZUL : 'white', color: filtroEstatus === e ? 'white' : '#6B7280', border: `1px solid ${filtroEstatus === e ? AZUL : '#E5E7EB'}`, fontSize: '11px', fontWeight: (filtroEstatus === e ? '700' : '400'), cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                  {e === 'todos' ? `Todos (${financiamientos.length})` : `${ESTATUS_COLORS[e]?.label} (${financiamientos.filter((f: any) => f.estatus === e).length})`}
                </button>
              ))}
            </div>
            {finFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF', background: 'white', border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>💳</div>
                <p style={{ margin: 0 }}>No hay financiamientos registrados.</p>
                <p style={{ fontSize: '12px', margin: '6px 0 0' }}>Se crean automáticamente al autorizar un diagnóstico con financiamiento desde la Calculadora.</p>
              </div>
            ) : (
              <div style={{ background: 'white', border: '1px solid #E5E7EB' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['Cliente', 'Institución', 'Monto', 'Cuota/mes', 'Plazo', 'Comisión', 'Estatus', ''].map((h, i) => (
                      <th key={i} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#F8FAFC', padding: '9px 12px', textAlign: (i > 1 ? 'right' : 'left'), fontSize: '10px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', boxShadow: 'inset 0 -2px 0 #E5E7EB', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {finFiltrados.map((f: any, i: number) => (
                      <tr key={f.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? 'white' : '#FAFAFA', cursor: 'pointer' }} onClick={() => openDetalle(f)}>
                        <td style={{ padding: '10px 12px', fontWeight: '600', color: '#111827' }}>{f.cliente_nombre}</td>
                        <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: '12px' }}>{f.institucion_nombre}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{fmtMXN(f.monto_total)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{fmtMXN2(f.cuota_mensual)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{f.plazo_meses} meses</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {f.comision_monto > 0 ? <span style={{ color: f.comision_cobrada ? VERDE : '#DC2626', fontWeight: '700' }}>{fmtMXN(f.comision_monto)} {f.comision_cobrada ? '✓' : '⏳'}</span> : <span style={{ color: '#9CA3AF' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Badge estatus={f.estatus} /></td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}><span style={{ color: AZUL, fontSize: '12px' }}>Ver →</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* DETALLE */}
        {tab === 'detalle' && selFin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button onClick={() => setTab('lista')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: AZUL, cursor: 'pointer', fontSize: '13px', padding: 0 }}>← Volver</button>
            <div style={{ background: 'white', border: '1px solid #E5E7EB', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '16px', fontWeight: '800', color: '#111827', margin: '0 0 4px' }}>{selFin.cliente_nombre}</p>
                <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>{selFin.institucion_nombre} · {selFin.tasa_anual}% anual · {selFin.plazo_meses} meses</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Badge estatus={selFin.estatus} />
                <select value={selFin.estatus} onChange={e => cambiarEstatus(selFin.id, e.target.value)} style={{ padding: '6px 10px', border: '1px solid #E5E7EB', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', background: 'white' }}>
                  {['pendiente', 'activo', 'liquidado', 'cancelado'].map(s => <option key={s} value={s}>{ESTATUS_COLORS[s]?.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {[
                { label: 'Monto financiado', value: fmtMXN(selFin.monto_total), color: AZUL },
                { label: 'Cuota mensual', value: fmtMXN2(selFin.cuota_mensual), color: NARANJA },
                { label: 'Pensión sin Mod.40', value: selFin.pension_sin_mod40 ? fmtMXN2(selFin.pension_sin_mod40) : '—', color: '#6B7280' },
                { label: 'Pensión con Mod.40', value: selFin.pension_con_mod40 ? fmtMXN2(selFin.pension_con_mod40) : '—', color: VERDE },
              ].map((k, i) => (
                <div key={i} style={{ background: 'white', border: '1px solid #E5E7EB', borderLeft: `3px solid ${k.color}`, padding: '10px 14px' }}>
                  <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{k.label}</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            {selFin.comision_monto > 0 && (
              <div style={{ background: 'white', border: '1px solid #E5E7EB', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#374151', margin: '0 0 2px' }}>Comisión: {fmtMXN(selFin.comision_monto)} ({selFin.comision_pct}%)</p>
                  <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>{selFin.comision_cobrada ? 'Cobrada' : 'Pendiente de cobro'}</p>
                </div>
                <button onClick={async () => { await supabase.from('financiamientos').update({ comision_cobrada: !selFin.comision_cobrada }).eq('id', selFin.id); setSelFin({ ...selFin, comision_cobrada: !selFin.comision_cobrada }); await loadFinanciamientos(userId) }}
                  style={{ padding: '7px 14px', background: selFin.comision_cobrada ? '#FEF2F2' : '#F0FDF4', color: selFin.comision_cobrada ? '#DC2626' : VERDE, border: `1px solid ${selFin.comision_cobrada ? '#FCA5A5' : '#86EFAC'}`, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {selFin.comision_cobrada ? 'Marcar pendiente' : '✓ Marcar como cobrada'}
                </button>
              </div>
            )}
            {pagos.length > 0 && (
              <div style={{ background: 'white', border: '1px solid #E5E7EB' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#374151', margin: 0 }}>Tabla de pagos</p>
                  <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>{pagos.filter((p: any) => p.estatus === 'pagado').length} de {pagos.length} pagados</p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>{['#', 'Fecha prog.', 'Fecha real', 'Monto', 'Estatus', ''].map((h, i) => <th key={i} style={{ padding: '7px 10px', textAlign: (i > 1 ? 'right' : 'left'), fontWeight: '700', color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {pagos.map((p: any) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6', background: p.estatus === 'pagado' ? '#F0FDF4' : 'white' }}>
                        <td style={{ padding: '6px 10px', color: '#6B7280' }}>{p.numero_pago}</td>
                        <td style={{ padding: '6px 10px', color: '#374151' }}>{fmtFecha(p.fecha_programada)}</td>
                        <td style={{ padding: '6px 10px', color: '#374151' }}>{fmtFecha(p.fecha_real)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>{fmtMXN2(p.monto)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}><Badge estatus={p.estatus} /></td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                          <button onClick={e => { e.stopPropagation(); marcarPago(p.id, p.estatus !== 'pagado') }} style={{ padding: '3px 8px', background: 'none', border: `1px solid ${p.estatus === 'pagado' ? '#D1D5DB' : VERDE}`, color: p.estatus === 'pagado' ? '#9CA3AF' : VERDE, fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {p.estatus === 'pagado' ? 'Desmarcar' : '✓ Pagado'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* INSTITUCIONES */}
        {tab === 'instituciones' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>Tus convenios con instituciones. Aparecen como opciones al registrar un financiamiento desde la Calculadora.</p>
              <button onClick={() => setShowNuevaInst(true)} style={{ padding: '8px 16px', background: AZUL, color: 'white', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>+ Nueva institución</button>
            </div>
            {instituciones.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF', background: 'white', border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏦</div>
                <p style={{ margin: 0 }}>Aún no tienes instituciones configuradas.</p>
              </div>
            ) : (
              <div style={{ background: 'white', border: '1px solid #E5E7EB' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>{['Institución', 'Tipo', 'Tasa anual', 'Plazo máx.', 'Estatus', ''].map((h, i) => <th key={i} style={{ padding: '9px 12px', textAlign: (i > 1 ? 'right' : 'left'), fontSize: '10px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #E5E7EB' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {instituciones.map((inst: any, i: number) => (
                      <tr key={inst.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                        <td style={{ padding: '10px 12px', fontWeight: '600', color: '#111827' }}>{inst.nombre}</td>
                        <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: '12px' }}>{inst.tipo === 'banco' ? 'Banco / Financiera' : 'Directo'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: NARANJA }}>{inst.tasa_anual}%</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{inst.plazo_max_meses} meses</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}><span style={{ padding: '2px 8px', background: inst.activo ? '#F0FDF4' : '#F3F4F6', color: inst.activo ? VERDE : '#9CA3AF', fontSize: '11px', fontWeight: 700 }}>{inst.activo ? 'Activa' : 'Inactiva'}</span></td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button onClick={async () => { if (!confirm('¿Eliminar?')) return; await supabase.from('instituciones_financieras').delete().eq('id', inst.id); await loadInstituciones(userId) }} style={{ padding: '4px 10px', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', fontSize: '10.5px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {showNuevaInst && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                <div style={{ background: 'white', width: '100%', maxWidth: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                  <div style={{ background: AZUL, padding: '14px 20px' }}><p style={{ fontSize: '14px', fontWeight: '700', color: 'white', margin: 0 }}>+ Nueva institución</p></div>
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[{ label: 'Nombre', key: 'nombre', type: 'text', placeholder: 'Ej. HSBC, Caja Popular...' }, { label: 'Tasa anual (%)', key: 'tasa_anual', type: 'number', placeholder: '32.2' }, { label: 'Plazo máximo (meses)', key: 'plazo_max_meses', type: 'number', placeholder: '60' }].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: '10.5px', fontWeight: '600', color: '#6B7280', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                        <input type={f.type} placeholder={f.placeholder} value={(formInst as any)[f.key]} onChange={e => setFormInst(prev => ({ ...prev, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: '600', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Tipo</label>
                      <select value={formInst.tipo} onChange={e => setFormInst(prev => ({ ...prev, tipo: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', fontFamily: 'inherit', background: 'white' }}>
                        <option value="banco">Banco / Financiera</option>
                        <option value="directo">Financiamiento directo (yo)</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <button onClick={() => setShowNuevaInst(false)} style={{ flex: 1, padding: '10px', background: '#F8FAFC', color: '#374151', border: '1px solid #E5E7EB', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                      <button onClick={guardarInstitucion} disabled={!formInst.nombre || guardandoInst} style={{ flex: 1, padding: '10px', background: AZUL, color: 'white', border: 'none', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', opacity: !formInst.nombre || guardandoInst ? 0.6 : 1 }}>
                        {guardandoInst ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CORRIDA */}
        {tab === 'corrida' && (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '16px', alignItems: 'start' }}>
            <div style={{ background: 'white', border: '1px solid #E5E7EB', padding: '20px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#374151', margin: '0 0 16px' }}>⚙️ Parámetros</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '10.5px', fontWeight: '600', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Institución (opcional)</label>
                  <select value={corrInstId} onChange={e => { setCorrInstId(e.target.value); const inst = instituciones.find((i: any) => i.id === e.target.value); if (inst) { setCorrTasa(inst.tasa_anual) } }} style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '12px', fontFamily: 'inherit', background: 'white' }}>
                    <option value="">— Manual —</option>
                    {instituciones.filter((i: any) => i.activo).map((i: any) => <option key={i.id} value={i.id}>{i.nombre} ({i.tasa_anual}%)</option>)}
                  </select>
                </div>
                {[{ label: 'Monto ($)', value: corrMonto, set: setCorrMonto }, { label: 'Plazo (meses)', value: corrPlazo, set: setCorrPlazo }, { label: 'Tasa anual (%)', value: corrTasa, set: setCorrTasa }].map(f => (
                  <div key={f.label}>
                    <label style={{ fontSize: '10.5px', fontWeight: '600', color: '#6B7280', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                    <input type="number" value={f.value} onChange={e => f.set(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                ))}
                <div style={{ marginTop: '8px', padding: '12px', background: '#EEF2F8', border: '1px solid #BFDBFE' }}>
                  {[{ label: 'Cuota mensual', value: fmtMXN2(cuotaCorr), big: true }, { label: 'Total a pagar', value: fmtMXN2(totalCorr) }, { label: 'Total intereses', value: fmtMXN2(totalCorr - corrMonto) }].map((k, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: i < 2 ? '6px' : 0 }}>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>{k.label}</span>
                      <span style={{ fontSize: k.big ? '16px' : '12px', fontWeight: '700', color: AZUL }}>{k.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ background: 'white', border: '1px solid #E5E7EB' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#374151', margin: 0 }}>Tabla de amortización — {corrPlazo} pagos</p>
              </div>
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead><tr style={{ background: '#1B3A6B' }}>{['#', 'Cuota', 'Interés', 'Capital', 'Saldo'].map((h, i) => <th key={i} style={{ padding: '8px 12px', color: 'white', fontWeight: '700', textAlign: (i === 0 ? 'left' : 'right') }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {tablaCorr.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                        <td style={{ padding: '6px 12px', color: '#6B7280' }}>{r.n}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600' }}>{fmtMXN2(r.cuota)}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#DC2626' }}>{fmtMXN2(r.interes)}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: VERDE }}>{fmtMXN2(r.capital)}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#374151' }}>{fmtMXN2(r.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Page() {
  return <Suspense><FinanciamientoPage /></Suspense>
}
