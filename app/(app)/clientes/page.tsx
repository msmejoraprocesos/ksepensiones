'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

const COLUMNAS = [
  { id: 'prospecto',   label: 'Prospecto',         color: '#64748b', bg: '#f1f5f9' },
  { id: 'diagnostico', label: 'Diagnóstico',        color: '#3b82f6', bg: '#eff6ff' },
  { id: 'propuesta',   label: 'Propuesta enviada',  color: '#8b5cf6', bg: '#f5f3ff' },
  { id: 'cierre1',     label: '⭐ Cierre 1',        color: NARANJA,   bg: '#fff7ed' },
  { id: 'seguimiento', label: 'Seguimiento',        color: '#0891b2', bg: '#ecfeff' },
  { id: 'cierre2',     label: '⭐ Cierre 2',        color: '#dc2626', bg: '#fef2f2' },
  { id: 'tramite',     label: 'Trámite IMSS',       color: VERDE,     bg: '#f0fdf4' },
  { id: 'pensionado',  label: 'Pensionado ✅',      color: AZUL,      bg: '#eef2f8' },
]

const SERVICIOS = ['Diagnóstico', 'Trámite', 'Combo']
const PAGOS = ['Pendiente', 'Parcial', 'Liquidado']
const PAGO_COLOR: Record<string, string> = { 'Pendiente': '#ef4444', 'Parcial': NARANJA, 'Liquidado': VERDE }


// Auto-calcula estatus de pago
function calcEstatusPago(monto: number | null, cobrado: number | null): string {
  if (!cobrado || cobrado === 0) return 'Pendiente'
  if (!monto || monto === 0) return cobrado > 0 ? 'Parcial' : 'Pendiente'
  if (cobrado >= monto) return 'Liquidado'
  return 'Parcial'
}


// Validaciones
function formatTelefono(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `${digits.slice(0,2)} ${digits.slice(2)}`
  return `${digits.slice(0,2)} ${digits.slice(2,6)} ${digits.slice(6)}`
}

function validateTelefono(val: string): string | null {
  const digits = val.replace(/\D/g, '')
  if (!val) return null
  if (digits.length < 10) return `Faltan ${10 - digits.length} dígitos (requiere 10)`
  if (digits.length > 10) return 'Máximo 10 dígitos'
  if (!['55','56','33','81','664','998','999','222','442','444'].some(p => digits.startsWith(p)) && digits[0] !== '1') {
    // Basic check - just verify it starts with valid Mexican codes
  }
  return null
}

function validateEmail(val: string): string | null {
  if (!val) return null
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(val)) return 'Formato inválido (ej: nombre@dominio.com)'
  if (val.length > 100) return 'Máximo 100 caracteres'
  return null
}


const PAGO_SEMAFORO: Record<string, { bg: string; border: string; color: string; icon: string; label: string }> = {
  'Pendiente': { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: '🔴', label: 'Pendiente' },
  'Parcial':   { bg: '#fff7ed', border: '#fed7aa', color: '#ea580c', icon: '🟡', label: 'Parcial' },
  'Liquidado': { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a', icon: '🟢', label: 'Liquidado' },
}

const TIPO_ICONS: Record<string, string> = { llamada: '📞', whatsapp: '💬', cita: '📅', email: '✉️', nota: '📝' }

interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  notas: string | null
  etapa_kanban: string | null
  servicio_contratado: string | null
  monto_acordado: number | null
  monto_cobrado: number | null
  estatus_pago: string | null
  comprobante_url: string | null
  ultimo_contacto: string | null
  created_at: string
}

interface Diagnostico {
  id: string
  ley: string
  semanas: number
  salario_diario: number
  edad_retiro: number
  resultado_e1: number | null
  resultado_e2: number | null
  resultado_e4: number | null
  created_at: string
  notas: string | null
}

interface Actividad {
  id: string
  tipo: string
  titulo: string
  fecha_programada: string | null
  estatus: string
  notas: string | null
}

type Vista = 'lista' | 'pipeline'

