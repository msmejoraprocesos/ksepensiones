'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useSearchParams, useRouter } from 'next/navigation'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

// ── Etapas del pipeline ──────────────────────────────────────────
const COLUMNAS = [
  { id: 'prospecto',   label: 'Prospecto',         color: '#64748b', bg: '#f1f5f9', orden: 0 },
  { id: 'diagnostico', label: 'Diagnóstico',        color: '#3b82f6', bg: '#eff6ff', orden: 1 },
  { id: 'propuesta',   label: 'Propuesta enviada',  color: '#8b5cf6', bg: '#f5f3ff', orden: 2 },
  { id: 'cierre1',     label: '⭐ Cierre 1',        color: NARANJA,   bg: '#fff7ed', orden: 3, esCierre: true },
  { id: 'seguimiento', label: 'Seguimiento',        color: '#0891b2', bg: '#ecfeff', orden: 4 },
  { id: 'cierre2',     label: '⭐ Cierre 2',        color: '#dc2626', bg: '#fef2f2', orden: 5, esCierre: true },
  { id: 'tramite',     label: 'Trámite IMSS',       color: VERDE,     bg: '#f0fdf4', orden: 6 },
  { id: 'pensionado',  label: 'Pensionado ✅',      color: AZUL,      bg: '#eef2f8', orden: 7, esFinal: true },
]

const SERVICIOS = ['Diagnóstico', 'Trámite', 'Combo']

// Detecta automáticamente el concepto según número de pago y saldo
function detectarConcepto(numPagos: number, monto: number, saldoPendiente: number, montoAcordado: number | null): string {
  if (numPagos === 0) return 'Anticipo'
  if (montoAcordado && Math.abs(monto - saldoPendiente) < 1) return 'Liquidación'
  if (numPagos === 1) return 'Segunda exhibición'
  if (numPagos === 2) return 'Tercera exhibición'
  return 'Liquidación'
}

const TIPO_ICONS: Record<string, string> = { llamada: '📞', whatsapp: '💬', cita: '📅', email: '✉️', nota: '📝' }
const CONCEPTOS = ['Anticipo', 'Segunda exhibición', 'Tercera exhibición', 'Liquidación', 'Otro']

// ── Reglas de movimiento ─────────────────────────────────────────
function puedeMoverse(desde: string, hacia: string): boolean {
  if (desde === hacia) return false
  const colDesde = COLUMNAS.find(c => c.id === desde)
  const colHacia = COLUMNAS.find(c => c.id === hacia)
  if (!colDesde || !colHacia) return false
  // Pensionado es estado final
  if (desde === 'pensionado') return false
  // No puede regresar antes de Cierre 1
  if (colDesde.orden >= 3 && colHacia.orden < 3) return false
  // No puede regresar antes de Cierre 2
  if (colDesde.orden >= 5 && colHacia.orden < 5) return false
  // Trámite solo puede ir a Pensionado
  if (desde === 'tramite' && hacia !== 'pensionado') return false
  return true
}

// ── Semáforo de pago ─────────────────────────────────────────────
function calcEstatus(acordado: number | null, pagado: number): string {
  if (!acordado || acordado === 0) return pagado > 0 ? 'Parcial' : 'Pendiente'
  if (pagado >= acordado) return 'Liquidado'
  if (pagado > 0) return 'Parcial'
  return 'Pendiente'
}

const SEMAFORO: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  'Pendiente': { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: '🔴' },
  'Parcial':   { bg: '#fff7ed', border: '#fed7aa', color: '#ea580c', icon: '🟡' },
  'Liquidado': { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a', icon: '🟢' },
}

// ── Interfaces ───────────────────────────────────────────────────
interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  notas: string | null
  etapa_kanban: string | null
  servicio_contratado: string | null
  monto_acordado: number | null
  comprobante_url: string | null
  ultimo_contacto: string | null
  created_at: string
  total_pagado?: number
}

interface Servicio {
  id: string
  cliente_id: string
  tipo: string
  monto_acordado: number
  descripcion: string | null
  estatus: string
  fecha_inicio: string
  fecha_cierre: string | null
  created_at: string
  // computed
  total_pagado?: number
  pagos?: Pago[]
}

interface Pago {
  id: string
  cliente_id: string
  servicio_id: string | null
  monto: number
  concepto: string
  comprobante_url: string | null
  fecha_pago: string
  notas: string | null
}

interface Diagnostico {
  id: string; ley: string; semanas: number; edad_retiro: number
  resultado_e1: number | null; resultado_e4: number | null; created_at: string; notas: string | null
}

interface Actividad {
  id: string; tipo: string; titulo: string; fecha_programada: string | null; estatus: string; notas: string | null
}

type Vista = 'lista' | 'pipeline'

