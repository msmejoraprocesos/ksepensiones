'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B', NARANJA = '#F05B21', VERDE = '#2E8B57'
const fmtNum = (n: number) => new Intl.NumberFormat('es-MX').format(n || 0)
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtFecha = (s: string | null) => { if (!s) return '—'; try { const [y,m,d] = s.slice(0,10).split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }) } catch { return s } }

function generarPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyz', upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const nums = '23456789', syms = '!@#$%&*'
  const pwd = upper[Math.floor(Math.random()*upper.length)] + chars[Math.floor(Math.random()*chars.length)] + chars[Math.floor(Math.random()*chars.length)] + nums[Math.floor(Math.random()*nums.length)] + nums[Math.floor(Math.random()*nums.length)] + syms[Math.floor(Math.random()*syms.length)] + upper[Math.floor(Math.random()*upper.length)] + chars[Math.floor(Math.random()*chars.length)] + nums[Math.floor(Math.random()*nums.length)] + syms[Math.floor(Math.random()*syms.length)]
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

function abrirWhatsApp(nombre: string, email: string, password: string, telefono: string) {
  const msg = `🔷 *KSE PENSIONES*\n_Sistema de Diagnóstico Pensional_\n\nHola *${nombre}* 👋\n\nTu cuenta ha sido creada exitosamente. Aquí están tus datos de acceso:\n\n━━━━━━━━━━━━━━━\n📧 *Usuario:* ${email}\n🔑 *Contraseña:* ${password}\n━━━━━━━━━━━━━━━\n\n🌐 *Accede aquí:*\nhttps://ksepensiones.vercel.app\n\n⚠️ _Por seguridad, cambia tu contraseña en tu primer acceso desde Configuración._\n\n¡Bienvenido al equipo! 💼✨`
  const tel = telefono.replace(/\D/g, '')
  window.open(`https://wa.me/${tel.startsWith('52') ? tel : '52'+tel}?text=${encodeURIComponent(msg)}`, '_blank')
}

