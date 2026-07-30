'use client'
/**
 * /admin/formulas — KSE Pensiones
 * ════════════════════════════════════════════════════════════════════
 * Página exclusiva del administrador para ver y ajustar las constantes
 * configurables del sistema pensional.
 *
 * Constantes FIJAS (solo cambian con la ley) → solo lectura
 * Constantes CONFIGURABLES (UMA, PMG, tasas Mod40) → editables
 *
 * Todo lo que aquí se edita se guarda en la tabla `configuracion_sistema`
 * de Supabase y es leída por la calculadora en tiempo real.
 * ════════════════════════════════════════════════════════════════════
 */

import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import {
  TABLA_CUANTIA_UMA, FACTOR_EDAD_RETIRO, ASIGNACIONES,
  SEMANAS_MINIMAS_PENSION, DIAS_AGUINALDO, MAX_MESES_RETROACTIVO,
  TASA_ACTUALIZACION_MENSUAL, TASA_ACTUALIZACION_DEFAULT,
  TASA_RECARGO_MENSUAL, TASAS_MOD40_POR_ANIO, TASA_MOD40_TECHO,
  PCT_RECUPERACION_AFORE_DEFAULT, EDAD_ANALISIS_FLUJOS,
  FACTOR_ACTUALIZACION_UMA, fmtMXN, fmtPct
} from '@/app/utils/formulas'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F05B21'

