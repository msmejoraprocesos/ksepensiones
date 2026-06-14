'use client' // v6-etapas

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
  { id: 'seguimiento', label: 'Seguimiento',        color: '#0891b2', bg: '#ecfeff', orden: 3 },
  { id: 'tramite',     label: 'Trámite IMSS',       color: VERDE,     bg: '#f0fdf4', orden: 4 },
  { id: 'pensionado',  label: 'Pensionado ✅',      color: AZUL,      bg: '#eef2f8', orden: 5, esFinal: true },
  { id: 'cancelado',   label: 'Cancelado',         color: '#64748b', bg: '#f8fafc', orden: 6, esFinal: true },
  { id: 'perdido',     label: 'Perdido',           color: '#ef4444', bg: '#fef2f2', orden: 7, esFinal: true },
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
  // Pensionado es estado final — no se puede mover
  if (desde === 'pensionado') return false
  // Trámite IMSS solo puede avanzar a Pensionado
  if (desde === 'tramite' && hacia !== 'pensionado') return false
  // Cancelado/perdido siempre permitido desde cualquier etapa no final
  if (hacia === 'cancelado' || hacia === 'perdido') return true
  // No puede regresar antes de Trámite IMSS una vez iniciado
  if (colDesde.orden >= 4 && colHacia.orden < 4) return false
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


interface PagoProgramado {
  id: string
  cliente_id: string
  numero_pago: number
  fecha_programada: string
  monto_programado: number
  pagado: boolean
  fecha_pago_real: string | null
  comprobante_url: string | null
  notas: string | null
}

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
  id: string; ley: string; semanas: number; edad_retiro: number; ingreso_deseado: number | null
  resultado_e1: number | null; resultado_e2: number | null; resultado_e3: number | null; resultado_e4: number | null
  created_at: string; notas: string | null; analisis_narrativo: any | null; salario_diario: number | null
}

interface Actividad {
  id: string; tipo: string; titulo: string; fecha_programada: string | null; estatus: string; notas: string | null
}

type Vista = 'lista' | 'pipeline'

