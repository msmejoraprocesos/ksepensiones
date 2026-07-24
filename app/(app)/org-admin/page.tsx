'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B', NARANJA = '#F05B21', VERDE = '#2E8B57'
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtNum = (n: number) => new Intl.NumberFormat('es-MX').format(n || 0)
const fmtFecha = (s: string | null) => { if (!s) return '—'; try { const [y,m,d] = s.slice(0,10).split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }) } catch { return s } }

export default function OrgAdminDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [asesores, setAsesores] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [stats, setStats] = useState({ clientes: 0, diagnosticos: 0, autorizados: 0, asientos_usados: 0 })

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
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
      supabase.from('perfiles_usuario').select('*').eq('organizacion_id', orgId),
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
        asientos_usados: asesData.length,
      })
    }
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: '#9CA3AF' }}>Cargando...</div>
  if (!org) return null

  const CARD = { background: 'white', border: '1px solid #E5E7EB', padding: '16px' }
  const pctAsientos = org.asientos > 0 ? Math.round((stats.asientos_usados / org.asientos) * 100) : 0
  const pagosPendientes = pagos.filter((p: any) => ['pendiente','vencido'].includes(p.estatus))

  return (
    <div style={{ minHeight: '100vh', background: '#F4F6FB' }}>
      <div style={{ position: 'sticky' as const, top: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #E5E7EB', padding: '12px 24px' }}>
        <h1 style={{ fontSize: '16px', fontWeight: '800' as const, color: AZUL, margin: 0 }}>📊 {org.nombre}</h1>
        <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>Panel de equipo · Plan {org.plan} · {org.asientos} asientos</p>
      </div>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
        {pagosPendientes.length > 0 && (
          <div style={{ background: '#FEF2F2', border: '2px solid #FCA5A5', borderLeft: '4px solid #DC2626', padding: '12px 16px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#991B1B', margin: '0 0 4px' }}>⚠️ {pagosPendientes.length} pago(s) pendiente(s)</p>
            <p style={{ fontSize: '11px', color: '#991B1B', margin: 0 }}>Contacta a tu administrador de KSE Pensiones.</p>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { label: 'Asientos en uso', value: `${stats.asientos_usados}/${org.asientos}`, color: pctAsientos >= 90 ? '#DC2626' : AZUL },
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
        <div style={{ ...CARD }}>
          <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#374151', margin: '0 0 8px' }}>Actividad del equipo</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
            <thead><tr style={{ background: '#F8FAFC' }}>{['Asesor','Email','Clientes','Diagnósticos','Autorizados'].map((h,i) => <th key={i} style={{ padding: '7px 10px', textAlign: (i>1?'right':'left') as const, fontWeight: '700' as const, color: '#6B7280', borderBottom: '2px solid #E5E7EB', fontSize: '10px', textTransform: 'uppercase' as const }}>{h}</th>)}</tr></thead>
            <tbody>
              {asesores.map((a: any, i: number) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #F3F4F6', background: i%2===0?'white':'#FAFAFA' }}>
                  <td style={{ padding: '8px 10px', fontWeight: '600' as const }}>{a.nombre||'—'}</td>
                  <td style={{ padding: '8px 10px', color: '#6B7280', fontSize: '11px' }}>{a.email}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: AZUL, fontWeight: '600' as const }}>{a.clientes}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' as const }}>{a.diagnosticos}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: VERDE, fontWeight: '600' as const }}>{a.autorizados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagos.length > 0 && (
          <div style={CARD}>
            <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151', margin: '0 0 12px' }}>Historial de suscripción</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '11px' }}>
              <thead><tr style={{ background: '#F8FAFC' }}>{['Periodo','Concepto','Monto','Estatus'].map((h,i) => <th key={i} style={{ padding:'7px 10px', textAlign:(i>1?'right':'left') as const, fontWeight:'700' as const, color:'#6B7280', borderBottom:'1px solid #E5E7EB' }}>{h}</th>)}</tr></thead>
              <tbody>
                {pagos.map((p: any, i: number) => {
                  const col: Record<string,string> = { pendiente:'#92400E', pagado:'#065F46', vencido:'#991B1B', cancelado:'#6B7280' }
                  const bg: Record<string,string> = { pendiente:'#FFFBEB', pagado:'#F0FDF4', vencido:'#FEF2F2', cancelado:'#F9FAFB' }
                  return (
                    <tr key={p.id} style={{ borderBottom:'1px solid #F3F4F6', background: i%2===0?'white':'#FAFAFA' }}>
                      <td style={{ padding:'6px 10px', color:'#6B7280' }}>{fmtFecha(p.periodo_inicio)} — {fmtFecha(p.periodo_fin)}</td>
                      <td style={{ padding:'6px 10px' }}>{p.concepto}</td>
                      <td style={{ padding:'6px 10px', textAlign:'right' as const, fontWeight:'600' as const }}>{fmtMXN(p.monto)}</td>
                      <td style={{ padding:'6px 10px', textAlign:'right' as const }}><span style={{ padding:'2px 8px', background: bg[p.estatus]??'#F9FAFB', color: col[p.estatus]??'#6B7280', fontSize:'11px', fontWeight:700, textTransform:'capitalize' as const }}>{p.estatus}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