function AdminFormulasInner() {
  const supabase = createClient()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Valores configurables (se cargan de Supabase)
  const [uma, setUma] = useState(117.31)
  const [salMin, setSalMin] = useState(315.04)
  const [pmgL73, setPmgL73] = useState(10636.54)
  const [pmgL97, setPmgL97] = useState(4345.72)
  const [pctAfore, setPctAfore] = useState(20)
  const [rendDefault, setRendDefault] = useState(6)
  const [pctBanco, setPctBanco] = useState(35.65)
  const [tasaBanco, setTasaBanco] = useState(32.2)
  const [tasasMod40, setTasasMod40] = useState<Record<number, number>>({ ...TASAS_MOD40_POR_ANIO })
  const [activeTab, setActiveTab] = useState<'configurables' | 'legales' | 'equipo'>('configurables')
  const [orgExpandida, setOrgExpandida] = useState<string | null>(null)
  const [organizaciones, setOrganizaciones] = useState<any[]>([])
  const [showNuevaOrg, setShowNuevaOrg] = useState(false)
  const [formOrg, setFormOrg] = useState({ nombre: '', plan: 'individual', asientos: 1, fecha_vencimiento: '' })
  const [guardandoOrg, setGuardandoOrg] = useState(false)
  const [showPago, setShowPago] = useState(false)
  const [pagoOrgId, setPagoOrgId] = useState('')
  const [formPago, setFormPago] = useState({ monto: 0, concepto: 'Suscripción mensual', periodo_inicio: '', periodo_fin: '', metodo_pago: '', notas: '' })
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [fechaActualizacion, setFechaActualizacion] = useState<string | null>(null)
  const [equipo, setEquipo] = useState<{ id: string; nombre: string; email: string; total_clientes: number; total_diagnosticos: number; is_admin: boolean }[]>([])
  const [showNuevoUsuario, setShowNuevoUsuario] = useState(false)
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [nuevoPassword, setNuevoPassword] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [nuevoEnvioMetodo, setNuevoEnvioMetodo] = useState<'email' | 'whatsapp' | 'ambos'>('email')
  const [nuevoEsAdmin, setNuevoEsAdmin] = useState(false)
  const [nuevoRol, setNuevoRol] = useState<'asesor' | 'org_admin'>('asesor')
  const [showCambiarPwd, setShowCambiarPwd] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState('')
  const [nuevoOrgId, setNuevoOrgId] = useState('')
  const [creandoUsuario, setCreandoUsuario] = useState(false)
  const [errorUsuario, setErrorUsuario] = useState('')
  const [recargarEquipo, setRecargarEquipo] = useState(0)

  async function cargarEquipo() {
    const { data: asesores } = await supabase.from('perfiles_usuario').select('id, nombre, email_contacto, razon_social, is_admin, organizacion_id, rol')
    if (asesores) {
      const { data: clientesAll } = await supabase.from('clientes').select('asesor_id')
      const { data: diagsAll } = await supabase.from('diagnosticos').select('asesor_id')
      const equipoData = asesores.map(a => ({
        id: a.id,
        nombre: a.razon_social || a.nombre || 'Sin nombre',
        email: a.email_contacto || '—',
        total_clientes: (clientesAll ?? []).filter(c => c.asesor_id === a.id).length,
        total_diagnosticos: (diagsAll ?? []).filter(d => d.asesor_id === a.id).length,
        is_admin: !!a.is_admin,
      }))
      setEquipo(equipoData)
    }
    const { data: orgs } = await supabase.from('organizaciones').select('*').order('nombre')
    if (orgs) setOrganizaciones(orgs)
  }

  async function guardarOrganizacion() {
    setGuardandoOrg(true)
    await supabase.from('organizaciones').insert({ nombre: formOrg.nombre, plan: formOrg.plan, asientos: formOrg.asientos, fecha_vencimiento: formOrg.fecha_vencimiento || null })
    await cargarEquipo()
    setShowNuevaOrg(false)
    setFormOrg({ nombre: '', plan: 'individual', asientos: 1, fecha_vencimiento: '' })
    setGuardandoOrg(false)
  }

  async function asignarOrganizacion(asesorId: string, orgId: string | null) {
    await supabase.from('perfiles_usuario').update({ organizacion_id: orgId || null }).eq('id', asesorId)
    await cargarEquipo()
  }

  async function toggleOrgActivo(orgId: string, activo: boolean) {
    await supabase.from('organizaciones').update({ activo: !activo }).eq('id', orgId)
    await cargarEquipo()
  }

  async function guardarPago() {
    setGuardandoPago(true)
    await supabase.from('pagos_suscripcion').insert({
      organizacion_id: pagoOrgId,
      monto: formPago.monto,
      concepto: formPago.concepto,
      periodo_inicio: formPago.periodo_inicio,
      periodo_fin: formPago.periodo_fin,
      metodo_pago: formPago.metodo_pago || null,
      notas: formPago.notas || null,
      estatus: 'pendiente',
    })
    setShowPago(false)
    setFormPago({ monto: 0, concepto: 'Suscripción mensual', periodo_inicio: '', periodo_fin: '', metodo_pago: '', notas: '' })
    setGuardandoPago(false)
  }

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      // Verificar rol admin en perfiles_usuario
      const { data: perfil } = await supabase
        .from('perfiles_usuario')
        .select('is_admin')
        .eq('id', session.user.id)
        .single()
      if (!perfil?.is_admin) { setIsAdmin(false); return }
      setIsAdmin(true)
      // Cargar valores desde configuracion_sistema
      const { data: conf } = await supabase
        .from('perfiles_usuario')
        .select('*')
        .eq('id', session.user.id)
        .single()
      if (conf) {
        if (conf.uma_diaria) setUma(conf.uma_diaria)
        if (conf.salario_minimo) setSalMin(conf.salario_minimo)
        if (conf.pmg_mensual) setPmgL73(conf.pmg_mensual)
        if (conf.pmg_l97) setPmgL97(conf.pmg_l97)
        if (conf.pct_afore_mod40) setPctAfore(conf.pct_afore_mod40)
        if (conf.rendimiento_afore_default) setRendDefault(conf.rendimiento_afore_default)
        if (conf.pct_banco_regulado) setPctBanco(conf.pct_banco_regulado)
        if (conf.tasa_banco_anual) setTasaBanco(conf.tasa_banco_anual)
        const t: Record<number, number> = { ...TASAS_MOD40_POR_ANIO }
        for (let y = 2026; y <= 2030; y++) {
          const k = `mod40_${y}`
          if (conf[k]) t[y] = conf[k]
        }
        setTasasMod40(t)
        if (conf.fecha_actualizacion_formulas) setFechaActualizacion(conf.fecha_actualizacion_formulas)
      }
      await cargarEquipo()
    }
    init()
  }, [])

  useEffect(() => {
    if (recargarEquipo > 0) cargarEquipo()
  }, [recargarEquipo])

  function generarPasswordAdmin() {
    const chars = 'abcdefghijkmnpqrstuvwxyz'
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const nums = '23456789'
    const syms = '!@#$%&*'
    let pwd = upper[Math.floor(Math.random() * upper.length)]
      + chars[Math.floor(Math.random() * chars.length)]
      + chars[Math.floor(Math.random() * chars.length)]
      + nums[Math.floor(Math.random() * nums.length)]
      + nums[Math.floor(Math.random() * nums.length)]
      + syms[Math.floor(Math.random() * syms.length)]
      + upper[Math.floor(Math.random() * upper.length)]
      + chars[Math.floor(Math.random() * chars.length)]
      + nums[Math.floor(Math.random() * nums.length)]
      + syms[Math.floor(Math.random() * syms.length)]
    return pwd.split('').sort(() => Math.random() - 0.5).join('')
  }

  function abrirWhatsApp(nombre: string, email: string, password: string, telefono: string) {
    const appUrl = 'https://ksepensiones.vercel.app'
    const msg = `🔷 *KSE PENSIONES*\n_Sistema de Diagnóstico Pensional_\n\nHola *${nombre}* 👋\n\nTu cuenta ha sido creada exitosamente. Aquí están tus datos de acceso:\n\n━━━━━━━━━━━━━━━\n📧 *Usuario:* ${email}\n🔑 *Contraseña:* ${password}\n━━━━━━━━━━━━━━━\n\n🌐 *Accede aquí:*\n${appUrl}\n\n⚠️ _Por seguridad, cambia tu contraseña en tu primer acceso desde Configuración._\n\n¡Bienvenido al equipo! 💼✨`
    const tel = telefono.replace(/\D/g, '')
    const numero = tel.startsWith('52') ? tel : `52${tel}`
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  async function crearUsuario() {
    setErrorUsuario('')
    setErrorUsuario('')
    if (!nuevoNombre) { setErrorUsuario('El nombre es obligatorio'); return }
    if (!nuevoEmail) { setErrorUsuario('El correo es obligatorio'); return }
    if (!nuevoTelefono) { setErrorUsuario('El teléfono es obligatorio'); return }
    if (!nuevoPassword || nuevoPassword.length < 10) { setErrorUsuario('La contraseña debe tener mínimo 10 caracteres'); return }
    setCreandoUsuario(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { setErrorUsuario('Sesión no válida — recarga la página'); setCreandoUsuario(false); return }
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _uid: uid,
          email: nuevoEmail, password: nuevoPassword, nombre: nuevoNombre,
          telefono: nuevoTelefono || null,
          is_admin: nuevoEsAdmin, rol: nuevoEsAdmin ? 'super_admin' : nuevoRol,
          organizacion_id: nuevoOrgId || null,
          envio_metodo: nuevoEnvioMetodo,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorUsuario(data.error || 'Error al crear usuario'); setCreandoUsuario(false); return }
      // Abrir WhatsApp si el método lo requiere
      if ((nuevoEnvioMetodo === 'whatsapp' || nuevoEnvioMetodo === 'ambos') && nuevoTelefono) {
        abrirWhatsApp(nuevoNombre, nuevoEmail, nuevoPassword, nuevoTelefono)
      }
      setShowNuevoUsuario(false)
      setNuevoEmail(''); setNuevoPassword(''); setNuevoNombre(''); setNuevoTelefono(''); setNuevoEsAdmin(false); setNuevoEnvioMetodo('email')
      setRecargarEquipo(n => n + 1)
    } catch (e: any) {
      setErrorUsuario(e.message || 'Error de conexión')
    }
    setCreandoUsuario(false)
  }

  async function eliminarUsuario(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la cuenta de "${nombre}"? Esta acción no se puede deshacer. Sus clientes y diagnósticos NO se eliminan, pero quedarán sin asesor asignado.`)) return
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    const res = await fetch(`/api/admin/usuarios?id=${id}`, {
      method: 'DELETE',
      headers: { 'x-uid': uid ?? '' },
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error || 'Error al eliminar'); return }
    setRecargarEquipo(n => n + 1)
  }

  const handleSave = async () => {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const payload: Record<string, number> = {
      uma_diaria: uma, salario_minimo: salMin,
      pmg_mensual: pmgL73, pmg_l97: pmgL97,
      pct_afore_mod40: pctAfore, rendimiento_afore_default: rendDefault,
      pct_banco_regulado: pctBanco, tasa_banco_anual: tasaBanco,
    }
    for (let y = 2026; y <= 2030; y++) payload[`mod40_${y}`] = tasasMod40[y] ?? TASAS_MOD40_POR_ANIO[y]
    const nowIso = new Date().toISOString()
    // CRÍTICO: debe guardar en la misma fila (id = session.user.id) que lee init() al cargar.
    // Antes guardaba en id:1 (literal inválido para columna UUID) — nunca persistía donde se leía.
    const { error } = await supabase.from('perfiles_usuario').upsert({ id: session.user.id, ...payload, fecha_actualizacion_formulas: nowIso })
    if (error) {
      console.error('Error al guardar fórmulas:', error)
      alert('Error al guardar: ' + error.message)
      setSaving(false)
      return
    }
    setFechaActualizacion(nowIso)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function sectionTitle(t: string, sub: string) { return (
    <div style={{ marginBottom: '14px' }}>
      <p style={{ fontSize: '13px', fontWeight: '800', color: AZUL, margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{t}</p>
      <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{sub}</p>
    </div>
  ) }

  function fieldRow(label: string, legal: string, excel: string, value: any, editable = false) { return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: '#374151', width: '220px' }}>{label}</td>
      <td style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>{legal}</td>
      <td style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{excel}</td>
      <td style={{ padding: '10px 12px' }}>{value}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center' as const }}>
        {editable
          ? <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontWeight: '700' }}>EDITABLE</span>
          : <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: '#f0fdf4', color: '#166534', fontWeight: '700' }}>FIJO POR LEY</span>
        }
      </td>
    </tr>
  ) }

  function numInput(val: number, onChange: (v: number) => void, step = 0.01) { return (
    <input
      type="number" step={step} value={val}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={{ width: '110px', padding: '4px 8px', border: '1.5px solid #f59e0b', borderRadius: '6px', fontSize: '12px', fontWeight: '700', color: '#374151', background: '#fffbeb' }}
    />
  ) }

  if (isAdmin === null) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>Cargando...</div>
  if (isAdmin === null) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>Verificando acceso...</div>
  if (!isAdmin) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><p style={{ color: '#374151', fontWeight: '700' }}>🔒 Acceso restringido</p></div>

  return (
    <div style={{ height: 'calc(100vh - 48px)', overflowY: 'auto', background: '#F4F6FB' }}>
      <style>{`
        .af-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .af-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .af-wrap   { display: flex; flex-wrap: wrap; gap: 8px; }
        .af-table  { width: 100%; border-collapse: collapse; font-size: 12px; }
        .af-table th { padding: 9px 12px; background: #1B3A6B; color: white; text-align: left; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
        .af-table th.r { text-align: right; }
        .af-table td { padding: 8px 12px; border-bottom: 1px solid #F3F4F6; font-size: 12px; color: #374151; vertical-align: middle; }
        .af-table td.r { text-align: right; }
        .af-table tr:nth-child(even) td { background: #F9FAFB; }
        .af-card { background: white; border: 1px solid #E5E7EB; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .af-badge-fix  { display: inline-block; font-size: 9.5px; font-weight: 700; padding: 2px 8px; background: #EFF6FF; color: #1D4ED8; text-transform: uppercase; letter-spacing: 0.3px; }
        .af-badge-edit { display: inline-block; font-size: 9.5px; font-weight: 700; padding: 2px 8px; background: #FFFBEB; color: #B45309; text-transform: uppercase; letter-spacing: 0.3px; }
        @media (max-width: 900px) { .af-grid-3 { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 600px) { .af-grid-3, .af-grid-2 { grid-template-columns: 1fr; } .admin-col-hide { display: none; } }
      `}</style>

      {/* Header */}
      <div style={{ background: AZUL, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: '800', color: 'white', margin: '0 0 4px' }}>⚙️ Fórmulas y Constantes del Sistema</h1>
          <p style={{ fontSize: '11px', color: '#93C5FD', margin: 0 }}>
            <span style={{ background: 'rgba(255,255,255,0.15)', padding: '1px 6px', marginRight: '8px' }}>FIJO POR LEY</span>
            Solo cambia con la LSS 1973 ·
            <span style={{ background: 'rgba(255,255,255,0.15)', padding: '1px 6px', margin: '0 8px' }}>EDITABLE</span>
            Actualizar cada año
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => router.back()} style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>← Regresar</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '7px 18px', background: saved ? VERDE : '#F05B21', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700', fontFamily: 'inherit' }}>
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* ── Alerta de temporada de actualización oficial ── */}
      {(() => {
        const hoy = new Date()
        const anio = hoy.getFullYear()
        const mes = hoy.getMonth() // 0=ene
        // Temporada de publicaciones oficiales: diciembre (salario mínimo) a febrero (UMA, PMG, tasas IMSS vigentes desde el 1° de febrero)
        const enTemporada = mes === 11 || mes === 0 || mes === 1
        const fechaUlt = fechaActualizacion ? new Date(fechaActualizacion) : null
        const actualizadoEsteAnio = fechaUlt ? fechaUlt.getFullYear() === anio && fechaUlt.getMonth() <= 2 : false
        const requiereAtencion = enTemporada && !actualizadoEsteAnio
        const fuentes = [
          { label: 'DOF — Diario Oficial', url: 'https://www.dof.gob.mx/' },
          { label: 'CONASAMI — Salarios mínimos y UMA', url: 'https://www.gob.mx/conasami' },
          { label: 'IMSS — Avisos y acuerdos', url: 'https://www.imss.gob.mx/' },
        ]
        return (
          <div style={{ padding: '14px 24px 0' }}>
            <div style={{ background: requiereAtencion ? '#FEF2F2' : '#F0FDF4', border: `2px solid ${requiereAtencion ? '#FCA5A5' : '#86EFAC'}`, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '22px', flexShrink: 0 }}>{requiereAtencion ? '⚠️' : '📅'}</span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '700' as const, color: requiereAtencion ? '#991B1B' : '#065F46', margin: '0 0 4px' }}>
                    {requiereAtencion
                      ? `Temporada de actualización oficial ${anio} — verifica si ya hay nuevos valores`
                      : enTemporada
                        ? `Temporada de actualización oficial ${anio} — valores ya revisados`
                        : 'Calendario de publicaciones oficiales'}
                  </p>
                  <p style={{ fontSize: '11.5px', color: '#374151', margin: 0, lineHeight: 1.6 }}>
                    Cada año el <strong>Salario Mínimo</strong> se publica a fines de diciembre (vigente desde el 1° de enero) y la <strong>UMA, PMG y tasas IMSS</strong> se publican entre enero y principios de febrero (vigentes desde el 1° de febrero).
                    {fechaUlt && <> Última actualización registrada: <strong>{fechaUlt.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.</>}
                    {!fechaUlt && ' Aún no se ha registrado ninguna actualización en este sistema.'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const, flexShrink: 0 }}>
                {fuentes.map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '6px 12px', background: 'white', border: '1px solid #D1D5DB', fontSize: '11px', fontWeight: '600' as const, color: '#1B3A6B', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                    {f.label} ↗
                  </a>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Guía rápida */}
      <div style={{ padding: '16px 24px 0' }}>
        <div className="af-grid-3">
          {[
            { icon: '📝', title: 'Parámetros editables', desc: 'Actualízalos cada año cuando el IMSS o CONASAMI publiquen nuevos valores. Se guardan en Supabase y la calculadora los lee en tiempo real.', bg: '#FFFBEB', border: '#FCD34D' },
            { icon: '⚖️', title: 'Constantes legales', desc: 'Solo cambian si el Congreso modifica la Ley del Seguro Social 1973. Para cambiarlas, editar formulas.ts directamente.', bg: '#EFF6FF', border: '#93C5FD' },
            { icon: '🔄', title: 'Cómo actualizar', desc: '1. Edita el valor · 2. Clic en Guardar cambios · 3. La calculadora usa los nuevos valores de inmediato en todos los diagnósticos.', bg: '#F0FDF4', border: '#86EFAC' },
          ].map((g, i) => (
            <div key={i} style={{ padding: '12px 14px', background: g.bg, border: '1px solid ' + g.border }}>
              <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: '700', color: '#374151' }}>{g.icon} {g.title}</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#6B7280', lineHeight: 1.6 }}>{g.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '14px 24px 0' }}>
        <div style={{ display: 'flex', borderBottom: '2px solid #E5E7EB', background: 'white' }}>
          {(['configurables', 'legales', 'equipo'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '10px 20px', border: 'none', borderBottom: '3px solid ' + (activeTab === t ? '#F05B21' : 'transparent'), cursor: 'pointer', fontSize: '12.5px', fontWeight: activeTab === t ? '700' : '500', background: 'white', color: activeTab === t ? '#F05B21' : '#6B7280', fontFamily: 'inherit', marginBottom: '-2px' }}>
              {t === 'configurables' ? '📝 Parámetros editables' : t === 'legales' ? '⚖️ Constantes legales' : '👥 Equipo'}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ padding: '16px 24px 32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {activeTab === 'configurables' && (
          <>
            <div className="af-card">
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>Valores CONASAMI / IMSS — actualizar cada enero/febrero</p>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 14px', lineHeight: 1.5 }}>Fuente: DOF (Diario Oficial de la Federación). Estos valores afectan directamente el cálculo de pensiones.</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="af-table">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Fundamento</th>
                      <th className="admin-col-hide">Celda Excel</th>
                      <th className="r">Valor actual</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldRow('UMA Diaria', 'CONASAMI — actualiza cada febrero', 'SAL. PROM MOD 40!E16', numInput(uma, setUma, 0.01), true)}
                    {fieldRow('Salario Mínimo Diario', 'CONASAMI — actualiza cada enero', 'COSTO MOD. 40 (ref.)', numInput(salMin, setSalMin, 0.01), true)}
                    {fieldRow('PMG Ley 73 (mensual)', 'IMSS — Pensión Mínima Garantizada Ley 73', 'PENSION MOD. 40!D18', numInput(pmgL73, setPmgL73, 1), true)}
                    {fieldRow('PMG Ley 97 (mensual)', 'CONSAR — Pensión Garantizada Ley 97', 'Configuración', numInput(pmgL97, setPmgL97, 1), true)}
                    {fieldRow('% Recuperación AFORE', '~20% va a subcuenta Retiro 97', 'COSTO MOD. 40!G17', numInput(pctAfore, setPctAfore, 0.1), true)}
                    {fieldRow('Rendimiento AFORE %', 'Estimado para proyecciones Ley 97', 'Configuración', numInput(rendDefault, setRendDefault, 0.1), true)}
                    {fieldRow('% Banco Regulado', 'Porcentaje del retroactivo que financia el banco', 'FINANCIAMIENTO!C10', numInput(pctBanco, setPctBanco, 0.01), true)}
                    {fieldRow('Tasa Banco Anual %', 'Tasa de interés anual del crédito bancario regulado', 'FINANCIAMIENTO!G32', numInput(tasaBanco, setTasaBanco, 0.1), true)}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="af-card">
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>Tasas de cotización Modalidad 40 — por año</p>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 14px', lineHeight: 1.5 }}>Fuente: IMSS — sube ~1.091% anual hasta llegar al techo de 18.8% en 2030. Excel: COSTO MOD. 40!D4-D14</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="af-table">
                  <thead>
                    <tr>
                      <th>Año</th>
                      <th className="r">Tasa %</th>
                      <th className="r">Costo mensual (25 UMAs)</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(tasasMod40).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([yr, tasa]) => {
                      const anio = parseInt(yr)
                      const esFuturo = anio >= 2026
                      const costoRef = uma * 25 * (tasa / 100) * 365 / 12
                      return (
                        <tr key={yr}>
                          <td style={{ fontWeight: '700', color: esFuturo ? '#7C3AED' : '#374151' }}>
                            {yr}
                            {anio < new Date().getFullYear() && <span style={{ fontSize: '10px', color: '#9CA3AF', marginLeft: '6px' }}>(histórico)</span>}
                            {anio === new Date().getFullYear() && <span style={{ fontSize: '10px', color: '#F05B21', fontWeight: '700', marginLeft: '6px' }}>← vigente</span>}
                          </td>
                          <td className="r">
                            {esFuturo
                              ? <input type="number" step={0.001} value={tasa} onChange={e => setTasasMod40(prev => ({ ...prev, [anio]: parseFloat(e.target.value) || tasa }))}
                                  style={{ width: '80px', padding: '4px 6px', border: '1.5px solid #FCD34D', fontSize: '12px', fontWeight: '700', color: '#374151', background: '#FFFBEB', textAlign: 'right' }} />
                              : <span style={{ fontWeight: '700', color: AZUL }}>{tasa.toFixed(3)}%</span>
                            }
                          </td>
                          <td className="r" style={{ color: '#6B7280' }}>{fmtMXN(costoRef)}</td>
                          <td><span className={esFuturo ? 'af-badge-edit' : 'af-badge-fix'}>{esFuturo ? 'Editable' : 'Fijo'}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'legales' && (
          <>
            <div className="af-card">
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>Parámetros generales — Art. 162-183 LSS 1973</p>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 14px', lineHeight: 1.5 }}>Solo se modifican si cambia la ley. Para cambiarlos, editar formulas.ts</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="af-table">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Fundamento legal</th>
                      <th className="admin-col-hide">Celda Excel</th>
                      <th className="r">Valor</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldRow('Semanas mínimas para pensión', 'Art. 162 LSS 1973', 'Implícito en DATOS GEN.', <strong>{SEMANAS_MINIMAS_PENSION} semanas</strong>)}
                    {fieldRow('Días de aguinaldo', 'Art. 171 LSS 1973', 'PENSIÓN ACTUAL!A25', <strong>{DIAS_AGUINALDO} días</strong>)}
                    {fieldRow('Máximo retroactivo Mod40', 'Reglamento IMSS / criterio validado', 'PAGO RETROACTIVO', <strong>{MAX_MESES_RETROACTIVO} meses (5 años)</strong>)}
                    {fieldRow('Factor actualización UMA', 'Metodología del Excel de referencia', 'PENSIÓN ACTUAL!×1.11', <strong>×{FACTOR_ACTUALIZACION_UMA}</strong>)}
                    {fieldRow('Techo tasa Mod40', 'IMSS — a partir de 2031', 'COSTO MOD. 40!D14', <strong>{TASA_MOD40_TECHO}%</strong>)}
                    {fieldRow('Edad análisis de flujos', 'Estándar de industria', 'INVERSION!D46/F46', <strong>{EDAD_ANALISIS_FLUJOS} años</strong>)}
                    {fieldRow('Tasa actualización default', 'Estimado conservador (post-2024)', 'PAGO RETROACTIVO', <strong>{(TASA_ACTUALIZACION_DEFAULT * 100).toFixed(2)}% mensual</strong>)}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="af-grid-2">
              <div className="af-card">
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>Factores de edad — Art. 167 LSS 1973</p>
                <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 14px', lineHeight: 1.5 }}>100% a los 65 años. Reduce 5% por año antes, mínimo a los 60 (75%). Excel: DATOS GEN.!E27-E32</p>
                <div className="af-wrap">
                  {Object.entries(FACTOR_EDAD_RETIRO).filter(([e]) => parseInt(e) <= 65).map(([edad, factor]) => (
                    <div key={edad} style={{ flex: '1 0 80px', padding: '12px', background: parseInt(edad) === 65 ? '#F0FDF4' : '#F9FAFB', border: '1px solid ' + (parseInt(edad) === 65 ? '#86EFAC' : '#E5E7EB'), textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>{edad} años</div>
                      <div style={{ fontSize: '22px', fontWeight: '900', color: parseInt(edad) === 65 ? '#065F46' : AZUL }}>{(factor * 100).toFixed(0)}%</div>
                      <div style={{ fontSize: '9.5px', color: '#9CA3AF', marginTop: '2px' }}>{parseInt(edad) === 65 ? 'Vejez' : 'Cesantía'}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="af-card">
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>Asignaciones familiares — Art. 164-165 LSS 1973</p>
                <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 14px', lineHeight: 1.5 }}>Se aplican sobre la cuantía total antes del factor de edad.</p>
                <div className="af-wrap">
                  {[
                    { label: 'Cónyuge', pct: ASIGNACIONES.CONYUGE * 100, legal: 'Art. 164 fracc. I', color: AZUL },
                    { label: 'Por hijo', pct: ASIGNACIONES.HIJO * 100, legal: 'Art. 164 fracc. II', color: VERDE },
                    { label: 'Por padre dep.', pct: ASIGNACIONES.PADRE * 100, legal: 'Art. 164 fracc. III', color: '#7C3AED' },
                    { label: 'Ayuda asistencial (sin beneficiarios)', pct: ASIGNACIONES.AYUDA_ASISTENCIAL_SIN_NADIE * 100, legal: 'Art. 165 LSS', color: '#F05B21' },
                    { label: 'Ayuda asistencial (solo padres)', pct: ASIGNACIONES.AYUDA_ASISTENCIAL_SOLO_PADRES * 100, legal: 'Art. 165 LSS', color: '#0891B2' },
                  ].map(a => (
                    <div key={a.label} style={{ flex: '1 0 140px', padding: '12px 14px', background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>{a.label}</div>
                      <div style={{ fontSize: '24px', fontWeight: '900', color: a.color }}>{a.pct.toFixed(0)}%</div>
                      <div style={{ fontSize: '9.5px', color: '#9CA3AF', marginTop: '3px' }}>{a.legal}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="af-card">
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>Tabla de cuantía básica por veces UMA — Art. 167 LSS 1973</p>
              <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 14px', lineHeight: 1.5 }}>22 rangos de salario relativo (SDI / UMA diaria). A menor salario → mayor % de cuantía. Excel: PENSIÓN ACTUAL y PENSION MOD. 40</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="af-table">
                  <thead>
                    <tr>
                      <th>Rango (veces UMA)</th>
                      <th className="r">Cuantía básica %</th>
                      <th className="r">Incremento anual %</th>
                      <th>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TABLA_CUANTIA_UMA.map((fila, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontSize: '11.5px' }}>
                          {fila.min === 0 ? '0.00' : fila.min.toFixed(2)} – {fila.max === Infinity ? '∞' : fila.max.toFixed(2)}
                        </td>
                        <td className="r" style={{ fontWeight: '700', color: AZUL }}>{(fila.basica * 100).toFixed(2)}%</td>
                        <td className="r" style={{ fontWeight: '600', color: VERDE }}>{(fila.incremento * 100).toFixed(4)}%</td>
                        <td style={{ fontSize: '11px', color: '#9CA3AF' }}>
                          {i === 0 ? 'Salario ≤ UMA' : i === TABLA_CUANTIA_UMA.length - 1 ? 'Salario > 6 UMAs' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'equipo' && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>

            {/* Header con acciones principales */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNuevaOrg(true)}
                style={{ padding: '8px 16px', background: AZUL, color: 'white', border: 'none', fontSize: '12px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                🏢 Nueva organización
              </button>
              <button onClick={() => { setShowNuevoUsuario(true); setErrorUsuario(''); setNuevoEmail(''); setNuevoPassword(''); setNuevoNombre(''); setNuevoOrgId('') }}
                style={{ padding: '8px 16px', background: NARANJA, color: 'white', border: 'none', fontSize: '12px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Nuevo asesor
              </button>
            </div>

            {/* Organizaciones con asesores agrupados */}
            {organizaciones.map((org: any) => {
              const asesoresOrg = equipo.filter((a: any) => a.organizacion_id === org.id)
              const isExpanded = orgExpandida === org.id
              const pct = org.asientos > 0 ? Math.round((asesoresOrg.length / org.asientos) * 100) : 0
              return (
                <div key={org.id} style={{ background: 'white', border: `1px solid ${isExpanded ? AZUL : '#E5E7EB'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  {/* Header de org */}
                  <div onClick={() => setOrgExpandida(isExpanded ? null : org.id)}
                    style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: isExpanded ? '#EEF2F8' : 'white' }}>
                    <span style={{ fontSize: '16px' }}>🏢</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#111827', margin: '0 0 2px' }}>{org.nombre}</p>
                      <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>
                        {org.plan} · <span style={{ color: pct >= 90 ? '#DC2626' : '#374151', fontWeight: '600' as const }}>{asesoresOrg.length}/{org.asientos} asientos</span>
                        {org.fecha_vencimiento && ` · Vence ${org.fecha_vencimiento}`}
                      </p>
                    </div>
                    {/* Barra de asientos */}
                    <div style={{ width: '80px' }}>
                      <div style={{ background: '#F4F6FB', height: '6px', borderRadius: '3px', overflow: 'hidden' as const }}>
                        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: pct >= 90 ? '#DC2626' : AZUL }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={e => { e.stopPropagation(); toggleOrgActivo(org.id, org.activo) }}
                        style={{ padding: '3px 8px', background: org.activo ? '#FEF2F2' : '#F0FDF4', color: org.activo ? '#DC2626' : '#065F46', border: `1px solid ${org.activo ? '#FCA5A5' : '#86EFAC'}`, fontSize: '10px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {org.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                    <span style={{ color: '#9CA3AF', fontSize: '12px' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {/* Asesores de esta org */}
                  {isExpanded && (
                    <div style={{ borderTop: `2px solid ${AZUL}` }}>
                      {asesoresOrg.length === 0 ? (
                        <p style={{ padding: '16px', fontSize: '12px', color: '#9CA3AF', margin: 0, textAlign: 'center' as const }}>Sin asesores asignados</p>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                          <thead><tr style={{ background: '#F8FAFC' }}>
                            {['Nombre', 'Email', 'Rol', 'Clientes', 'Diagnósticos', ''].map((h, i) => (
                              <th key={i} style={{ padding: '7px 12px', textAlign: (i > 2 ? 'right' : 'left') as const, fontWeight: '700' as const, color: '#6B7280', fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {asesoresOrg.map((a: any, i: number) => (
                              <tr key={a.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                                <td style={{ padding: '8px 12px', fontWeight: '600' as const }}>{a.nombre}</td>
                                <td style={{ padding: '8px 12px', color: '#6B7280', fontSize: '11px' }}>{a.email}</td>
                                <td style={{ padding: '8px 12px' }}>
                                  <span style={{ padding: '2px 6px', background: a.rol === 'org_admin' ? '#EFF6FF' : '#F4F6FB', color: a.rol === 'org_admin' ? '#1D4ED8' : '#6B7280', fontSize: '10px', fontWeight: 700 }}>
                                    {a.rol === 'org_admin' ? 'Líder' : 'Asesor'}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' as const, color: AZUL, fontWeight: '600' as const }}>{a.total_clientes}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' as const, color: '#374151' }}>{a.total_diagnosticos}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' as const }}>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => { setUsuarioEditando(a.id); setNuevoPassword(''); setShowCambiarPwd(true) }}
                                      style={{ padding: '3px 8px', background: '#F4F6FB', color: '#374151', border: '1px solid #E5E7EB', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                      🔑 Pwd
                                    </button>
                                    <button onClick={() => eliminarUsuario(a.id, a.nombre)}
                                      style={{ padding: '3px 8px', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Eliminar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {/* Agregar asesor a esta org */}
                      {asesoresOrg.length < org.asientos && (
                        <div style={{ padding: '10px 16px', borderTop: '1px solid #F3F4F6' }}>
                          <button onClick={() => { setNuevoOrgId(org.id); setShowNuevoUsuario(true); setErrorUsuario(''); setNuevoEmail(''); setNuevoPassword(''); setNuevoNombre('') }}
                            style={{ padding: '6px 14px', background: '#F4F6FB', color: AZUL, border: `1px solid ${AZUL}`, fontSize: '11px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                            + Agregar asesor a {org.nombre}
                          </button>
                        </div>
                      )}
                      {asesoresOrg.length >= org.asientos && (
                        <div style={{ padding: '8px 16px', background: '#FEF2F2', borderTop: '1px solid #FCA5A5' }}>
                          <p style={{ fontSize: '11px', color: '#DC2626', margin: 0 }}>
                            ⚠️ Asientos llenos ({asesoresOrg.length}/{org.asientos}) — 
                            <button onClick={() => { /* editar asientos */ }} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '11px', fontWeight: '700', padding: '0 4px', fontFamily: 'inherit' }}>
                              Ampliar plan
                            </button>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Asesores individuales sin organización */}
            {(() => {
              const solos = equipo.filter((a: any) => !a.organizacion_id && !a.is_admin)
              if (solos.length === 0 && organizaciones.length > 0) return null
              return (
                <div style={{ background: 'white', border: '1px solid #E5E7EB' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>👤</span>
                    <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#111827', margin: 0 }}>Asesores individuales</p>
                    <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{solos.length} asesor{solos.length !== 1 ? 'es' : ''}</span>
                  </div>
                  {solos.length === 0 ? (
                    <p style={{ padding: '16px', fontSize: '12px', color: '#9CA3AF', margin: 0, textAlign: 'center' as const }}>Sin asesores individuales</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                      <thead><tr style={{ background: '#F8FAFC' }}>
                        {['Nombre', 'Email', 'Clientes', 'Diagnósticos', ''].map((h, i) => (
                          <th key={i} style={{ padding: '7px 12px', textAlign: (i > 1 ? 'right' : 'left') as const, fontWeight: '700' as const, color: '#6B7280', fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {solos.map((a: any, i: number) => (
                          <tr key={a.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                            <td style={{ padding: '8px 12px', fontWeight: '600' as const }}>{a.nombre}</td>
                            <td style={{ padding: '8px 12px', color: '#6B7280', fontSize: '11px' }}>{a.email}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' as const, color: AZUL, fontWeight: '600' as const }}>{a.total_clientes}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' as const }}>{a.total_diagnosticos}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' as const }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                <select value="" onChange={e => { if (e.target.value) asignarOrganizacion(a.id, e.target.value) }}
                                  style={{ padding: '3px 6px', border: '1px solid #E5E7EB', fontSize: '10px', fontFamily: 'inherit', background: 'white', color: '#374151', cursor: 'pointer' }}>
                                  <option value="">Asignar a org...</option>
                                  {organizaciones.filter((o: any) => o.activo).map((o: any) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                                </select>
                                <button onClick={() => { setUsuarioEditando(a.id); setNuevoPassword(''); setShowCambiarPwd(true) }}
                                  style={{ padding: '3px 8px', background: '#F4F6FB', color: '#374151', border: '1px solid #E5E7EB', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  🔑
                                </button>
                                <button onClick={() => eliminarUsuario(a.id, a.nombre)}
                                  style={{ padding: '3px 8px', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })()}
          </div>
        )}


      {/* ── Modal nueva organización ── */}
      {showNuevaOrg && (
        <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ background: AZUL, padding: '16px 20px' }}><p style={{ fontSize: '14px', fontWeight: '700' as const, color: 'white', margin: 0 }}>+ Nueva organización</p></div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
              {[{ label: 'Nombre', key: 'nombre', type: 'text', placeholder: 'Ej. Grupo Financiero XYZ' }].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                  <input type="text" placeholder={f.placeholder} value={(formOrg as any)[f.key]} onChange={e => setFormOrg(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280', display: 'block', marginBottom: '4px' }}>Plan</label>
                <select value={formOrg.plan} onChange={e => setFormOrg(p => ({ ...p, plan: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', fontFamily: 'inherit', background: 'white' }}>
                  <option value="individual">Individual (1 asesor)</option>
                  <option value="equipo">Equipo (2-10 asesores)</option>
                  <option value="enterprise">Enterprise (10+ asesores)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280', display: 'block', marginBottom: '4px' }}>Asientos</label>
                <input type="number" value={formOrg.asientos} onChange={e => setFormOrg(p => ({ ...p, asientos: parseInt(e.target.value) || 1 }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280', display: 'block', marginBottom: '4px' }}>Vencimiento (opcional)</label>
                <input type="date" value={formOrg.fecha_vencimiento} onChange={e => setFormOrg(p => ({ ...p, fecha_vencimiento: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button onClick={() => setShowNuevaOrg(false)} style={{ flex: 1, padding: '10px', background: '#F8FAFC', color: '#374151', border: '1px solid #E5E7EB', fontSize: '12.5px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                <button onClick={guardarOrganizacion} disabled={!formOrg.nombre || guardandoOrg} style={{ flex: 1, padding: '10px', background: '#F05B21', color: 'white', border: 'none', fontSize: '12.5px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit', opacity: !formOrg.nombre || guardandoOrg ? 0.6 : 1 }}>
                  {guardandoOrg ? 'Guardando...' : 'Crear organización'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal nuevo usuario ── */}
      {showNuevoUsuario && (
        <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ background: AZUL, padding: '14px 20px' }}><p style={{ fontSize: '14px', fontWeight: '700' as const, color: 'white', margin: 0 }}>+ Nuevo asesor</p></div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
              {errorUsuario && <p style={{ fontSize: '12px', color: '#DC2626', margin: 0, padding: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5' }}>{errorUsuario}</p>}
              {[{ label: 'Nombre completo', state: nuevoNombre, set: setNuevoNombre, type: 'text', placeholder: 'Ej. María García', required: true },
                { label: 'Correo electrónico', state: nuevoEmail, set: setNuevoEmail, type: 'email', placeholder: 'asesor@empresa.com', required: true },
                { label: 'Teléfono WhatsApp (10 dígitos)', state: nuevoTelefono, set: setNuevoTelefono, type: 'tel', placeholder: 'Ej. 4421234567', required: true },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280', display: 'block', marginBottom: '3px' }}>{f.label} <span style={{ color: '#EF4444' }}>*</span></label>
                  <input type={f.type} placeholder={f.placeholder} value={f.state} onChange={e => f.set(e.target.value)} required={f.required}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
                </div>
              ))}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <label style={{ fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280' }}>Contraseña temporal <span style={{ color: '#EF4444' }}>*</span></label>
                  <button type="button" onClick={() => setNuevoPassword(generarPasswordAdmin())}
                    style={{ fontSize: '11px', color: NARANJA, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' as const, fontFamily: 'inherit' }}>🎲 Generar</button>
                </div>
                <input type="text" placeholder="Mínimo 10 caracteres" value={nuevoPassword} onChange={e => setNuevoPassword(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit', fontWeight: '600' }} />
              </div>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280', display: 'block', marginBottom: '3px' }}>Rol</label>
                <select value={nuevoRol} onChange={e => setNuevoRol(e.target.value as 'asesor' | 'org_admin')}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', fontFamily: 'inherit', background: 'white' }}>
                  <option value="asesor">Asesor — solo ve sus propios clientes</option>
                  <option value="org_admin">Líder de equipo — ve la actividad de su organización</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280', display: 'block', marginBottom: '4px' }}>¿Cómo enviar las credenciales?</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {([['email', '📧 Email'], ['whatsapp', '💬 WhatsApp'], ['ambos', '📧+💬 Ambos']] as const).map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setNuevoEnvioMetodo(val)}
                      style={{ flex: 1, padding: '7px 4px', background: nuevoEnvioMetodo === val ? AZUL : '#F4F6FB', color: nuevoEnvioMetodo === val ? 'white' : '#374151', border: `1px solid ${nuevoEnvioMetodo === val ? AZUL : '#E5E7EB'}`, fontSize: '11px', fontWeight: nuevoEnvioMetodo === val ? '700' : '400' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {(nuevoEnvioMetodo === 'whatsapp' || nuevoEnvioMetodo === 'ambos') && !nuevoTelefono && (
                  <p style={{ fontSize: '10.5px', color: '#DC2626', margin: '4px 0 0' }}>⚠️ Ingresa el teléfono para enviar por WhatsApp</p>
                )}
              </div>
              {organizaciones.length > 0 && (
                <div>
                  <label style={{ fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280', display: 'block', marginBottom: '3px' }}>Organización (opcional)</label>
                  <select value={nuevoOrgId} onChange={e => setNuevoOrgId(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', fontFamily: 'inherit', background: 'white' }}>
                    <option value="">— Individual (sin organización) —</option>
                    {organizaciones.filter((o: any) => o.activo).map((o: any) => <option key={o.id} value={o.id}>{o.nombre} ({o.plan})</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => { setShowNuevoUsuario(false); setErrorUsuario(''); setNuevoEmail(''); setNuevoPassword(''); setNuevoNombre(''); setNuevoTelefono(''); setNuevoOrgId(''); setNuevoEnvioMetodo('email') }}
                  style={{ flex: 1, padding: '10px', background: '#F8FAFC', color: '#374151', border: '1px solid #E5E7EB', fontSize: '12px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                <button onClick={crearUsuario} disabled={creandoUsuario}
                  style={{ flex: 1, padding: '10px', background: NARANJA, color: 'white', border: 'none', fontSize: '12px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit', opacity: creandoUsuario ? 0.6 : 1 }}>
                  {creandoUsuario ? 'Creando...' : 'Crear asesor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal cambiar contraseña ── */}
      {showCambiarPwd && (
        <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '360px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ background: AZUL, padding: '14px 20px' }}><p style={{ fontSize: '14px', fontWeight: '700' as const, color: 'white', margin: 0 }}>🔑 Cambiar contraseña</p></div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280', display: 'block', marginBottom: '3px' }}>Nueva contraseña</label>
                <input type="password" value={nuevoPassword} onChange={e => setNuevoPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
              </div>
              {errorUsuario && <p style={{ fontSize: '12px', color: '#DC2626', margin: 0 }}>{errorUsuario}</p>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setShowCambiarPwd(false); setErrorUsuario(''); setNuevoPassword('') }}
                  style={{ flex: 1, padding: '10px', background: '#F8FAFC', color: '#374151', border: '1px solid #E5E7EB', fontSize: '12px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                <button onClick={async () => {
                  if (nuevoPassword.length < 6) { setErrorUsuario('Mínimo 6 caracteres'); return }
                  const { data: { session } } = await supabase.auth.getSession()
                  const uid = session?.user?.id
                  const res = await fetch('/api/admin/usuarios', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _uid: uid, id: usuarioEditando, password: nuevoPassword }) })
                  const json = await res.json()
                  if (json.ok) { setShowCambiarPwd(false); setErrorUsuario(''); setNuevoPassword('') }
                  else setErrorUsuario(json.error)
                }} style={{ flex: 1, padding: '10px', background: AZUL, color: 'white', border: 'none', fontSize: '12px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Actualizar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

export default function AdminFormulasPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>Cargando...</div>}>
      <AdminFormulasInner />
    </Suspense>
  )
}
