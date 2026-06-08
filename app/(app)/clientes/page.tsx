'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const AZUL = '#1F3A5F'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  notas: string | null
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

const TIPO_ICONS: Record<string, string> = {
  llamada: '📞', whatsapp: '💬', cita: '📅', email: '✉️', nota: '📝',
}

export default function ClientesPage() {
  const supabase = createClientComponentClient()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[]>([])
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [modalTab, setModalTab] = useState<'info' | 'diagnosticos' | 'actividades'>('info')
  const [showNuevo, setShowNuevo] = useState(false)
  const [userId, setUserId] = useState<string>('')

  // Form nuevo cliente
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', notas: '' })
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
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('asesor_id', uid)
      .order('created_at', { ascending: false })
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

  async function saveCliente() {
    if (!form.nombre.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('clientes').insert({
      asesor_id: userId,
      nombre: form.nombre,
      telefono: form.telefono || null,
      email: form.email || null,
      notas: form.notas || null,
    }).select().single()
    if (!error && data) {
      setClientes(prev => [data as Cliente, ...prev])
      setForm({ nombre: '', telefono: '', email: '', notas: '' })
      setShowNuevo(false)
    }
    setSaving(false)
  }

  async function deleteCliente(id: string) {
    if (!confirm('¿Eliminar este cliente?')) return
    await supabase.from('clientes').delete().eq('id', id)
    setClientes(prev => prev.filter(c => c.id !== id))
    setSelectedCliente(null)
  }

  const filtered = clientes.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.telefono ?? '').includes(search)
  )

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const fmtMoney = (n: number | null) => n != null ? `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}` : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{ color: AZUL, fontSize: '20px', fontWeight: '700', margin: 0, flex: 1 }}>Clientes</h1>
        <input
          placeholder="Buscar por nombre, email o teléfono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '280px', outline: 'none' }}
        />
        <button onClick={() => setShowNuevo(true)}
          style={{ background: AZUL, color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          + Nuevo cliente
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Cargando clientes...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
            <div style={{ color: '#64748b', fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>
              {search ? 'Sin resultados' : 'Sin clientes aún'}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>
              {search ? 'Intenta con otro término' : 'Agrega tu primer cliente con el botón de arriba'}
            </div>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#F8FAFC' }}>
                  {['Nombre', 'Teléfono', 'Email', 'Último contacto', 'Alta', ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
                    onClick={() => openExpediente(c)}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', background: AZUL, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>
                          {c.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{c.nombre}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{c.telefono ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{c.email ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{fmt(c.ultimo_contacto)}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{fmt(c.created_at)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ color: NARANJA, fontSize: '13px', fontWeight: '600' }}>Ver expediente →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Expediente */}
      {selectedCliente && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedCliente(null) }}>
          <div style={{ width: '520px', height: '100vh', background: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '44px', height: '44px', background: AZUL, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '18px', fontWeight: '700' }}>
                {selectedCliente.nombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{selectedCliente.nombre}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Alta: {fmt(selectedCliente.created_at)}</div>
              </div>
              <button onClick={() => setSelectedCliente(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
              {(['info', 'diagnosticos', 'actividades'] as const).map(tab => (
                <button key={tab} onClick={() => setModalTab(tab)}
                  style={{ padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: modalTab === tab ? '700' : '400', color: modalTab === tab ? AZUL : '#64748b', borderBottom: modalTab === tab ? `2px solid ${AZUL}` : '2px solid transparent', marginBottom: '-1px' }}>
                  {tab === 'info' ? 'Datos' : tab === 'diagnosticos' ? `Diagnósticos (${diagnosticos.length})` : `Actividades (${actividades.length})`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              {modalTab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {[
                    { label: 'Nombre completo', value: selectedCliente.nombre },
                    { label: 'Teléfono', value: selectedCliente.telefono ?? '—' },
                    { label: 'Email', value: selectedCliente.email ?? '—' },
                    { label: 'Último contacto', value: fmt(selectedCliente.ultimo_contacto) },
                    { label: 'Notas', value: selectedCliente.notas ?? '—' },
                  ].map((f, i) => (
                    <div key={i}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{f.label}</div>
                      <div style={{ fontSize: '14px', color: '#1e293b' }}>{f.value}</div>
                    </div>
                  ))}
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <a href={`/calculadora?cliente=${selectedCliente.id}`}
                      style={{ flex: 1, padding: '10px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                      Nueva calculadora
                    </a>
                    <button onClick={() => deleteCliente(selectedCliente.id)}
                      style={{ padding: '10px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
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
                        <span style={{ background: d.ley === '73' ? '#EEF2F8' : '#EEF7F1', color: d.ley === '73' ? AZUL : VERDE, fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px' }}>Ley {d.ley}</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{fmt(d.created_at)}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
                        <div><span style={{ color: '#94a3b8' }}>Semanas: </span><strong>{d.semanas}</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>Retiro: </span><strong>{d.edad_retiro} años</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>Pensión IMSS: </span><strong style={{ color: VERDE }}>{fmtMoney(d.resultado_e1)}/mes</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>Con AFORE: </span><strong style={{ color: AZUL }}>{fmtMoney(d.resultado_e2)}/mes</strong></div>
                      </div>
                      {d.notas && <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>{d.notas}</div>}
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
                      <div style={{ fontSize: '18px' }}>{TIPO_ICONS[a.tipo] ?? '📌'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{a.titulo}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{a.fecha_programada ? fmt(a.fecha_programada) : 'Sin fecha'}</div>
                        {a.notas && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{a.notas}</div>}
                      </div>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', fontWeight: '600', background: a.estatus === 'completado' ? '#f0fdf4' : '#FEF4EC', color: a.estatus === 'completado' ? VERDE : NARANJA }}>
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

      {/* Modal Nuevo Cliente */}
      {showNuevo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowNuevo(false) }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '28px', width: '440px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h2 style={{ color: AZUL, fontSize: '18px', fontWeight: '700', margin: '0 0 20px' }}>Nuevo cliente</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Nombre completo *', key: 'nombre', type: 'text', placeholder: 'Ej. Juan Pérez García' },
                { label: 'Teléfono', key: 'telefono', type: 'tel', placeholder: '55 1234 5678' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'juan@ejemplo.com' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Notas</label>
                <textarea placeholder="Observaciones iniciales..."
                  value={form.notas}
                  onChange={e => setForm(prev => ({ ...prev, notas: e.target.value }))}
                  rows={3}
                  style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', resize: 'none', outline: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowNuevo(false)}
                style={{ flex: 1, padding: '10px', background: '#F1F5F9', color: '#64748b', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={saveCliente} disabled={saving || !form.nombre.trim()}
                style={{ flex: 2, padding: '10px', background: saving || !form.nombre.trim() ? '#94a3b8' : AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Guardando...' : 'Guardar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