export default function OrgAdminPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'dashboard' | 'equipo' | 'reasignacion'>('dashboard')
  const [org, setOrg] = useState<any>(null)
  const [myId, setMyId] = useState('')
  const [asesores, setAsesores] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [stats, setStats] = useState({ clientes: 0, diagnosticos: 0, autorizados: 0, asientos_usados: 0 })

  // Nuevo asesor
  const [showNuevo, setShowNuevo] = useState(false)
  const [formNuevo, setFormNuevo] = useState({ nombre: '', email: '', password: '', telefono: '', envio: 'whatsapp' as 'email'|'whatsapp'|'ambos' })
  const [creando, setCreando] = useState(false)
  const [errNuevo, setErrNuevo] = useState('')

  // Cambiar contraseña
  const [showPwd, setShowPwd] = useState(false)
  const [pwdAsesorId, setPwdAsesorId] = useState('')
  const [pwdNueva, setPwdNueva] = useState('')
  const [pwdErr, setPwdErr] = useState('')

  // Inactivar asesor
  const [showInactivar, setShowInactivar] = useState(false)
  const [asesorInactivar, setAsesorInactivar] = useState<any>(null)
  const [clientesAsesor, setClientesAsesor] = useState<any[]>([])
  const [reasignaciones, setReasignaciones] = useState<Record<string, string>>({})
  const [modoReasig, setModoReasig] = useState<'manual' | 'auto'>('manual')
  const [inactivando, setInactivando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setMyId(session.user.id)
      const { data: p } = await supabase.from('perfiles_usuario').select('rol, organizacion_id').eq('id', session.user.id).single()
      if (!p || !['org_admin', 'super_admin'].includes(p.rol ?? '')) { router.push('/dashboard'); return }
      if (!p.organizacion_id) { router.push('/dashboard'); return }
      await loadAll(p.organizacion_id)
      setLoading(false)
    })
  }, [])

  async function loadAll(orgId: string) {
    const [{ data: orgData }, { data: asesData }, { data: pagosData }] = await Promise.all([
      supabase.from('organizaciones').select('*').eq('id', orgId).single(),
      supabase.from('perfiles_usuario').select('*').eq('organizacion_id', orgId).order('nombre'),
      supabase.from('pagos_suscripcion').select('*').eq('organizacion_id', orgId).order('periodo_inicio', { ascending: false }),
    ])
    setOrg(orgData)
    setPagos(pagosData ?? [])
    if (asesData && asesData.length > 0) {
      const ids = asesData.map((a: any) => a.id)
      const [{ data: clis }, { data: diags }] = await Promise.all([
        supabase.from('clientes').select('asesor_id').in('asesor_id', ids),
        supabase.from('diagnosticos').select('asesor_id, estatus').in('asesor_id', ids),
      ])
      const enriched = asesData.map((a: any) => ({
        ...a,
        clientes: (clis ?? []).filter((c: any) => c.asesor_id === a.id).length,
        diagnosticos: (diags ?? []).filter((d: any) => d.asesor_id === a.id).length,
        autorizados: (diags ?? []).filter((d: any) => d.asesor_id === a.id && d.estatus === 'autorizado').length,
      }))
      setAsesores(enriched)
      setStats({
        clientes: (clis ?? []).length,
        diagnosticos: (diags ?? []).length,
        autorizados: (diags ?? []).filter((d: any) => d.estatus === 'autorizado').length,
        asientos_usados: asesData.filter((a: any) => a.activo !== false).length,
      })
    }
  }

  async function crearAsesor() {
    setErrNuevo('')
    const { nombre, email, password, telefono } = formNuevo
    if (!nombre || !email || !password || !telefono) { setErrNuevo('Todos los campos son obligatorios'); return }
    if (password.length < 10) { setErrNuevo('La contraseña debe tener mínimo 10 caracteres'); return }
    setCreando(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, nombre, telefono, rol: 'asesor', organizacion_id: org.id }),
    })
    const data = await res.json()
    if (!res.ok) { setErrNuevo(data.error || 'Error al crear asesor'); setCreando(false); return }
    if ((formNuevo.envio === 'whatsapp' || formNuevo.envio === 'ambos') && telefono) {
      abrirWhatsApp(nombre, email, password, telefono)
    }
    setShowNuevo(false)
    setFormNuevo({ nombre: '', email: '', password: '', telefono: '', envio: 'whatsapp' })
    await loadAll(org.id)
    setCreando(false)
  }

  async function cambiarPassword() {
    if (pwdNueva.length < 10) { setPwdErr('Mínimo 10 caracteres'); return }
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pwdAsesorId, password: pwdNueva }),
    })
    const data = await res.json()
    if (data.ok) { setShowPwd(false); setPwdNueva(''); setPwdErr('') }
    else setPwdErr(data.error || 'Error')
  }

  async function iniciarInactivar(asesor: any) {
    setAsesorInactivar(asesor)
    const { data } = await supabase.from('clientes').select('id, nombre').eq('asesor_id', asesor.id).neq('activo', false)
    setClientesAsesor(data ?? [])
    setReasignaciones({})
    setModoReasig('manual')
    setShowInactivar(true)
    setTab('reasignacion')
  }

  async function confirmarInactivar() {
    if (!asesorInactivar) return
    const activosRestantes = asesores.filter((a: any) => a.id !== asesorInactivar.id && a.activo !== false)

    if (clientesAsesor.length > 0) {
      if (modoReasig === 'auto') {
        // Distribuir equitativamente entre asesores activos
        for (let i = 0; i < clientesAsesor.length; i++) {
          const destino = activosRestantes[i % activosRestantes.length]
          await supabase.from('clientes').update({ asesor_id: destino.id }).eq('id', clientesAsesor[i].id)
        }
      } else {
        // Reasignación manual
        const sinAsignar = clientesAsesor.filter(c => !reasignaciones[c.id])
        if (sinAsignar.length > 0) { alert(`Faltan ${sinAsignar.length} clientes por asignar`); return }
        for (const [clienteId, asesorId] of Object.entries(reasignaciones)) {
          await supabase.from('clientes').update({ asesor_id: asesorId }).eq('id', clienteId)
        }
      }
    }

    // Inactivar asesor
    setInactivando(true)
    await supabase.from('perfiles_usuario').update({ activo: false }).eq('id', asesorInactivar.id)
    setShowInactivar(false)
    setAsesorInactivar(null)
    setTab('equipo')
    await loadAll(org.id)
    setInactivando(false)
  }

  async function reactivarAsesor(asesorId: string) {
    if (!confirm('¿Reactivar este asesor?')) return
    await supabase.from('perfiles_usuario').update({ activo: true }).eq('id', asesorId)
    await loadAll(org.id)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: '#9CA3AF' }}>Cargando...</div>
  if (!org) return null

  const CARD = { background: 'white', border: '1px solid #E5E7EB', padding: '16px' }
  const pctAsientos = org.asientos > 0 ? Math.round((stats.asientos_usados / org.asientos) * 100) : 0
  const pagosPendientes = pagos.filter((p: any) => ['pendiente','vencido'].includes(p.estatus))
  const asesoresActivos = asesores.filter((a: any) => a.activo !== false)
  const asesoresInactivos = asesores.filter((a: any) => a.activo === false)

  return (
    <div style={{ minHeight: '100vh', background: '#F4F6FB' }}>
      {/* Header */}
      <div style={{ position: 'sticky' as const, top: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #E5E7EB', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: '800' as const, color: AZUL, margin: 0 }}>📊 {org.nombre}</h1>
          <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>Panel de equipo · Plan {org.plan} · {org.asientos} asientos</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['dashboard', 'equipo'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '6px 14px', background: tab === t ? AZUL : '#F4F6FB', color: tab === t ? 'white' : '#6B7280', border: `1px solid ${tab === t ? AZUL : '#E5E7EB'}`, fontSize: '12px', fontWeight: (tab === t ? '700' : '400') as const, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t === 'dashboard' ? '📈 Actividad' : '👥 Mi Equipo'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>

        {/* Alertas */}
        {pagosPendientes.length > 0 && (
          <div style={{ background: '#FEF2F2', border: '2px solid #FCA5A5', borderLeft: '4px solid #DC2626', padding: '12px 16px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#991B1B', margin: '0 0 4px' }}>⚠️ {pagosPendientes.length} pago(s) pendiente(s)</p>
            <p style={{ fontSize: '11px', color: '#991B1B', margin: 0 }}>Contacta a tu administrador de KSE Pensiones para regularizar.</p>
          </div>
        )}

        {/* ── TAB: DASHBOARD ── */}
        {tab === 'dashboard' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {[
                { label: 'Asientos activos', value: `${stats.asientos_usados}/${org.asientos}`, color: pctAsientos >= 90 ? '#DC2626' : AZUL },
                { label: 'Clientes totales', value: fmtNum(stats.clientes), color: NARANJA },
                { label: 'Diagnósticos', value: fmtNum(stats.diagnosticos), color: VERDE },
                { label: 'Autorizados', value: fmtNum(stats.autorizados), color: '#7C3AED' },
              ].map((k, i) => (
                <div key={i} style={{ ...CARD, borderLeft: `3px solid ${k.color}` }}>
                  <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>{k.label}</div>
                  <div style={{ fontSize: '24px', fontWeight: '800' as const, color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Barra asientos */}
            <div style={CARD}>
              <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#374151', margin: '0 0 8px' }}>Capacidad del equipo</p>
              <div style={{ background: '#F4F6FB', height: '8px', borderRadius: '4px', overflow: 'hidden' as const }}>
                <div style={{ width: `${Math.min(100, pctAsientos)}%`, height: '100%', background: pctAsientos >= 90 ? '#DC2626' : AZUL }} />
              </div>
              <p style={{ fontSize: '11px', color: '#6B7280', margin: '6px 0 0' }}>
                {stats.asientos_usados} de {org.asientos} asientos en uso
                {pctAsientos >= 90 && ' · ⚠️ Contacta a KSE para ampliar'}
              </p>
            </div>

            {/* Tabla actividad */}
            <div style={CARD}>
              <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151', margin: '0 0 12px' }}>Actividad por asesor</p>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>{['Asesor','Rol','Clientes','Diagnósticos','Autorizados'].map((h,i) => <th key={i} style={{ padding:'7px 10px', textAlign:(i>1?'right':'left') as const, fontWeight:'700' as const, color:'#6B7280', borderBottom:'2px solid #E5E7EB', fontSize:'10px', textTransform:'uppercase' as const }}>{h}</th>)}</tr></thead>
                <tbody>
                  {asesoresActivos.map((a: any, i: number) => (
                    <tr key={a.id} style={{ borderBottom:'1px solid #F3F4F6', background: i%2===0?'white':'#FAFAFA' }}>
                      <td style={{ padding:'8px 10px', fontWeight:'600' as const }}>{a.nombre||'—'}</td>
                      <td style={{ padding:'8px 10px' }}><span style={{ padding:'2px 6px', background: a.rol==='org_admin'?'#EFF6FF':'#F4F6FB', color: a.rol==='org_admin'?'#1D4ED8':'#6B7280', fontSize:'10px', fontWeight:700 }}>{a.rol==='org_admin'?'Líder':'Asesor'}</span></td>
                      <td style={{ padding:'8px 10px', textAlign:'right' as const, color:AZUL, fontWeight:'600' as const }}>{a.clientes}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right' as const }}>{a.diagnosticos}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right' as const, color:VERDE, fontWeight:'600' as const }}>{a.autorizados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Historial pagos */}
            {pagos.length > 0 && (
              <div style={CARD}>
                <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151', margin: '0 0 12px' }}>Historial de suscripción</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '11px' }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>{['Periodo','Concepto','Monto','Estatus'].map((h,i) => <th key={i} style={{ padding:'7px 10px', textAlign:(i>1?'right':'left') as const, fontWeight:'700' as const, color:'#6B7280', borderBottom:'1px solid #E5E7EB' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {pagos.map((p: any, i: number) => {
                      const col: Record<string,string> = { pendiente:'#92400E', pagado:'#065F46', vencido:'#991B1B', cancelado:'#6B7280' }
                      const bg: Record<string,string> = { pendiente:'#FFFBEB', pagado:'#F0FDF4', vencido:'#FEF2F2', cancelado:'#F9FAFB' }
                      return <tr key={p.id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2===0?'white':'#FAFAFA' }}>
                        <td style={{ padding:'6px 10px', color:'#6B7280' }}>{fmtFecha(p.periodo_inicio)} — {fmtFecha(p.periodo_fin)}</td>
                        <td style={{ padding:'6px 10px' }}>{p.concepto}</td>
                        <td style={{ padding:'6px 10px', textAlign:'right' as const, fontWeight:'600' as const }}>{fmtMXN(p.monto)}</td>
                        <td style={{ padding:'6px 10px', textAlign:'right' as const }}><span style={{ padding:'2px 8px', background:bg[p.estatus]??'#F9FAFB', color:col[p.estatus]??'#6B7280', fontSize:'11px', fontWeight:700, textTransform:'capitalize' as const }}>{p.estatus}</span></td>
                      </tr>
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── TAB: MI EQUIPO ── */}
        {tab === 'equipo' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {stats.asientos_usados < org.asientos ? (
                <button onClick={() => { setShowNuevo(true); setErrNuevo('') }}
                  style={{ padding: '8px 16px', background: NARANJA, color: 'white', border: 'none', fontSize: '12px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Nuevo asesor
                </button>
              ) : (
                <p style={{ fontSize: '12px', color: '#DC2626', fontWeight: '600' }}>⚠️ Asientos llenos — contacta a KSE para ampliar</p>
              )}
            </div>

            {/* Asesores activos */}
            <div style={CARD}>
              <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151', margin: '0 0 12px' }}>Asesores activos ({asesoresActivos.length})</p>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>{['Nombre','Correo','Rol','Clientes','Acciones'].map((h,i) => <th key={i} style={{ padding:'7px 10px', textAlign:(i>2?'right':'left') as const, fontWeight:'700' as const, color:'#6B7280', borderBottom:'2px solid #E5E7EB', fontSize:'10px', textTransform:'uppercase' as const }}>{h}</th>)}</tr></thead>
                <tbody>
                  {asesoresActivos.map((a: any, i: number) => (
                    <tr key={a.id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2===0?'white':'#FAFAFA' }}>
                      <td style={{ padding:'8px 10px', fontWeight:'600' as const }}>{a.nombre||'—'}</td>
                      <td style={{ padding:'8px 10px', color:'#6B7280', fontSize:'11px' }}>{a.email_contacto||'—'}</td>
                      <td style={{ padding:'8px 10px' }}><span style={{ padding:'2px 6px', background: a.rol==='org_admin'?'#EFF6FF':'#F4F6FB', color: a.rol==='org_admin'?'#1D4ED8':'#6B7280', fontSize:'10px', fontWeight:700 }}>{a.rol==='org_admin'?'Líder':'Asesor'}</span></td>
                      <td style={{ padding:'8px 10px', textAlign:'right' as const, color:AZUL, fontWeight:'600' as const }}>{a.clientes}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right' as const }}>
                        <div style={{ display:'flex', gap:'4px', justifyContent:'flex-end' }}>
                          <button onClick={() => { setPwdAsesorId(a.id); setPwdNueva(''); setPwdErr(''); setShowPwd(true) }}
                            style={{ padding:'3px 8px', background:'#F4F6FB', color:'#374151', border:'1px solid #E5E7EB', fontSize:'10px', cursor:'pointer', fontFamily:'inherit' }}>
                            🔑 Pwd
                          </button>
                          {a.id !== myId && (
                            <button onClick={() => iniciarInactivar(a)}
                              style={{ padding:'3px 8px', background:'#FEF2F2', color:'#DC2626', border:'1px solid #FCA5A5', fontSize:'10px', cursor:'pointer', fontFamily:'inherit' }}>
                              Inactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {asesoresActivos.length === 0 && <tr><td colSpan={5} style={{ padding:'20px', textAlign:'center' as const, color:'#9CA3AF' }}>Sin asesores activos</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Asesores inactivos */}
            {asesoresInactivos.length > 0 && (
              <div style={CARD}>
                <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151', margin: '0 0 12px' }}>Asesores inactivos ({asesoresInactivos.length})</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>{['Nombre','Correo','Clientes previos',''].map((h,i) => <th key={i} style={{ padding:'7px 10px', textAlign:(i>1?'right':'left') as const, fontWeight:'700' as const, color:'#6B7280', borderBottom:'1px solid #E5E7EB', fontSize:'10px' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {asesoresInactivos.map((a: any, i: number) => (
                      <tr key={a.id} style={{ borderBottom:'1px solid #F3F4F6', background:'#FAFAFA', opacity:0.7 }}>
                        <td style={{ padding:'8px 10px', color:'#6B7280' }}>{a.nombre||'—'}</td>
                        <td style={{ padding:'8px 10px', color:'#9CA3AF', fontSize:'11px' }}>{a.email_contacto||'—'}</td>
                        <td style={{ padding:'8px 10px', textAlign:'right' as const, color:'#9CA3AF' }}>{a.clientes}</td>
                        <td style={{ padding:'8px 10px', textAlign:'right' as const }}>
                          <button onClick={() => reactivarAsesor(a.id)}
                            style={{ padding:'3px 8px', background:'#F0FDF4', color:'#065F46', border:'1px solid #86EFAC', fontSize:'10px', cursor:'pointer', fontFamily:'inherit' }}>
                            Reactivar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── TAB: REASIGNACIÓN ── */}
        {tab === 'reasignacion' && asesorInactivar && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderLeft: '4px solid #DC2626', padding: '14px 16px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#991B1B', margin: '0 0 4px' }}>⚠️ Antes de inactivar a {asesorInactivar.nombre}</p>
              <p style={{ fontSize: '12px', color: '#991B1B', margin: 0 }}>Tiene {clientesAsesor.length} cliente(s) activo(s). Debes reasignarlos antes de continuar.</p>
            </div>

            {clientesAsesor.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['manual', 'auto'] as const).map(m => (
                    <button key={m} onClick={() => setModoReasig(m)}
                      style={{ padding:'7px 14px', background: modoReasig===m ? AZUL : 'white', color: modoReasig===m ? 'white' : '#374151', border:`1px solid ${modoReasig===m ? AZUL : '#E5E7EB'}`, fontSize:'12px', fontWeight:(modoReasig===m?'700':'400') as const, cursor:'pointer', fontFamily:'inherit' }}>
                      {m === 'manual' ? '✋ Reasignación manual' : '🎲 Distribución automática'}
                    </button>
                  ))}
                </div>

                {modoReasig === 'manual' ? (
                  <div style={CARD}>
                    <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#374151', margin: '0 0 10px' }}>Asigna cada cliente a un asesor activo:</p>
                    {clientesAsesor.map((c: any) => (
                      <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
                        <span style={{ fontSize:'13px', fontWeight:'600' as const, color:'#111827' }}>{c.nombre}</span>
                        <select value={reasignaciones[c.id] || ''} onChange={e => setReasignaciones(r => ({ ...r, [c.id]: e.target.value }))}
                          style={{ padding:'5px 8px', border:`1px solid ${reasignaciones[c.id] ? '#86EFAC' : '#E5E7EB'}`, fontSize:'12px', fontFamily:'inherit', background:'white', minWidth:'160px' }}>
                          <option value=''>— Seleccionar asesor —</option>
                          {asesoresActivos.filter((a: any) => a.id !== asesorInactivar.id).map((a: any) => (
                            <option key={a.id} value={a.id}>{a.nombre}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ ...CARD, background: '#F0FDF4', border: '1px solid #86EFAC' }}>
                    <p style={{ fontSize: '13px', color: '#065F46', margin: 0 }}>
                      ✓ Los {clientesAsesor.length} clientes se distribuirán automáticamente entre los {asesoresActivos.length - 1} asesores activos restantes.
                    </p>
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setTab('equipo'); setAsesorInactivar(null) }}
                style={{ flex: 1, padding:'10px', background:'white', color:'#374151', border:'1px solid #E5E7EB', fontSize:'13px', fontWeight:'600' as const, cursor:'pointer', fontFamily:'inherit' }}>
                Cancelar
              </button>
              <button onClick={confirmarInactivar} disabled={inactivando || (clientesAsesor.length > 0 && modoReasig === 'manual' && clientesAsesor.some((c: any) => !reasignaciones[c.id]))}
                style={{ flex: 1, padding:'10px', background:'#DC2626', color:'white', border:'none', fontSize:'13px', fontWeight:'700' as const, cursor:'pointer', fontFamily:'inherit',
                  opacity: (inactivando || (clientesAsesor.length > 0 && modoReasig === 'manual' && clientesAsesor.some((c: any) => !reasignaciones[c.id]))) ? 0.5 : 1 }}>
                {inactivando ? 'Procesando...' : clientesAsesor.length === 0 ? 'Inactivar asesor' : 'Reasignar e inactivar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal nuevo asesor ── */}
      {showNuevo && (
        <div style={{ position:'fixed' as const, inset:0, background:'rgba(15,23,42,0.6)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:'white', width:'100%', maxWidth:'420px', boxShadow:'0 24px 64px rgba(0,0,0,0.3)', borderRadius:'8px', overflow:'hidden' }}>
            <div style={{ background:AZUL, padding:'14px 20px' }}><p style={{ fontSize:'14px', fontWeight:'700' as const, color:'white', margin:0 }}>+ Nuevo asesor</p></div>
            <div style={{ padding:'20px', display:'flex', flexDirection:'column' as const, gap:'10px' }}>
              {errNuevo && <p style={{ fontSize:'12px', color:'#DC2626', margin:0, padding:'8px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:'4px' }}>{errNuevo}</p>}
              {[
                { label:'Nombre completo *', key:'nombre', type:'text', placeholder:'Ej. María García' },
                { label:'Correo electrónico *', key:'email', type:'email', placeholder:'asesor@empresa.com' },
                { label:'Teléfono WhatsApp *', key:'telefono', type:'tel', placeholder:'Ej. 4421234567' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:'10.5px', fontWeight:'600' as const, color:'#6B7280', display:'block', marginBottom:'3px' }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={(formNuevo as any)[f.key]} onChange={e => setFormNuevo(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', fontSize:'13px', boxSizing:'border-box' as const, fontFamily:'inherit', borderRadius:'4px' }} />
                </div>
              ))}
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                  <label style={{ fontSize:'10.5px', fontWeight:'600' as const, color:'#6B7280' }}>Contraseña temporal *</label>
                  <button type="button" onClick={() => setFormNuevo(p => ({ ...p, password: generarPassword() }))}
                    style={{ fontSize:'11px', color:NARANJA, background:'none', border:'none', cursor:'pointer', fontWeight:'600' as const, fontFamily:'inherit' }}>🎲 Generar</button>
                </div>
                <input type="text" placeholder="Mínimo 10 caracteres" value={formNuevo.password} onChange={e => setFormNuevo(p => ({ ...p, password: e.target.value }))}
                  style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', fontSize:'13px', boxSizing:'border-box' as const, fontFamily:'inherit', borderRadius:'4px', fontWeight:'600' }} />
              </div>
              <div>
                <label style={{ fontSize:'10.5px', fontWeight:'600' as const, color:'#6B7280', display:'block', marginBottom:'4px' }}>¿Cómo enviar las credenciales?</label>
                <div style={{ display:'flex', gap:'6px' }}>
                  {(['email','whatsapp','ambos'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setFormNuevo(p => ({ ...p, envio: v }))}
                      style={{ flex:1, padding:'6px 4px', background: formNuevo.envio===v ? AZUL : '#F4F6FB', color: formNuevo.envio===v ? 'white' : '#374151', border:`1px solid ${formNuevo.envio===v ? AZUL : '#E5E7EB'}`, fontSize:'11px', fontWeight:(formNuevo.envio===v?'700':'400') as const, cursor:'pointer', fontFamily:'inherit', borderRadius:'4px' }}>
                      {v === 'email' ? '📧 Email' : v === 'whatsapp' ? '💬 WhatsApp' : '📧+💬 Ambos'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
                <button onClick={() => { setShowNuevo(false); setErrNuevo(''); setFormNuevo({ nombre:'', email:'', password:'', telefono:'', envio:'whatsapp' }) }}
                  style={{ flex:1, padding:'10px', background:'#F8FAFC', color:'#374151', border:'1px solid #E5E7EB', fontSize:'12px', fontWeight:'600' as const, cursor:'pointer', fontFamily:'inherit', borderRadius:'4px' }}>Cancelar</button>
                <button onClick={crearAsesor} disabled={creando}
                  style={{ flex:1, padding:'10px', background:NARANJA, color:'white', border:'none', fontSize:'12px', fontWeight:'700' as const, cursor:'pointer', fontFamily:'inherit', borderRadius:'4px', opacity:creando?0.6:1 }}>
                  {creando ? 'Creando...' : 'Crear asesor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal cambiar contraseña ── */}
      {showPwd && (
        <div style={{ position:'fixed' as const, inset:0, background:'rgba(15,23,42,0.6)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:'white', width:'100%', maxWidth:'360px', boxShadow:'0 24px 64px rgba(0,0,0,0.3)', borderRadius:'8px', overflow:'hidden' }}>
            <div style={{ background:AZUL, padding:'14px 20px' }}><p style={{ fontSize:'14px', fontWeight:'700' as const, color:'white', margin:0 }}>🔑 Cambiar contraseña</p></div>
            <div style={{ padding:'20px', display:'flex', flexDirection:'column' as const, gap:'10px' }}>
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                  <label style={{ fontSize:'10.5px', fontWeight:'600' as const, color:'#6B7280' }}>Nueva contraseña</label>
                  <button type="button" onClick={() => setPwdNueva(generarPassword())}
                    style={{ fontSize:'11px', color:NARANJA, background:'none', border:'none', cursor:'pointer', fontWeight:'600' as const, fontFamily:'inherit' }}>🎲 Generar</button>
                </div>
                <input type="text" value={pwdNueva} onChange={e => { setPwdNueva(e.target.value); setPwdErr('') }} placeholder="Mínimo 10 caracteres"
                  style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', fontSize:'13px', boxSizing:'border-box' as const, fontFamily:'inherit', borderRadius:'4px', fontWeight:'600' }} />
              </div>
              {pwdErr && <p style={{ fontSize:'12px', color:'#DC2626', margin:0 }}>{pwdErr}</p>}
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={() => { setShowPwd(false); setPwdNueva(''); setPwdErr('') }}
                  style={{ flex:1, padding:'10px', background:'#F8FAFC', color:'#374151', border:'1px solid #E5E7EB', fontSize:'12px', fontWeight:'600' as const, cursor:'pointer', fontFamily:'inherit', borderRadius:'4px' }}>Cancelar</button>
                <button onClick={cambiarPassword}
                  style={{ flex:1, padding:'10px', background:AZUL, color:'white', border:'none', fontSize:'12px', fontWeight:'700' as const, cursor:'pointer', fontFamily:'inherit', borderRadius:'4px' }}>
                  Actualizar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
