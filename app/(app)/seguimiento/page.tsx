'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1F3A5F'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

interface Actividad {
  id: string
  tipo: string
  titulo: string
  notas: string | null
  fecha_programada: string | null
  estatus: string
  cliente_id: string | null
  clientes?: { nombre: string } | null
  comentario: string | null
}

interface Cliente { id: string; nombre: string }

const TIPO_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  llamada:  { color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd', label: 'Llamada' },
  cita:     { color: '#9a3412', bg: '#ffedd5', border: '#fdba74', label: 'Cita' },
  email:    { color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd', label: 'Email' },
  whatsapp: { color: '#166534', bg: '#dcfce7', border: '#86efac', label: 'WhatsApp' },
  nota:     { color: '#475569', bg: '#f1f5f9', border: '#cbd5e1', label: 'Nota' },
}

const TIPO_ICONS: Record<string, string> = { llamada: '📞', cita: '📅', email: '✉️', whatsapp: '💬', nota: '📝' }
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const HORAS = Array.from({ length: 24 }, (_, i) => i)

function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}
function startOfWeek(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
}

export default function SeguimientoPage() {
  const supabase = createClient()
  const [vista, setVista] = useState<'mes' | 'semana' | 'dia'>('semana')
  const [fecha, setFecha] = useState(new Date())
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [userId, setUserId] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [fechaSel, setFechaSel] = useState('')
  const [horaSel, setHoraSel] = useState('09:00')
  const [form, setForm] = useState({ tipo: 'llamada', titulo: '', cliente_id: '', notas: '' })
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [detalle, setDetalle] = useState<Actividad | null>(null)
  const [comentarioDetalle, setComentarioDetalle] = useState('')
  const [savingComentario, setSavingComentario] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      loadData(session.user.id)
    })
  }, [])

  useEffect(() => {
    if (scrollRef.current && (vista === 'semana' || vista === 'dia')) {
      scrollRef.current.scrollTop = 7 * 56
    }
  }, [vista])

  async function loadData(uid: string) {
    setCargando(true)
    const [{ data: acts }, { data: clis }] = await Promise.all([
      supabase.from('actividades').select('*, clientes(nombre)').eq('asesor_id', uid).order('fecha_programada'),
      supabase.from('clientes').select('id, nombre').eq('asesor_id', uid).order('nombre'),
    ])
    setActividades((acts as Actividad[]) ?? [])
    setClientes((clis as Cliente[]) ?? [])
    setCargando(false)
  }

  async function guardar() {
    if (!form.titulo.trim()) return
    setGuardando(true)
    let fechaCompleta: string | null = null
    if (fechaSel && horaSel) {
      const [yr, mo, dy] = fechaSel.split('-').map(Number)
      const [hh, mm] = horaSel.split(':').map(Number)
      const local = new Date(yr, mo-1, dy, hh, mm, 0)
      fechaCompleta = local.toISOString()
    }
    const { data } = await supabase.from('actividades').insert({
      asesor_id: userId, titulo: form.titulo, tipo: form.tipo,
      fecha_programada: fechaCompleta,
      notas: form.notas || null,
      cliente_id: form.cliente_id || null,
      estatus: 'pendiente',
      comentario: null,
    }).select('*, clientes(nombre)').single()
    if (data) {
      setActividades(prev => [...prev, data as Actividad])
      setMensaje('✓ Actividad creada')
      setTimeout(() => setMensaje(''), 3000)
    }
    setShowModal(false)
    setForm({ tipo: 'llamada', titulo: '', cliente_id: '', notas: '' })
    setGuardando(false)
  }

  async function completar(act: Actividad) {
    const nuevoEstatus = act.estatus === 'pendiente' ? 'completado' : 'pendiente'
    await supabase.from('actividades').update({ estatus: nuevoEstatus }).eq('id', act.id)
    setActividades(prev => prev.map(a => a.id === act.id ? { ...a, estatus: nuevoEstatus } : a))
    setDetalle(null)
  }

  async function eliminar(id: string) {
    // Direct delete - no confirm needed as user clicked delete button
    await supabase.from('actividades').delete().eq('id', id)
    setActividades(prev => prev.filter(a => a.id !== id))
    setDetalle(null)
  }

  function openModal(fecha: string, hora = '09:00') {
    setFechaSel(fecha)
    setHoraSel(hora)
    setForm({ tipo: 'llamada', titulo: '', cliente_id: '', notas: '' })
    setShowModal(true)
  }

  function navegar(dir: number) {
    const d = new Date(fecha)
    if (vista === 'mes') d.setMonth(d.getMonth() + dir)
    else if (vista === 'semana') d.setDate(d.getDate() + dir * 7)
    else d.setDate(d.getDate() + dir)
    setFecha(d)
  }

  function actsDelDia(day: Date) {
    return actividades.filter(a => a.fecha_programada && isSameDay(new Date(a.fecha_programada), day))
  }

  function titulo() {
    if (vista === 'mes') return `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`
    if (vista === 'semana') {
      const ini = startOfWeek(fecha)
      const fin = new Date(ini); fin.setDate(ini.getDate() + 6)
      return `${ini.getDate()} ${MESES[ini.getMonth()].slice(0,3)} — ${fin.getDate()} ${MESES[fin.getMonth()].slice(0,3)} ${fin.getFullYear()}`
    }
    return fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  // ── RENDER MES ─────────────────────────────────────────────────
  function renderMes() {
    const ini = new Date(fecha.getFullYear(), fecha.getMonth(), 1)
    const fin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0)
    const startPad = ini.getDay()
    const days: (Date | null)[] = Array(startPad).fill(null)
    for (let i = 1; i <= fin.getDate(); i++) days.push(new Date(fecha.getFullYear(), fecha.getMonth(), i))
    while (days.length % 7 !== 0) days.push(null)
    const hoy = new Date()

    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
        {/* Cabecera días */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e2e8f0' }}>
          {DIAS.map(d => (
            <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>
        {/* Semanas */}
        {Array.from({ length: days.length / 7 }, (_, w) => (
          <div key={w} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #f1f5f9' }}>
            {days.slice(w * 7, w * 7 + 7).map((day, i) => {
              const acts = day ? actsDelDia(day) : []
              const esHoy = day ? isSameDay(day, hoy) : false
              const esFecha = day ? isSameDay(day, fecha) : false
              return (
                <div key={i} onClick={() => day && setFecha(day)}
                  style={{ minHeight: '100px', padding: '6px', borderRight: i < 6 ? '1px solid #f1f5f9' : 'none', background: esFecha ? '#EEF2F8' : 'white', cursor: day ? 'pointer' : 'default' }}>
                  {day && (
                    <>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: esHoy ? AZUL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: esHoy ? '700' : '400', color: esHoy ? 'white' : day.getMonth() !== fecha.getMonth() ? '#cbd5e1' : '#374151', marginBottom: '4px' }}>
                        {day.getDate()}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {acts.slice(0, 3).map(a => {
                          const cfg = TIPO_CONFIG[a.tipo] ?? TIPO_CONFIG.nota
                          return (
                            <div key={a.id} onClick={e => { e.stopPropagation(); setDetalle(a) }}
                              style={{ fontSize: '10px', padding: '2px 5px', borderRadius: '4px', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: a.estatus === 'completado' ? 'line-through' : 'none' }}>
                              {TIPO_ICONS[a.tipo]} {a.titulo}{a.fecha_programada ? ' ' + new Date(a.fecha_programada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          )
                        })}
                        {acts.length > 3 && <div style={{ fontSize: '10px', color: '#94a3b8', padding: '1px 4px' }}>+{acts.length - 3} más</div>}
                      </div>
                      <button onClick={e => { e.stopPropagation(); openModal(day.toISOString().split('T')[0]) }}
                        style={{ marginTop: '4px', fontSize: '10px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: '4px' }}>+ agregar</button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // ── RENDER SEMANA / DÍA ────────────────────────────────────────
  function renderSemanaODia() {
    const HORA_H = 56
    const dias = vista === 'semana'
      ? Array.from({ length: 7 }, (_, i) => { const d = startOfWeek(fecha); d.setDate(d.getDate() + i); return d })
      : [fecha]
    const hoy = new Date()

    return (
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Cabecera días */}
        <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${dias.length}, 1fr)`, borderBottom: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
          <div />
          {dias.map((d, i) => {
            const esHoy = isSameDay(d, hoy)
            return (
              <div key={i} onClick={() => { setFecha(d); if (vista === 'semana') setVista('dia') }}
                style={{ padding: '8px 4px', textAlign: 'center', cursor: 'pointer', borderLeft: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600' }}>{DIAS[d.getDay()]}</div>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: esHoy ? AZUL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: esHoy ? '700' : '500', color: esHoy ? 'white' : '#374151', margin: '2px auto 0' }}>
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>
        {/* Grid de horas */}
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${dias.length}, 1fr)`, position: 'relative' }}>
            {/* Columna horas */}
            <div>
              {HORAS.map((h, hi) => (
                <div key={h} style={{ height: HORA_H, borderBottom: '1px solid #f1f5f9', background: hi % 2 === 0 ? '#FAFBFC' : 'white', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: '8px', paddingTop: '2px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>{h.toString().padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>
            {/* Columnas días */}
            {dias.map((dia, di) => (
              <div key={di} style={{ borderLeft: '1px solid #f1f5f9', position: 'relative' }}>
                {HORAS.map((h, hi) => (
                  <div key={h} onClick={() => openModal(dia.toISOString().split('T')[0], `${h.toString().padStart(2, '0')}:00`)}
                    style={{ height: HORA_H, borderBottom: '1px solid #f1f5f9', background: hi % 2 === 0 ? '#FAFBFC' : 'white', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = hi % 2 === 0 ? '#FAFBFC' : 'white')}
                  />
                ))}
                {/* Actividades posicionadas */}
                {actsDelDia(dia).map((a, ai) => {
                  if (!a.fecha_programada) return null
                  const d = new Date(a.fecha_programada)
                  const top = (d.getHours() + d.getMinutes() / 60) * HORA_H
                  const cfg = TIPO_CONFIG[a.tipo] ?? TIPO_CONFIG.nota
                  // Count concurrent activities at same hour
                  const sameHour = actsDelDia(dia).filter(b => b.fecha_programada && Math.abs(new Date(b.fecha_programada).getHours() - d.getHours()) < 1)
                  const totalCols = sameHour.length
                  const col = sameHour.indexOf(a)
                  const widthPct = Math.floor(96 / totalCols)
                  const leftPct = col * widthPct + 2
                  return (
                    <div key={a.id} onClick={e => { e.stopPropagation(); setDetalle(a) }}
                      style={{ position: 'absolute', top, left: `${leftPct}%`, width: `${widthPct}%`, height: '36px', borderRadius: '6px', padding: '3px 6px', background: cfg.bg, border: `1px solid ${cfg.border}`, cursor: 'pointer', zIndex: 10 + col, opacity: a.estatus === 'completado' ? 0.6 : 1, boxSizing: 'border-box', overflow: 'hidden' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: cfg.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: a.estatus === 'completado' ? 'line-through' : 'none' }}>
                        {TIPO_ICONS[a.tipo]} {d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} {a.titulo}
                      </div>
                      {a.clientes?.nombre && <div style={{ fontSize: '9px', color: cfg.color, opacity: 0.8 }}>{a.clientes.nombre}</div>}
                    </div>
                  )
                })}
                {/* Línea hora actual */}
                {isSameDay(dia, hoy) && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: (hoy.getHours() + hoy.getMinutes() / 60) * HORA_H, height: '2px', background: '#ef4444', zIndex: 20, pointerEvents: 'none' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', position: 'absolute', left: '-4px', top: '-3px' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: 'white', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Nav */}
        <button onClick={() => navegar(-1)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>‹</button>
        <button onClick={() => setFecha(new Date())} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Hoy</button>
        <button onClick={() => navegar(1)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>›</button>

        <h2 style={{ fontSize: '15px', fontWeight: '700', color: AZUL, margin: 0, flex: 1, textTransform: 'capitalize' }}>{titulo()}</h2>

        {/* Vista toggles */}
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          {(['mes', 'semana', 'dia'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding: '6px 12px', background: vista === v ? AZUL : 'white', color: vista === v ? 'white' : '#64748b', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', textTransform: 'capitalize' }}>
              {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>

        <button onClick={() => openModal(fecha.toISOString().split('T')[0])}
          style={{ background: NARANJA, border: 'none', color: 'white', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
          + Nueva actividad
        </button>
      </div>

      {mensaje && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: AZUL, color: 'white', padding: '12px 24px', borderRadius: '12px', fontSize: '13px', fontWeight: '600', zIndex: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          {mensaje}
        </div>
      )}

      {cargando ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px' }}>Cargando agenda...</div>
      ) : (
        vista === 'mes' ? renderMes() : renderSemanaODia()
      )}

      {/* Modal nueva actividad */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', width: '440px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h3 style={{ color: AZUL, fontSize: '16px', fontWeight: '700', margin: '0 0 18px' }}>Nueva actividad</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Título *</label>
                <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Ej. Llamada de seguimiento"
                  style={{ display: 'block', width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                    style={{ display: 'block', width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: 'white' }}>
                    {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{TIPO_ICONS[k]} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hora</label>
                  <input type="time" value={horaSel} onChange={e => setHoraSel(e.target.value)}
                    style={{ display: 'block', width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fecha</label>
                <input type="date" value={fechaSel} onChange={e => setFechaSel(e.target.value)}
                  style={{ display: 'block', width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cliente</label>
                <select value={form.cliente_id} onChange={e => setForm(p => ({ ...p, cliente_id: e.target.value }))}
                  style={{ display: 'block', width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: 'white' }}>
                  <option value="">— Sin cliente —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} rows={2}
                  style={{ display: 'block', width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', resize: 'none', outline: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: '10px', background: '#F1F5F9', color: '#64748b', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando || !form.titulo.trim()}
                style={{ flex: 2, padding: '10px', background: guardando || !form.titulo.trim() ? '#94a3b8' : NARANJA, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: guardando ? 'not-allowed' : 'pointer' }}>
                {guardando ? 'Guardando...' : 'Crear actividad'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setDetalle(null) }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', width: '380px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            {(() => {
              const cfg = TIPO_CONFIG[detalle.tipo] ?? TIPO_CONFIG.nota
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                      {TIPO_ICONS[detalle.tipo]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>{detalle.titulo}</div>
                      <div style={{ fontSize: '11px', color: cfg.color, fontWeight: '600', textTransform: 'uppercase' }}>{cfg.label}</div>
                    </div>
                    <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {detalle.fecha_programada && (
                      <div style={{ fontSize: '13px', color: '#64748b' }}>
                        📅 {new Date(detalle.fecha_programada).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {detalle.clientes?.nombre && <div style={{ fontSize: '13px', color: '#64748b' }}>👤 {detalle.clientes.nombre}</div>}
                    {detalle.notas && <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>📝 {detalle.notas}</div>}
                    <div style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', background: detalle.estatus === 'completado' ? '#f0fdf4' : '#FEF4EC', color: detalle.estatus === 'completado' ? VERDE : NARANJA, fontWeight: '600', display: 'inline-block' }}>
                      {detalle.estatus === 'completado' ? '✓ Completado' : '⏳ Pendiente'}
                    </div>
                  </div>
                  {/* Comentario / Minuta */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      📝 Comentarios / Minuta
                    </label>
                    <textarea
                      value={comentarioDetalle}
                      onChange={e => setComentarioDetalle(e.target.value)}
                      rows={3}
                      placeholder="Agrega notas, acuerdos o resultados de esta actividad..."
                      style={{ display: 'block', width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                    />
                    {comentarioDetalle !== (detalle.comentario ?? '') && (
                      <button onClick={async () => {
                        setSavingComentario(true)
                        await supabase.from('actividades').update({ comentario: comentarioDetalle }).eq('id', detalle.id)
                        setActividades(prev => prev.map(a => a.id === detalle.id ? { ...a, comentario: comentarioDetalle } : a))
                        setDetalle(d => d ? { ...d, comentario: comentarioDetalle } : d)
                        setSavingComentario(false)
                      }} disabled={savingComentario}
                        style={{ marginTop: '5px', padding: '5px 14px', background: AZUL, color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                        {savingComentario ? 'Guardando...' : '💾 Guardar comentario'}
                      </button>
                    )}
                  </div>

                  {/* Estatus badge */}
                  <div style={{ padding: '7px 12px', background: detalle.estatus === 'completado' ? '#f0fdf4' : '#F4F6FB', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{detalle.estatus === 'completado' ? '✅' : '⏳'}</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: detalle.estatus === 'completado' ? VERDE : '#64748b' }}>
                      {detalle.estatus === 'completado' ? 'Completado' : 'Pendiente'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => completar(detalle)}
                      style={{ flex: 1, padding: '9px', background: detalle.estatus === 'pendiente' ? VERDE : '#F1F5F9', color: detalle.estatus === 'pendiente' ? 'white' : '#64748b', border: detalle.estatus !== 'pendiente' ? '1px solid #e2e8f0' : 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                      {detalle.estatus === 'pendiente' ? '✅ Completar' : '🔄 Reabrir'}
                    </button>
                    <button onClick={() => { setDetalle(null) }}
                      style={{ flex: 1, padding: '9px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                      ✕ Cerrar
                    </button>
                    <button onClick={() => eliminar(detalle.id)}
                      style={{ flex: 1, padding: '9px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                      🗑️ Eliminar
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
