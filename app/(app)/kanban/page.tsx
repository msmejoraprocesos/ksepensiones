'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

const COLUMNAS = [
  { id: 'prospecto',         label: 'Prospecto',         color: '#64748b', bg: '#f1f5f9', cierre: false },
  { id: 'diagnostico',       label: 'Diagnóstico',       color: '#3b82f6', bg: '#eff6ff', cierre: false },
  { id: 'propuesta',         label: 'Propuesta enviada', color: '#8b5cf6', bg: '#f5f3ff', cierre: false },
  { id: 'cierre1',           label: '⭐ Cierre 1',       color: NARANJA,   bg: '#fff7ed', cierre: true  },
  { id: 'seguimiento',       label: 'Seguimiento',       color: '#0891b2', bg: '#ecfeff', cierre: false },
  { id: 'cierre2',           label: '⭐ Cierre 2',       color: '#dc2626', bg: '#fef2f2', cierre: true  },
  { id: 'tramite',           label: 'Trámite IMSS',      color: VERDE,     bg: '#f0fdf4', cierre: false },
  { id: 'pensionado',        label: 'Pensionado ✅',     color: AZUL,      bg: '#eef2f8', cierre: false },
]

const SERVICIOS = ['Diagnóstico', 'Trámite', 'Combo']
const PAGOS = ['Pendiente', 'Parcial', 'Liquidado']

const PAGO_COLOR: Record<string, string> = {
  'Pendiente': '#ef4444',
  'Parcial':   NARANJA,
  'Liquidado': VERDE,
}

interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  notas: string | null
  etapa_kanban: string
  servicio_contratado: string | null
  monto_acordado: number | null
  monto_cobrado: number | null
  estatus_pago: string | null
  ultimo_contacto: string | null
  created_at: string
}

interface ModalData {
  cliente: Cliente
  tipo: 'ver' | 'mover' | 'editar'
}

