'use client' // v6-etapas

import { useEffect, useState, useRef, Suspense } from 'react'
import { createClient } from '@/utils/supabase/client'
import { pdf } from '@react-pdf/renderer'
import { DiagnosticoPDF } from '@/app/utils/DiagnosticoPDF'
import { useSearchParams, useRouter } from 'next/navigation'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

// ── Etapas del pipeline ──────────────────────────────────────────
const COLUMNAS = [
  { id: 'prospecto',    label: 'Prospecto',          color: '#64748b', bg: '#f1f5f9', orden: 0, desc: 'Primer contacto registrado. El asesor agenda la asesoría y ejecuta el diagnóstico en la calculadora.' },
  { id: 'diagnostico',  label: 'Diagnóstico',        color: '#3b82f6', bg: '#eff6ff', orden: 1, desc: 'Diagnóstico pensional realizado. Se entregó la propuesta. Se define el tipo de servicio y esquema de pago.' },
  { id: 'recopilacion', label: 'Recopilación',       color: '#eab308', bg: '#fefce8', orden: 2, desc: 'Se está armando el expediente físico y digital con la documentación oficial requerida por el IMSS.' },
  { id: 'tramite',      label: 'Trámite',            color: '#f97316', bg: '#fff7ed', orden: 3, desc: 'Expediente entregado. El trámite está en proceso ante el IMSS o la institución correspondiente.' },
  { id: 'cierre',       label: 'Cierre (Exitoso) ✅', color: VERDE,     bg: '#f0fdf4', orden: 4, esFinal: true, desc: 'Servicio concluido exitosamente. Pensión otorgada o gestión finalizada. Se procede al cobro de honorarios.' },
  { id: 'cancelado',    label: 'Cancelado',          color: '#94a3b8', bg: '#f8fafc', orden: 5, esFinal: true , desc: 'Expediente detenido. Cliente que no continuó, caso no viable o sin respuesta. Se conserva el historial completo.' },
]

const TIPOS_SERVICIO = [
  { id: 'asesoria',        label: 'Asesoría',         color: '#378ADD' },
  { id: 'gestion',         label: 'Trámite de Pensión', color: '#639922' },
  { id: 'financiamiento',  label: 'Financiamiento',   color: '#eab308' },
  { id: 'gestoria_global', label: 'Gestoría Global',  color: '#7F77DD' },
]

const SERVICIO_COLORS: Record<string, string> = {
  asesoria: '#378ADD',
  gestion: '#639922',
  financiamiento: '#eab308',
  gestoria_global: '#7F77DD',
}

const ESQUEMAS_PAGO = [
  { id: 'monto_acordado',       label: 'Monto acordado' },
  { id: 'meses_pension',        label: 'Meses de pensión' },
  { id: 'tarifa_etapa',         label: 'Tarifa por etapa' },
  { id: 'porcentaje_recuperado', label: '% de recursos recuperados' },
]

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
// Indica si un cliente con este esquema de pago ya tiene definido cómo va a cobrar
function tieneEsquemaDefinido(cliente: Cliente): boolean {
  switch (cliente.esquema_pago) {
    case 'monto_acordado':
      return !!cliente.monto_acordado
    case 'meses_pension':
      return !!cliente.monto_pension_mensual && !!cliente.numero_meses_cobro
    case 'tarifa_etapa':
      return true // se valida por etapa vía cobros_esperados, no bloquea aquí
    case 'porcentaje_recuperado':
      return !!cliente.porcentaje_recuperacion
    default:
      return !!cliente.monto_acordado
  }
}

function puedeMoverse(desde: string, hacia: string, cliente?: Cliente, tieneDiagnostico?: boolean, tieneDiagnosticoAutorizado?: boolean): { ok: boolean; razon?: string } {
  if (desde === hacia) return { ok: false }
  const colDesde = COLUMNAS.find(c => c.id === desde)
  const colHacia = COLUMNAS.find(c => c.id === hacia)
  if (!colDesde || !colHacia) return { ok: false }

  // Cierre y Cancelado son estados finales
  if (desde === 'cierre') return { ok: false, razon: 'Cierre es un estado final y no puede modificarse.' }
  if (desde === 'cancelado') return { ok: false, razon: 'Cancelado es un estado final y no puede modificarse.' }

  // Cancelado siempre permitido desde cualquier etapa no final (requiere nota, validado en UI)
  if (hacia === 'cancelado') return { ok: true }

  // No se puede pasar de Diagnóstico a Recopilación sin al menos un diagnóstico (aunque sea borrador)
  if (desde === 'diagnostico' && hacia === 'recopilacion' && !tieneDiagnostico) {
    return { ok: false, razon: 'Este cliente no tiene ningún diagnóstico (ni borrador). Genera uno antes de avanzar a Recopilación.' }
  }

  // No se puede pasar de Recopilación a Trámite sin un diagnóstico autorizado/aprobado (un borrador no es suficiente)
  if (desde === 'recopilacion' && hacia === 'tramite' && !tieneDiagnosticoAutorizado) {
    return { ok: false, razon: 'Este cliente no tiene un diagnóstico autorizado/aprobado. Un borrador no es suficiente para avanzar a Trámite.' }
  }

  const esAsesoria = cliente?.tipo_servicio === 'asesoria'

  // ── Reglas para Asesoría: Prospecto → Diagnóstico → Cierre (salta Recopilación y Trámite) ──
  if (esAsesoria) {
    if (desde === 'prospecto' && hacia !== 'diagnostico') {
      return { ok: false, razon: 'Un cliente de Asesoría avanza de Prospecto a Diagnóstico.' }
    }
    if (desde === 'diagnostico' && hacia !== 'cierre') {
      return { ok: false, razon: 'Un cliente de Asesoría en Diagnóstico avanza directo a Cierre (no pasa por Recopilación ni Trámite).' }
    }
    if (hacia === 'recopilacion' || hacia === 'tramite') {
      return { ok: false, razon: 'Los clientes de Asesoría no pasan por Recopilación ni Trámite.' }
    }
    // Validar esquema de pago antes de Cierre
    if (hacia === 'cierre' && cliente && !tieneEsquemaDefinido(cliente)) {
      return { ok: false, razon: 'Define el monto acordado de este cliente antes de avanzar a Cierre.' }
    }
    return { ok: true }
  }

  // ── Reglas para Gestión / Financiamiento / Gestoría Global: flujo completo, columna por columna ──
  // No retroceder
  if (colHacia.orden < colDesde.orden) {
    return { ok: false, razon: 'No se puede regresar a una etapa anterior.' }
  }
  // Solo se permite avanzar a la siguiente columna inmediata (no saltar)
  if (colHacia.orden > colDesde.orden + 1) {
    return { ok: false, razon: 'No se pueden saltar etapas. Avanza una columna a la vez.' }
  }
  // Validar esquema de pago antes de entrar a Recopilación o Cierre
  if ((hacia === 'recopilacion' || hacia === 'cierre') && cliente && !tieneEsquemaDefinido(cliente)) {
    return { ok: false, razon: 'Define cómo se cobrará este cliente (esquema de pago) antes de continuar.' }
  }
  return { ok: true }
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
  tipo_servicio: string | null
  esquema_pago: string | null
  monto_acordado: number | null
  monto_pension_mensual: number | null
  numero_meses_cobro: number | null
  porcentaje_recuperacion: number | null
  monto_recuperado: number | null
  nota_cancelacion: string | null
  activo?: boolean
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
  // Nuevas columnas flujo Borrador/Autorizado
  estatus: string | null
  escenario_elegido: string | null
  ingreso_objetivo: number | null
  mod40_umas: number | null
  mod40_meses: number | null
  fecha_autorizacion: string | null
  pension_sin_mod40: number | null
  pension_con_mod40: number | null
  inversion_mod40: number | null
  params_json: any | null
}

interface Actividad {
  id: string; tipo: string; titulo: string; fecha_programada: string | null; estatus: string; notas: string | null
}

type Vista = 'lista' | 'pipeline'

function ClientesInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [vista, setVista] = useState<Vista>('lista')
  const [filtroNombre, setFiltroNombre] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroServicio, setFiltroServicio] = useState('')
  const [filtroPago, setFiltroPago] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const userIdRef = useRef('')

  // Expediente
  const [selected, setSelected] = useState<Cliente | null>(null)
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[]>([])
  const [clientesConDiagnostico, setClientesConDiagnostico] = useState<Set<string>>(new Set())
  const [clientesConDiagnosticoAutorizado, setClientesConDiagnosticoAutorizado] = useState<Set<string>>(new Set())
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
  const [showConfirmArchivar, setShowConfirmArchivar] = useState(false)
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [bloqueoMsg, setBloqueoMsg] = useState<string | null>(null)
  const [notaCancelacion, setNotaCancelacion] = useState('')
  const [showGuia, setShowGuia] = useState(false)
  const [materialesSeleccionados, setMaterialesSeleccionados] = useState<string[]>([])
  const [mostrarArchivados, setMostrarArchivados] = useState(false)
  const [confirmDelPago, setConfirmDelPago] = useState<{ id: string, monto: number } | null>(null)
  const [clientesArchivados, setClientesArchivados] = useState<Cliente[]>([])
  const [loadingArchivados, setLoadingArchivados] = useState(false)
  const [showConfirmEtapa, setShowConfirmEtapa] = useState<{clienteId: string; nombre: string; etapaActual: string; etapaNueva: string} | null>(null)
  const [pendingClose, setPendingClose] = useState(false)
  const [formServicio, setFormServicio] = useState({ tipo: 'Diagnóstico', monto_acordado: '', descripcion: '' })
  const [modalTab, setModalTab] = useState<'info' | 'diagnosticos' | 'financiamiento' | 'actividades' | 'pagos'>('info')

  // Nuevo cliente
  // Financiamiento state
  const [finSelId, setFinSelId] = useState('')
  const [finPlazo, setFinPlazo] = useState(24)
  const [diagFinId, setDiagFinId] = useState('')
  const [financieras, setFinancieras] = useState<{id: string; nombre: string; tasa_anual: number; plazo_min: number; plazo_max: number; monto_min: number; monto_max: number}[]>([])

  const [asesorPerfil, setAsesorPerfil] = useState<{
    razon_social?: string; nombre?: string; logo_url?: string
    encabezado_color?: string; encabezado_titulo?: string
    encabezado_logo_size?: number; encabezado_font_size?: number
  } | null>(null)

  const [showNuevo, setShowNuevo] = useState(false)
  const [editando, setEditando] = useState(false)
  const [formEdit, setFormEdit] = useState({ nombre: '', telefono: '', email: '', notas: '' })
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', notas: '', etapa_kanban: 'prospecto', tipo_servicio: '', esquema_pago: '', monto_acordado: '', monto_pension_mensual: '', numero_meses_cobro: '', porcentaje_recuperacion: '', tarifas_etapa: { prospecto: { cobrar: false, monto: '' }, diagnostico: { cobrar: false, monto: '' }, recopilacion: { cobrar: false, monto: '' }, tramite: { cobrar: false, monto: '' }, cierre: { cobrar: false, monto: '' } } })
  const [formErrors, setFormErrors] = useState<{telefono?: string; email?: string; monto_acordado?: string; esquema_pago?: string; tipo_servicio?: string}>({})
  const [saving, setSaving] = useState(false)

  // Nuevo pago
  const [showPago, setShowPago] = useState(false)
  const [formPago, setFormPago] = useState({ monto: '', concepto: 'Anticipo', notas: '', fecha_pago: new Date().toISOString().split('T')[0] })
  const [tipoMovimiento, setTipoMovimiento] = useState<'pago' | 'devolucion'>('pago')
  const [savingPago, setSavingPago] = useState(false)
  const [uploadingComp, setUploadingComp] = useState<string | null>(null)
  const [pagosProgramados, setPagosProgramados] = useState<PagoProgramado[]>([])
  const [uploadingProgComp, setUploadingProgComp] = useState<string | null>(null)
  const [showWappModal, setShowWappModal] = useState(false)
  const [nuevoClienteData, setNuevoClienteData] = useState<{id: string; nombre: string; telefono: string | null} | null>(null)
  const [materiales, setMateriales] = useState<{id:string;nombre:string;descripcion:string|null;tipo:string;url:string|null;activo?:boolean;archivo_url?:string|null}[]>([])
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
      // Load asesor profile for PDF generation
      supabase.from('perfiles_usuario')
        .select('nombre, razon_social, logo_url, encabezado_color, encabezado_titulo, encabezado_logo_size, encabezado_font_size')
        .eq('id', userIdRef.current)
        .single()
        .then(({ data }) => { if (data) setAsesorPerfil(data) })
      loadClientes(session.user.id)
      loadMateriales(session.user.id)
    })
    if (searchParams.get('nuevo') === 'true') { setShowNuevo(true); router.replace('/clientes') }
  }, [])

  async function generarPDFDesdeDiag(d: Diagnostico) {
    const p = d.params_json as any
    if (!p) return
    try {
      const analisisParsed = d.analisis_narrativo
        ? (() => { try { return JSON.parse(d.analisis_narrativo) } catch { return [] } })()
        : []
      const elemento = (
        <DiagnosticoPDF
          datos={p.datos || {}}
          periodos={p.periodos || []}
          sdiPromedio={p.sdiPromedio || 0}
          escenarios={p.escenarios || []}
          escSelIdx={p.escElegidoIdx ?? 0}
          analisis={Array.isArray(analisisParsed) ? analisisParsed : []}
          ingresoObjetivo={p.ingresoObjetivo || undefined}
          logoUrl={asesorPerfil?.logo_url ?? undefined}
          razonSocial={asesorPerfil?.razon_social ?? undefined}
          asesorNombre={asesorPerfil?.nombre ?? undefined}
          encabezadoColor={asesorPerfil?.encabezado_color ?? undefined}
          encabezadoTitulo={asesorPerfil?.encabezado_titulo ?? undefined}
          esBorrador={d.estatus !== 'autorizado'}
        />
      )
      const blob = await pdf(elemento).toBlob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const nombre = (p.datos?.nombre_trabajador || p.datos?.nombre || 'cliente').replace(/\s+/g, '_')
      const sufijo = d.estatus === 'autorizado' ? '_OFICIAL' : '_BORRADOR'
      const fecha  = new Date(d.created_at).toISOString().slice(0, 10)
      a.href = url
      a.download = `Proyecto_Pension_${nombre}_${fecha}${sufijo}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error generando PDF desde diagnóstico:', err)
      alert('Error al generar el PDF. Intenta desde la calculadora.')
    }
  }

  async function loadClientes(uid: string) {
    setLoading(true)
    const { data } = await supabase.from('clientes').select('*').eq('asesor_id', uid).or('activo.is.null,activo.eq.true').order('created_at', { ascending: false })
    if (!data) { setLoading(false); return }
    // Load total pagado per cliente
    const { data: pagosData } = await supabase.from('pagos').select('cliente_id, monto').eq('asesor_id', uid)
    const totales: Record<string, number> = {}
    pagosData?.forEach((p: any) => { totales[p.cliente_id] = (totales[p.cliente_id] ?? 0) + p.monto })
    const clientesConPago = data.map((c: any) => ({ ...c, total_pagado: totales[c.id] ?? 0 }))
    setClientes(clientesConPago as Cliente[])
    // Set de clientes con al menos un diagnóstico (incluye borradores) — necesario para validar el paso Diagnóstico → Recopilación
    // y set de clientes con diagnóstico autorizado — necesario para validar Recopilación → Trámite
    const { data: diagRows } = await supabase.from('diagnosticos').select('cliente_id, estatus').eq('asesor_id', uid)
    setClientesConDiagnostico(new Set((diagRows ?? []).map((d: any) => d.cliente_id)))
    setClientesConDiagnosticoAutorizado(new Set((diagRows ?? []).filter((d: any) => d.estatus === 'autorizado').map((d: any) => d.cliente_id)))
    setLoading(false)
  }

  async function loadArchivados(uid: string) {
    setLoadingArchivados(true)
    const { data } = await supabase.from('clientes').select('*').eq('asesor_id', uid).eq('activo', false).order('ultimo_contacto', { ascending: false })
    setClientesArchivados((data ?? []) as Cliente[])
    setLoadingArchivados(false)
  }

  async function reactivarCliente(clienteId: string) {
    await supabase.from('clientes').update({ activo: true }).eq('id', clienteId)
    setClientesArchivados(prev => prev.filter(c => c.id !== clienteId))
    if (userIdRef.current) await loadClientes(userIdRef.current)
  }

  async function openExpediente(cliente: Cliente) {
    setSelected(cliente)
    setModalTab('info')
    setEditando(false)
    setPagos([])
    setDiagnosticos([])
    setActividades([])
    setServicios([])
    setDiagFinId('')
    // Load financieras
    if (userIdRef.current) {
      supabase.from('financieras').select('*').eq('asesor_id', userIdRef.current).then(({ data }) => {
        if (data) { setFinancieras(data); if (data[0]) setFinSelId(data[0].id) }
      })
    }
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
    const telDigits = form.telefono.replace(/\D/g, '')
    const newErrors: typeof formErrors = {}
    if (!form.nombre.trim()) return
    if (telDigits.length !== 10) newErrors.telefono = 'El teléfono es obligatorio (10 dígitos)'
    if (form.email && validateEmail(form.email)) newErrors.email = validateEmail(form.email) ?? undefined

    if (!form.tipo_servicio) newErrors.tipo_servicio = 'Selecciona el servicio'

    const esAsesoria = form.tipo_servicio === 'asesoria'
    if (esAsesoria) {
      if (!form.monto_acordado || parseFloat(form.monto_acordado) <= 0) newErrors.monto_acordado = 'El monto acordado es obligatorio'
    } else if (form.tipo_servicio) {
      // Gestión / Financiamiento / Gestoría Global requieren esquema de pago
      if (!form.esquema_pago) {
        newErrors.esquema_pago = 'Selecciona un esquema de pago'
      } else if (form.esquema_pago === 'monto_acordado' && (!form.monto_acordado || parseFloat(form.monto_acordado) <= 0)) {
        newErrors.monto_acordado = 'El monto acordado es obligatorio'
      } else if (form.esquema_pago === 'tarifa_etapa') {
        const tarifas = form.tarifas_etapa as any
        const marcadas = Object.values(tarifas).filter((v: any) => v.cobrar)
        const incompletas = marcadas.filter((v: any) => !v.monto || parseFloat(v.monto) <= 0)
        if (marcadas.length === 0) {
          newErrors.esquema_pago = 'Marca al menos una etapa para cobrar y define su monto.'
        } else if (incompletas.length > 0) {
          newErrors.esquema_pago = 'Define el monto para cada etapa marcada para cobrar (o desmarca la casilla).'
        }
      } else if (form.esquema_pago === 'meses_pension') {
        if (!form.numero_meses_cobro || parseInt(form.numero_meses_cobro) <= 0) {
          newErrors.esquema_pago = 'Define el número de meses a cobrar.'
        }
      } else if (form.esquema_pago === 'porcentaje_recuperado') {
        if (!form.porcentaje_recuperacion || parseFloat(form.porcentaje_recuperacion) <= 0) {
          newErrors.esquema_pago = 'Define el porcentaje a cobrar.'
        }
      }
    }

    if (Object.keys(newErrors).length > 0) { setFormErrors(newErrors); return }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const uid = session.user.id
    userIdRef.current = uid

    const insertData: any = {
      asesor_id: uid,
      nombre: form.nombre,
      telefono: form.telefono || null,
      email: form.email || null,
      notas: form.notas || null,
      etapa_kanban: form.etapa_kanban,
      fecha_etapa: new Date().toISOString(),
      tipo_servicio: form.tipo_servicio || null,
    }

    if (esAsesoria) {
      insertData.esquema_pago = 'monto_acordado'
      insertData.monto_acordado = form.monto_acordado ? parseFloat(form.monto_acordado) : null
    } else if (form.tipo_servicio) {
      insertData.esquema_pago = form.esquema_pago || null
      if (form.esquema_pago === 'monto_acordado') {
        insertData.monto_acordado = form.monto_acordado ? parseFloat(form.monto_acordado) : null
      } else if (form.esquema_pago === 'meses_pension') {
        insertData.monto_pension_mensual = form.monto_pension_mensual ? parseFloat(form.monto_pension_mensual) : null
        insertData.numero_meses_cobro = form.numero_meses_cobro ? parseInt(form.numero_meses_cobro) : null
      } else if (form.esquema_pago === 'porcentaje_recuperado') {
        insertData.porcentaje_recuperacion = form.porcentaje_recuperacion ? parseFloat(form.porcentaje_recuperacion) : null
      }
    }

    const { data: newCliente, error } = await supabase.from('clientes').insert(insertData).select().single()
    if (error) { console.error('Error: ' + error.message); setSaving(false); return }

    // Esquema 3: insertar cobros_esperados por etapa marcada
    if (!esAsesoria && form.esquema_pago === 'tarifa_etapa' && newCliente) {
      const filas = Object.entries(form.tarifas_etapa as any)
        .filter(([_, v]: any) => v.cobrar && v.monto)
        .map(([etapa, v]: any) => ({
          cliente_id: newCliente.id,
          asesor_id: uid,
          etapa,
          monto_esperado: parseFloat(v.monto),
        }))
      if (filas.length > 0) await supabase.from('cobros_esperados').insert(filas)
    }

    await loadClientes(uid)
    setSaving(false)
    // Show WhatsApp material modal
    if (newCliente) {
      setNuevoClienteData({ id: newCliente.id, nombre: newCliente.nombre, telefono: newCliente.telefono })
      setShowWappModal(true)
    }
    setShowNuevo(false)
    setForm({ nombre: '', telefono: '', email: '', notas: '', etapa_kanban: 'prospecto', tipo_servicio: '', esquema_pago: '', monto_acordado: '', monto_pension_mensual: '', numero_meses_cobro: '', porcentaje_recuperacion: '', tarifas_etapa: { prospecto: { cobrar: false, monto: '' }, diagnostico: { cobrar: false, monto: '' }, recopilacion: { cobrar: false, monto: '' }, tramite: { cobrar: false, monto: '' }, cierre: { cobrar: false, monto: '' } } })
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

    const esDevolucion = tipoMovimiento === 'devolucion'
    const montoAbs = Math.abs(parseFloat(formPago.monto))
    const montoNuevo = esDevolucion ? -montoAbs : montoAbs

    // Validar que no exceda el saldo pendiente (solo aplica a pagos, no a devoluciones)
    if (!esDevolucion) {
      const saldoPendiente = Math.max(0, (selected.monto_acordado ?? 0) - (selected.total_pagado ?? 0))
      if (selected.monto_acordado && montoNuevo > saldoPendiente) {
        alert(`El pago de ${fmtMXN(montoNuevo)} excede el saldo pendiente de ${fmtMXN(saldoPendiente)}`)
        setSavingPago(false)
        return
      }
    } else {
      // Validar que la devolución no exceda lo ya pagado
      const totalPagado = selected.total_pagado ?? 0
      if (montoAbs > totalPagado) {
        alert(`La devolución de ${fmtMXN(montoAbs)} excede el total pagado de ${fmtMXN(totalPagado)}`)
        setSavingPago(false)
        return
      }
    }

    const concepto = esDevolucion
      ? `Devolución${formPago.notas ? ` — ${formPago.notas}` : ''}`
      : formPago.concepto

    const { data, error } = await supabase.from('pagos').insert({
      cliente_id: selected.id,
      asesor_id: session.user.id,
      monto: montoNuevo,
      concepto,
      notas: formPago.notas || null,
      fecha_pago: new Date(formPago.fecha_pago + 'T12:00:00').toISOString(),
      comprobante_url,
      servicio_id: servicioActivo,
    }).select().single()
    if (error) {
      console.error('Error al registrar movimiento:', error.message)
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
    setTipoMovimiento('pago')
    setFormPago({ monto: '', concepto: 'Anticipo', notas: '', fecha_pago: new Date().toISOString().split('T')[0] })
  }

  async function eliminarPago(pagoId: string, monto: number) {
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

  async function moverCliente(clienteId: string, etapaActual: string, nuevaEtapa: string, notaCancel?: string) {
    const updates: any = { etapa_kanban: nuevaEtapa, ultimo_contacto: new Date().toISOString(), fecha_etapa: new Date().toISOString() }
    if (nuevaEtapa === 'cancelado' && notaCancel) updates.nota_cancelacion = notaCancel
    await supabase.from('clientes').update(updates).eq('id', clienteId)
    setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, ...updates } : c))
    if (selected?.id === clienteId) setSelected(prev => prev ? { ...prev, ...updates } : prev)
    setDragging(null); setDragOver(null)
  }

  async function actualizarCliente(id: string, campos: Partial<Cliente>) {
    await supabase.from('clientes').update(campos).eq('id', id)
    setClientes(prev => prev.map(c => c.id === id ? { ...c, ...campos } : c))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, ...campos } : prev)
  }

  async function archivarCliente() {
    if (!selected) return
    setDeletingCliente(true)
    await supabase.from('clientes').update({ activo: false }).eq('id', selected.id)
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
      (() => {
        try {
          const secs = typeof analisis === 'string' ? JSON.parse(analisis) : analisis
          if (Array.isArray(secs) && secs.length > 0) {
            return secs.map((s: any) => seccion(s.titulo || '', s.contenido || '')).join('')
          } else if (secs && typeof secs === 'object') {
            return [
              seccion('Contexto', secs.contexto || ''),
              seccion('Diagnóstico actual', secs.diagnostico_actual || ''),
              seccion('Opciones disponibles', secs.opciones_disponibles || ''),
              seccion('Recomendación', secs.recomendacion || ''),
              seccion('Próximos pasos', secs.proximos_pasos || ''),
            ].join('')
          }
        } catch(e) {}
        return '<p style="color:#94a3b8">Sin análisis narrativo generado.</p>'
      })(),
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
    if (filtroServicio && c.tipo_servicio !== filtroServicio) return false
    return true
  })

  const clientesPorColumna = (colId: string) => filtered.filter(c => (c.etapa_kanban || 'prospecto') === colId)
  const totalCobrado = clientes.reduce((s, c) => s + (c.total_pagado ?? 0), 0)
  const totalPorCobrar = clientes.reduce((s, c) => s + Math.max(0, (c.monto_acordado ?? 0) - (c.total_pagado ?? 0)), 0)
  const filtered = clientes.filter(c => {
    const matchSearch = c.nombre.toLowerCase().includes(search.toLowerCase()) || (c.email ?? '').toLowerCase().includes(search.toLowerCase()) || (c.telefono ?? '').includes(search)
    if (!matchSearch) return false
    if (filtroEtapa && c.etapa_kanban !== filtroEtapa) return false
    if (filtroServicio && c.tipo_servicio !== filtroServicio) return false
    if (filtroPago && calcEstatus(c.monto_acordado, c.total_pagado ?? 0) !== filtroPago) return false
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
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', rowGap: '8px' }}>
        {/* Fila 1: título + toggle vista + botones principales */}
        <h1 style={{ color: AZUL, fontSize: '18px', fontWeight: '800', margin: 0, flexShrink: 0 }}>
          Clientes <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '14px' }}>({clientesFiltrados.length})</span>
        </h1>
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
          {(['lista', 'pipeline'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding: '6px 14px', background: vista === v ? AZUL : 'white', color: vista === v ? 'white' : '#64748b', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
              {v === 'lista' ? '☰ Lista' : '⊟ Pipeline'}
            </button>
          ))}
        </div>
        {(vista === 'lista' || vista === 'pipeline') && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: '820px' }}>
            <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: '7px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', width: '130px', minWidth: '100px', outline: 'none' }} />
            <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)}
              style={{ padding: '7px 8px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', outline: 'none', background: 'white', color: filtroEtapa ? '#374151' : '#94a3b8', maxWidth: '125px' }}>
              <option value="">Todas las etapas</option>
              {COLUMNAS.map(col => <option key={col.id} value={col.id}>{col.label}</option>)}
            </select>
            <select value={filtroServicio} onChange={e => setFiltroServicio(e.target.value)}
              style={{ padding: '7px 8px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', outline: 'none', background: 'white', color: filtroServicio ? '#374151' : '#94a3b8', maxWidth: '125px' }}>
              <option value="">Todos los servicios</option>
              {TIPOS_SERVICIO.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select value={filtroPago} onChange={e => setFiltroPago(e.target.value)}
              style={{ padding: '7px 8px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', outline: 'none', background: 'white', color: filtroPago ? '#374151' : '#94a3b8', maxWidth: '115px' }}>
              <option value="">Todos los pagos</option>
              <option value="Pendiente">🔴 Pendiente</option>
              <option value="Parcial">🟡 Parcial</option>
              <option value="Liquidado">🟢 Liquidado</option>
            </select>
            {(filtroEtapa || filtroServicio || filtroPago || search) && (
              <button onClick={() => { setFiltroEtapa(''); setFiltroServicio(''); setFiltroPago(''); setSearch('') }}
                style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', background: '#F4F6FB', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                ✕ Limpiar
              </button>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b', cursor: 'pointer', userSelect: 'none' as const, padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', background: mostrarArchivados ? '#F4F6FB' : 'white', flexShrink: 0 }}>
              <input type="checkbox" checked={mostrarArchivados}
                onChange={e => { setMostrarArchivados(e.target.checked); if (e.target.checked && userIdRef.current) loadArchivados(userIdRef.current) }} />
              📦 Archivados {clientesArchivados.length > 0 ? `(${clientesArchivados.length})` : ''}
            </label>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          {[
            { label: 'Total clientes', value: String(filtered.length), color: AZUL, bg: '#EEF2F8', border: AZUL },
            { label: 'Cobrado', value: fmtMXN(filtered.reduce((s, c) => s + (c.total_pagado ?? 0), 0)), color: VERDE, bg: '#F0FDF4', border: VERDE },
            { label: 'Por cobrar', value: fmtMXN(filtered.reduce((s, c) => s + Math.max(0, (c.monto_acordado ?? 0) - (c.total_pagado ?? 0)), 0)), color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5' },
          ].map((k, i) => (
            <div key={i} style={{ background: k.bg, border: `1px solid ${k.border}`, padding: '5px 12px', width: '130px', textAlign: 'center' as const, flexShrink: 0 }}>
              <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.4px', fontWeight: '600', marginBottom: '2px' }}>{k.label}</div>
              <div style={{ fontSize: '13px', fontWeight: '800', color: k.color, letterSpacing: '-0.3px' }}>{k.value}</div>
            </div>
          ))}
          <button onClick={() => { setForm({ nombre: '', telefono: '', email: '', notas: '', etapa_kanban: 'prospecto', tipo_servicio: '', esquema_pago: '', monto_acordado: '', monto_pension_mensual: '', numero_meses_cobro: '', porcentaje_recuperacion: '', tarifas_etapa: { prospecto: { cobrar: false, monto: '' }, diagnostico: { cobrar: false, monto: '' }, recopilacion: { cobrar: false, monto: '' }, tramite: { cobrar: false, monto: '' }, cierre: { cobrar: false, monto: '' } } }); setFormErrors({}); setShowNuevo(true) }}
            style={{ background: AZUL, color: 'white', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' as const }}>
            + Nuevo cliente
          </button>
          <button onClick={() => setShowGuia(true)}
            style={{ background: '#F4F6FB', color: AZUL, border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>
            📖 Guía
          </button>
        </div>
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
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto', maxHeight: 'calc(100vh - 260px)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
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
                        <td style={{ padding: '10px 12px', borderLeft: `4px solid ${SERVICIO_COLORS[c.tipo_servicio || ''] || 'transparent'}` }}>
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
                        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#64748b' }}>{TIPOS_SERVICIO.find(t => t.id === c.tipo_servicio)?.label ?? '—'}</td>
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
                  {mostrarArchivados && clientesArchivados.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={9} style={{ padding: '10px 12px', background: '#F4F6FB', fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          📦 Archivados ({clientesArchivados.length})
                        </td>
                      </tr>
                      {clientesArchivados.map((c, i) => (
                        <tr key={c.id} style={{ borderBottom: i < clientesArchivados.length - 1 ? '1px solid #f1f5f9' : 'none', opacity: 0.6 }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '30px', height: '30px', background: '#94a3b8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                                {c.nombre.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b' }}>{c.nombre}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.email ?? c.telefono ?? '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8' }}>{COLUMNAS.find(col => col.id === (c.etapa_kanban || 'prospecto'))?.label ?? '—'}</td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', color: '#94a3b8' }}>{TIPOS_SERVICIO.find(t => t.id === c.tipo_servicio)?.label ?? '—'}</td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', color: '#94a3b8' }}>{fmtMXN(c.monto_acordado)}</td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', color: '#94a3b8' }}>{fmtMXN(c.total_pagado ?? 0)}</td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', color: '#94a3b8' }}>—</td>
                          <td style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8' }}>—</td>
                          <td style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8' }}>{fmtDias(c.ultimo_contacto)}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <button onClick={() => reactivarCliente(c.id)}
                              style={{ padding: '4px 10px', border: '1px solid #c7d2fe', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', background: '#EEF2F8', color: AZUL }}>
                              ↩️ Reactivar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── VISTA PIPELINE ── */}
      {vista === 'pipeline' && (
        <div style={{ flex: 1, overflow: 'hidden', padding: '12px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '8px', height: '100%' }}>
            {COLUMNAS.map(col => {
              const cards = clientesPorColumna(col.id)
              const isDragOver = dragOver === col.id
              const draggingCliente = dragging ? clientes.find(c => c.id === dragging) : undefined
              const canDrop = dragging ? puedeMoverse(draggingCliente?.etapa_kanban ?? 'prospecto', col.id, draggingCliente, draggingCliente ? clientesConDiagnostico.has(draggingCliente.id) : false, draggingCliente ? clientesConDiagnosticoAutorizado.has(draggingCliente.id) : false).ok : true
              return (
                <div key={col.id}
                  onDragOver={e => { e.preventDefault(); if (canDrop) setDragOver(col.id) }}
                  onDrop={e => {
                    e.preventDefault()
                    if (dragging) {
                      const cliente = clientes.find(c => c.id === dragging)
                      if (cliente) {
                        const etapaActual = cliente.etapa_kanban ?? 'prospecto'
                        const check = puedeMoverse(etapaActual, col.id, cliente, clientesConDiagnostico.has(cliente.id), clientesConDiagnosticoAutorizado.has(cliente.id))
                        if (check.ok) {
                          setShowConfirmEtapa({ clienteId: cliente.id, nombre: cliente.nombre, etapaActual, etapaNueva: col.id })
                        } else if (check.razon) {
                          setBloqueoMsg(check.razon)
                        }
                      }
                    }
                    setDragging(null); setDragOver(null)
                  }}
                  style={{ minWidth: 0, height: '100%', maxHeight: 'calc(100vh - 220px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: isDragOver && canDrop ? `${col.color}12` : '#F4F6FB', borderRadius: '12px', border: `2px solid ${isDragOver && canDrop ? col.color : 'transparent'}`, transition: 'all 0.15s', opacity: isDragOver && !canDrop ? 0.5 : 1 }}>
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
                          style={{ background: 'white', borderRadius: '10px', padding: '11px', border: `1px solid ${dragging === cliente.id ? col.color : '#e2e8f0'}`, borderLeft: `4px solid ${SERVICIO_COLORS[cliente.tipo_servicio || ''] || '#e2e8f0'}`, cursor: col.esFinal ? 'pointer' : 'grab', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', opacity: dragging === cliente.id ? 0.5 : 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: AZUL, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>
                              {cliente.nombre.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliente.nombre}</span>
                          </div>
                          {cliente.tipo_servicio && (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: col.bg, color: col.color, fontWeight: '700', display: 'inline-block', marginBottom: '4px' }}>{TIPOS_SERVICIO.find(t => t.id === cliente.tipo_servicio)?.label ?? cliente.tipo_servicio}</span>
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
          onClick={e => { if (e.target === e.currentTarget) { if (editando) setShowConfirmClose(true); else setSelected(null) } }}>
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
              <button onClick={() => { setNuevoClienteData({ id: selected.id, nombre: selected.nombre, telefono: selected.telefono }); setMaterialesSeleccionados([]); setShowWappModal(true) }}
                title="Enviar material de apoyo"
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                💬 Material
              </button>
              <button onClick={() => { if (editando) setShowConfirmClose(true); else setSelected(null) }} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            {/* Etapa pipeline */}
            <div style={{ padding: '10px 22px', borderBottom: '1px solid #f1f5f9' }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#94a3b8', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Etapa del pipeline</label>
              {editando ? (
                <select
                  value={selected.etapa_kanban || 'prospecto'}
                  onChange={e => {
                    const nuevaEtapa = e.target.value
                    const etapaActual = selected.etapa_kanban || 'prospecto'
                    if (nuevaEtapa === etapaActual) return
                    const check = puedeMoverse(etapaActual, nuevaEtapa, selected, diagnosticos.length > 0, diagnosticos.some(d => d.estatus === 'autorizado'))
                    if (check.ok) {
                      setShowConfirmEtapa({ clienteId: selected.id, nombre: selected.nombre, etapaActual, etapaNueva: nuevaEtapa })
                    } else if (check.razon) {
                      setBloqueoMsg(check.razon)
                    }
                  }}
                  style={{ ...inputSt, fontSize: '12px', fontWeight: '600' }}>
                  {COLUMNAS.map(col => <option key={col.id} value={col.id}>{col.label}</option>)}
                </select>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '6px', border: `1.5px solid ${(COLUMNAS.find(c => c.id === (selected.etapa_kanban || 'prospecto'))?.color) || '#e2e8f0'}`, background: (COLUMNAS.find(c => c.id === (selected.etapa_kanban || 'prospecto'))?.bg) || 'white', color: (COLUMNAS.find(c => c.id === (selected.etapa_kanban || 'prospecto'))?.color) || '#64748b', fontSize: '12px', fontWeight: '700' }}>
                  {COLUMNAS.find(c => c.id === (selected.etapa_kanban || 'prospecto'))?.label}
                </div>
              )}
              {!editando && <p style={{ fontSize: '10px', color: '#94a3b8', margin: '4px 0 0' }}>Activa el modo edición para cambiar la etapa</p>}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 22px' }}>
              {(['info', 'pagos', 'diagnosticos', 'financiamiento', 'actividades'] as const).map(tab => (
                <button key={tab} onClick={() => setModalTab(tab)}
                  style={{ padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: modalTab === tab ? '700' : '400', color: modalTab === tab ? AZUL : '#64748b', borderBottom: modalTab === tab ? `2px solid ${AZUL}` : '2px solid transparent', marginBottom: '-1px' }}>
                  {tab === 'info' ? 'Datos' : tab === 'pagos' ? `💰 Pagos (${pagos.length})` : tab === 'diagnosticos' ? `Diagnósticos (${diagnosticos.length})` : tab === 'financiamiento' ? '🏦 Financiamiento' : `Actividades (${actividades.length})`}
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
                    </div>
                  )}

                      <div style={{ background: '#F4F6FB', borderRadius: '10px', padding: '12px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Etiqueta de servicio</div>
                        {editando ? (
                          <select defaultValue={selected.tipo_servicio ?? ''} onChange={e => actualizarCliente(selected.id, { tipo_servicio: e.target.value || null })} style={{ ...inputSt, fontSize: '12px', padding: '7px 10px' }}>
                            <option value="">— Sin definir —</option>
                            {TIPOS_SERVICIO.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                          </select>
                        ) : (
                          <div style={{ fontSize: '13px', color: '#374151', padding: '7px 0' }}>
                            {TIPOS_SERVICIO.find(t => t.id === selected.tipo_servicio)?.label || <span style={{ color: '#94a3b8' }}>Sin definir</span>}
                          </div>
                        )}
                      </div>

                      {/* ── RECORDATORIO MONTO PENDIENTE ── */}
                      {(() => {
                        const colActual = COLUMNAS.find(c => c.id === (selected.etapa_kanban || 'prospecto'))
                        const yaEnDiagnostico = (colActual?.orden ?? 0) >= 1
                        if (!yaEnDiagnostico) return null
                        if (selected.esquema_pago === 'meses_pension' && !selected.monto_pension_mensual) {
                          return (
                            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', color: '#92400e', lineHeight: 1.5 }}>
                              📌 Aún no has definido el <strong>monto de pensión mensual</strong> de este cliente. Captúralo en cuanto lo sepas (sección "Esquema de pago" abajo).
                            </div>
                          )
                        }
                        if (selected.esquema_pago === 'porcentaje_recuperado' && !selected.monto_recuperado) {
                          return (
                            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', color: '#92400e', lineHeight: 1.5 }}>
                              📌 Aún no has definido el <strong>monto recuperado</strong> de este cliente. Captúralo en cuanto lo sepas (sección "Esquema de pago" abajo).
                            </div>
                          )
                        }
                        return null
                      })()}

                      {/* ── ESQUEMA DE PAGO ── */}
                      {selected.tipo_servicio && (
                        <div style={{ background: '#F4F6FB', borderRadius: '10px', padding: '12px' }}>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Esquema de pago</div>
                          {selected.tipo_servicio === 'asesoria' ? (
                            editando ? (
                              <div>
                                <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Monto acordado ($)</label>
                                <input type="number" defaultValue={selected.monto_acordado ?? ''}
                                  onBlur={e => actualizarCliente(selected.id, { monto_acordado: e.target.value ? parseFloat(e.target.value) : null, esquema_pago: 'monto_acordado' })}
                                  placeholder="Ej. 3500" style={inputSt} />
                              </div>
                            ) : (
                              <div style={{ fontSize: '13px', color: '#374151' }}>{fmtMXN(selected.monto_acordado)}</div>
                            )
                          ) : editando ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div>
                                <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Esquema</label>
                                <select defaultValue={selected.esquema_pago ?? ''}
                                  disabled={pagos.length > 0}
                                  onChange={e => actualizarCliente(selected.id, {
                                    esquema_pago: e.target.value || null,
                                    monto_acordado: null, monto_pension_mensual: null, numero_meses_cobro: null, porcentaje_recuperacion: null,
                                  })}
                                  style={{ ...inputSt, fontSize: '12px', padding: '7px 10px', background: pagos.length > 0 ? '#f1f5f9' : 'white', cursor: pagos.length > 0 ? 'not-allowed' : 'pointer', color: pagos.length > 0 ? '#94a3b8' : '#374151' }}>
                                  <option value="">— Selecciona —</option>
                                  {ESQUEMAS_PAGO.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                                </select>
                                {pagos.length > 0 && (
                                  <p style={{ fontSize: '10px', color: '#92400e', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '6px 8px', margin: '6px 0 0', lineHeight: 1.5 }}>
                                    🔒 Este cliente ya tiene pagos registrados ({pagos.length}), por lo que no se puede cambiar el esquema de pago. Si necesitas renegociar los términos: cancela este registro indicando el motivo, crea un nuevo cliente con el esquema correcto, y registra lo ya cobrado como anticipo.
                                  </p>
                                )}
                              </div>

                              {selected.esquema_pago === 'monto_acordado' && (
                                <div>
                                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Monto acordado ($)</label>
                                  <input type="number" defaultValue={selected.monto_acordado ?? ''}
                                    onBlur={e => actualizarCliente(selected.id, { monto_acordado: e.target.value ? parseFloat(e.target.value) : null })}
                                    placeholder="Ej. 18000" style={inputSt} />
                                </div>
                              )}

                              {selected.esquema_pago === 'meses_pension' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Pensión mensual ($)</label>
                                    <input type="number" defaultValue={selected.monto_pension_mensual ?? ''}
                                      onBlur={e => actualizarCliente(selected.id, { monto_pension_mensual: e.target.value ? parseFloat(e.target.value) : null })}
                                      placeholder="Ej. 8000" style={inputSt} />
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Meses a cobrar</label>
                                    <input type="number" defaultValue={selected.numero_meses_cobro ?? ''}
                                      onBlur={e => actualizarCliente(selected.id, { numero_meses_cobro: e.target.value ? parseInt(e.target.value) : null })}
                                      placeholder="Ej. 2" style={inputSt} />
                                  </div>
                                </div>
                              )}

                              {selected.esquema_pago === 'tarifa_etapa' && (
                                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                                  📌 La tarifa por etapa se definió al registrar al cliente. Para ajustarla, consulta los cobros esperados o contacta soporte.
                                </p>
                              )}

                              {selected.esquema_pago === 'porcentaje_recuperado' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>% a cobrar</label>
                                    <input type="number" defaultValue={selected.porcentaje_recuperacion ?? ''}
                                      onBlur={e => actualizarCliente(selected.id, { porcentaje_recuperacion: e.target.value ? parseFloat(e.target.value) : null })}
                                      placeholder="Ej. 10" style={inputSt} />
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>Monto recuperado ($)</label>
                                    <input type="number" defaultValue={selected.monto_recuperado ?? ''}
                                      onBlur={e => actualizarCliente(selected.id, { monto_recuperado: e.target.value ? parseFloat(e.target.value) : null })}
                                      placeholder="Se define al cierre" style={inputSt} />
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ fontSize: '13px', color: '#374151' }}>
                              {!selected.esquema_pago && <span style={{ color: '#94a3b8' }}>Sin definir</span>}
                              {selected.esquema_pago === 'monto_acordado' && fmtMXN(selected.monto_acordado)}
                              {selected.esquema_pago === 'meses_pension' && (
                                selected.monto_pension_mensual && selected.numero_meses_cobro
                                  ? `${fmtMXN(selected.monto_pension_mensual)} × ${selected.numero_meses_cobro} meses = ${fmtMXN(selected.monto_pension_mensual * selected.numero_meses_cobro)}`
                                  : <span style={{ color: '#94a3b8' }}>Pendiente de definir monto de pensión</span>
                              )}
                              {selected.esquema_pago === 'tarifa_etapa' && 'Tarifa por etapa (ver cobros esperados)'}
                              {selected.esquema_pago === 'porcentaje_recuperado' && (
                                selected.porcentaje_recuperacion
                                  ? `${selected.porcentaje_recuperacion}% ${selected.monto_recuperado ? `de ${fmtMXN(selected.monto_recuperado)} = ${fmtMXN(selected.monto_recuperado * selected.porcentaje_recuperacion / 100)}` : '(pendiente monto recuperado)'}`
                                  : <span style={{ color: '#94a3b8' }}>Sin definir</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                  {!editando ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => abrirEditar(selected)}
                        style={{ flex: 1, padding: '9px', background: '#F4F6FB', color: AZUL, border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                        ✏️ Editar datos
                      </button>
                      <button onClick={() => setShowConfirmDelete(true)}
                        style={{ padding: '9px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                        📦 Archivar
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setEditando(false)} style={{ flex: 1, padding: '9px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
                      <button onClick={guardarEdicion} style={{ flex: 2, padding: '9px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>Guardar cambios</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB FINANCIAMIENTO ── */}
              {modalTab === 'financiamiento' && (() => {
                // Asesor elige el diagnóstico base
                const diagSel = diagnosticos.find(d => d.id === diagFinId) ?? null
                const capitalBase = diagSel?.inversion_mod40 ?? 0
                const pensionBase = diagSel?.pension_con_mod40 ?? 0
                const finSel = financieras.find(f => f.id === finSelId)

                // Corrida financiera
                function calcCorrida(capital: number, tasaAnual: number, plazo: number) {
                  const tm = tasaAnual / 100 / 12
                  const cuota = tm > 0 ? capital * (tm * Math.pow(1+tm,plazo)) / (Math.pow(1+tm,plazo)-1) : capital/plazo
                  let saldo = capital; const rows = []
                  for (let i = 1; i <= plazo; i++) {
                    const interes = saldo * tm
                    const cap = cuota - interes
                    saldo -= cap
                    rows.push({ mes: i, cuota, capital: cap, interes, saldo: Math.max(0, saldo) })
                  }
                  return { cuota, totalPagado: cuota * plazo, rows }
                }

                const capital = capitalBase > 0 ? capitalBase : 100000
                const corrida = finSel ? calcCorrida(capital, finSel.tasa_anual, finPlazo) : null
                const fmtM = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n)

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Info banner */}
                    <div style={{ padding: '10px 14px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '12px', color: '#1B3A6B', lineHeight: 1.6 }}>
                      Si el cliente no puede pagar la Modalidad 40 de contado, una financiera puede adelantar el capital. La pensión obtenida debe superar la cuota mensual del crédito.
                    </div>

                    {/* Selector de diagnóstico base */}
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        1. Selecciona el diagnóstico base
                      </label>
                      {diagnosticos.filter(d => (d.inversion_mod40 ?? 0) > 0).length === 0 ? (
                        <div style={{ padding: '12px 14px', background: '#FFF7ED', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '12px', color: '#92400e' }}>
                          Ningún diagnóstico tiene inversión de Mod 40 registrada. Corre la calculadora y guarda un diagnóstico con escenario de Modalidad 40.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {diagnosticos.filter(d => (d.inversion_mod40 ?? 0) > 0).map((d, i) => (
                            <button key={d.id} onClick={() => setDiagFinId(d.id)}
                              style={{ padding: '10px 14px', border: `2px solid ${diagFinId === d.id ? '#1B3A6B' : '#e2e8f0'}`, borderRadius: '8px', background: diagFinId === d.id ? '#EEF2F8' : 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px', background: d.estatus === 'autorizado' ? '#dcfce7' : '#f1f5f9', color: d.estatus === 'autorizado' ? '#15803d' : '#64748b' }}>
                                    {d.estatus === 'autorizado' ? '✅ Autorizado' : '📝 Borrador'}
                                  </span>
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>{new Date(d.created_at).toLocaleDateString('es-MX')}</span>
                                  {d.escenario_elegido && <span style={{ fontSize: '11px', color: '#1B3A6B', fontWeight: '600' }}>{d.escenario_elegido}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#1B3A6B' }}>{fmtM(d.inversion_mod40 ?? 0)}</span>
                                  <span style={{ fontSize: '12px', color: '#2E8B57', fontWeight: '600' }}>{fmtM(d.pension_con_mod40 ?? 0)}/mes</span>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Capital y pensión del diagnóstico seleccionado */}
                    {diagSel && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
                          <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0 0 4px', textTransform: 'uppercase', fontWeight: '700' }}>Capital a financiar (Mod 40)</p>
                          <p style={{ fontSize: '20px', fontWeight: '700', color: '#1B3A6B', margin: 0 }}>{fmtM(capitalBase)}</p>
                          <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>Del diagnóstico seleccionado</p>
                        </div>
                        <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '12px', border: '1px solid #bbf7d0' }}>
                          <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0 0 4px', textTransform: 'uppercase', fontWeight: '700' }}>Pensión estimada</p>
                          <p style={{ fontSize: '20px', fontWeight: '700', color: '#2E8B57', margin: 0 }}>{fmtM(pensionBase)}/mes</p>
                          <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>Escenario elegido en el diagnóstico</p>
                        </div>
                      </div>
                    )}

                    {!diagSel ? null : financieras.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px', background: '#F4F6FB', borderRadius: '10px', color: '#94a3b8', fontSize: '12px' }}>
                        No hay financieras configuradas. Agrega financieras en Configuración → Financieras aliadas.
                      </div>
                    ) : (
                      <>
                        {/* Configuración */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '10px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Financiera aliada</label>
                            <select value={finSelId} onChange={e => setFinSelId(e.target.value)}
                              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}>
                              {financieras.map(f => <option key={f.id} value={f.id}>{f.nombre} — {f.tasa_anual}% anual</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Plazo</label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {finSel && [12, 24, 36, 48].filter(p => p >= finSel.plazo_min && p <= finSel.plazo_max).map(p => (
                                <button key={p} onClick={() => setFinPlazo(p)}
                                  style={{ flex: 1, padding: '8px 4px', borderRadius: '7px', border: `2px solid ${finPlazo === p ? '#1B3A6B' : '#e2e8f0'}`, background: finPlazo === p ? '#1B3A6B' : 'white', color: finPlazo === p ? 'white' : '#64748b', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {p}m
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* KPIs viabilidad */}
                        {corrida && (
                          <div style={{ background: '#F8FAFC', borderRadius: '10px', border: `2px solid ${corrida.cuota < pensionBase ? '#bbf7d0' : '#fecaca'}`, padding: '14px' }}>
                            <p style={{ fontSize: '11px', fontWeight: '700', color: '#475569', margin: '0 0 10px', textTransform: 'uppercase' }}>Análisis de viabilidad</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                              {[
                                { label: 'Cuota mensual', value: fmtM(corrida.cuota), sub: `${finSel?.tasa_anual}% · ${finPlazo}m`, color: '#F05B21' },
                                { label: 'Pensión obtenida', value: fmtM(pensionBase), sub: 'del diagnóstico', color: '#2E8B57' },
                                { label: 'Saldo neto', value: fmtM(pensionBase - corrida.cuota), sub: 'pensión − cuota', color: pensionBase > corrida.cuota ? '#2E8B57' : '#ef4444' },
                                { label: 'Total a pagar', value: fmtM(corrida.totalPagado), sub: 'capital + intereses', color: '#64748b' },
                              ].map((k, i) => (
                                <div key={i} style={{ background: 'white', borderRadius: '8px', padding: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0 0 4px' }}>{k.label}</p>
                                  <p style={{ fontSize: '15px', fontWeight: '700', color: k.color, margin: '0 0 2px' }}>{k.value}</p>
                                  <p style={{ fontSize: '9px', color: '#94a3b8', margin: 0 }}>{k.sub}</p>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              {[
                                [corrida.cuota < pensionBase, corrida.cuota < pensionBase ? 'La pensión cubre la cuota mensual del crédito ✅' : 'La cuota supera la pensión — revisa el plazo o el escenario ⚠️'],
                                [pensionBase - corrida.cuota > 2000, pensionBase - corrida.cuota > 2000 ? `Margen cómodo: ${fmtM(pensionBase - corrida.cuota)}/mes sobrante ✅` : 'Margen ajustado — evalúa con el cliente ⚠️'],
                              ].map(([ok, txt], i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '6px 10px', background: ok ? '#f0fdf4' : '#fff7ed', borderRadius: '6px', color: ok ? '#15803d' : '#92400e' }}>
                                  {txt as string}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tabla amortización */}
                        {corrida && (
                          <div>
                            <p style={{ fontSize: '11px', fontWeight: '700', color: '#475569', margin: '0 0 8px', textTransform: 'uppercase' }}>Tabla de amortización — primeros 6 meses de {finPlazo}</p>
                            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                  <tr style={{ background: '#F4F6FB' }}>
                                    {['#', 'Cuota', 'Capital', 'Interés', 'Saldo'].map((h, i) => (
                                      <th key={i} style={{ padding: '7px 10px', textAlign: i === 0 ? 'center' : 'right', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {corrida.rows.slice(0, 6).map((r, i) => (
                                    <tr key={r.mes} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94a3b8', fontWeight: '600' }}>{r.mes}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: '#1B3A6B' }}>{fmtM(r.cuota)}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#2E8B57' }}>{fmtM(r.capital)}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#F05B21' }}>{fmtM(r.interes)}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>{fmtM(r.saldo)}</td>
                                    </tr>
                                  ))}
                                  <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                                    <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: '700', color: '#1B3A6B' }}>Tot</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: '#1B3A6B' }}>{fmtM(corrida.totalPagado)}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: '#2E8B57' }}>{fmtM(capital)}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: '#F05B21' }}>{fmtM(corrida.totalPagado - capital)}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: '#374151' }}>—</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })()}

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
                        return (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {liquidado ? (
                              <div style={{ flex: 1, padding: '11px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', textAlign: 'center', fontSize: '13px', fontWeight: '700', color: VERDE }}>
                                🟢 Cuenta liquidada — pago completo
                              </div>
                            ) : (
                              <button onClick={() => { setTipoMovimiento('pago'); setFormPago(p => ({ ...p, concepto })); setShowPago(true) }}
                                style={{ flex: 1, padding: '11px', background: VERDE, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                                + Registrar {concepto.toLowerCase()} {saldo > 0 ? `— ${fmtMXN(saldo)} pendiente` : ''}
                              </button>
                            )}
                            {(selected.total_pagado ?? 0) > 0 && (
                              <button onClick={() => { setTipoMovimiento('devolucion'); setFormPago(p => ({ ...p, concepto: '', monto: '', notas: '' })); setShowPago(true) }}
                                style={{ padding: '11px 14px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                ↩️ Devolución
                              </button>
                            )}
                          </div>
                        )
                      })()}

                      {pagos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '28px', color: '#94a3b8', fontSize: '13px', background: '#F8FAFC', borderRadius: '10px', border: '1px dashed #e2e8f0' }}>Sin pagos registrados</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                          {[...pagos].reverse().map((pago, i) => {
                            const esDevolucion = pago.monto < 0
                            return (
                            <div key={pago.id} style={{ background: esDevolucion ? '#fef2f2' : '#F8FAFC', borderRadius: '10px', border: `1px solid ${esDevolucion ? '#fecaca' : '#e2e8f0'}`, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: `1px solid ${esDevolucion ? '#fed7d7' : '#f1f5f9'}` }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: esDevolucion ? '#ef4444' : '#94a3b8' }}>{esDevolucion ? '↩️ Devolución' : `Pago ${i + 1}`}</span>
                                <div style={{ flex: 1 }} />
                                <span style={{ fontSize: '16px', fontWeight: '800', color: esDevolucion ? '#ef4444' : VERDE }}>{esDevolucion ? '−' : ''}{fmtMXN(Math.abs(pago.monto))}</span>
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
                                <button onClick={() => setConfirmDelPago({ id: pago.id, monto: pago.monto })}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px', padding: '4px', flexShrink: 0 }}>🗑️</button>
                              </div>
                            </div>
                          )})}
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

              {confirmDelPago && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                  onClick={() => setConfirmDelPago(null)}>
                  <div onClick={e => e.stopPropagation()}
                    style={{ background: 'white', borderRadius: '12px', padding: '24px', maxWidth: '360px', width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
                    <p style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: '0 0 6px' }}>¿Eliminar este pago?</p>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
                      Se eliminará el pago de {fmtMXN(confirmDelPago.monto)}. Esta acción no se puede deshacer.
                    </p>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setConfirmDelPago(null)}
                        style={{ padding: '8px 16px', border: '1.5px solid #e2e8f0', borderRadius: '8px', background: 'white', color: '#64748b', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                        Cancelar
                      </button>
                      <button onClick={() => { eliminarPago(confirmDelPago.id, confirmDelPago.monto); setConfirmDelPago(null) }}
                        style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', background: '#ef4444', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
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
                    const esAutorizado = d.estatus === 'autorizado'
                    const esBorrador = !d.estatus || d.estatus === 'borrador'
                    const borderColor = esAutorizado ? '#bbf7d0' : '#e2e8f0'
                    const bgColor = esAutorizado ? '#f0fdf4' : '#F8FAFC'
                    return (
                    <div key={d.id} style={{ background: bgColor, borderRadius: '10px', border: `1.5px solid ${borderColor}`, overflow: 'hidden' }}>
                      {/* Header diagnóstico */}
                      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '28px', height: '28px', background: esAutorizado ? VERDE : '#94a3b8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                          {String.fromCharCode(65 + idx)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {/* Estatus badge */}
                            <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px', background: esAutorizado ? '#dcfce7' : '#f1f5f9', color: esAutorizado ? '#15803d' : '#64748b' }}>
                              {esAutorizado ? '✅ Autorizado' : '📝 Borrador'}
                            </span>
                            <span style={{ background: d.ley === '73' ? '#EEF2F8' : '#EEF7F1', color: d.ley === '73' ? AZUL : VERDE, fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>Ley {d.ley}</span>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{fmt(d.created_at)}</span>
                            {esAutorizado && d.fecha_autorizacion && (
                              <span style={{ fontSize: '10px', color: '#15803d' }}>· Autorizado {fmt(d.fecha_autorizacion)}</span>
                            )}
                            {analisis && <span style={{ fontSize: '10px', background: '#f0fdf4', color: VERDE, padding: '1px 6px', borderRadius: '6px', fontWeight: '600' }}>📝 Análisis</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                            {d.semanas} semanas
                            {d.escenario_elegido && <span style={{ color: AZUL, fontWeight: '600' }}> · {d.escenario_elegido}</span>}
                            {d.ingreso_objetivo ? <span> · Objetivo {fmtMXN(d.ingreso_objetivo)}/mes</span> : ''}
                          </div>
                        </div>
                      </div>

                      {/* Resultados */}
                      <div style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '10px' }}>
                          {[
                            { label: 'Sin modalidad', value: d.pension_sin_mod40, color: '#94a3b8' },
                            { label: 'Escenario elegido', value: d.pension_con_mod40, color: esAutorizado ? VERDE : NARANJA },
                          ].map((e, i) => (
                            <div key={i} style={{ background: 'white', borderRadius: '6px', padding: '8px 10px', border: `1px solid ${i === 1 && esAutorizado ? '#bbf7d0' : '#e2e8f0'}` }}>
                              <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{e.label}</div>
                              <div style={{ fontSize: '14px', fontWeight: '700', color: e.color }}>{e.value ? fmtMXN(e.value) : '—'}<span style={{ fontSize: '10px', fontWeight: '400' }}>/mes</span></div>
                            </div>
                          ))}
                        </div>
                        {(d.inversion_mod40 ?? 0) > 0 && (
                          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', padding: '5px 8px', background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            💰 Inversión Mod 40: {fmtMXN(d.inversion_mod40 ?? 0)} total
                            {d.mod40_umas && d.mod40_meses && <span> · {d.mod40_umas} UMAs · {d.mod40_meses} meses</span>}
                          </div>
                        )}
                        {/* Acciones */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {esBorrador && (
                            <a href={`/calculadora?cliente=${selected.id}&diag=${d.id}`}
                              style={{ flex: 1, padding: '7px', background: '#EEF2F8', color: AZUL, border: 'none', borderRadius: '7px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                              🔄 Cargar en calculadora
                            </a>
                          )}
                          {esAutorizado && (
                            <div style={{ flex: 1, padding: '7px', background: '#dcfce7', color: '#15803d', borderRadius: '7px', fontSize: '11px', fontWeight: '600', textAlign: 'center' }}>
                              🔒 Diagnóstico oficial — inmutable
                            </div>
                          )}
                          {d.params_json && (
                            <button onClick={() => generarPDFDesdeDiag(d)}
                              style={{ flex: 1, padding: '7px', background: d.estatus === 'autorizado' ? '#f0fdf4' : '#fffbeb', color: d.estatus === 'autorizado' ? VERDE : '#92400e', border: `1px solid ${d.estatus === 'autorizado' ? '#bbf7d0' : '#fde68a'}`, borderRadius: '7px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                              📄 {d.estatus === 'autorizado' ? 'PDF oficial' : 'PDF borrador'}
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
                {materiales.filter(m => m.activo).map(m => {
                  const emoji = m.tipo === 'video' ? '🎥' : m.tipo === 'guia' ? '📋' : m.tipo === 'calculadora' ? '🧮' : '📄'
                  const checked = materialesSeleccionados.includes(m.id)
                  return (
                    <label key={m.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', border: `1.5px solid ${checked ? '#22c55e' : '#e2e8f0'}`, borderRadius: '10px', background: checked ? '#f0fdf4' : 'white', cursor: 'pointer', transition: 'border-color .15s' }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setMaterialesSeleccionados(prev => checked ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                        style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                      <span style={{ fontSize: '20px' }}>{emoji}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#374151', margin: '0 0 1px' }}>{m.nombre}</p>
                        {m.descripcion && <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{m.descripcion}</p>}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowWappModal(false); setNuevoClienteData(null); setMaterialesSeleccionados([]) }}
                style={{ flex: 1, padding: '11px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                {materialesSeleccionados.length > 0 ? 'Cancelar' : 'Cerrar'}
              </button>
              {materialesSeleccionados.length > 0 && (() => {
                const tel = nuevoClienteData.telefono?.replace(/\D/g, '') || ''
                const seleccionados = materiales.filter(m => materialesSeleccionados.includes(m.id))
                const lineas = seleccionados.map(m => {
                  const emoji = m.tipo === 'video' ? '🎥' : m.tipo === 'guia' ? '📋' : m.tipo === 'calculadora' ? '🧮' : '📄'
                  const enlace = (m as any).archivo_url || m.url
                  return `${emoji} *${m.nombre}*${m.descripcion ? `\n${m.descripcion}` : ''}${enlace ? `\n🔗 ${enlace}` : ''}`
                }).join('\n\n')
                const msg = encodeURIComponent(
                  `Hola ${nuevoClienteData.nombre}, te comparto material de apoyo sobre tu proceso de pensión:\n\n${lineas}\n\nCualquier duda estoy a tus órdenes.`
                )
                const wappUrl = tel ? `https://wa.me/52${tel}?text=${msg}` : `https://wa.me/?text=${msg}`
                return (
                  <a href={wappUrl} target="_blank" rel="noopener noreferrer"
                    onClick={() => setTimeout(() => { setShowWappModal(false); setNuevoClienteData(null); setMaterialesSeleccionados([]) }, 300)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '11px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', textDecoration: 'none' }}>
                    💬 Enviar {materialesSeleccionados.length} por WhatsApp
                  </a>
                )
              })()}
            </div>
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

    {/* ── MODAL GUÍA DE FUNCIONAMIENTO ── */}
      {showGuia && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowGuia(false) }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '24px', maxWidth: '920px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', position: 'relative' }}>
            <button onClick={() => setShowGuia(false)}
              style={{ position: 'absolute', top: '14px', right: '14px', width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: '#F4F6FB', color: '#64748b', fontSize: '16px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ✕
            </button>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', textAlign: 'center', margin: '0 0 20px' }}>
              GUÍA DE FUNCIONAMIENTO — TABLERO UNIFICADO DE PENSIONES
            </h2>

            {/* Grid de 6 columnas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', marginBottom: '20px' }}>
              {[
                { label: 'PROSPECTO', color: '#378ADD', desc: 'TODOS LOS SERVICIOS ACTIVO.', sub: 'Registro y toma de datos.' },
                { label: 'DIAGNÓSTICO', color: '#639922', desc: 'TODOS LOS SERVICIOS ACTIVO.', sub: 'Análisis de viabilidad.' },
                { label: 'RECOPILACIÓN', color: '#eab308', desc: 'Gestión y Financiamiento', sub: 'Asesoría se salta esta columna.' },
                { label: 'TRÁMITE', color: '#f97316', desc: 'Gestión y Financiamiento', sub: 'Asesoría se salta esta columna.' },
                { label: 'CIERRE (EXITOSO)', color: VERDE, desc: 'TODOS LOS SERVICIOS ACTIVO.', sub: 'Cierre y facturación.' },
                { label: 'CANCELADO', color: '#94a3b8', desc: 'TODOS LOS SERVICIOS ACTIVO.', sub: 'Expedientes detenidos.' },
              ].map((col, i) => (
                <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ background: col.color, color: 'white', padding: '8px 6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', marginBottom: '3px' }}>{col.label}</div>
                    {'desc' in col && <div style={{ fontSize: '9px', opacity: 0.85, lineHeight: 1.4, fontWeight: '400' }}>{(col as any).desc}</div>}
                  </div>
                  <div style={{ padding: '8px 6px', flex: 1 }}>
                    <p style={{ fontSize: '10px', fontWeight: '700', color: '#374151', margin: '0 0 4px', lineHeight: 1.3 }}>{col.desc}</p>
                    <p style={{ fontSize: '10px', color: '#64748b', margin: 0, lineHeight: 1.3 }}>{col.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Flechas de flujo por tipo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '90px', fontSize: '11px', fontWeight: '700', color: '#378ADD', flexShrink: 0 }}>🟦 Asesoría</span>
                <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'linear-gradient(to right, #378ADD 0%, #378ADD 33%, transparent 33%, transparent 66%, ' + VERDE + ' 66%, ' + VERDE + ' 100%)' }} />
                <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>Prospecto → Diagnóstico → Cierre</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '90px', fontSize: '11px', fontWeight: '700', color: '#639922', flexShrink: 0 }}>🟩 Gestión</span>
                <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: `linear-gradient(to right, #639922 0%, ${VERDE} 100%)` }} />
                <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>Flujo completo (1→5)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '90px', fontSize: '11px', fontWeight: '700', color: '#eab308', flexShrink: 0 }}>🟨 Financiamiento</span>
                <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: `linear-gradient(to right, #eab308 0%, ${VERDE} 100%)` }} />
                <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>Flujo completo (1→5)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '90px', fontSize: '11px', fontWeight: '700', color: '#7F77DD', flexShrink: 0 }}>🟪 Gestoría Global</span>
                <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: `linear-gradient(to right, #7F77DD 0%, ${VERDE} 100%)` }} />
                <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>Flujo completo (1→5)</span>
              </div>
            </div>

            {/* Notas clave */}
            <div style={{ background: '#F4F6FB', borderRadius: '10px', padding: '14px 16px', fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 6px', fontWeight: '700' }}>📌 Reglas clave:</p>
              <p style={{ margin: '0 0 4px' }}>• <strong>Asesoría</strong> avanza de Diagnóstico directo a Cierre — no pasa por Recopilación ni Trámite.</p>
              <p style={{ margin: '0 0 4px' }}>• <strong>Gestión, Financiamiento y Gestoría Global</strong> recorren las 5 etapas en orden, sin saltos.</p>
              <p style={{ margin: '0 0 4px' }}>• Cualquier servicio puede pasar a <strong>Cancelado</strong> desde cualquier etapa no final, indicando el motivo.</p>
              <p style={{ margin: 0 }}>• Antes de Recopilación/Cierre se requiere definir cómo se cobrará al cliente (esquema de pago).</p>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL BLOQUEO REGLA DE NEGOCIO ── */}
      {bloqueoMsg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '380px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🚫</div>
            <h3 style={{ color: '#1e293b', fontSize: '16px', fontWeight: '700', margin: '0 0 8px' }}>No se puede mover</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 20px', lineHeight: 1.6 }}>
              {bloqueoMsg}
            </p>
            <button onClick={() => setBloqueoMsg(null)}
              style={{ width: '100%', padding: '11px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
              Entendido
            </button>
          </div>
        </div>
      )}

{/* ── MODAL CONFIRMAR ETAPA ── */}
      {showConfirmEtapa && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '380px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>{showConfirmEtapa.etapaNueva === 'cancelado' ? '🚫' : '🔄'}</div>
            <h3 style={{ color: '#1e293b', fontSize: '16px', fontWeight: '700', margin: '0 0 8px' }}>{showConfirmEtapa.etapaNueva === 'cancelado' ? '¿Cancelar cliente?' : '¿Cambiar etapa?'}</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 8px', lineHeight: 1.6 }}>
              Moverás a <strong style={{ color: '#374151' }}>{showConfirmEtapa.nombre}</strong> de
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', margin: '0 0 20px' }}>
              <span style={{ padding: '4px 12px', borderRadius: '8px', background: '#EEF2F8', color: AZUL, fontSize: '13px', fontWeight: '700' }}>
                {COLUMNAS.find(c => c.id === showConfirmEtapa.etapaActual)?.label ?? showConfirmEtapa.etapaActual}
              </span>
              <span style={{ fontSize: '18px', color: '#94a3b8' }}>→</span>
              <span style={{ padding: '4px 12px', borderRadius: '8px', background: showConfirmEtapa.etapaNueva === 'cancelado' ? '#fef2f2' : '#f0fdf4', color: showConfirmEtapa.etapaNueva === 'cancelado' ? '#ef4444' : VERDE, fontSize: '13px', fontWeight: '700' }}>
                {COLUMNAS.find(c => c.id === showConfirmEtapa.etapaNueva)?.label ?? showConfirmEtapa.etapaNueva}
              </span>
            </div>
            {showConfirmEtapa.etapaNueva === 'cancelado' && (
              <div style={{ marginBottom: '16px', textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Motivo de cancelación *</label>
                <textarea value={notaCancelacion} onChange={e => setNotaCancelacion(e.target.value)}
                  placeholder="Ej. No califica por semanas, Cliente no interesado..."
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
                {!notaCancelacion.trim() && <p style={{ fontSize: '11px', color: '#ef4444', margin: '4px 0 0' }}>El motivo es obligatorio para cancelar.</p>}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowConfirmEtapa(null); setNotaCancelacion('') }}
                style={{ flex: 1, padding: '11px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button disabled={showConfirmEtapa.etapaNueva === 'cancelado' && !notaCancelacion.trim()}
                onClick={async () => {
                if (showConfirmEtapa) {
                  await moverCliente(showConfirmEtapa.clienteId, showConfirmEtapa.etapaActual, showConfirmEtapa.etapaNueva, showConfirmEtapa.etapaNueva === 'cancelado' ? notaCancelacion : undefined)
                  setNotaCancelacion('')
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
              <h3 style={{ color: '#1e293b', fontSize: '17px', fontWeight: '700', margin: '0 0 8px' }}>¿Archivar a {selected.nombre}?</h3>
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0, lineHeight: 1.6 }}>
                El cliente dejará de aparecer en el pipeline y listados, pero conservará todo su historial:
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
            <div style={{ background: '#EEF2F8', border: '1px solid #c7d2fe', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '12px', color: '#1e3a8a' }}>
              ℹ️ Esta acción es reversible — el cliente y su historial (pagos, diagnósticos, actividades) permanecen guardados y se puede reactivar más adelante.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirmDelete(false)}
                style={{ flex: 1, padding: '11px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => setShowConfirmArchivar(true)} disabled={deletingCliente}
                style={{ flex: 1, padding: '11px', background: deletingCliente ? '#94a3b8' : '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: deletingCliente ? 'not-allowed' : 'pointer' }}>
                {deletingCliente ? 'Archivando...' : 'Sí, archivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIRMAR ARCHIVAR ── */}
      {showConfirmArchivar && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '32px', textAlign: 'center', marginBottom: '12px' }}>📦</div>
            <h3 style={{ fontSize: '17px', fontWeight: '700', color: '#1e293b', margin: '0 0 10px', textAlign: 'center' }}>¿Archivar a {selected.nombre}?</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.6, textAlign: 'center' }}>
              El cliente será movido al archivo. Podrás consultarlo y reactivarlo en cualquier momento desde la vista de archivados.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowConfirmArchivar(false)}
                style={{ flex: 1, padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#F4F6FB', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={() => { setShowConfirmArchivar(false); archivarCliente() }} disabled={deletingCliente}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', background: '#dc2626', color: 'white', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                {deletingCliente ? 'Archivando...' : '📦 Sí, archivar'}
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
              <h3 style={{ color: tipoMovimiento === 'devolucion' ? '#ef4444' : AZUL, fontSize: '17px', fontWeight: '700', margin: 0 }}>
                {tipoMovimiento === 'devolucion' ? '↩️ Registrar devolución' : 'Registrar pago'}
              </h3>
              {tipoMovimiento === 'pago' && (
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 10px', borderRadius: '10px', background: '#EEF2F8', color: AZUL }}>
                  Pago #{pagos.length + 1}
                </span>
              )}
            </div>
            {/* Toggle pago / devolución */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
              <button onClick={() => { setTipoMovimiento('pago'); setFormPago(p => ({ ...p, monto: '' })) }}
                style={{ flex: 1, padding: '7px', borderRadius: '8px', border: `1.5px solid ${tipoMovimiento === 'pago' ? VERDE : '#e2e8f0'}`, background: tipoMovimiento === 'pago' ? '#f0fdf4' : 'white', color: tipoMovimiento === 'pago' ? VERDE : '#94a3b8', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                💰 Pago
              </button>
              <button onClick={() => { setTipoMovimiento('devolucion'); setFormPago(p => ({ ...p, monto: '', concepto: '' })) }}
                style={{ flex: 1, padding: '7px', borderRadius: '8px', border: `1.5px solid ${tipoMovimiento === 'devolucion' ? '#ef4444' : '#e2e8f0'}`, background: tipoMovimiento === 'devolucion' ? '#fef2f2' : 'white', color: tipoMovimiento === 'devolucion' ? '#ef4444' : '#94a3b8', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                ↩️ Devolución
              </button>
            </div>
            {(() => {
          const saldo = Math.max(0, (selected.monto_acordado ?? 0) - (selected.total_pagado ?? 0))
          if (tipoMovimiento === 'devolucion') {
            return (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: '8px', padding: '8px 12px' }}>
                  <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>Total pagado</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: VERDE }}>{fmtMXN(selected.total_pagado ?? 0)}</div>
                </div>
                <div style={{ flex: 1, background: '#fef2f2', borderRadius: '8px', padding: '8px 12px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>Devolución máxima</div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#ef4444' }}>{fmtMXN(selected.total_pagado ?? 0)}</div>
                </div>
              </div>
            )
          }
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
                      if (tipoMovimiento === 'devolucion') {
                        setFormPago(p => ({ ...p, monto: val }))
                        return
                      }
                      const saldo = Math.max(0, (selected.monto_acordado ?? 0) - (selected.total_pagado ?? 0))
                      const concepto = detectarConcepto(pagos.length, parseFloat(val) || 0, saldo, selected.monto_acordado)
                      setFormPago(p => ({ ...p, monto: val, concepto }))
                    }}
                  placeholder="0"
                  max={tipoMovimiento === 'devolucion' ? (selected.total_pagado ?? 0) : Math.max(0, (selected.monto_acordado ?? 0) - (selected.total_pagado ?? 0))}
                  style={{ ...inputSt, borderColor: tipoMovimiento === 'devolucion'
                    ? (formPago.monto && parseFloat(formPago.monto) > (selected.total_pagado ?? 0) ? '#ef4444' : '#e2e8f0')
                    : (formPago.monto && selected.monto_acordado && parseFloat(formPago.monto) > Math.max(0, selected.monto_acordado - (selected.total_pagado ?? 0)) ? '#ef4444' : '#e2e8f0') }}
                  autoFocus />
                {tipoMovimiento === 'devolucion' ? (
                  formPago.monto && parseFloat(formPago.monto) > (selected.total_pagado ?? 0) && (
                    <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>
                      ⚠️ Excede el total pagado de {fmtMXN(selected.total_pagado ?? 0)}
                    </p>
                  )
                ) : (
                  formPago.monto && selected.monto_acordado && parseFloat(formPago.monto) > Math.max(0, selected.monto_acordado - (selected.total_pagado ?? 0)) && (
                    <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>
                      ⚠️ Excede el saldo pendiente de {fmtMXN(Math.max(0, selected.monto_acordado - (selected.total_pagado ?? 0)))}
                    </p>
                  )
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Concepto</label>
                  <div style={{ padding: '10px 12px', background: tipoMovimiento === 'devolucion' ? '#fef2f2' : '#EEF2F8', borderRadius: '8px', border: `1px solid ${tipoMovimiento === 'devolucion' ? '#fecaca' : '#bfdbfe'}`, fontSize: '13px', fontWeight: '700', color: tipoMovimiento === 'devolucion' ? '#ef4444' : AZUL }}>
                    {tipoMovimiento === 'devolucion' ? 'Devolución' : (formPago.concepto || 'Automático')}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fecha</label>
                  <input type="date" value={formPago.fecha_pago} onChange={e => setFormPago(p => ({ ...p, fecha_pago: e.target.value }))} style={inputSt} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tipoMovimiento === 'devolucion' ? 'Motivo de la devolución *' : 'Notas'}</label>
                <input value={formPago.notas} onChange={e => setFormPago(p => ({ ...p, notas: e.target.value }))} placeholder={tipoMovimiento === 'devolucion' ? 'Ej. Cliente canceló el servicio' : 'Ej. Transferencia BBVA'} style={inputSt} />
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
              <button onClick={guardarPago} disabled={
                  savingPago || !formPago.monto ||
                  (tipoMovimiento === 'devolucion'
                    ? (!formPago.notas.trim() || parseFloat(formPago.monto) > (selected.total_pagado ?? 0))
                    : (selected.monto_acordado != null && parseFloat(formPago.monto||'0') > Math.max(0, selected.monto_acordado - (selected.total_pagado ?? 0))))
                }
                style={{ flex: 2, padding: '10px', background: (
                    savingPago || !formPago.monto ||
                    (tipoMovimiento === 'devolucion'
                      ? (!formPago.notas.trim() || parseFloat(formPago.monto) > (selected.total_pagado ?? 0))
                      : (selected.monto_acordado != null && parseFloat(formPago.monto||'0') > Math.max(0, selected.monto_acordado - (selected.total_pagado ?? 0))))
                  ) ? '#94a3b8' : (tipoMovimiento === 'devolucion' ? '#ef4444' : VERDE), color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: savingPago ? 'not-allowed' : 'pointer' }}>
                {savingPago ? 'Guardando...' : (tipoMovimiento === 'devolucion' ? '↩️ Registrar devolución' : '💰 Registrar pago')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NUEVO CLIENTE ── */}
      {showNuevo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '440px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h2 style={{ color: AZUL, fontSize: '18px', fontWeight: '700', margin: '0 0 20px' }}>Nuevo cliente</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre completo" style={inputSt} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Teléfono *</label>
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
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Servicio *</label>
                  <select value={form.tipo_servicio} onChange={e => { setForm(p => ({ ...p, tipo_servicio: e.target.value })); setFormErrors(prev => ({ ...prev, tipo_servicio: undefined })) }}
                    style={{ ...inputSt, borderColor: formErrors.tipo_servicio ? '#ef4444' : '#e2e8f0' }}>
                    <option value="">— Selecciona —</option>
                    {TIPOS_SERVICIO.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  {formErrors.tipo_servicio && <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>⚠️ {formErrors.tipo_servicio}</p>}
                </div>
              </div>
              {form.tipo_servicio === 'asesoria' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monto acordado ($) *</label>
                  <input type="number" value={form.monto_acordado} onChange={e => { setForm(p => ({ ...p, monto_acordado: e.target.value })); setFormErrors(prev => ({ ...prev, monto_acordado: undefined })) }} placeholder="Ej. 3500" style={{ ...inputSt, borderColor: formErrors.monto_acordado ? '#ef4444' : '#e2e8f0' }} />
                  {formErrors.monto_acordado && <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>⚠️ {formErrors.monto_acordado}</p>}
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Esquema de pago{form.tipo_servicio ? ' *' : ''}</label>
                  <select value={form.esquema_pago} onChange={e => setForm(p => ({
                    ...p,
                    esquema_pago: e.target.value,
                    monto_acordado: '',
                    monto_pension_mensual: '',
                    numero_meses_cobro: '',
                    porcentaje_recuperacion: '',
                    tarifas_etapa: { prospecto: { cobrar: false, monto: '' }, diagnostico: { cobrar: false, monto: '' }, recopilacion: { cobrar: false, monto: '' }, tramite: { cobrar: false, monto: '' }, cierre: { cobrar: false, monto: '' } },
                  }))}
                    style={{ ...inputSt, borderColor: formErrors.esquema_pago ? '#ef4444' : '#e2e8f0' }}>
                    <option value="">— Selecciona —</option>
                    {ESQUEMAS_PAGO.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                  {formErrors.esquema_pago && <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>⚠️ {formErrors.esquema_pago}</p>}

                  {/* Esquema 1: Monto acordado */}
                  {form.esquema_pago === 'monto_acordado' && (
                    <div style={{ marginTop: '10px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monto acordado ($) *</label>
                      <input type="number" value={form.monto_acordado} onChange={e => { setForm(p => ({ ...p, monto_acordado: e.target.value })); setFormErrors(prev => ({ ...prev, monto_acordado: undefined })) }} placeholder="Ej. 18000" style={{ ...inputSt, borderColor: formErrors.monto_acordado ? '#ef4444' : '#e2e8f0' }} />
                      {formErrors.monto_acordado && <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>⚠️ {formErrors.monto_acordado}</p>}
                    </div>
                  )}

                  {/* Esquema 2: Meses de pensión */}
                  {form.esquema_pago === 'meses_pension' && (
                    <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monto de pensión mensual ($)</label>
                        <input type="number" value={form.monto_pension_mensual} onChange={e => setForm(p => ({ ...p, monto_pension_mensual: e.target.value }))} placeholder="Se define después" style={inputSt} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Meses a cobrar</label>
                        <input type="number" value={form.numero_meses_cobro} onChange={e => setForm(p => ({ ...p, numero_meses_cobro: e.target.value }))} placeholder="Ej. 2" style={inputSt} />
                      </div>
                      <p style={{ gridColumn: '1 / -1', fontSize: '10px', color: '#94a3b8', margin: 0 }}>📌 Si no defines el monto de pensión ahora, se te recordará al avanzar a Recopilación o Trámite.</p>
                    </div>
                  )}

                  {/* Esquema 3: Tarifa por etapa */}
                  {form.esquema_pago === 'tarifa_etapa' && (
                    <div style={{ marginTop: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#F4F6FB' }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Etapa</th>
                            <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Cobrar</th>
                            <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Monto ($)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {COLUMNAS.filter(c => c.id !== 'cancelado').map(col => {
                            const fila = (form.tarifas_etapa as any)[col.id]
                            return (
                              <tr key={col.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', color: '#374151' }}>{col.label}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                  <input type="checkbox" checked={fila.cobrar} onChange={e => setForm(p => ({ ...p, tarifas_etapa: { ...(p.tarifas_etapa as any), [col.id]: { cobrar: e.target.checked, monto: e.target.checked ? fila.monto : '' } } }))} />
                                </td>
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                  <input type="number" value={fila.monto} disabled={!fila.cobrar}
                                    onChange={e => setForm(p => ({ ...p, tarifas_etapa: { ...(p.tarifas_etapa as any), [col.id]: { ...fila, monto: e.target.value } } }))}
                                    placeholder="0" style={{ width: '90px', padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', textAlign: 'right', background: fila.cobrar ? 'white' : '#f8fafc', fontFamily: 'inherit' }} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Esquema 4: % de recursos recuperados */}
                  {form.esquema_pago === 'porcentaje_recuperado' && (
                    <div style={{ marginTop: '10px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Porcentaje a cobrar (%)</label>
                      <input type="number" value={form.porcentaje_recuperacion} onChange={e => setForm(p => ({ ...p, porcentaje_recuperacion: e.target.value }))} placeholder="Ej. 10" style={inputSt} />
                      <p style={{ fontSize: '10px', color: '#94a3b8', margin: '4px 0 0' }}>📌 El monto recuperado se registrará al llegar a Cierre, y se te recordará en Recopilación/Trámite.</p>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} rows={2} style={{ ...inputSt, resize: 'none' }} />
              </div>
            </div>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '12px 0 0' }}>💡 Los pagos se registran desde el expediente del cliente</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={() => { setShowNuevo(false); setFormErrors({}); setForm({ nombre: '', telefono: '', email: '', notas: '', etapa_kanban: 'prospecto', tipo_servicio: '', esquema_pago: '', monto_acordado: '', monto_pension_mensual: '', numero_meses_cobro: '', porcentaje_recuperacion: '', tarifas_etapa: { prospecto: { cobrar: false, monto: '' }, diagnostico: { cobrar: false, monto: '' }, recopilacion: { cobrar: false, monto: '' }, tramite: { cobrar: false, monto: '' }, cierre: { cobrar: false, monto: '' } } }) }} style={{ flex: 1, padding: '10px', background: '#F1F5F9', color: '#64748b', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarNuevo} disabled={saving || !form.nombre.trim() || form.telefono.replace(/\D/g,'').length !== 10 || !form.tipo_servicio || ((form.tipo_servicio === 'asesoria' && (!form.monto_acordado || parseFloat(form.monto_acordado) <= 0)) || (form.tipo_servicio && form.tipo_servicio !== 'asesoria' && (!form.esquema_pago || (form.esquema_pago === 'monto_acordado' && (!form.monto_acordado || parseFloat(form.monto_acordado) <= 0)) || (form.esquema_pago === 'tarifa_etapa' && (Object.values(form.tarifas_etapa as any).every((v: any) => !v.cobrar) || Object.values(form.tarifas_etapa as any).some((v: any) => v.cobrar && (!v.monto || parseFloat(v.monto) <= 0)))) || (form.esquema_pago === 'meses_pension' && (!form.numero_meses_cobro || parseInt(form.numero_meses_cobro) <= 0)) || (form.esquema_pago === 'porcentaje_recuperado' && (!form.porcentaje_recuperacion || parseFloat(form.porcentaje_recuperacion) <= 0))))) || !!formErrors.telefono || !!formErrors.email}
                style={{ flex: 2, padding: '10px', background: saving || !form.nombre.trim() || form.telefono.replace(/\D/g,'').length !== 10 || !form.tipo_servicio || ((form.tipo_servicio === 'asesoria' && (!form.monto_acordado || parseFloat(form.monto_acordado) <= 0)) || (form.tipo_servicio && form.tipo_servicio !== 'asesoria' && (!form.esquema_pago || (form.esquema_pago === 'monto_acordado' && (!form.monto_acordado || parseFloat(form.monto_acordado) <= 0)) || (form.esquema_pago === 'tarifa_etapa' && (Object.values(form.tarifas_etapa as any).every((v: any) => !v.cobrar) || Object.values(form.tarifas_etapa as any).some((v: any) => v.cobrar && (!v.monto || parseFloat(v.monto) <= 0)))) || (form.esquema_pago === 'meses_pension' && (!form.numero_meses_cobro || parseInt(form.numero_meses_cobro) <= 0)) || (form.esquema_pago === 'porcentaje_recuperado' && (!form.porcentaje_recuperacion || parseFloat(form.porcentaje_recuperacion) <= 0))))) || !!formErrors.telefono || !!formErrors.email ? '#94a3b8' : AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
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
