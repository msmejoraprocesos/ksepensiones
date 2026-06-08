'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const AZUL = '#1F3A5F'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

interface Actividad {
  id: string
  titulo: string
  tipo: string
  fecha_programada: string | null
  estatus: string
  notas: string | null
  cliente_id: string | null
  clientes?: { nombre: string }
}

interface Cliente { id: string; nombre: string }

const TIPOS = ['llamada', 'whatsapp', 'cita', 'email', 'nota']
const TIPO_ICONS: Record<string, string> = { llamada: '📞', whatsapp: '💬', cita: '📅', email: '✉️', nota: '📝' }
const TIPO_COLORS: Record<string, string> = { llamada: '#3b82f6', whatsapp: '#22c55e', cita: AZUL, email: NARANJA, nota: '#94a3b8' }

type Vista = 'hoy' | 'semana' | 'todos' | 'completados'

export default function SeguimientoPage() {
  const supabase = createClientComponentClient()
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<Vista>('hoy')
  const [userId, setUserId] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Actividad | null>(null)
  const [form, setForm] = useState({ titulo: '', tipo: 'llamada', fecha_programada: '', notas: '', cliente_id: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      loadData(session.user.id)
    })
  }, [])

  async function loadData(uid: string) {
    setLoading(true)
    const [{ data: acts }, { data: clis }] = await Promise.all([
      supabase.from('actividades').select('*, clientes(nombre)').eq('asesor_id', uid).order('fecha_programada', { ascending: true }),
      supabase.from('clientes').select('id, nombre').eq('asesor_id', uid).order('nombre'),
    ])
    setActividades((acts as Actividad[]) ?? [])
    setClientes((clis as Cliente[]) ?? [])
    setLoading(false)
  }

  async function saveActividad() {
    if (!form.titulo.trim()) return
    setSaving(true)
    if (editando) {
      const { data } = await supabase.from('actividades').update({
        titulo: form.titulo, tipo: form.tipo,
        fecha_programada: form.fecha_programada || null,
        notas: form.notas || null,
        cliente_id: form.cliente_id || null,
      }).eq('id', editando.id).select('*, clientes(nombre)').single()
      if (data) setActividades(prev => prev.map(a => a.id === editando.id ? data as Actividad : a))
    } else {
      const { data } = await supabase.from('actividades').insert({
        asesor_id: userId, titulo: form.titulo, tipo: form.tipo,
        fecha_programada: form.fecha_programada || null,
        notas: form.notas || null,
        cliente_id: form.cliente_id || null,
        estatus: 'pendiente',
      }).select('*, clientes(nombre)').single()
      if (data) setActividades(prev => [data as Actividad, ...prev])
    }
    setSaving(false)
    closeModal()
  }

  async function toggleEstatus(act: Actividad) {
    const nuevoEstatus = act.estatus === 'pendiente' ? 'completado' : 'pendiente'
    await supabase.from('actividades').update({ estatus: nuevoEstatus }).eq('id', act.id)
    setActividades(prev => prev.map(a => a.id === act.id ? { ...a, estatus: nuevoEstatus } : a))
  }

  async function deleteActividad(id: string) {
    if (!confirm('¿Eliminar esta actividad?')) return
    await supabase.from('actividades').delete().eq('id', id)
    setActividades(prev => prev.filter(a => a.id !== id))
  }

  function openNueva() {
    setEditando(null)
    const now = new Date()
    now.setMinutes(0)
    setForm({ titulo: '', tipo: 'llamada', fecha_programada: now.toISOString().slice(0, 16), notas: '', cliente_id: '' })
    setShowModal(true)
  }

  function openEditar(act: Actividad) {
    setEditando(act)
    setForm({
      titulo: act.titulo, tipo: act.tipo,
      fecha_programada: act.fecha_programada ? act.fecha_programada.slice(0, 16) : '',
      notas: act.notas ?? '', cliente_id: act.cliente_id ?? '',
    })
    setShowModal(true)
  }

  function closeModal() { setShowModal(false); setEditando(null) }

  const hoy = new Date()
  const startHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const endHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59)
  const startSemana = new Date(startHoy); startSemana.setDate(startHoy.getDate() - startHoy.getDay())
  const endSemana = new Date(startSemana); endSemana.setDate(startSemana.getDate() + 6)

  const filtradas = actividades.filter(a => {
    const fecha = a.fecha_programada ? new Date(a.fecha_programada) : null
    if (vista === 'hoy') return a.estatus === 'pendiente' && fecha && fecha >= startHoy && fecha <= endHoy
    if (vista === 'semana') return a.estatus === 'pendiente' && fecha && fecha >= startSemana && fecha <= endSemana
    if (vista === 'todos') return a.estatus === 'pendiente'
    if (vista === 'completados') return a.estatus === 'completado'
    return true
  })

  const pendientesHoy = actividades.filter(a => {
    const fecha = a.fecha_programada ? new Date(a.fecha_programada) : null
    return a.estatus === 'pendiente' && fecha && fecha >= startHoy && fecha <= endHoy
  }).length

  const fmt = (d: string | null) => {
    if (!d) return 'Sin fecha'
    const date = new Date(d)
    const esHoy = date >= startHoy && date <= endHoy
    if (esHoy) return `Hoy ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
    return date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const isVencida = (a: Actividad) => a.fecha_programada && new Date(a.fecha_programada) < startHoy && a.estatus === 'pendiente'

  const VISTAS: { key: Vista; label: string; count?: number }[] = [
    { key: 'hoy', label: 'Hoy', count: pendientesHoy },
    { key: 'semana', label: 'Esta semana' },
    { key: 'todos', label: 'Todos los pendientes' },
    { key: 'completados', label: 'Completados' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{ color: AZUL, fontSize: '20px', fontWeight: '700', margin: 0, flex: 1 }}>Seguimiento</h1>
        <button onClick={openNueva}
          style={{ background: AZUL, color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          + Nueva actividad
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar vistas */}
        <div style={{ width: '200px', flexShrink: 0, background: 'white', borderRight: '1px solid #e2e8f0', padding: '12px 8px' }}>
          {VISTAS.map(v => (
            <button key={v.key} onClick={() => setVista(v.key)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 12px', background: vista === v.key ? '#EEF2F8' : 'none', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '2px', textAlign: 'left' }}>
              <span style={{ fontSize: '13px', fontWeight: vista === v.key ? '600' : '400', color: vista === v.key ? AZUL : '#64748b' }}>{v.label}</span>
              {v.count !== undefined && v.count > 0 && (
                <span style={{ background: NARANJA, color: 'white', fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '10px' }}>{v.count}</span>
              )}
            </button>
          ))}

          <div style={{ borderTop: '1px solid #e2e8f0', margin: '12px 0', paddingTop: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 12px', margin: '0 0 8px' }}>Por tipo</p>
            {TIPOS.map(tipo => {
              const count = actividades.filter(a => a.tipo === tipo && a.estatus === 'pendiente').length
              return (
                <div key={tipo} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px' }}>
                  <span style={{ fontSize: '14px' }}>{TIPO_ICONS[tipo]}</span>
                  <span style={{ fontSize: '12px', color: '#64748b', flex: 1, textTransform: 'capitalize' }}>{tipo}</span>
                  {count > 0 && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{count}</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Lista actividades */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Cargando...</div>
          ) : filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>{vista === 'completados' ? '🏆' : '✅'}</div>
              <div style={{ color: '#64748b', fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>
                {vista === 'hoy' ? 'Sin actividades para hoy' : vista === 'completados' ? 'Sin actividades completadas' : 'Sin pendientes'}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>
                {vista !== 'completados' ? 'Agrega una nueva actividad con el botón de arriba' : ''}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtradas.map(act => (
                <div key={act.id} style={{
                  background: 'white', borderRadius: '10px', padding: '14px 16px',
                  border: `1px solid ${isVencida(act) ? '#fecaca' : '#e2e8f0'}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  opacity: act.estatus === 'completado' ? 0.65 : 1,
                }}>
                  {/* Checkbox */}
                  <button onClick={() => toggleEstatus(act)}
                    style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${act.estatus === 'completado' ? VERDE : '#e2e8f0'}`, background: act.estatus === 'completado' ? VERDE : 'white', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px', padding: 0 }}>
                    {act.estatus === 'completado' && <span style={{ color: 'white', fontSize: '10px', fontWeight: '700' }}>✓</span>}
                  </button>

                  {/* Tipo icon */}
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${TIPO_COLORS[act.tipo]}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                    {TIPO_ICONS[act.tipo] ?? '📌'}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: act.estatus === 'completado' ? '#94a3b8' : '#1e293b', textDecoration: act.estatus === 'completado' ? 'line-through' : 'none', marginBottom: '3px' }}>
                      {act.titulo}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {act.clientes?.nombre && (
                        <span style={{ fontSize: '12px', color: AZUL, fontWeight: '500' }}>👤 {act.clientes.nombre}</span>
                      )}
                      <span style={{ fontSize: '11px', color: isVencida(act) ? '#ef4444' : '#94a3b8' }}>
                        {isVencida(act) ? '⚠️ Vencida · ' : ''}{fmt(act.fecha_programada)}
                      </span>
                    </div>
                    {act.notas && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>{act.notas}</div>}
                  </div>

                  {/* Badge tipo */}
                  <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '12px', fontWeight: '600', background: `${TIPO_COLORS[act.tipo]}15`, color: TIPO_COLORS[act.tipo], flexShrink: 0, textTransform: 'capitalize' }}>
                    {act.tipo}
                  </span>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => openEditar(act)}
                      style={{ padding: '4px 8px', background: '#F1F5F9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#64748b' }}>✏️</button>
                    <button onClick={() => deleteActividad(act.id)}
                      style={{ padding: '4px 8px', background: '#fef2f2', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#dc2626' }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal nueva/editar actividad */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '28px', width: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h2 style={{ color: AZUL, fontSize: '18px', fontWeight: '700', margin: '0 0 20px' }}>
              {editando ? 'Editar actividad' : 'Nueva actividad'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Título *</label>
                <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Ej. Llamada de seguimiento"
                  style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                    style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: 'white' }}>
                    {TIPOS.map(t => <option key={t} value={t}>{TIPO_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Fecha y hora</label>
                  <input type="datetime-local" value={form.fecha_programada} onChange={e => setForm(p => ({ ...p, fecha_programada: e.target.value }))}
                    style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Cliente</label>
                <select value={form.cliente_id} onChange={e => setForm(p => ({ ...p, cliente_id: e.target.value }))}
                  style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: 'white' }}>
                  <option value="">— Sin cliente —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} rows={2} placeholder="Detalles adicionales..."
                  style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', resize: 'none', outline: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={closeModal}
                style={{ flex: 1, padding: '10px', background: '#F1F5F9', color: '#64748b', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={saveActividad} disabled={saving || !form.titulo.trim()}
                style={{ flex: 2, padding: '10px', background: saving || !form.titulo.trim() ? '#94a3b8' : AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear actividad'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