function ClientesInner() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [vista, setVista] = useState<Vista>('lista')
  const [filtroNombre, setFiltroNombre] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroServicio, setFiltroServicio] = useState('')
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
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [deletingCliente, setDeletingCliente] = useState(false)
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [showConfirmEtapa, setShowConfirmEtapa] = useState<{clienteId: string; etapaActual: string; etapaNueva: string} | null>(null)
  const [pendingClose, setPendingClose] = useState(false)
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
  const [pagosProgramados, setPagosProgramados] = useState<PagoProgramado[]>([])
  const [uploadingProgComp, setUploadingProgComp] = useState<string | null>(null)
  const [showWappModal, setShowWappModal] = useState(false)
  const [nuevoClienteData, setNuevoClienteData] = useState<{id: string; nombre: string; telefono: string | null} | null>(null)
  const [materiales, setMateriales] = useState<{id:string;nombre:string;descripcion:string|null;tipo:string;url:string|null}[]>([])
  const [compFile, setCompFile] = useState<File | null>(null)

  // Drag & drop
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  async function loadMateriales(uid: string) {
    const { data } = await supabase.from('materiales_apoyo').select('*').eq('asesor_id', uid).eq('activo', true).order('orden')
    setMateriales(data ?? [])
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      userIdRef.current = session.user.id
      loadClientes(session.user.id)
      loadMateriales(session.user.id)
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
    const { data: newCliente, error } = await supabase.from('clientes').insert({
      asesor_id: uid,
      nombre: form.nombre,
      telefono: form.telefono || null,
      email: form.email || null,
      notas: form.notas || null,
      etapa_kanban: form.etapa_kanban,
      servicio_contratado: form.servicio_contratado || null,
      monto_acordado: form.monto_acordado ? parseFloat(form.monto_acordado) : null,
    }).select().single()
    if (error) { console.error('Error: ' + error.message); setSaving(false); return }
    await loadClientes(uid)
    setSaving(false)
    // Show WhatsApp material modal
    if (newCliente) {
      setNuevoClienteData({ id: newCliente.id, nombre: newCliente.nombre, telefono: newCliente.telefono })
      setShowWappModal(true)
    }
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
    if (error) { console.error('Error: ' + error.message); return }
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
      console.error('Error al registrar pago:', error.message)
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

  async function eliminarCliente() {
    if (!selected) return
    setDeletingCliente(true)
    await supabase.from('pagos').delete().eq('cliente_id', selected.id)
    await supabase.from('servicios_contratados').delete().eq('cliente_id', selected.id)
    await supabase.from('diagnosticos').delete().eq('cliente_id', selected.id)
    await supabase.from('actividades').delete().eq('cliente_id', selected.id)
    await supabase.from('clientes').delete().eq('id', selected.id)
    setClientes(prev => prev.filter(c => c.id !== selected.id))
    setDeletingCliente(false)
    setShowConfirmDelete(false)
    setSelected(null)
  }

  async function loadPagosProgramados(clienteId: string) {
    const { data } = await supabase
      .from('pagos_programados')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('numero_pago')
    setPagosProgramados(data ?? [])
  }

  async function generarPagosProgramados(clienteId: string, asesorId: string, montoTotal: number, numPagos: number, periodo: string, fechaPrimer: string) {
    if (!numPagos || !fechaPrimer || !montoTotal) return
    const montoPorPago = Math.round(montoTotal / numPagos * 100) / 100
    const pagosArr: any[] = []
    const fecha = new Date(fechaPrimer + 'T12:00:00')
    for (let i = 1; i <= numPagos; i++) {
      pagosArr.push({
        cliente_id: clienteId,
        asesor_id: asesorId,
        numero_pago: i,
        fecha_programada: fecha.toISOString().split('T')[0],
        monto_programado: i === numPagos ? Math.round((montoTotal - montoPorPago * (numPagos - 1)) * 100) / 100 : montoPorPago,
        pagado: false,
      })
      if (periodo === 'semanal') fecha.setDate(fecha.getDate() + 7)
      else if (periodo === 'quincenal') fecha.setDate(fecha.getDate() + 15)
      else fecha.setMonth(fecha.getMonth() + 1)
    }
    await supabase.from('pagos_programados').delete().eq('cliente_id', clienteId)
    await supabase.from('pagos_programados').insert(pagosArr)
    loadPagosProgramados(clienteId)
  }

  async function marcarPagoProgramado(pago: PagoProgramado, pagado: boolean) {
    await supabase.from('pagos_programados').update({
      pagado,
      fecha_pago_real: pagado ? new Date().toISOString().split('T')[0] : null
    }).eq('id', pago.id)
    const updatedPagos = pagosProgramados.map(p => p.id === pago.id ? { ...p, pagado, fecha_pago_real: pagado ? new Date().toISOString().split('T')[0] : null } : p)
    setPagosProgramados(updatedPagos)
    const total = updatedPagos.filter(p => p.pagado).reduce((s, p) => s + p.monto_programado, 0)
    await supabase.from('clientes').update({ total_pagado: total }).eq('id', pago.cliente_id)
    setClientes(prev => prev.map(c => c.id === pago.cliente_id ? { ...c, total_pagado: total } : c))
    if (selected?.id === pago.cliente_id) setSelected(p => p ? { ...p, total_pagado: total } : p)
  }

  async function uploadCompProgPago(pagoId: string, file: File) {
    setUploadingProgComp(pagoId)
    const ext = file.name.split('.').pop()
    const path = `comprobantes/prog-${pagoId}.${ext}`
    const { error } = await supabase.storage.from('comprobantes').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('comprobantes').getPublicUrl(path)
      await supabase.from('pagos_programados').update({ comprobante_url: data.publicUrl }).eq('id', pagoId)
      setPagosProgramados(prev => prev.map(p => p.id === pagoId ? { ...p, comprobante_url: data.publicUrl } : p))
    }
    setUploadingProgComp(null)
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

  function verAnalisis(d: any, idx: number, analisis: any, nombre: string) {
    const win = window.open('', '_blank')
    if (!win) return
    const letra = String.fromCharCode(65 + idx)
    const e1 = d.resultado_e1 ? '$' + Math.round(d.resultado_e1).toLocaleString() : '—'
    const e2 = d.resultado_e2 ? '$' + Math.round(d.resultado_e2).toLocaleString() : '—'
    const e3 = d.resultado_e3 ? '$' + Math.round(d.resultado_e3).toLocaleString() : '—'
    const e4 = d.resultado_e4 ? '$' + Math.round(d.resultado_e4).toLocaleString() : '—'
    const fecha = new Date(d.created_at).toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })
    const seccion = (titulo: string, texto: string) => texto ? '<h2>' + titulo + '</h2><p>' + texto.split('\n').join('<br>') + '</p>' : ''
    const html = [
      '<html><head><title>Diagnóstico ' + letra + ' — ' + nombre + '</title>',
      '<meta charset="utf-8">',
      '<style>',
      'body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1e293b}',
      'h1{color:#1B3A6B;border-bottom:3px solid #F05B21;padding-bottom:10px;font-size:22px}',
      'h2{color:#1B3A6B;margin-top:24px;font-size:13px;text-transform:uppercase;letter-spacing:1px}',
      'p{line-height:1.7;color:#374151;font-size:14px}',
      '.badge{display:inline-block;padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700;background:#EEF2F8;color:#1B3A6B}',
      '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}',
      '.kpi{background:#F4F6FB;border-radius:8px;padding:12px;text-align:center;border:1px solid #e2e8f0}',
      '.kpi-label{font-size:11px;color:#94a3b8;margin-bottom:4px}',
      '.kpi-val{font-size:20px;font-weight:700}',
      '.footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between}',
      '.print-btn{background:#F05B21;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;margin-top:20px}',
      '@media print{.print-btn{display:none}}',
      '</style></head><body>',
      '<h1>Diagnóstico Pensional ' + letra + ' — ' + nombre + '</h1>',
      '<p><span class="badge">Ley ' + d.ley + '</span>&nbsp;&nbsp;',
      d.semanas + ' semanas cotizadas&nbsp;&nbsp;Retiro a los ' + d.edad_retiro + ' años&nbsp;&nbsp;' + fecha + '</p>',
      '<div class="grid">',
      '<div class="kpi"><div class="kpi-label">Sin acción</div><div class="kpi-val" style="color:#ef4444">' + e1 + '</div></div>',
      '<div class="kpi"><div class="kpi-label">Modalidad 10</div><div class="kpi-val" style="color:#3b82f6">' + e2 + '</div></div>',
      '<div class="kpi"><div class="kpi-label">Modalidad 40</div><div class="kpi-val" style="color:#F05B21">' + e3 + '</div></div>',
      '<div class="kpi"><div class="kpi-label">Escenario óptimo</div><div class="kpi-val" style="color:#2E8B57">' + e4 + '</div></div>',
      '</div>',
      analisis ? [
        seccion('Contexto del asegurado', analisis.contexto),
        seccion('Diagnóstico actual', analisis.diagnostico_actual),
        seccion('Opciones disponibles', analisis.opciones_disponibles),
        seccion('Recomendación', analisis.recomendacion),
        seccion('Próximos pasos', analisis.proximos_pasos),
      ].join('') : '<p style="color:#94a3b8">Sin análisis narrativo generado.</p>',
      '<div class="footer"><span>KSE Pensiones · Diagnóstico ' + letra + '</span><span>Generado el ' + fecha + '</span></div>',
      '<button class="print-btn" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>',
      '</body></html>'
    ].join('')
    win.document.write(html)
    win.document.close()
  }

  const clientesFiltrados = clientes.filter(c => {
    if (filtroNombre && !c.nombre.toLowerCase().includes(filtroNombre.toLowerCase())) return false
    if (filtroEtapa && c.etapa_kanban !== filtroEtapa) return false
    if (filtroServicio && c.servicio_contratado !== filtroServicio) return false
    return true
  })

  const clientesPorColumna = (colId: string) => clientes.filter(c => (c.etapa_kanban || 'prospecto') === colId)
  const totalCobrado = clientes.reduce((s, c) => s + (c.total_pagado ?? 0), 0)
  const totalPorCobrar = clientes.reduce((s, c) => s + Math.max(0, (c.monto_acordado ?? 0) - (c.total_pagado ?? 0)), 0)
  const filtered = clientes.filter(c => {
    const matchSearch = c.nombre.toLowerCase().includes(search.toLowerCase()) || (c.email ?? '').toLowerCase().includes(search.toLowerCase()) || (c.telefono ?? '').includes(search)
    if (!matchSearch) return false
    if (filtroEtapa && c.etapa_kanban !== filtroEtapa) return false
    if (filtroServicio && c.servicio_contratado !== filtroServicio) return false
    return true
  })

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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: '7px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '200px', outline: 'none' }} />
            <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)}
              style={{ padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', outline: 'none', background: 'white', color: filtroEtapa ? '#374151' : '#94a3b8' }}>
              <option value="">Todas las etapas</option>
              {COLUMNAS.map(col => <option key={col.id} value={col.id}>{col.label}</option>)}
            </select>
            <select value={filtroServicio} onChange={e => setFiltroServicio(e.target.value)}
              style={{ padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', outline: 'none', background: 'white', color: filtroServicio ? '#374151' : '#94a3b8' }}>
              <option value="">Todos los servicios</option>
              {SERVICIOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {(filtroEtapa || filtroServicio || search) && (
              <button onClick={() => { setFiltroEtapa(''); setFiltroServicio(''); setSearch('') }}
                style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', background: '#F4F6FB', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                ✕ Limpiar
              </button>
            )}
          </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '8px', height: '100%' }}>
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
                  style={{ minWidth: 0, display: 'flex', flexDirection: 'column', background: isDragOver && canDrop ? `${col.color}12` : '#F4F6FB', borderRadius: '12px', border: `2px solid ${isDragOver && canDrop ? col.color : 'transparent'}`, transition: 'all 0.15s', opacity: isDragOver && !canDrop ? 0.5 : 1 }}>
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
                        {editando ? (
                          <select defaultValue={selected.servicio_contratado ?? ''} onChange={e => actualizarCliente(selected.id, { servicio_contratado: e.target.value || null })} style={{ ...inputSt, fontSize: '12px', padding: '7px 10px' }}>
                            <option value="">— Sin definir —</option>
                            {SERVICIOS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <div style={{ fontSize: '13px', color: '#374151', padding: '7px 0' }}>
                            {selected.servicio_contratado || <span style={{ color: '#94a3b8' }}>Sin definir</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => abrirEditar(selected)}
                          style={{ flex: 1, padding: '9px', background: '#F4F6FB', color: AZUL, border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                          ✏️ Editar datos
                        </button>
                        <button onClick={() => setShowConfirmDelete(true)}
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
                  {pagosProgramados.length > 0 ? (
                    <>
                      {/* Resumen */}
                      {(() => {
                        const totalPagado = pagosProgramados.filter(p => p.pagado).reduce((s, p) => s + p.monto_programado, 0)
                        const totalAcordado = pagosProgramados.reduce((s, p) => s + p.monto_programado, 0)
                        const saldo = Math.max(0, totalAcordado - totalPagado)
                        const numPagados = pagosProgramados.filter(p => p.pagado).length
                        const pct = pagosProgramados.length > 0 ? Math.round((numPagados / pagosProgramados.length) * 100) : 0
                        return (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                              {[
                                { label: 'Total acordado', value: fmtMXN(totalAcordado), color: AZUL, bg: '#EEF2F8' },
                                { label: 'Pagado', value: fmtMXN(totalPagado), color: VERDE, bg: '#f0fdf4' },
                                { label: 'Saldo', value: fmtMXN(saldo), color: saldo > 0 ? '#ef4444' : VERDE, bg: saldo > 0 ? '#fef2f2' : '#f0fdf4' },
                              ].map((k, i) => (
                                <div key={i} style={{ background: k.bg, borderRadius: '8px', padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '3px' }}>{k.label}</div>
                                  <div style={{ fontSize: '15px', fontWeight: '800', color: k.color }}>{k.value}</div>
                                </div>
                              ))}
                            </div>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>
                                <span>{numPagados} de {pagosProgramados.length} pagos completados</span>
                                <span style={{ fontWeight: '700', color: VERDE }}>{pct}%</span>
                              </div>
                              <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: VERDE, borderRadius: '3px', transition: 'width 0.4s' }} />
                              </div>
                            </div>
                          </>
                        )
                      })()}

                      {/* Lista pagos programados */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {pagosProgramados.map(pago => (
                          <div key={pago.id} style={{ background: pago.pagado ? '#f0fdf4' : '#F8FAFC', borderRadius: '10px', border: `1px solid ${pago.pagado ? '#bbf7d0' : '#e2e8f0'}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px' }}>
                              <button onClick={() => marcarPagoProgramado(pago, !pago.pagado)}
                                style={{ width: '22px', height: '22px', borderRadius: '6px', border: `2px solid ${pago.pagado ? VERDE : '#cbd5e1'}`, background: pago.pagado ? VERDE : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}>
                                {pago.pagado && <span style={{ color: 'white', fontSize: '11px', fontWeight: '700' }}>✓</span>}
                              </button>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>Pago {pago.numero_pago}</span>
                                  <span style={{ fontSize: '14px', fontWeight: '800', color: pago.pagado ? VERDE : AZUL }}>{fmtMXN(pago.monto_programado)}</span>
                                </div>
                                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>
                                  Prog: {fmt(pago.fecha_programada)}
                                  {pago.pagado && pago.fecha_pago_real && <span style={{ color: VERDE }}> · Pagado: {fmt(pago.fecha_pago_real)}</span>}
                                </div>
                              </div>
                              {pago.pagado && (
                                pago.comprobante_url ? (
                                  <a href={pago.comprobante_url} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: '10px', color: AZUL, textDecoration: 'none', background: '#EEF2F8', padding: '3px 8px', borderRadius: '6px', fontWeight: '600' }}>
                                    📎 Ver
                                  </a>
                                ) : (
                                  <label style={{ fontSize: '10px', color: '#94a3b8', cursor: 'pointer', background: '#F4F6FB', padding: '3px 8px', borderRadius: '6px', border: '1px dashed #e2e8f0' }}>
                                    {uploadingProgComp === pago.id ? '⏳' : '📎'}
                                    <input type="file" accept="image/*,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) uploadCompProgPago(pago.id, f) }} style={{ display: 'none' }} disabled={uploadingProgComp === pago.id} />
                                  </label>
                                )
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Esquema clásico de pagos */}
                      {(() => {
                        const totalPagado = pagos.reduce((s, p) => s + p.monto, 0)
                        const saldo = Math.max(0, (selected.monto_acordado ?? 0) - totalPagado)
                        const estatus = calcEstatus(selected.monto_acordado, totalPagado)
                        const sem = SEMAFORO[estatus]
                        return (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                            {[
                              { label: 'Acordado', value: fmtMXN(selected.monto_acordado), color: AZUL, bg: '#F4F6FB', border: '#e2e8f0' },
                              { label: 'Pagado', value: fmtMXN(totalPagado), color: VERDE, bg: '#f0fdf4', border: '#bbf7d0' },
                              { label: 'Saldo', value: fmtMXN(saldo), color: sem.color, bg: sem.bg, border: sem.border, extra: `${sem.icon} ${estatus}` },
                            ].map((k, i) => (
                              <div key={i} style={{ background: k.bg, borderRadius: '8px', padding: '10px 12px', border: `1px solid ${k.border}` }}>
                                <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{k.label}</div>
                                <div style={{ fontSize: '16px', fontWeight: '800', color: k.color }}>{k.value}</div>
                                {k.extra && <div style={{ fontSize: '10px', fontWeight: '700', color: k.color, marginTop: '2px' }}>{k.extra}</div>}
                              </div>
                            ))}
                          </div>
                        )
                      })()}

                      {(() => {
                        const totalPagado = pagos.reduce((s,p) => s + p.monto, 0)
                        const saldo = Math.max(0, (selected.monto_acordado ?? 0) - totalPagado)
                        const liquidado = selected.monto_acordado != null && saldo <= 0
                        const concepto = detectarConcepto(pagos.length, 0, saldo, selected.monto_acordado)
                        if (liquidado) return (
                          <div style={{ padding: '11px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', textAlign: 'center', fontSize: '13px', fontWeight: '700', color: VERDE }}>
                            🟢 Cuenta liquidada — pago completo
                          </div>
                        )
                        return (
                          <button onClick={() => { setFormPago(p => ({ ...p, concepto })); setShowPago(true) }}
                            style={{ width: '100%', padding: '11px', background: VERDE, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                            + Registrar {concepto.toLowerCase()} {saldo > 0 ? `— ${fmtMXN(saldo)} pendiente` : ''}
                          </button>
                        )
                      })()}

                      {pagos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '28px', color: '#94a3b8', fontSize: '13px', background: '#F8FAFC', borderRadius: '10px', border: '1px dashed #e2e8f0' }}>Sin pagos registrados</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                          {[...pagos].reverse().map((pago, i) => (
                            <div key={pago.id} style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8' }}>Pago {i + 1}</span>
                                <div style={{ flex: 1 }} />
                                <span style={{ fontSize: '16px', fontWeight: '800', color: VERDE }}>{fmtMXN(pago.monto)}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px' }}>
                                <span style={{ fontSize: '11px', color: '#64748b', flex: 1 }}>{fmt(pago.fecha_pago)}</span>
                                {pago.comprobante_url ? (
                                  <a href={pago.comprobante_url} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: '11px', color: AZUL, textDecoration: 'none', background: '#EEF2F8', padding: '3px 10px', borderRadius: '6px', fontWeight: '600' }}>
                                    📎 Ver comprobante
                                  </a>
                                ) : (
                                  <label style={{ fontSize: '11px', color: '#94a3b8', cursor: 'pointer', background: '#F4F6FB', padding: '3px 10px', borderRadius: '6px', border: '1px dashed #e2e8f0' }}>
                                    {uploadingComp === pago.id ? '⏳ Subiendo...' : '📎 Adjuntar'}
                                    <input type="file" accept="image/*,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) uploadComprobantePago(pago.id, f) }} style={{ display: 'none' }} disabled={uploadingComp === pago.id} />
                                  </label>
                                )}
                                <button onClick={() => eliminarPago(pago.id, pago.monto)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px', padding: '4px', flexShrink: 0 }}>🗑️</button>
                              </div>
                            </div>
                          ))}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F4F6FB', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Total pagado ({pagos.length} pago{pagos.length !== 1 ? 's' : ''})</span>
                            <span style={{ fontSize: '15px', fontWeight: '800', color: VERDE }}>{fmtMXN(pagos.reduce((s,p) => s + p.monto, 0))}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
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
                  ) : diagnosticos.map((d, idx) => {
                    const analisis = d.analisis_narrativo
                    return (
                    <div key={d.id} style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      {/* Header diagnóstico */}
                      <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '28px', height: '28px', background: AZUL, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                          {String.fromCharCode(65 + idx)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: d.ley === '73' ? '#EEF2F8' : '#EEF7F1', color: d.ley === '73' ? AZUL : VERDE, fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>Ley {d.ley}</span>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{fmt(d.created_at)}</span>
                            {analisis && <span style={{ fontSize: '10px', background: '#f0fdf4', color: VERDE, padding: '1px 6px', borderRadius: '6px', fontWeight: '600' }}>📝 Con análisis</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                            {d.semanas} semanas · Retiro {d.edad_retiro} años
                            {d.ingreso_deseado ? ` · Meta ${fmtMXN(d.ingreso_deseado)}/mes` : ''}
                          </div>
                        </div>
                      </div>

                      {/* Resultados */}
                      <div style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
                          {[
                            { label: 'E1 Sin acción', value: d.resultado_e1, color: '#ef4444' },
                            { label: 'E2 Mod 10', value: d.resultado_e2, color: '#3b82f6' },
                            { label: 'E3 Mod 40', value: d.resultado_e3, color: NARANJA },
                            { label: 'E4 Óptimo', value: d.resultado_e4, color: VERDE },
                          ].map((e, i) => (
                            <div key={i} style={{ background: 'white', borderRadius: '6px', padding: '6px 8px', border: `1px solid ${i === 3 ? '#bbf7d0' : '#e2e8f0'}` }}>
                              <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '2px' }}>{e.label}</div>
                              <div style={{ fontSize: '12px', fontWeight: '700', color: e.color }}>{e.value ? fmtMXN(e.value) : '—'}</div>
                            </div>
                          ))}
                        </div>

                        {/* Acciones */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <a href={`/calculadora?cliente=${selected.id}&diag=${d.id}`}
                            style={{ flex: 1, padding: '7px', background: '#EEF2F8', color: AZUL, border: 'none', borderRadius: '7px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                            🔄 Cargar en calculadora
                          </a>
                          {analisis && (
                            <button onClick={() => verAnalisis(d, idx, analisis, selected.nombre)}
                              style={{ flex: 1, padding: '7px', background: '#f0fdf4', color: VERDE, border: '1px solid #bbf7d0', borderRadius: '7px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                              📄 Ver análisis completo
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    )
                  })}
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

      {/* ── MODAL WHATSAPP MATERIAL DE APOYO ── */}
      {showWappModal && nuevoClienteData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '480px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                💬
              </div>
              <div>
                <p style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: '0 0 2px' }}>Enviar material de apoyo</p>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                  Cliente: <strong>{nuevoClienteData.nombre}</strong>
                  {nuevoClienteData.telefono && ` · ${nuevoClienteData.telefono}`}
                </p>
              </div>
            </div>

            {materiales.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', background: '#F4F6FB', borderRadius: '10px', color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📚</div>
                No hay materiales configurados.<br />
                Agrega materiales en <strong>Configuración → Materiales de apoyo</strong>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Selecciona el material a enviar:</p>
                {materiales.map(m => {
                  const tel = nuevoClienteData.telefono?.replace(/\D/g, '') || ''
                  const emoji = m.tipo === 'video' ? '🎥' : m.tipo === 'guia' ? '📋' : m.tipo === 'calculadora' ? '🧮' : '📄'
                  const msg = encodeURIComponent(
                    `Hola ${nuevoClienteData.nombre}, te comparto material de apoyo sobre tu proceso de pensión:\n\n${emoji} *${m.nombre}*${m.descripcion ? `\n${m.descripcion}` : ''}${m.url ? `\n\n🔗 ${m.url}` : ''}\n\nCualquier duda estoy a tus órdenes.`
                  )
                  const wappUrl = tel ? `https://wa.me/52${tel}?text=${msg}` : `https://wa.me/?text=${msg}`
                  return (
                    <a key={m.id} href={wappUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', textDecoration: 'none', background: 'white', transition: 'border-color .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#22c55e')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                      <span style={{ fontSize: '20px' }}>{emoji}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#374151', margin: '0 0 1px' }}>{m.nombre}</p>
                        {m.descripcion && <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{m.descripcion}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', background: '#22c55e', color: 'white', borderRadius: '8px', fontSize: '12px', fontWeight: '600', flexShrink: 0 }}>
                        <span>WhatsApp</span>
                      </div>
                    </a>
                  )
                })}
              </div>
            )}

            <button onClick={() => { setShowWappModal(false); setNuevoClienteData(null) }}
              style={{ width: '100%', padding: '11px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIRMAR CERRAR ── */}
      {showConfirmClose && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '360px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ color: '#1e293b', fontSize: '16px', fontWeight: '700', margin: '0 0 8px' }}>¿Cerrar el expediente?</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 20px', lineHeight: 1.6 }}>
              Tienes cambios sin guardar. ¿Seguro que quieres cerrar?
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirmClose(false)}
                style={{ flex: 1, padding: '11px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Seguir editando
              </button>
              <button onClick={() => { setShowConfirmClose(false); setSelected(null) }}
                style={{ flex: 1, padding: '11px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIRMAR ETAPA ── */}
      {showConfirmEtapa && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '380px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔄</div>
            <h3 style={{ color: '#1e293b', fontSize: '16px', fontWeight: '700', margin: '0 0 8px' }}>¿Cambiar etapa?</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 8px', lineHeight: 1.6 }}>
              Moverás al cliente de
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', margin: '0 0 20px' }}>
              <span style={{ padding: '4px 12px', borderRadius: '8px', background: '#EEF2F8', color: AZUL, fontSize: '13px', fontWeight: '700' }}>
                {COLUMNAS.find(c => c.id === showConfirmEtapa.etapaActual)?.label ?? showConfirmEtapa.etapaActual}
              </span>
              <span style={{ fontSize: '18px', color: '#94a3b8' }}>→</span>
              <span style={{ padding: '4px 12px', borderRadius: '8px', background: '#f0fdf4', color: VERDE, fontSize: '13px', fontWeight: '700' }}>
                {COLUMNAS.find(c => c.id === showConfirmEtapa.etapaNueva)?.label ?? showConfirmEtapa.etapaNueva}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirmEtapa(null)}
                style={{ flex: 1, padding: '11px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={async () => {
                if (showConfirmEtapa) {
                  await moverCliente(showConfirmEtapa.clienteId, showConfirmEtapa.etapaActual, showConfirmEtapa.etapaNueva)
                  setShowConfirmEtapa(null)
                }
              }} style={{ flex: 1, padding: '11px', background: VERDE, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                Sí, mover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIRMAR ELIMINAR ── */}
      {showConfirmDelete && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
              <h3 style={{ color: '#1e293b', fontSize: '17px', fontWeight: '700', margin: '0 0 8px' }}>¿Eliminar a {selected.nombre}?</h3>
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0, lineHeight: 1.6 }}>
                Esta acción eliminará permanentemente el cliente y todos sus datos:
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px', background: '#fef2f2', borderRadius: '10px', padding: '12px 14px', border: '1px solid #fecaca' }}>
              {[
                { icon: '💰', label: 'Pagos registrados', value: pagos.length },
                { icon: '📋', label: 'Servicios contratados', value: servicios.length },
                { icon: '🧮', label: 'Diagnósticos', value: diagnosticos.length },
                { icon: '📅', label: 'Actividades', value: actividades.length },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: '#64748b' }}>{item.icon} {item.label}</span>
                  <span style={{ fontWeight: '700', color: item.value > 0 ? '#dc2626' : '#94a3b8' }}>
                    {item.value > 0 ? `${item.value} registros` : 'Sin datos'}
                  </span>
                </div>
              ))}
            </div>
            {(pagos.length > 0 || servicios.length > 0) && (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '12px', color: '#92400e' }}>
                ⚠️ Este cliente tiene pagos o servicios registrados. Esta acción no se puede deshacer.
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirmDelete(false)}
                style={{ flex: 1, padding: '11px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={eliminarCliente} disabled={deletingCliente}
                style={{ flex: 1, padding: '11px', background: deletingCliente ? '#94a3b8' : '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: deletingCliente ? 'not-allowed' : 'pointer' }}>
                {deletingCliente ? 'Eliminando...' : 'Sí, eliminar todo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NUEVO PAGO ── */}
      {showPago && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => e.stopPropagation()}>
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
                  <div style={{ padding: '10px 12px', background: '#EEF2F8', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '13px', fontWeight: '700', color: AZUL }}>
                    {formPago.concepto || 'Automático'}
                  </div>
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