export default function KanbanPage() {
  const supabase = createClient()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [modal, setModal] = useState<ModalData | null>(null)
  const [showNuevo, setShowNuevo] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', notas: '', etapa_kanban: 'prospecto', servicio_contratado: '', monto_acordado: '', monto_cobrado: '', estatus_pago: 'Pendiente' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      loadClientes(session.user.id)
    })
  }, [])

  async function loadClientes(uid: string) {
    setLoading(true)
    const { data } = await supabase.from('clientes').select('*').eq('asesor_id', uid).order('created_at', { ascending: false })
    setClientes((data as Cliente[]) ?? [])
    setLoading(false)
  }

  async function moverCliente(clienteId: string, nuevaEtapa: string) {
    await supabase.from('clientes').update({ etapa_kanban: nuevaEtapa, ultimo_contacto: new Date().toISOString() }).eq('id', clienteId)
    setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, etapa_kanban: nuevaEtapa, ultimo_contacto: new Date().toISOString() } : c))
    setModal(null)
  }

  async function actualizarCliente(clienteId: string, campos: Partial<Cliente>) {
    await supabase.from('clientes').update(campos).eq('id', clienteId)
    setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, ...campos } : c))
    setModal(null)
  }

  async function guardarNuevo() {
    if (!form.nombre.trim()) return
    setSaving(true)
    const { data } = await supabase.from('clientes').insert({
      asesor_id: userId,
      nombre: form.nombre,
      telefono: form.telefono || null,
      email: form.email || null,
      notas: form.notas || null,
      etapa_kanban: form.etapa_kanban,
      servicio_contratado: form.servicio_contratado || null,
      monto_acordado: form.monto_acordado ? parseFloat(form.monto_acordado) : null,
      monto_cobrado: form.monto_cobrado ? parseFloat(form.monto_cobrado) : null,
      estatus_pago: form.estatus_pago || null,
    }).select().single()
    if (data) setClientes(prev => [data as Cliente, ...prev])
    setSaving(false)
    setShowNuevo(false)
    setForm({ nombre: '', telefono: '', email: '', notas: '', etapa_kanban: 'prospecto', servicio_contratado: '', monto_acordado: '', monto_cobrado: '', estatus_pago: 'Pendiente' })
  }

  // Drag and drop
  function onDragStart(e: React.DragEvent, clienteId: string) {
    setDragging(clienteId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: React.DragEvent, columnaId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(columnaId)
  }

  function onDrop(e: React.DragEvent, columnaId: string) {
    e.preventDefault()
    if (dragging) moverCliente(dragging, columnaId)
    setDragging(null)
    setDragOver(null)
  }

  function onDragEnd() {
    setDragging(null)
    setDragOver(null)
  }

  const fmtMXN = (n: number | null) => n ? `$${n.toLocaleString('es-MX')}` : '—'
  const fmtFecha = (d: string | null) => {
    if (!d) return '—'
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Ayer'
    return `hace ${diff} días`
  }

  const clientesPorColumna = (colId: string) => clientes.filter(c => (c.etapa_kanban || 'prospecto') === colId)

  const totalPorCobrar = clientes.filter(c => c.estatus_pago === 'Pendiente' || c.estatus_pago === 'Parcial').reduce((s, c) => s + ((c.monto_acordado ?? 0) - (c.monto_cobrado ?? 0)), 0)
  const totalCobrado = clientes.reduce((s, c) => s + (c.monto_cobrado ?? 0), 0)
  const cierres1 = clientesPorColumna('cierre1').length + clientesPorColumna('seguimiento').length + clientesPorColumna('cierre2').length + clientesPorColumna('tramite').length + clientesPorColumna('pensionado').length
  const cierres2 = clientesPorColumna('cierre2').length + clientesPorColumna('tramite').length + clientesPorColumna('pensionado').length

  const inputSt: React.CSSProperties = { display: 'block', width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', background: 'white' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)', background: '#F4F6FB' }}>
      {/* Header — fijo arriba mientras se hace scroll de toda la página */}
      <div style={{ position: 'sticky' as const, top: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '16px' }}>
        <h1 style={{ color: AZUL, fontSize: '18px', fontWeight: '800', margin: 0 }}>Pipeline de Clientes</h1>

        {/* KPIs rápidos */}
        <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
          {[
            { label: 'Total clientes', value: clientes.length, color: AZUL },
            { label: 'Cierres 1', value: cierres1, color: NARANJA },
            { label: 'Cierres 2', value: cierres2, color: VERDE },
            { label: 'Cobrado', value: fmtMXN(totalCobrado), color: VERDE },
            { label: 'Por cobrar', value: fmtMXN(totalPorCobrar), color: '#ef4444' },
          ].map((k, i) => (
            <div key={i} style={{ background: '#F4F6FB', borderRadius: '8px', padding: '5px 12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k.label}</div>
              <div style={{ fontSize: '14px', fontWeight: '800', color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        <button onClick={() => setShowNuevo(true)}
          style={{ background: AZUL, color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>
          + Nuevo cliente
        </button>
      </div>

      {/* Kanban board — sin limite de altura, crece con su contenido; el scroll lo maneja la pagina (main) */}
      <div style={{ padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Cargando pipeline...</div>
        ) : (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', minWidth: 'max-content' }}>
            {COLUMNAS.map(col => {
              const cards = clientesPorColumna(col.id)
              const isDragOver = dragOver === col.id
              const colBg = isDragOver ? `${col.color}15` : '#F4F6FB'
              return (
                <div key={col.id}
                  onDragOver={e => onDragOver(e, col.id)}
                  onDrop={e => onDrop(e, col.id)}
                  style={{
                    width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column',
                    background: colBg,
                    borderRadius: '12px', border: `2px solid ${isDragOver ? col.color : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}>
                  {/* Columna header — sticky debajo del header de pagina (top: 65px ≈ altura del header) */}
                  <div style={{ position: 'sticky' as const, top: '65px', zIndex: 2, background: colBg, borderRadius: '12px 12px 0 0', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color }} />
                      <span style={{ fontSize: '12px', fontWeight: '700', color: col.cierre ? col.color : '#374151' }}>{col.label}</span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '700', background: col.bg, color: col.color, padding: '1px 7px', borderRadius: '10px', border: `1px solid ${col.color}30` }}>
                      {cards.length}
                    </span>
                  </div>

                  {/* Cards — sin limite de altura, crecen con la pagina */}
                  <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {cards.map(cliente => (
                      <div key={cliente.id}
                        draggable
                        onDragStart={e => onDragStart(e, cliente.id)}
                        onDragEnd={onDragEnd}
                        onClick={() => setModal({ cliente, tipo: 'ver' })}
                        style={{
                          background: 'white', borderRadius: '10px', padding: '12px',
                          border: `1px solid ${dragging === cliente.id ? col.color : '#e2e8f0'}`,
                          cursor: 'grab', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                          opacity: dragging === cliente.id ? 0.5 : 1,
                          transition: 'all 0.1s',
                        }}>
                        {/* Nombre */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: AZUL, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                            {cliente.nombre.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliente.nombre}</span>
                        </div>

                        {/* Servicio */}
                        {cliente.servicio_contratado && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: col.bg, color: col.color, fontWeight: '700', border: `1px solid ${col.color}30` }}>
                              {cliente.servicio_contratado}
                            </span>
                          </div>
                        )}

                        {/* Monto */}
                        {cliente.monto_acordado && (
                          <div style={{ fontSize: '12px', color: AZUL, fontWeight: '700', marginBottom: '4px' }}>
                            💰 {fmtMXN(cliente.monto_acordado)}
                            {cliente.monto_cobrado && cliente.monto_cobrado > 0 && (
                              <span style={{ color: '#94a3b8', fontWeight: '400' }}> · cobrado {fmtMXN(cliente.monto_cobrado)}</span>
                            )}
                          </div>
                        )}

                        {/* Estatus pago */}
                        {cliente.estatus_pago && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: PAGO_COLOR[cliente.estatus_pago] ?? '#94a3b8' }} />
                            <span style={{ fontSize: '10px', color: PAGO_COLOR[cliente.estatus_pago] ?? '#94a3b8', fontWeight: '600' }}>{cliente.estatus_pago}</span>
                          </div>
                        )}

                        {/* Último contacto */}
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                          📅 {fmtFecha(cliente.ultimo_contacto ?? cliente.created_at)}
                        </div>
                      </div>
                    ))}

                    {/* Drop zone vacía */}
                    {cards.length === 0 && (
                      <div style={{ border: `2px dashed ${isDragOver ? col.color : '#e2e8f0'}`, borderRadius: '8px', padding: '20px 8px', textAlign: 'center', color: isDragOver ? col.color : '#cbd5e1', fontSize: '11px', transition: 'all 0.15s' }}>
                        {isDragOver ? 'Suelta aquí' : 'Sin clientes'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal ver/editar cliente */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            {/* Header modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: AZUL, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', fontWeight: '700' }}>
                {modal.cliente.nombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{modal.cliente.nombre}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {COLUMNAS.find(c => c.id === modal.cliente.etapa_kanban)?.label ?? modal.cliente.etapa_kanban}
                </div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            {/* Mover de etapa */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Etapa en el pipeline</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {COLUMNAS.map(col => (
                  <button key={col.id} onClick={() => moverCliente(modal.cliente.id, col.id)}
                    style={{ padding: '5px 10px', borderRadius: '8px', border: `1.5px solid ${modal.cliente.etapa_kanban === col.id ? col.color : '#e2e8f0'}`, background: modal.cliente.etapa_kanban === col.id ? col.bg : 'white', color: modal.cliente.etapa_kanban === col.id ? col.color : '#64748b', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                    {col.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Servicio y pago */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Servicio</label>
                <select defaultValue={modal.cliente.servicio_contratado ?? ''} onChange={e => actualizarCliente(modal.cliente.id, { servicio_contratado: e.target.value || null })} style={inputSt}>
                  <option value="">— Sin definir —</option>
                  {SERVICIOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Estatus de pago</label>
                <select defaultValue={modal.cliente.estatus_pago ?? 'Pendiente'} onChange={e => actualizarCliente(modal.cliente.id, { estatus_pago: e.target.value })} style={inputSt}>
                  {PAGOS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monto acordado ($)</label>
                <input type="number" defaultValue={modal.cliente.monto_acordado ?? ''} onBlur={e => actualizarCliente(modal.cliente.id, { monto_acordado: parseFloat(e.target.value) || null })} placeholder="0" style={inputSt} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monto cobrado ($)</label>
                <input type="number" defaultValue={modal.cliente.monto_cobrado ?? ''} onBlur={e => actualizarCliente(modal.cliente.id, { monto_cobrado: parseFloat(e.target.value) || null })} placeholder="0" style={inputSt} />
              </div>
            </div>

            {/* Info contacto */}
            <div style={{ background: '#F4F6FB', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
              {[
                { icon: '📞', label: modal.cliente.telefono ?? '—' },
                { icon: '✉️', label: modal.cliente.email ?? '—' },
                { icon: '📝', label: modal.cliente.notas ?? '—' },
              ].map((item, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#64748b', marginBottom: i < 2 ? '4px' : '0', display: 'flex', gap: '6px' }}>
                  <span>{item.icon}</span><span>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Acciones */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <a href={`/clientes`} style={{ flex: 1, padding: '9px', background: '#F1F5F9', color: '#64748b', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                Ver expediente
              </a>
              <a href={`/calculadora?cliente=${modal.cliente.id}`} style={{ flex: 1, padding: '9px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                Abrir calculadora
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo cliente */}
      {showNuevo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowNuevo(false) }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '460px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h2 style={{ color: AZUL, fontSize: '18px', fontWeight: '700', margin: '0 0 20px' }}>Nuevo cliente</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre completo" style={inputSt} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Teléfono</label>
                  <input value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} placeholder="55 1234 5678" style={inputSt} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</label>
                  <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="correo@ejemplo.com" style={inputSt} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Etapa inicial</label>
                  <select value={form.etapa_kanban} onChange={e => setForm(p => ({ ...p, etapa_kanban: e.target.value }))} style={inputSt}>
                    {COLUMNAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Servicio</label>
                  <select value={form.servicio_contratado} onChange={e => setForm(p => ({ ...p, servicio_contratado: e.target.value }))} style={inputSt}>
                    <option value="">— Sin definir —</option>
                    {SERVICIOS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monto ($)</label>
                  <input type="number" value={form.monto_acordado} onChange={e => setForm(p => ({ ...p, monto_acordado: e.target.value }))} placeholder="0" style={inputSt} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cobrado ($)</label>
                  <input type="number" value={form.monto_cobrado} onChange={e => setForm(p => ({ ...p, monto_cobrado: e.target.value }))} placeholder="0" style={inputSt} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pago</label>
                  <select value={form.estatus_pago} onChange={e => setForm(p => ({ ...p, estatus_pago: e.target.value }))} style={inputSt}>
                    {PAGOS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} rows={2} style={{ ...inputSt, resize: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowNuevo(false)} style={{ flex: 1, padding: '10px', background: '#F1F5F9', color: '#64748b', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarNuevo} disabled={saving || !form.nombre.trim()} style={{ flex: 2, padding: '10px', background: saving || !form.nombre.trim() ? '#94a3b8' : AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Guardando...' : 'Guardar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