function ClientesInner() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [vista, setVista] = useState<Vista>('lista')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const userIdRef = useRef('')

  // Expediente
  const [selected, setSelected] = useState<Cliente | null>(null)
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[]>([])
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [servicioActivo, setServicioActivo] = useState<string | null>(null)
  const [showNuevoServicio, setShowNuevoServicio] = useState(false)
  const [showNuevaActividad, setShowNuevaActividad] = useState(false)
  const [formActividad, setFormActividad] = useState({ tipo: 'llamada', titulo: '', fecha_programada: new Date().toISOString().split('T')[0], hora: '09:00', notas: '' })
  const [savingActividad, setSavingActividad] = useState(false)
  const [formServicio, setFormServicio] = useState({ tipo: 'Diagnóstico', monto_acordado: '', descripcion: '' })
  const [modalTab, setModalTab] = useState<'info' | 'diagnosticos' | 'actividades' | 'pagos'>('info')

  // Nuevo cliente
  const [showNuevo, setShowNuevo] = useState(false)
  const [editando, setEditando] = useState(false)
  const [formEdit, setFormEdit] = useState({ nombre: '', telefono: '', email: '', notas: '' })
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', notas: '', etapa_kanban: 'prospecto', servicio_contratado: '', monto_acordado: '' })
  const [formErrors, setFormErrors] = useState<{telefono?: string; email?: string}>({})
  const [saving, setSaving] = useState(false)

  // Nuevo pago
  const [showPago, setShowPago] = useState(false)
  const [formPago, setFormPago] = useState({ monto: '', concepto: 'Anticipo', notas: '', fecha_pago: new Date().toISOString().split('T')[0] })
  const [savingPago, setSavingPago] = useState(false)
  const [uploadingComp, setUploadingComp] = useState<string | null>(null)
  const [compFile, setCompFile] = useState<File | null>(null)

  // Drag & drop
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      userIdRef.current = session.user.id
      loadClientes(session.user.id)
    })
    if (searchParams.get('nuevo') === 'true') setShowNuevo(true)
  }, [])

  async function loadClientes(uid: string) {
    setLoading(true)
    const { data } = await supabase.from('clientes').select('*').eq('asesor_id', uid).order('created_at', { ascending: false })
    if (!data) { setLoading(false); return }
    // Load total pagado per cliente
    const { data: pagosData } = await supabase.from('pagos').select('cliente_id, monto').eq('asesor_id', uid)
    const totales: Record<string, number> = {}
    pagosData?.forEach((p: any) => { totales[p.cliente_id] = (totales[p.cliente_id] ?? 0) + p.monto })
    const clientesConPago = data.map((c: any) => ({ ...c, total_pagado: totales[c.id] ?? 0 }))
    setClientes(clientesConPago as Cliente[])
    setLoading(false)
  }

  async function openExpediente(cliente: Cliente) {
    setSelected(cliente)
    setModalTab('info')
    const [{ data: diags }, { data: acts }, { data: pags }, { data: srvs }] = await Promise.all([
      supabase.from('diagnosticos').select('*').eq('cliente_id', cliente.id).order('created_at', { ascending: false }),
      supabase.from('actividades').select('*').eq('cliente_id', cliente.id).order('fecha_programada', { ascending: false }),
      supabase.from('pagos').select('*').eq('cliente_id', cliente.id).order('fecha_pago', { ascending: false }),
      supabase.from('servicios_contratados').select('*').eq('cliente_id', cliente.id).order('created_at', { ascending: true }),
    ])
    setDiagnosticos((diags as Diagnostico[]) ?? [])
    setActividades((acts as Actividad[]) ?? [])
    const pagosArr = (pags as Pago[]) ?? []
    setPagos(pagosArr)
    // Enrich servicios with pagos
    const srvsArr = (srvs as Servicio[]) ?? []
    const enriched = srvsArr.map(s => {
      const sPagos = pagosArr.filter(p => p.servicio_id === s.id)
      const total = sPagos.reduce((sum, p) => sum + p.monto, 0)
      return { ...s, total_pagado: total, pagos: sPagos }
    })
    setServicios(enriched)
    if (enriched.length > 0) setServicioActivo(enriched[enriched.length - 1].id)
  }

  async function guardarNuevo() {
    if (!form.nombre.trim()) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const uid = session.user.id
    userIdRef.current = uid
    const { error } = await supabase.from('clientes').insert({
      asesor_id: uid,
      nombre: form.nombre,
      telefono: form.telefono || null,
      email: form.email || null,
      notas: form.notas || null,
      etapa_kanban: form.etapa_kanban,
      servicio_contratado: form.servicio_contratado || null,
      monto_acordado: form.monto_acordado ? parseFloat(form.monto_acordado) : null,
    })
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    await loadClientes(uid)
    setSaving(false)
    setShowNuevo(false)
    setForm({ nombre: '', telefono: '', email: '', notas: '', etapa_kanban: 'prospecto', servicio_contratado: '', monto_acordado: '' })
    setFormErrors({})
  }

  function abrirEditar(cliente: Cliente) {
    setFormEdit({ nombre: cliente.nombre, telefono: cliente.telefono ?? '', email: cliente.email ?? '', notas: cliente.notas ?? '' })
    setEditando(true)
  }

  async function guardarEdicion() {
    if (!selected || !formEdit.nombre.trim()) return
    await actualizarCliente(selected.id, {
      nombre: formEdit.nombre,
      telefono: formEdit.telefono || null,
      email: formEdit.email || null,
      notas: formEdit.notas || null,
    })
    setEditando(false)
  }

  async function guardarActividad() {
    if (!selected || !formActividad.titulo.trim()) return
    setSavingActividad(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSavingActividad(false); return }
    const fechaHora = new Date(`${formActividad.fecha_programada}T${formActividad.hora}:00`)
    const { data, error } = await supabase.from('actividades').insert({
      cliente_id: selected.id,
      asesor_id: session.user.id,
      tipo: formActividad.tipo,
      titulo: formActividad.titulo,
      fecha_programada: fechaHora.toISOString(),
      notas: formActividad.notas || null,
      estatus: 'pendiente',
    }).select().single()
    if (!error && data) setActividades(prev => [data as Actividad, ...prev])
    setSavingActividad(false)
    setShowNuevaActividad(false)
    setFormActividad({ tipo: 'llamada', titulo: '', fecha_programada: new Date().toISOString().split('T')[0], hora: '09:00', notas: '' })
  }

  async function completarActividad(id: string) {
    await supabase.from('actividades').update({ estatus: 'completado' }).eq('id', id)
    setActividades(prev => prev.map(a => a.id === id ? { ...a, estatus: 'completado' } : a))
  }

  async function guardarServicio() {
    if (!selected || !formServicio.monto_acordado) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data, error } = await supabase.from('servicios_contratados').insert({
      cliente_id: selected.id,
      asesor_id: session.user.id,
      tipo: formServicio.tipo,
      monto_acordado: parseFloat(formServicio.monto_acordado),
      descripcion: formServicio.descripcion || null,
    }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    if (data) {
      const newSrv = { ...data as Servicio, total_pagado: 0, pagos: [] }
      setServicios(prev => [...prev, newSrv])
      setServicioActivo(newSrv.id)
      // Update monto_acordado on cliente as sum of all servicios
      const nuevoTotal = servicios.reduce((s, srv) => s + srv.monto_acordado, 0) + newSrv.monto_acordado
      await actualizarCliente(selected.id, { monto_acordado: nuevoTotal })
    }
    setShowNuevoServicio(false)
    setFormServicio({ tipo: 'Diagnóstico', monto_acordado: '', descripcion: '' })
  }

  async function cerrarServicio(servicioId: string) {
    await supabase.from('servicios_contratados').update({ estatus: 'liquidado', fecha_cierre: new Date().toISOString() }).eq('id', servicioId)
    setServicios(prev => prev.map(s => s.id === servicioId ? { ...s, estatus: 'liquidado', fecha_cierre: new Date().toISOString() } : s))
  }

  async function guardarPago() {
    if (!selected || !formPago.monto) return
    setSavingPago(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSavingPago(false); return }

    // Upload comprobante if exists
    let comprobante_url = null
    if (compFile) {
      const pagoTempId = crypto.randomUUID()
      const ext = compFile.name.split('.').pop()
      const path = `comprobantes/${pagoTempId}.${ext}`
      const { error: uploadError } = await supabase.storage.from('comprobantes').upload(path, compFile, { upsert: true })
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path)
        comprobante_url = urlData.publicUrl
      }
    }

    // Validar que no exceda el saldo pendiente
    const montoNuevo = parseFloat(formPago.monto)
    const saldoPendiente = Math.max(0, (selected.monto_acordado ?? 0) - (selected.total_pagado ?? 0))
    if (selected.monto_acordado && montoNuevo > saldoPendiente) {
      alert(`El pago de ${fmtMXN(montoNuevo)} excede el saldo pendiente de ${fmtMXN(saldoPendiente)}`)
      setSavingPago(false)
      return
    }

    const { data, error } = await supabase.from('pagos').insert({
      cliente_id: selected.id,
      asesor_id: session.user.id,
      monto: montoNuevo,
      concepto: formPago.concepto,
      notas: formPago.notas || null,
      fecha_pago: new Date(formPago.fecha_pago).toISOString(),
      comprobante_url,
      servicio_id: servicioActivo,
    }).select().single()
    if (error) {
      alert('Error al registrar pago: ' + error.message + ' (code: ' + error.code + ')')
      setSavingPago(false)
      return
    }
    if (!error && data) {
      const newPago = data as Pago
      setPagos(prev => [newPago, ...prev])
      const nuevoTotal = (selected.total_pagado ?? 0) + newPago.monto
      const updatedCliente = { ...selected, total_pagado: nuevoTotal }
      setSelected(updatedCliente)
      setClientes(prev => prev.map(c => c.id === selected.id ? updatedCliente : c))
      // Update servicio total
      if (servicioActivo) {
        setServicios(prev => prev.map(s => {
          if (s.id !== servicioActivo) return s
          const newPagos = [...(s.pagos ?? []), newPago]
          const newTotal = newPagos.reduce((sum, p) => sum + p.monto, 0)
          return { ...s, pagos: newPagos, total_pagado: newTotal }
        }))
      }
    }
    // Reload all clientes to get fresh total_pagado
    const uid = userIdRef.current
    if (uid) await loadClientes(uid)
    setSavingPago(false)
    setShowPago(false)
    setCompFile(null)
    setFormPago({ monto: '', concepto: 'Anticipo', notas: '', fecha_pago: new Date().toISOString().split('T')[0] })
  }

  async function eliminarPago(pagoId: string, monto: number) {
    if (!confirm('¿Eliminar este pago?')) return
    await supabase.from('pagos').delete().eq('id', pagoId)
    setPagos(prev => prev.filter(p => p.id !== pagoId))
    const uid = userIdRef.current
    if (uid) await loadClientes(uid)
    if (selected) {
      const nuevoTotal = (selected.total_pagado ?? 0) - monto
      setSelected(prev => prev ? { ...prev, total_pagado: nuevoTotal } : prev)
    }
  }

  async function uploadComprobantePago(pagoId: string, file: File) {
    setUploadingComp(pagoId)
    const ext = file.name.split('.').pop()
    const path = `comprobantes/${pagoId}.${ext}`
    const { error } = await supabase.storage.from('comprobantes').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('comprobantes').getPublicUrl(path)
      await supabase.from('pagos').update({ comprobante_url: data.publicUrl }).eq('id', pagoId)
      setPagos(prev => prev.map(p => p.id === pagoId ? { ...p, comprobante_url: data.publicUrl } : p))
    }
    setUploadingComp(null)
  }

  async function moverCliente(clienteId: string, etapaActual: string, nuevaEtapa: string) {
    if (!puedeMoverse(etapaActual, nuevaEtapa)) return
    await supabase.from('clientes').update({ etapa_kanban: nuevaEtapa, ultimo_contacto: new Date().toISOString() }).eq('id', clienteId)
    setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, etapa_kanban: nuevaEtapa } : c))
    if (selected?.id === clienteId) setSelected(prev => prev ? { ...prev, etapa_kanban: nuevaEtapa } : prev)
    setDragging(null); setDragOver(null)
  }

  async function actualizarCliente(id: string, campos: Partial<Cliente>) {
    await supabase.from('clientes').update(campos).eq('id', id)
    setClientes(prev => prev.map(c => c.id === id ? { ...c, ...campos } : c))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, ...campos } : prev)
  }

  async function eliminarCliente(id: string) {
    if (!confirm('¿Eliminar este cliente y todos sus datos?')) return
    await supabase.from('clientes').delete().eq('id', id)
    setClientes(prev => prev.filter(c => c.id !== id))
    setSelected(null)
  }

  // Validaciones
  function formatTelefono(val: string): string {
    const digits = val.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 2) return digits
    if (digits.length <= 6) return `${digits.slice(0,2)} ${digits.slice(2)}`
    return `${digits.slice(0,2)} ${digits.slice(2,6)} ${digits.slice(6)}`
  }
  function validateTelefono(val: string): string | null {
    if (!val) return null
    const digits = val.replace(/\D/g, '')
    if (digits.length > 0 && digits.length < 10) return `Faltan ${10 - digits.length} dígitos`
    return null
  }
  function validateEmail(val: string): string | null {
    if (!val) return null
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Formato inválido'
  }

  const clientesPorColumna = (colId: string) => clientes.filter(c => (c.etapa_kanban || 'prospecto') === colId)
  const totalCobrado = clientes.reduce((s, c) => s + (c.total_pagado ?? 0), 0)
  const totalPorCobrar = clientes.reduce((s, c) => s + Math.max(0, (c.monto_acordado ?? 0) - (c.total_pagado ?? 0)), 0)
  const filtered = clientes.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase()) || (c.email ?? '').toLowerCase().includes(search.toLowerCase()) || (c.telefono ?? '').includes(search))

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const fmtMXN = (n: number | null) => n != null ? `$${n.toLocaleString('es-MX')}` : '—'
  const fmtDias = (d: string | null) => {
    if (!d) return '—'
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    if (diff === 0) return 'Hoy'; if (diff === 1) return 'Ayer'; return `hace ${diff}d`
  }
  const inputSt: React.CSSProperties = { display: 'block', width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', background: 'white' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{ color: AZUL, fontSize: '18px', fontWeight: '800', margin: 0 }}>Clientes</h1>
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          {(['lista', 'pipeline'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding: '6px 14px', background: vista === v ? AZUL : 'white', color: vista === v ? 'white' : '#64748b', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
              {v === 'lista' ? '☰ Lista' : '⊟ Pipeline'}
            </button>
          ))}
        </div>
        {vista === 'lista' && (
          <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '7px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '240px', outline: 'none' }} />
        )}
        {vista === 'pipeline' && (
          <div style={{ display: 'flex', gap: '10px' }}>
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
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNuevo(true)}
          style={{ background: AZUL, color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
          + Nuevo cliente
        </button>
      </div>

      {/* ── VISTA LISTA ── */}
      {vista === 'lista' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Cargando...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
              <div style={{ color: '#64748b', fontSize: '15px', fontWeight: '600' }}>{search ? 'Sin resultados' : 'Sin clientes aún'}</div>
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #e2e8f0' }}>
                    {['Cliente', 'Etapa', 'Servicio', 'Acordado', 'Pagado', 'Saldo', 'Pago', 'Contacto', ''].map((h, i) => (
                      <th key={i} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const col = COLUMNAS.find(col => col.id === (c.etapa_kanban || 'prospecto'))
                    const estatus = calcEstatus(c.monto_acordado, c.total_pagado ?? 0)
                    const sem = SEMAFORO[estatus]
                    const saldo = Math.max(0, (c.monto_acordado ?? 0) - (c.total_pagado ?? 0))
                    return (
                      <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }} onClick={() => openExpediente(c)}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '30px', height: '30px', background: AZUL, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                              {c.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{c.nombre}</div>
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.email ?? c.telefono ?? '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', fontWeight: '600', background: col?.bg, color: col?.color }}>{col?.label}</span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#64748b' }}>{c.servicio_contratado ?? '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: AZUL }}>{fmtMXN(c.monto_acordado)}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: VERDE }}>{fmtMXN(c.total_pagado ?? 0)}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: saldo > 0 ? '#ef4444' : VERDE }}>{saldo > 0 ? fmtMXN(saldo) : '✅'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: sem.bg, border: `1px solid ${sem.border}`, borderRadius: '8px', padding: '2px 7px' }}>
                            <span style={{ fontSize: '11px' }}>{sem.icon}</span>
                            <span style={{ fontSize: '10px', color: sem.color, fontWeight: '700' }}>{estatus}</span>
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8' }}>{fmtDias(c.ultimo_contacto)}</td>
                        <td style={{ padding: '10px 12px' }}><span style={{ color: NARANJA, fontSize: '12px', fontWeight: '600' }}>Ver →</span></td>
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
              const canDrop = dragging ? puedeMoverse(clientes.find(c => c.id === dragging)?.etapa_kanban ?? 'prospecto', col.id) : true
              return (
                <div key={col.id}
                  onDragOver={e => { e.preventDefault(); if (canDrop) setDragOver(col.id) }}
                  onDrop={e => {
                    e.preventDefault()
                    if (dragging && canDrop) {
                      const cliente = clientes.find(c => c.id === dragging)
                      if (cliente) moverCliente(dragging, cliente.etapa_kanban ?? 'prospecto', col.id)
                    }
                  }}
                  style={{ width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: isDragOver && canDrop ? `${col.color}12` : '#F4F6FB', borderRadius: '12px', border: `2px solid ${isDragOver && canDrop ? col.color : 'transparent'}`, transition: 'all 0.15s', opacity: isDragOver && !canDrop ? 0.5 : 1 }}>
                  <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color }} />
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>{col.label}</span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '700', background: col.bg, color: col.color, padding: '1px 7px', borderRadius: '10px' }}>{cards.length}</span>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {cards.map(cliente => {
                      const estatus = calcEstatus(cliente.monto_acordado, cliente.total_pagado ?? 0)
                      const sem = SEMAFORO[estatus]
                      return (
                        <div key={cliente.id}
                          draggable={!col.esFinal}
                          onDragStart={e => { if (!col.esFinal) { setDragging(cliente.id); e.dataTransfer.effectAllowed = 'move' } }}
                          onDragEnd={() => { setDragging(null); setDragOver(null) }}
                          onClick={() => openExpediente(cliente)}
                          style={{ background: 'white', borderRadius: '10px', padding: '11px', border: `1px solid ${dragging === cliente.id ? col.color : '#e2e8f0'}`, cursor: col.esFinal ? 'pointer' : 'grab', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', opacity: dragging === cliente.id ? 0.5 : 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: AZUL, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>
                              {cliente.nombre.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliente.nombre}</span>
                          </div>
                          {cliente.servicio_contratado && (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: col.bg, color: col.color, fontWeight: '700', display: 'inline-block', marginBottom: '4px' }}>{cliente.servicio_contratado}</span>
                          )}
                          {cliente.monto_acordado && (
                            <div style={{ fontSize: '11px', color: AZUL, fontWeight: '700', marginBottom: '3px' }}>💰 {fmtMXN(cliente.monto_acordado)}</div>
                          )}
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: sem.bg, border: `1px solid ${sem.border}`, borderRadius: '6px', padding: '1px 6px', marginBottom: '3px' }}>
                            <span style={{ fontSize: '10px' }}>{sem.icon}</span>
                            <span style={{ fontSize: '10px', color: sem.color, fontWeight: '700' }}>{estatus}</span>
                          </div>
                          {/* Mini historial de pagos */}
                          {(cliente.total_pagado ?? 0) > 0 && (
                            <div style={{ marginTop: '4px', padding: '4px 6px', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                              <div style={{ fontSize: '10px', color: VERDE, fontWeight: '700' }}>
                                💰 {fmtMXN(cliente.total_pagado ?? 0)} pagado
                              </div>
                              {cliente.monto_acordado && (
                                <div style={{ fontSize: '9px', color: '#94a3b8' }}>
                                  de {fmtMXN(cliente.monto_acordado)} acordado
                                </div>
                              )}
                            </div>
                          )}
                          <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>📅 {fmtDias(cliente.ultimo_contacto ?? cliente.created_at)}</div>
                        </div>
                      )
                    })}
                    {cards.length === 0 && (
                      <div style={{ border: `2px dashed ${isDragOver && canDrop ? col.color : '#e2e8f0'}`, borderRadius: '8px', padding: '16px 8px', textAlign: 'center', color: isDragOver && canDrop ? col.color : '#cbd5e1', fontSize: '10px' }}>
                        {isDragOver && canDrop ? 'Suelta aquí' : isDragOver && !canDrop ? '🚫 No permitido' : 'Vacío'}
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
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div style={{ width: '540px', height: '100vh', background: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '42px', height: '42px', background: AZUL, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', fontWeight: '700' }}>
                {selected.nombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{selected.nombre}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Alta: {fmt(selected.created_at)}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            {/* Etapa pipeline */}
            <div style={{ padding: '10px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {COLUMNAS.map(col => {
                const puede = puedeMoverse(selected.etapa_kanban ?? 'prospecto', col.id)
                const esActual = (selected.etapa_kanban || 'prospecto') === col.id
                return (
                  <button key={col.id}
                    onClick={() => puede && moverCliente(selected.id, selected.etapa_kanban ?? 'prospecto', col.id)}
                    style={{ padding: '3px 8px', borderRadius: '6px', border: `1.5px solid ${esActual ? col.color : '#e2e8f0'}`, background: esActual ? col.bg : 'white', color: esActual ? col.color : puede ? '#64748b' : '#cbd5e1', fontSize: '10px', fontWeight: '600', cursor: puede ? 'pointer' : 'not-allowed', opacity: !puede && !esActual ? 0.4 : 1 }}>
                    {col.label}
                  </button>
                )
              })}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 22px' }}>
              {(['info', 'pagos', 'diagnosticos', 'actividades'] as const).map(tab => (
                <button key={tab} onClick={() => setModalTab(tab)}
                  style={{ padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: modalTab === tab ? '700' : '400', color: modalTab === tab ? AZUL : '#64748b', borderBottom: modalTab === tab ? `2px solid ${AZUL}` : '2px solid transparent', marginBottom: '-1px' }}>
                  {tab === 'info' ? 'Datos' : tab === 'pagos' ? `💰 Pagos (${pagos.length})` : tab === 'diagnosticos' ? `Diagnósticos (${diagnosticos.length})` : `Actividades (${actividades.length})`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>

              {/* ── TAB INFO ── */}
              {modalTab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {!editando ? (
                    <>
                      {[
                        { label: 'Nombre', value: selected.nombre },
                        { label: 'Teléfono', value: selected.telefono ?? '—' },
                        { label: 'Email', value: selected.email ?? '—' },
                        { label: 'Notas', value: selected.notas ?? '—' },
                      ].map((f, i) => (
                        <div key={i}>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{f.label}</div>
                          <div style={{ fontSize: '13px', color: '#1e293b' }}>{f.value}</div>
                        </div>
                      ))}
                      <div style={{ background: '#F4F6FB', borderRadius: '10px', padding: '12px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Etiqueta de servicio</div>
                        <select defaultValue={selected.servicio_contratado ?? ''} onChange={e => actualizarCliente(selected.id, { servicio_contratado: e.target.value || null })} style={{ ...inputSt, fontSize: '12px', padding: '7px 10px' }}>
                          <option value="">— Sin definir —</option>
                          {SERVICIOS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => abrirEditar(selected)}
                          style={{ flex: 1, padding: '9px', background: '#F4F6FB', color: AZUL, border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                          ✏️ Editar datos
                        </button>
                        <button onClick={() => eliminarCliente(selected.id)}
                          style={{ padding: '9px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                          🗑️ Eliminar
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: 0 }}>Editar datos del cliente</p>
                      {[
                        { label: 'Nombre', key: 'nombre', type: 'text', placeholder: 'Nombre completo' },
                        { label: 'Teléfono', key: 'telefono', type: 'tel', placeholder: '55 1234 5678' },
                        { label: 'Email', key: 'email', type: 'email', placeholder: 'correo@ejemplo.com' },
                      ].map((f, i) => (
                        <div key={i}>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>{f.label}</label>
                          <input type={f.type} value={(formEdit as any)[f.key]} onChange={e => setFormEdit(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inputSt} />
                        </div>
                      ))}
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Notas</label>
                        <textarea value={formEdit.notas} onChange={e => setFormEdit(p => ({ ...p, notas: e.target.value }))} rows={2} style={{ ...inputSt, resize: 'none' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setEditando(false)} style={{ flex: 1, padding: '9px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
                        <button onClick={guardarEdicion} style={{ flex: 2, padding: '9px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>Guardar cambios</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB PAGOS ── */}
              {modalTab === 'pagos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Resumen con número de pagos */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {pagos.map((p, i) => (
                      <span key={p.id} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: '#EEF2F8', color: AZUL, fontWeight: '600' }}>
                        #{i+1} {p.concepto} · {fmtMXN(p.monto)}
                      </span>
                    ))}
                    {pagos.length === 0 && <span style={{ fontSize: '11px', color: '#94a3b8' }}>Sin pagos registrados aún</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {[
                      { label: 'Acordado', value: fmtMXN(selected.monto_acordado), color: AZUL },
                      { label: 'Pagado', value: fmtMXN(selected.total_pagado ?? 0), color: VERDE },
                      { label: 'Saldo', value: fmtMXN(Math.max(0, (selected.monto_acordado ?? 0) - (selected.total_pagado ?? 0))), color: '#ef4444' },
                    ].map((k, i) => {
                      const estatus = calcEstatus(selected.monto_acordado, selected.total_pagado ?? 0)
                      const sem = SEMAFORO[estatus]
                      return (
                        <div key={i} style={{ background: i === 2 ? sem.bg : '#F4F6FB', border: i === 2 ? `1px solid ${sem.border}` : '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{k.label}</div>
                          <div style={{ fontSize: '15px', fontWeight: '800', color: i === 2 ? sem.color : k.color }}>{k.value}</div>
                          {i === 2 && <div style={{ fontSize: '10px', fontWeight: '700', color: sem.color, marginTop: '2px' }}>{sem.icon} {estatus}</div>}
                        </div>
                      )
                    })}
                  </div>

                  {/* Botón nuevo pago */}
                  {(() => {
                    const saldo = Math.max(0, (selected.monto_acordado ?? 0) - (selected.total_pagado ?? 0))
                    const liquidado = selected.monto_acordado != null && saldo <= 0
                    return liquidado ? (
                      <div style={{ width: '100%', padding: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', textAlign: 'center', fontSize: '13px', fontWeight: '700', color: VERDE }}>
                        🟢 Pago completado — cuenta liquidada
                      </div>
                    ) : (
                      <button onClick={() => {
                        const srvPagosLocal = pagos.filter(p => p.servicio_id === srv.id)
                        const concepto = detectarConcepto(srvPagosLocal.length, 0, srvSaldo, srv.monto_acordado)
                        setFormPago(p => ({ ...p, concepto }))
                        setShowPago(true)
                      }}
                        style={{ width: '100%', padding: '10px', background: VERDE, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                        + Registrar {pagos.length === 0 ? 'anticipo' : pagos.length === 1 ? 'segunda exhibición' : pagos.length === 2 ? 'tercera exhibición' : 'liquidación'}
                      </button>
                    )
                  })()}

                  {/* Lista de pagos */}
                  {pagos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px' }}>Sin pagos registrados</div>
                  ) : pagos.map(pago => (
                    <div key={pago.id} style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div>
                          <span style={{ fontSize: '14px', fontWeight: '800', color: VERDE }}>{fmtMXN(pago.monto)}</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>{pago.concepto}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{fmt(pago.fecha_pago)}</span>
                          <button onClick={() => eliminarPago(pago.id, pago.monto)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px', padding: '2px' }}>🗑️</button>
                        </div>
                      </div>
                      {pago.notas && <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontStyle: 'italic' }}>{pago.notas}</div>}
                      {pago.comprobante_url ? (
                        <a href={pago.comprobante_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: AZUL, fontWeight: '600', textDecoration: 'none', background: '#EEF2F8', padding: '4px 10px', borderRadius: '6px' }}>
                          📎 Ver comprobante
                        </a>
                      ) : (
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8', cursor: uploadingComp === pago.id ? 'not-allowed' : 'pointer', background: '#F4F6FB', padding: '4px 10px', borderRadius: '6px', border: '1px dashed #e2e8f0' }}>
                          {uploadingComp === pago.id ? '⏳ Subiendo...' : '📎 Adjuntar comprobante'}
                          <input type="file" accept="image/*,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) uploadComprobantePago(pago.id, f) }} style={{ display: 'none' }} disabled={uploadingComp === pago.id} />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── TAB DIAGNÓSTICOS ── */}
              {modalTab === 'diagnosticos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <a href={`/calculadora?cliente=${selected.id}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', background: AZUL, color: 'white', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: '700' }}>
                    🧮 Nuevo diagnóstico para {selected.nombre.split(' ')[0]}
                  </a>
                  {diagnosticos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px', background: '#F8FAFC', borderRadius: '10px', border: '1px dashed #e2e8f0' }}>
                      Sin diagnósticos aún — corre la calculadora para generar el primero
                    </div>
                  ) : diagnosticos.map(d => (
                    <div key={d.id} style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ background: d.ley === '73' ? '#EEF2F8' : '#EEF7F1', color: d.ley === '73' ? AZUL : VERDE, fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>Ley {d.ley}</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{fmt(d.created_at)}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
                        <div><span style={{ color: '#94a3b8' }}>Semanas: </span><strong>{d.semanas}</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>Retiro: </span><strong>{d.edad_retiro} años</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>E1 sin acción: </span><strong style={{ color: AZUL }}>${Math.round(d.resultado_e1 ?? 0).toLocaleString()}</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>E4 óptimo: </span><strong style={{ color: VERDE }}>${Math.round(d.resultado_e4 ?? 0).toLocaleString()}</strong></div>
                      </div>
                      {d.notas && <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>{d.notas}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* ── TAB ACTIVIDADES ── */}
              {modalTab === 'actividades' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button onClick={() => setShowNuevaActividad(p => !p)}
                    style={{ padding: '9px', background: NARANJA, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                    + Registrar actividad
                  </button>

                  {showNuevaActividad && (
                    <div style={{ background: '#F4F6FB', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Tipo</label>
                          <select value={formActividad.tipo} onChange={e => setFormActividad(p => ({ ...p, tipo: e.target.value }))} style={inputSt}>
                            <option value="llamada">📞 Llamada</option>
                            <option value="whatsapp">💬 WhatsApp</option>
                            <option value="cita">📅 Cita</option>
                            <option value="email">✉️ Email</option>
                            <option value="nota">📝 Nota</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Fecha</label>
                          <input type="date" value={formActividad.fecha_programada} onChange={e => setFormActividad(p => ({ ...p, fecha_programada: e.target.value }))} style={inputSt} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Hora</label>
                          <input type="time" value={formActividad.hora} onChange={e => setFormActividad(p => ({ ...p, hora: e.target.value }))} style={inputSt} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Título *</label>
                          <input value={formActividad.titulo} onChange={e => setFormActividad(p => ({ ...p, titulo: e.target.value }))} placeholder="Ej. Llamada de seguimiento" style={inputSt} />
                        </div>
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Notas</label>
                        <input value={formActividad.notas} onChange={e => setFormActividad(p => ({ ...p, notas: e.target.value }))} placeholder="Detalles de la actividad..." style={inputSt} />
                      </div>
                      <div style={{ display: 'flex', gap: '7px' }}>
                        <button onClick={() => setShowNuevaActividad(false)} style={{ flex: 1, padding: '8px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
                        <button onClick={guardarActividad} disabled={savingActividad || !formActividad.titulo.trim()}
                          style={{ flex: 2, padding: '8px', background: savingActividad || !formActividad.titulo.trim() ? '#94a3b8' : NARANJA, color: 'white', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                          {savingActividad ? 'Guardando...' : 'Guardar actividad'}
                        </button>
                      </div>
                    </div>
                  )}

                  {actividades.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px', color: '#94a3b8', fontSize: '13px', background: '#F8FAFC', borderRadius: '10px', border: '1px dashed #e2e8f0' }}>
                      Sin actividades registradas
                    </div>
                  ) : actividades.map(a => (
                    <div key={a.id} style={{ display: 'flex', gap: '10px', padding: '10px 12px', background: a.estatus === 'completado' ? '#f0fdf4' : '#F8FAFC', borderRadius: '8px', border: `1px solid ${a.estatus === 'completado' ? '#bbf7d0' : '#e2e8f0'}` }}>
                      <div style={{ fontSize: '16px' }}>{TIPO_ICONS[a.tipo] ?? '📌'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{a.titulo}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{a.fecha_programada ? fmt(a.fecha_programada) : 'Sin fecha'}</div>
                        {a.notas && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', fontStyle: 'italic' }}>{a.notas}</div>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600', background: a.estatus === 'completado' ? '#f0fdf4' : '#FEF4EC', color: a.estatus === 'completado' ? VERDE : NARANJA }}>
                          {a.estatus}
                        </span>
                        {a.estatus !== 'completado' && (
                          <button onClick={() => completarActividad(a.id)}
                            style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '6px', background: '#f0fdf4', color: VERDE, border: '1px solid #bbf7d0', cursor: 'pointer', fontWeight: '600' }}>
                            ✓ Completar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NUEVO PAGO ── */}
      {showPago && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowPago(false); setCompFile(null) } }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <h3 style={{ color: AZUL, fontSize: '17px', fontWeight: '700', margin: 0 }}>Registrar pago</h3>
              <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 10px', borderRadius: '10px', background: '#EEF2F8', color: AZUL }}>
                Pago #{pagos.length + 1}
              </span>
            </div>
            {(() => {
          const saldo = Math.max(0, (selected.monto_acordado ?? 0) - (selected.total_pagado ?? 0))
          return (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <div style={{ flex: 1, background: '#F4F6FB', borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>Acordado</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: AZUL }}>{fmtMXN(selected.monto_acordado)}</div>
              </div>
              <div style={{ flex: 1, background: '#f0fdf4', borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>Pagado</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: VERDE }}>{fmtMXN(selected.total_pagado ?? 0)}</div>
              </div>
              <div style={{ flex: 1, background: saldo > 0 ? '#fff5f5' : '#f0fdf4', borderRadius: '8px', padding: '8px 12px', border: `1px solid ${saldo > 0 ? '#fecaca' : '#bbf7d0'}` }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>Saldo máximo</div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: saldo > 0 ? '#ef4444' : VERDE }}>{fmtMXN(saldo)}</div>
              </div>
            </div>
          )
        })()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monto *</label>
                <input type="number" value={formPago.monto}
                  onChange={e => {
                      const val = e.target.value
                      const saldo = Math.max(0, (selected.monto_acordado ?? 0) - (selected.total_pagado ?? 0))
                      const concepto = detectarConcepto(pagos.length, parseFloat(val) || 0, saldo, selected.monto_acordado)
                      setFormPago(p => ({ ...p, monto: val, concepto }))
                    }}
                  placeholder="0"
                  max={Math.max(0, (selected.monto_acordado ?? 0) - (selected.total_pagado ?? 0))}
                  style={{ ...inputSt, borderColor: formPago.monto && selected.monto_acordado && parseFloat(formPago.monto) > Math.max(0, selected.monto_acordado - (selected.total_pagado ?? 0)) ? '#ef4444' : '#e2e8f0' }}
                  autoFocus />
                {formPago.monto && selected.monto_acordado && parseFloat(formPago.monto) > Math.max(0, selected.monto_acordado - (selected.total_pagado ?? 0)) && (
                  <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>
                    ⚠️ Excede el saldo pendiente de {fmtMXN(Math.max(0, selected.monto_acordado - (selected.total_pagado ?? 0)))}
                  </p>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Concepto</label>
                  <select value={formPago.concepto} onChange={e => setFormPago(p => ({ ...p, concepto: e.target.value }))} style={inputSt}>
                    {CONCEPTOS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fecha</label>
                  <input type="date" value={formPago.fecha_pago} onChange={e => setFormPago(p => ({ ...p, fecha_pago: e.target.value }))} style={inputSt} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notas</label>
                <input value={formPago.notas} onChange={e => setFormPago(p => ({ ...p, notas: e.target.value }))} placeholder="Ej. Transferencia BBVA" style={inputSt} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Comprobante (opcional)</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', border: `2px dashed ${compFile ? VERDE : '#e2e8f0'}`, borderRadius: '8px', cursor: 'pointer', background: compFile ? '#f0fdf4' : '#FAFBFC', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: '18px' }}>{compFile ? '✅' : '📎'}</span>
                  <span style={{ fontSize: '12px', color: compFile ? VERDE : '#94a3b8', fontWeight: '600' }}>
                    {compFile ? compFile.name : 'Adjuntar ficha de depósito o transferencia'}
                  </span>
                  <input type="file" accept="image/*,.pdf" onChange={e => setCompFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                </label>
                {compFile && (
                  <button onClick={() => setCompFile(null)} style={{ marginTop: '4px', fontSize: '10px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    ✕ Quitar archivo
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowPago(false)} style={{ flex: 1, padding: '10px', background: '#F1F5F9', color: '#64748b', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarPago} disabled={savingPago || !formPago.monto}
                style={{ flex: 2, padding: '10px', background: (savingPago || !formPago.monto || (selected.monto_acordado != null && parseFloat(formPago.monto||'0') > Math.max(0, selected.monto_acordado - (selected.total_pagado ?? 0)))) ? '#94a3b8' : VERDE, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: savingPago ? 'not-allowed' : 'pointer' }}>
                {savingPago ? 'Guardando...' : '💰 Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NUEVO CLIENTE ── */}
      {showNuevo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowNuevo(false) }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '440px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h2 style={{ color: AZUL, fontSize: '18px', fontWeight: '700', margin: '0 0 20px' }}>Nuevo cliente</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre completo" style={inputSt} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Teléfono</label>
                  <input value={form.telefono} onChange={e => { const f = formatTelefono(e.target.value); setForm(p => ({ ...p, telefono: f })); setFormErrors(p => ({ ...p, telefono: validateTelefono(f) ?? undefined })) }} placeholder="55 1234 5678" maxLength={12} style={{ ...inputSt, borderColor: formErrors.telefono ? '#ef4444' : '#e2e8f0' }} />
                  {formErrors.telefono && <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>⚠️ {formErrors.telefono}</p>}
                  {!formErrors.telefono && form.telefono && form.telefono.replace(/\D/g,'').length === 10 && <p style={{ fontSize: '10px', color: '#16a34a', margin: '3px 0 0' }}>✓ Válido</p>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</label>
                  <input type="email" value={form.email} onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setFormErrors(p => ({ ...p, email: validateEmail(e.target.value) ?? undefined })) }} placeholder="correo@ejemplo.com" style={{ ...inputSt, borderColor: formErrors.email ? '#ef4444' : '#e2e8f0' }} />
                  {formErrors.email && <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>⚠️ {formErrors.email}</p>}
                  {!formErrors.email && form.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && <p style={{ fontSize: '10px', color: '#16a34a', margin: '3px 0 0' }}>✓ Válido</p>}
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
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monto acordado ($)</label>
                <input type="number" value={form.monto_acordado} onChange={e => setForm(p => ({ ...p, monto_acordado: e.target.value }))} placeholder="Se puede definir después" style={inputSt} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} rows={2} style={{ ...inputSt, resize: 'none' }} />
              </div>
            </div>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '12px 0 0' }}>💡 Los pagos se registran desde el expediente del cliente</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={() => { setShowNuevo(false); setFormErrors({}) }} style={{ flex: 1, padding: '10px', background: '#F1F5F9', color: '#64748b', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarNuevo} disabled={saving || !form.nombre.trim() || !!formErrors.telefono || !!formErrors.email}
                style={{ flex: 2, padding: '10px', background: saving || !form.nombre.trim() || !!formErrors.telefono || !!formErrors.email ? '#94a3b8' : AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Guardando...' : 'Guardar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default function ClientesPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Cargando...</div>}>
      <ClientesInner />
    </Suspense>
  )
}