export default function ClientesPage() {
  const supabase = createClient()
  const [vista, setVista] = useState<Vista>('lista')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [userId, setUserId] = useState('')
  const userIdRef = useRef('')

  // Expediente
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[]>([])
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [modalTab, setModalTab] = useState<'info' | 'diagnosticos' | 'actividades'>('info')

  // Nuevo cliente
  const [showNuevo, setShowNuevo] = useState(false)
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', notas: '', etapa_kanban: 'prospecto', servicio_contratado: '', monto_acordado: '', monto_cobrado: '' })
  const [uploadingComp, setUploadingComp] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState<{telefono?: string; email?: string}>({})

  // Drag & drop
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      userIdRef.current = session.user.id
      loadClientes(session.user.id)
    })
  }, [])

  async function loadClientes(uid: string) {
    setLoading(true)
    const { data } = await supabase.from('clientes').select('*').eq('asesor_id', uid).order('created_at', { ascending: false })
    setClientes((data as Cliente[]) ?? [])
    setLoading(false)
  }

  async function openExpediente(cliente: Cliente) {
    setSelectedCliente(cliente)
    setModalTab('info')
    const [{ data: diags }, { data: acts }] = await Promise.all([
      supabase.from('diagnosticos').select('*').eq('cliente_id', cliente.id).order('created_at', { ascending: false }),
      supabase.from('actividades').select('*').eq('cliente_id', cliente.id).order('fecha_programada', { ascending: false }),
    ])
    setDiagnosticos((diags as Diagnostico[]) ?? [])
    setActividades((acts as Actividad[]) ?? [])
  }

  async function guardarNuevo() {
    if (!form.nombre.trim()) return
    setSaving(true)
    // Refresh session to ensure valid token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); alert('Error: sesión no iniciada'); return }
    const uid = session.user.id
    userIdRef.current = uid
    const estatus = calcEstatusPago(
      form.monto_acordado ? parseFloat(form.monto_acordado) : null,
      form.monto_cobrado ? parseFloat(form.monto_cobrado) : null
    )
    const { data, error } = await supabase.from('clientes').insert({
      asesor_id: uid,
      nombre: form.nombre,
      telefono: form.telefono || null,
      email: form.email || null,
      notas: form.notas || null,
      etapa_kanban: form.etapa_kanban,
      servicio_contratado: form.servicio_contratado || null,
      monto_acordado: form.monto_acordado ? parseFloat(form.monto_acordado) : null,
      monto_cobrado: form.monto_cobrado ? parseFloat(form.monto_cobrado) : null,
      estatus_pago: estatus,
    }).select('*').single()
    if (error) {
      console.error('Insert error:', error)
      alert('Error al guardar: ' + error.message)
      setSaving(false)
      return
    }
    if (data) setClientes(prev => [data as Cliente, ...prev])
    await loadClientes(uid)
    setSaving(false)
    setShowNuevo(false)
    setForm({ nombre: '', telefono: '', email: '', notas: '', etapa_kanban: 'prospecto', servicio_contratado: '', monto_acordado: '', monto_cobrado: '' })
    setFormErrors({})
  }

  async function actualizarCliente(id: string, campos: Partial<Cliente>) {
    // Auto-recalculate estatus_pago when monto changes
    const cliente = clientes.find(c => c.id === id)
    if (campos.monto_acordado !== undefined || campos.monto_cobrado !== undefined) {
      const monto = campos.monto_acordado ?? cliente?.monto_acordado ?? null
      const cobrado = campos.monto_cobrado ?? cliente?.monto_cobrado ?? null
      campos.estatus_pago = calcEstatusPago(monto, cobrado)
    }
    await supabase.from('clientes').update(campos).eq('id', id)
    setClientes(prev => prev.map(c => c.id === id ? { ...c, ...campos } : c))
    if (selectedCliente?.id === id) setSelectedCliente(prev => prev ? { ...prev, ...campos } : prev)
  }

  async function moverCliente(clienteId: string, etapa: string) {
    await actualizarCliente(clienteId, { etapa_kanban: etapa, ultimo_contacto: new Date().toISOString() })
    setDragging(null); setDragOver(null)
  }

  async function eliminarCliente(id: string) {
    if (!confirm('¿Eliminar este cliente?')) return
    await supabase.from('clientes').delete().eq('id', id)
    setClientes(prev => prev.filter(c => c.id !== id))
    setSelectedCliente(null)
  }


  async function uploadComprobante(clienteId: string, file: File) {
    setUploadingComp(clienteId)
    const ext = file.name.split('.').pop()
    const path = `comprobantes/${clienteId}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('comprobantes').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('comprobantes').getPublicUrl(path)
      await actualizarCliente(clienteId, { comprobante_url: data.publicUrl })
    }
    setUploadingComp(null)
  }

  const filtered = clientes.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.telefono ?? '').includes(search)
  )

  const clientesPorColumna = (colId: string) => clientes.filter(c => (c.etapa_kanban || 'prospecto') === colId)

  const totalCobrado = clientes.reduce((s, c) => s + (c.monto_cobrado ?? 0), 0)
  const totalPorCobrar = clientes.reduce((s, c) => s + Math.max(0, (c.monto_acordado ?? 0) - (c.monto_cobrado ?? 0)), 0)

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const fmtMXN = (n: number | null) => n ? `$${n.toLocaleString('es-MX')}` : '—'
  const fmtDias = (d: string | null) => {
    if (!d) return '—'
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Ayer'
    return `hace ${diff} días`
  }

  const inputSt: React.CSSProperties = { display: 'block', width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', background: 'white' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{ color: AZUL, fontSize: '18px', fontWeight: '800', margin: 0 }}>Clientes</h1>

        {/* Vista tabs */}
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          {([['lista', '☰ Lista'], ['pipeline', '⊟ Pipeline']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding: '6px 14px', background: vista === v ? AZUL : 'white', color: vista === v ? 'white' : '#64748b', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
              {label}
            </button>
          ))}
        </div>

        {vista === 'lista' && (
          <input placeholder="Buscar por nombre, email o teléfono..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '7px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '260px', outline: 'none' }} />
        )}

        {vista === 'pipeline' && (
          <div style={{ display: 'flex', gap: '10px', flex: 1 }}>
            {[
              { label: 'Total', value: clientes.length, color: AZUL },
              { label: 'Cobrado', value: fmtMXN(totalCobrado), color: VERDE },
              { label: 'Por cobrar', value: fmtMXN(totalPorCobrar), color: '#ef4444' },
            ].map((k, i) => (
              <div key={i} style={{ background: '#F4F6FB', borderRadius: '8px', padding: '4px 12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>{k.label}</div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: vista === 'lista' ? 1 : 0 }} />

        <button onClick={() => setShowNuevo(true)}
          style={{ background: AZUL, color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>
          + Nuevo cliente
        </button>
      </div>

      {/* ── VISTA LISTA ── */}
      {vista === 'lista' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Cargando clientes...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
              <div style={{ color: '#64748b', fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>{search ? 'Sin resultados' : 'Sin clientes aún'}</div>
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>{search ? 'Intenta con otro término' : 'Agrega tu primer cliente con el botón de arriba'}</div>
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#F8FAFC' }}>
                    {['Cliente', 'Etapa', 'Servicio', 'Monto', 'Pago', 'Último contacto', ''].map((h, i) => (
                      <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const col = COLUMNAS.find(col => col.id === (c.etapa_kanban || 'prospecto'))
                    return (
                      <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
                        onClick={() => openExpediente(c)}>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', background: AZUL, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>
                              {c.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{c.nombre}</div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{c.email ?? c.telefono ?? '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600', background: col?.bg, color: col?.color }}>
                            {col?.label ?? '—'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: '12px', color: '#64748b' }}>{c.servicio_contratado ?? '—'}</td>
                        <td style={{ padding: '11px 14px', fontSize: '12px', fontWeight: '600', color: AZUL }}>{fmtMXN(c.monto_acordado)}</td>
                        <td style={{ padding: '11px 14px' }}>
                          {(() => {
                            const ep = calcEstatusPago(c.monto_acordado, c.monto_cobrado)
                            const s = PAGO_SEMAFORO[ep]
                            return (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: '8px', padding: '2px 8px' }}>
                                <span style={{ fontSize: '12px' }}>{s.icon}</span>
                                <span style={{ fontSize: '11px', color: s.color, fontWeight: '700' }}>{s.label}</span>
                              </span>
                            )
                          })()}
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: '12px', color: '#94a3b8' }}>{fmtDias(c.ultimo_contacto)}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ color: NARANJA, fontSize: '12px', fontWeight: '600' }}>Ver →</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── VISTA PIPELINE ── */}
      {vista === 'pipeline' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: '10px', height: '100%', minWidth: 'max-content' }}>
            {COLUMNAS.map(col => {
              const cards = clientesPorColumna(col.id)
              const isDragOver = dragOver === col.id
              return (
                <div key={col.id}
                  onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
                  onDrop={e => { e.preventDefault(); if (dragging) moverCliente(dragging, col.id) }}
                  style={{ width: '210px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: isDragOver ? `${col.color}12` : '#F4F6FB', borderRadius: '12px', border: `2px solid ${isDragOver ? col.color : 'transparent'}`, transition: 'all 0.15s' }}>
                  {/* Col header */}
                  <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color }} />
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>{col.label}</span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '700', background: col.bg, color: col.color, padding: '1px 7px', borderRadius: '10px' }}>{cards.length}</span>
                  </div>

                  {/* Cards */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {cards.map(cliente => (
                      <div key={cliente.id}
                        draggable
                        onDragStart={e => { setDragging(cliente.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => { setDragging(null); setDragOver(null) }}
                        onClick={() => openExpediente(cliente)}
                        style={{ background: 'white', borderRadius: '10px', padding: '11px', border: `1px solid ${dragging === cliente.id ? col.color : '#e2e8f0'}`, cursor: 'grab', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', opacity: dragging === cliente.id ? 0.5 : 1, transition: 'all 0.1s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px' }}>
                          <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: AZUL, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>
                            {cliente.nombre.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliente.nombre}</span>
                        </div>
                        {cliente.servicio_contratado && (
                          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: col.bg, color: col.color, fontWeight: '700', display: 'inline-block', marginBottom: '4px' }}>
                            {cliente.servicio_contratado}
                          </span>
                        )}
                        {cliente.monto_acordado && (
                          <div style={{ fontSize: '11px', color: AZUL, fontWeight: '700', marginBottom: '3px' }}>
                            💰 {fmtMXN(cliente.monto_acordado)}
                          </div>
                        )}
                        {(() => {
                          const ep = calcEstatusPago(cliente.monto_acordado, cliente.monto_cobrado)
                          const s = PAGO_SEMAFORO[ep]
                          return (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: '6px', padding: '1px 6px', marginBottom: '3px' }}>
                              <span style={{ fontSize: '10px' }}>{s.icon}</span>
                              <span style={{ fontSize: '10px', color: s.color, fontWeight: '700' }}>{s.label}</span>
                            </div>
                          )
                        })()}
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>📅 {fmtDias(cliente.ultimo_contacto ?? cliente.created_at)}</div>
                      </div>
                    ))}
                    {cards.length === 0 && (
                      <div style={{ border: `2px dashed ${isDragOver ? col.color : '#e2e8f0'}`, borderRadius: '8px', padding: '16px 8px', textAlign: 'center', color: isDragOver ? col.color : '#cbd5e1', fontSize: '10px' }}>
                        {isDragOver ? 'Suelta aquí' : 'Vacío'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MODAL EXPEDIENTE ── */}
      {selectedCliente && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedCliente(null) }}>
          <div style={{ width: '520px', height: '100vh', background: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '42px', height: '42px', background: AZUL, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', fontWeight: '700' }}>
                {selectedCliente.nombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{selectedCliente.nombre}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Alta: {fmt(selectedCliente.created_at)}</div>
              </div>
              <button onClick={() => setSelectedCliente(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            {/* Etapa pipeline inline */}
            <div style={{ padding: '12px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {COLUMNAS.map(col => (
                <button key={col.id} onClick={() => moverCliente(selectedCliente.id, col.id)}
                  style={{ padding: '3px 8px', borderRadius: '6px', border: `1.5px solid ${(selectedCliente.etapa_kanban || 'prospecto') === col.id ? col.color : '#e2e8f0'}`, background: (selectedCliente.etapa_kanban || 'prospecto') === col.id ? col.bg : 'white', color: (selectedCliente.etapa_kanban || 'prospecto') === col.id ? col.color : '#94a3b8', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>
                  {col.label}
                </button>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 22px' }}>
              {(['info', 'diagnosticos', 'actividades'] as const).map(tab => (
                <button key={tab} onClick={() => setModalTab(tab)}
                  style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: modalTab === tab ? '700' : '400', color: modalTab === tab ? AZUL : '#64748b', borderBottom: modalTab === tab ? `2px solid ${AZUL}` : '2px solid transparent', marginBottom: '-1px' }}>
                  {tab === 'info' ? 'Datos' : tab === 'diagnosticos' ? `Diagnósticos (${diagnosticos.length})` : `Actividades (${actividades.length})`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
              {modalTab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Datos contacto */}
                  {[
                    { label: 'Teléfono', value: selectedCliente.telefono ?? '—' },
                    { label: 'Email', value: selectedCliente.email ?? '—' },
                    { label: 'Notas', value: selectedCliente.notas ?? '—' },
                  ].map((f, i) => (
                    <div key={i}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{f.label}</div>
                      <div style={{ fontSize: '13px', color: '#1e293b' }}>{f.value}</div>
                    </div>
                  ))}

                  {/* Comercial */}
                  <div style={{ background: '#F4F6FB', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Información comercial</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Servicio</label>
                        <select defaultValue={selectedCliente.servicio_contratado ?? ''} onChange={e => actualizarCliente(selectedCliente.id, { servicio_contratado: e.target.value || null })} style={{ ...inputSt, fontSize: '12px', padding: '7px 10px' }}>
                          <option value="">— Sin definir —</option>
                          {SERVICIOS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Estatus pago (auto)</label>
                        {(() => {
                          const ep = calcEstatusPago(selectedCliente.monto_acordado, selectedCliente.monto_cobrado)
                          const s = PAGO_SEMAFORO[ep]
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: s.bg, border: `2px solid ${s.border}`, borderRadius: '8px' }}>
                              <span style={{ fontSize: '20px' }}>{s.icon}</span>
                              <span style={{ fontSize: '13px', fontWeight: '800', color: s.color }}>{s.label}</span>
                            </div>
                          )
                        })()}
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Monto acordado</label>
                        <input type="number" defaultValue={selectedCliente.monto_acordado ?? ''} onBlur={e => actualizarCliente(selectedCliente.id, { monto_acordado: parseFloat(e.target.value) || null })} placeholder="0" style={{ ...inputSt, fontSize: '12px', padding: '7px 10px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Monto cobrado</label>
                        <input type="number" defaultValue={selectedCliente.monto_cobrado ?? ''} onBlur={e => actualizarCliente(selectedCliente.id, { monto_cobrado: parseFloat(e.target.value) || null })} placeholder="0" style={{ ...inputSt, fontSize: '12px', padding: '7px 10px' }} />
                      </div>
                    </div>
                  </div>

                  {/* Comprobante de pago */}
                  <div style={{ background: '#F4F6FB', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Comprobante de pago</div>
                    {selectedCliente.comprobante_url ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <a href={selectedCliente.comprobante_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', textDecoration: 'none', color: AZUL, fontSize: '12px', fontWeight: '600' }}>
                          📎 Ver comprobante adjunto →
                        </a>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: '#fff7ed', borderRadius: '8px', border: '1px solid #fed7aa', cursor: 'pointer', fontSize: '11px', color: NARANJA, fontWeight: '600' }}>
                          🔄 {uploadingComp === selectedCliente.id ? 'Subiendo...' : 'Reemplazar comprobante'}
                          <input type="file" accept="image/*,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) uploadComprobante(selectedCliente.id, f) }} style={{ display: 'none' }} disabled={uploadingComp === selectedCliente.id} />
                        </label>
                      </div>
                    ) : (
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: 'white', borderRadius: '8px', border: '2px dashed #e2e8f0', cursor: uploadingComp === selectedCliente.id ? 'not-allowed' : 'pointer', fontSize: '13px', color: '#94a3b8', fontWeight: '600', transition: 'all 0.15s' }}>
                        {uploadingComp === selectedCliente.id ? '⏳ Subiendo comprobante...' : '📎 Adjuntar ficha de depósito'}
                        <input type="file" accept="image/*,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) uploadComprobante(selectedCliente.id, f) }} style={{ display: 'none' }} disabled={uploadingComp === selectedCliente.id} />
                      </label>
                    )}
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a href={`/calculadora?cliente=${selectedCliente.id}`}
                      style={{ flex: 1, padding: '9px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                      Nueva calculadora
                    </a>
                    <button onClick={() => eliminarCliente(selectedCliente.id)}
                      style={{ padding: '9px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {modalTab === 'diagnosticos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {diagnosticos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>Sin diagnósticos aún</div>
                  ) : diagnosticos.map(d => (
                    <div key={d.id} style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ background: d.ley === '73' ? '#EEF2F8' : '#EEF7F1', color: d.ley === '73' ? AZUL : VERDE, fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>Ley {d.ley}</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{fmt(d.created_at)}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
                        <div><span style={{ color: '#94a3b8' }}>Semanas: </span><strong>{d.semanas}</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>Retiro: </span><strong>{d.edad_retiro} años</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>E1 (sin acción): </span><strong style={{ color: AZUL }}>${Math.round(d.resultado_e1 ?? 0).toLocaleString()}</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>E4 (óptimo): </span><strong style={{ color: VERDE }}>${Math.round(d.resultado_e4 ?? 0).toLocaleString()}</strong></div>
                      </div>
                      {d.notas && <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>{d.notas}</div>}
                    </div>
                  ))}
                </div>
              )}

              {modalTab === 'actividades' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {actividades.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>Sin actividades registradas</div>
                  ) : actividades.map(a => (
                    <div key={a.id} style={{ display: 'flex', gap: '10px', padding: '10px 12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #e2e8f0', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: '16px' }}>{TIPO_ICONS[a.tipo] ?? '📌'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{a.titulo}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{a.fecha_programada ? fmt(a.fecha_programada) : 'Sin fecha'}</div>
                        {a.notas && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>{a.notas}</div>}
                      </div>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600', background: a.estatus === 'completado' ? '#f0fdf4' : '#FEF4EC', color: a.estatus === 'completado' ? VERDE : NARANJA }}>
                        {a.estatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
                  <input
                    value={form.telefono}
                    onChange={e => {
                      const formatted = formatTelefono(e.target.value)
                      setForm(p => ({ ...p, telefono: formatted }))
                      setFormErrors(p => ({ ...p, telefono: validateTelefono(formatted) ?? undefined }))
                    }}
                    placeholder="55 1234 5678"
                    maxLength={12}
                    style={{ ...inputSt, borderColor: formErrors.telefono ? '#ef4444' : '#e2e8f0' }}
                  />
                  {formErrors.telefono && <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: '3px' }}>⚠️ {formErrors.telefono}</p>}
                  {!formErrors.telefono && form.telefono && form.telefono.replace(/\D/g,'').length === 10 && <p style={{ fontSize: '10px', color: '#16a34a', margin: '3px 0 0' }}>✓ Teléfono válido</p>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => {
                      setForm(p => ({ ...p, email: e.target.value }))
                      setFormErrors(p => ({ ...p, email: validateEmail(e.target.value) ?? undefined }))
                    }}
                    onBlur={e => setFormErrors(p => ({ ...p, email: validateEmail(e.target.value) ?? undefined }))}
                    placeholder="correo@ejemplo.com"
                    maxLength={100}
                    style={{ ...inputSt, borderColor: formErrors.email ? '#ef4444' : '#e2e8f0' }}
                  />
                  {formErrors.email && <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>⚠️ {formErrors.email}</p>}
                  {!formErrors.email && form.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && <p style={{ fontSize: '10px', color: '#16a34a', margin: '3px 0 0' }}>✓ Email válido</p>}
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
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
                  {(() => {
                    const ep = calcEstatusPago(form.monto_acordado ? parseFloat(form.monto_acordado) : null, form.monto_cobrado ? parseFloat(form.monto_cobrado) : null)
                    const s = PAGO_SEMAFORO[ep] ?? PAGO_SEMAFORO['Pendiente']
                    return (
                      <div style={{ width: '100%', background: s.bg, border: `2px solid ${s.border}`, borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>{s.icon}</span>
                        <div>
                          <div style={{ fontSize: '9px', color: s.color, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700', marginBottom: '1px' }}>Pago (auto)</div>
                          <div style={{ fontSize: '13px', fontWeight: '800', color: s.color }}>{s.label}</div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} rows={2} style={{ ...inputSt, resize: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowNuevo(false)} style={{ flex: 1, padding: '10px', background: '#F1F5F9', color: '#64748b', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarNuevo} disabled={saving || !form.nombre.trim() || !!formErrors.telefono || !!formErrors.email} style={{ flex: 2, padding: '10px', background: saving || !form.nombre.trim() || !!formErrors.telefono || !!formErrors.email ? '#94a3b8' : AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Guardando...' : 'Guardar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
