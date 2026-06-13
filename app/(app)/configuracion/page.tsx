'use client' // v-banner

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F05B21'

interface Perfil {
  nombre: string
  razon_social: string
  rfc: string
  telefono: string
  email_contacto: string
  direccion: string
  logo_url: string | null
  banner_url: string | null
  vigencia_propuesta: number
  uma_diaria: number
  salario_minimo: number
  pmg_mensual: number
  pmg_l97: number
  rendimiento_afore_default: number
  inflacion_uma: number
  mod40_2026: number
  mod40_2027: number
  mod40_2028: number
  mod40_2029: number
  mod40_2030: number
  uma_actualizada_en: string | null
  sm_actualizado_en: string | null
  pmg_actualizado_en: string | null
}

const DEFAULTS: Perfil = {
  nombre: '', razon_social: '', rfc: '', telefono: '', email_contacto: '',
  direccion: '', logo_url: null, banner_url: null, vigencia_propuesta: 30,
  uma_diaria: 117.31, salario_minimo: 315.04, pmg_mensual: 10636.54,
  pmg_l97: 4345.72, rendimiento_afore_default: 6, inflacion_uma: 4.5,
  mod40_2026: 14.438, mod40_2027: 15.528, mod40_2028: 16.619,
  mod40_2029: 17.709, mod40_2030: 18.800,
  uma_actualizada_en: null, sm_actualizado_en: null, pmg_actualizado_en: null,
}

// Validaciones
function validarRFC(rfc: string): string | null {
  if (!rfc) return null
  // Persona física: 4 letras + 6 dígitos fecha + 3 homoclave = 13 chars
  // Persona moral: 3 letras + 6 dígitos fecha + 3 homoclave = 12 chars
  const regexFisica = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/
  const regexMoral = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/
  const upper = rfc.toUpperCase()
  if (!regexFisica.test(upper) && !regexMoral.test(upper)) {
    return 'RFC inválido — debe tener 12 chars (moral) o 13 (física). Ej: SEMM870129'
  }
  return null
}

function validarTelefono(tel: string): string | null {
  if (!tel) return null
  const digits = tel.replace(/\D/g, '')
  if (digits.length !== 10) return `Requiere 10 dígitos (tienes ${digits.length})`
  return null
}

function validarEmail(email: string): string | null {
  if (!email) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Formato inválido. Ej: correo@dominio.com'
  return null
}

function formatTelefono(val: string): string {
  const d = val.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 2) return d
  if (d.length <= 6) return `${d.slice(0,2)} ${d.slice(2)}`
  return `${d.slice(0,2)} ${d.slice(2,6)} ${d.slice(6)}`
}

function formatRFC(val: string): string {
  return val.toUpperCase().replace(/[^A-ZÑ&0-9]/g, '').slice(0, 13)
}

export default function ConfiguracionPage() {
  const supabase = createClient()
  const router = useRouter()
  const [perfil, setPerfil] = useState<Perfil>(DEFAULTS)
  const [userId, setUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof Perfil, string>>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [editing, setEditing] = useState(false)
  const [perfilOriginal, setPerfilOriginal] = useState<Perfil>(DEFAULTS)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      supabase.from('perfiles_usuario').select('*').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (data) {
            const loaded = { ...DEFAULTS, ...data }
            setPerfil(loaded)
            setPerfilOriginal(loaded)
            if (!data.nombre && !data.razon_social) { setIsFirstTime(true); setEditing(true) }
          } else {
            setIsFirstTime(true)
            setEditing(true)
          }
        })
    })
  }, [])

  function validate(): boolean {
    const newErrors: Partial<Record<keyof Perfil, string>> = {}
    // Solo nombre es obligatorio
    if (!perfil.nombre.trim()) newErrors.nombre = 'El nombre es requerido'
    // Solo validar RFC/tel/email si tienen valor (no son obligatorios)
    if (perfil.rfc) {
      const rfcErr = validarRFC(perfil.rfc)
      if (rfcErr) newErrors.rfc = rfcErr
    }
    if (perfil.telefono) {
      const telErr = validarTelefono(perfil.telefono)
      if (telErr) newErrors.telefono = telErr
    }
    if (perfil.email_contacto) {
      const emailErr = validarEmail(perfil.email_contacto)
      if (emailErr) newErrors.email_contacto = emailErr
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function guardar() {
    if (!validate()) return
    setSaving(true)
    setSaveError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id || userId
    if (!uid) {
      setSaveError('Sesión expirada. Recarga la página.')
      setSaving(false)
      return
    }

    // Clean logo_url: if still blob (upload failed or pending), get from DB
    let logoUrl = perfil.logo_url
    if (logoUrl?.startsWith('blob:')) {
      const { data: existing } = await supabase.from('perfiles_usuario').select('logo_url').eq('id', uid).single()
      logoUrl = existing?.logo_url ?? null
    }
    const perfilToSave = { ...perfil, logo_url: logoUrl }

    const { error } = await supabase
      .from('perfiles_usuario')
      .upsert({ id: uid, ...perfilToSave }, { onConflict: 'id' })

    setSaving(false)

    if (error) {
      setSaveError('Error al guardar: ' + error.message)
      return
    }

    setUserId(uid)
    setSaved(true)
    setLastSaved(new Date())
    setIsFirstTime(false)
    setEditing(false)
    const saved_perfil = { ...perfil, logo_url: perfil.logo_url?.startsWith('blob:') ? null : perfil.logo_url }
    setPerfilOriginal(saved_perfil)
    setTimeout(() => setSaved(false), 3000)
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true)
    // Show instant local preview while uploading
    const localUrl = URL.createObjectURL(file)
    setPerfil(p => ({ ...p, logo_url: localUrl }))

    const ext = file.name.split('.').pop()
    const path = `logos/${userId}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      const finalUrl = data.publicUrl + '?t=' + Date.now()
      // Update state with final URL
      setPerfil(p => ({ ...p, logo_url: finalUrl }))
      // Also save logo_url to DB immediately so it persists
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id || userId
      if (uid) {
        await supabase.from('perfiles_usuario').upsert({ id: uid, logo_url: finalUrl }, { onConflict: 'id' })
      }
    } else {
      console.error('Logo upload error:', error)
      // Keep local preview even if upload failed
    }
    if (fileRef.current) fileRef.current.value = ''
    setUploadingLogo(false)
  }

  const set = (k: keyof Perfil, v: any) => {
    setPerfil(p => ({ ...p, [k]: v }))
    if (errors[k]) setErrors(e => ({ ...e, [k]: undefined }))
  }

  const disabledSt: React.CSSProperties = {
    display: 'block', width: '100%', padding: '10px 14px',
    border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px',
    boxSizing: 'border-box' as const, fontFamily: 'inherit',
    background: '#F8FAFC', color: '#374151', cursor: 'default',
    opacity: 1,
  }

  const inputSt = (hasError?: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', padding: '10px 14px',
    border: `1.5px solid ${hasError ? '#ef4444' : '#e2e8f0'}`,
    borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' as const,
    outline: 'none', fontFamily: 'inherit', background: 'white', color: '#1e293b',
  })

  const labelSt: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: '700',
    color: '#475569', marginBottom: '5px',
    textTransform: 'uppercase' as const, letterSpacing: '0.5px',
  }

  const errorMsg = (key: keyof Perfil) => errors[key] ? (
    <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>⚠️ {errors[key]}</p>
  ) : null

  const tooltip = (text: string) => (
    <span title={text} style={{ marginLeft: '4px', fontSize: '11px', color: '#94a3b8', cursor: 'help' }}>ⓘ</span>
  )

  const sectionTitle = (icon: string, title: string, subtitle?: string) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: '20px' }}>{icon}</span>
      <div>
        <h2 style={{ fontSize: '15px', fontWeight: '700', color: AZUL, margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: '12px', color: '#94a3b8', margin: '3px 0 0' }}>{subtitle}</p>}
      </div>
    </div>
  )

  return (
    <div style={{ height: 'calc(100vh - 48px)', overflow: 'auto', background: '#FAFAFA', padding: '0' }}>
      <div style={{ display: 'flex', height: '100%' }}>

        {/* Sidebar de secciones */}
        <div style={{ width: '200px', flexShrink: 0, borderRight: '1px solid #e2e8f0', background: 'white', padding: '16px 0' }}>
          {[
            { id: 'identidad', icon: '👤', label: 'Identidad' },
            { id: 'variables', icon: '📊', label: 'Variables 2026' },
            { id: 'preview', icon: '📄', label: 'Vista previa PDF' },
          ].map(sec => (
            <a key={sec.id} href={`#${sec.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', textDecoration: 'none', color: '#64748b', fontSize: '13px', borderLeft: '3px solid transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F6FB' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              <span>{sec.icon}</span>
              <span>{sec.label}</span>
            </a>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Banner primera vez */}
        {isFirstTime && (
          <div style={{ background: 'linear-gradient(135deg, #1B3A6B, #2c5282)', borderRadius: '14px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '32px' }}>👋</span>
            <div style={{ flex: 1 }}>
              <p style={{ color: 'white', fontSize: '15px', fontWeight: '700', margin: '0 0 4px' }}>¡Bienvenido a KSE Pensiones!</p>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: 0 }}>
                Antes de comenzar, configura tu perfil de asesor. Esta información aparecerá en todas tus propuestas PDF.
              </p>
            </div>
            <button onClick={() => setIsFirstTime(false)}
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px' }}>
              Después
            </button>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: AZUL, margin: 0 }}>Configuración</h1>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>Perfil del asesor · Variables del sistema</p>
          </div>

        </div>

        {/* ── SECCIÓN 1: Identidad ── */}
        <div style={{ background: 'white', borderRadius: '14px', padding: '24px', border: '1px solid #e2e8f0' }}>
          {sectionTitle('👤', 'Identidad del asesor', 'Esta información aparece en el encabezado de tus propuestas PDF')}

          {/* Logo */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelSt}>Logo del asesor</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '90px', height: '70px', border: `2px ${perfil.logo_url ? 'solid #bbf7d0' : 'dashed #e2e8f0'}`, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: perfil.logo_url ? '#f0fdf4' : '#F8FAFC', overflow: 'hidden', flexShrink: 0 }}>
                {perfil.logo_url ? (
                  <img src={perfil.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px' }}>🏢</div>
                    <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>Sin logo</div>
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px', lineHeight: 1.5 }}>
                  Aparece en el PDF de propuesta junto a tu nombre. PNG con fondo transparente recomendado, mínimo 200×80px.
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: (!editing || uploadingLogo) ? '#f1f5f9' : '#EEF2F8', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: (!editing || uploadingLogo) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', color: editing ? AZUL : '#94a3b8' }}>
                    {uploadingLogo ? '⏳ Subiendo...' : '📁 Subir logo'}
                    <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} style={{ display: 'none' }} disabled={uploadingLogo || !editing} />
                  </label>
                  {perfil.logo_url && (
                    <button onClick={() => {
                      setPerfil(p => ({ ...p, logo_url: null }))
                      if (fileRef.current) fileRef.current.value = ''
                    }} style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Quitar
                    </button>
                  )}
                  {perfil.logo_url && <span style={{ fontSize: '11px', color: VERDE, fontWeight: '600' }}>✓ Logo cargado</span>}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div>
              <label style={labelSt}>Nombre del asesor <span style={{ color: '#ef4444' }}>*</span></label>
              <input value={perfil.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej. Juan Pérez González" style={editing ? inputSt(!!errors.nombre) : disabledSt} disabled={!editing} />
              {errorMsg('nombre')}
            </div>
            <div>
              <label style={labelSt}>Razón social / Empresa</label>
              <input value={perfil.razon_social} onChange={e => set('razon_social', e.target.value)} placeholder="Ej. Asesoría Pensional López S.C." style={editing ? inputSt() : disabledSt} disabled={!editing} />
            </div>
            <div>
              <label style={labelSt}>RFC {tooltip('Registro Federal de Contribuyentes. Formato: 4 letras + 6 dígitos fecha + 3 caracteres homoclave. Ej: LOPJ800101XX3')}</label>
              <input value={perfil.rfc} onChange={e => set('rfc', formatRFC(e.target.value))} placeholder="LOPJ800101XX3" maxLength={13} style={editing ? inputSt(!!errors.rfc) : disabledSt} disabled={!editing} />
              {errorMsg('rfc')}
              {!errors.rfc && (perfil.rfc.length === 12 || perfil.rfc.length === 13) && !validarRFC(perfil.rfc) && <p style={{ fontSize: '10px', color: VERDE, margin: '3px 0 0' }}>✓ RFC válido ({perfil.rfc.length === 12 ? 'persona moral' : 'persona física'})</p>}
            </div>
            <div>
              <label style={labelSt}>Teléfono de contacto {tooltip('10 dígitos sin espacios ni guiones. Ej: 4421234567')}</label>
              <input value={perfil.telefono} onChange={e => { const f = formatTelefono(e.target.value); set('telefono', f) }} placeholder="44 2123 4567" maxLength={12} style={editing ? inputSt(!!errors.telefono) : disabledSt} disabled={!editing} />
              {errorMsg('telefono')}
              {!errors.telefono && perfil.telefono.replace(/\D/g,'').length === 10 && <p style={{ fontSize: '10px', color: VERDE, margin: '3px 0 0' }}>✓ Teléfono válido</p>}
            </div>
            <div>
              <label style={labelSt}>Email de contacto</label>
              <input type="email" value={perfil.email_contacto} onChange={e => set('email_contacto', e.target.value)} onBlur={e => { const err = validarEmail(e.target.value); if (err) setErrors(p => ({ ...p, email_contacto: err })) }} placeholder="contacto@tuempresa.com" style={editing ? inputSt(!!errors.email_contacto) : disabledSt} disabled={!editing} />
              {errorMsg('email_contacto')}
              {!errors.email_contacto && perfil.email_contacto && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(perfil.email_contacto) && <p style={{ fontSize: '10px', color: VERDE, margin: '3px 0 0' }}>✓ Email válido</p>}
            </div>
            <div>
              <label style={labelSt}>Vigencia de propuesta (días) {tooltip('Días que es válida la propuesta PDF desde su fecha de emisión')}</label>
              <input type="number" value={perfil.vigencia_propuesta} onChange={e => set('vigencia_propuesta', parseInt(e.target.value) || 30)} min={1} max={365} style={editing ? inputSt() : disabledSt} disabled={!editing} />
              <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>El PDF dirá: "Válida por {perfil.vigencia_propuesta} días a partir de la fecha de emisión"</p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSt}>Dirección / Ciudad</label>
              <input value={perfil.direccion} onChange={e => set('direccion', e.target.value)} placeholder="Ej. Querétaro, Qro." style={editing ? inputSt() : disabledSt} disabled={!editing} />
            </div>
          </div>
        </div>

        {/* ── SECCIÓN 2: Variables del sistema ── */}
        <div style={{ background: 'white', borderRadius: '14px', padding: '24px', border: '1px solid #e2e8f0' }}>
          {sectionTitle('📊', 'Variables del sistema 2026', 'Valores oficiales que usa la calculadora para todos los diagnósticos')}

          {/* Alertas de vigencia - se ocultan si la variable fue actualizada recientemente */}
          {(() => {
            const today = new Date()
            const alerts = [
              { key: 'uma_diaria', label: 'UMA Diaria', mes: 1, dia: 1, url: 'https://www.inegi.org.mx/temas/uma/', fuente: 'INEGI', desc: 'Se actualiza en febrero de cada año', updatedKey: 'uma_actualizada_en' },
              { key: 'salario_minimo', label: 'Salario Mínimo', mes: 0, dia: 1, url: 'https://www.gob.mx/conasami', fuente: 'CONASAMI', desc: 'Se actualiza en enero de cada año', updatedKey: 'sm_actualizado_en' },
              { key: 'pmg_mensual', label: 'PMG Ley 73', mes: 1, dia: 1, url: 'https://www.imss.gob.mx', fuente: 'IMSS', desc: 'Se actualiza en febrero con la UMA', updatedKey: 'pmg_actualizado_en' },
            ]
            const nearAlerts = alerts.filter(a => {
              // Hide if updated within last 30 days
              const updatedAt = (perfil as any)[a.updatedKey]
              if (updatedAt) {
                const daysSinceUpdate = Math.floor((today.getTime() - new Date(updatedAt).getTime()) / 86400000)
                if (daysSinceUpdate < 30) return false
              }
              const updateDate = new Date(today.getFullYear(), a.mes, a.dia)
              if (updateDate < today) { updateDate.setFullYear(today.getFullYear() + 1) }
              const daysLeft = Math.ceil((updateDate.getTime() - today.getTime()) / 86400000)
              return daysLeft <= 60
            })
            if (nearAlerts.length === 0) return null
            return (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '12px 16px', marginBottom: '4px' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#92400e', margin: '0 0 8px' }}>⚠️ Próximas actualizaciones de variables</p>
                {nearAlerts.map(a => {
                  const updateDate = new Date(today.getFullYear(), a.mes, a.dia)
                  if (updateDate < today) updateDate.setFullYear(today.getFullYear() + 1)
                  const daysLeft = Math.ceil((updateDate.getTime() - today.getTime()) / 86400000)
                  return (
                    <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', fontSize: '12px' }}>
                      <span style={{ color: '#92400e', fontWeight: '600' }}>📅 {a.label}</span>
                      <span style={{ color: '#b45309' }}>{a.desc}</span>
                      <span style={{ color: daysLeft <= 14 ? '#ef4444' : '#f59e0b', fontWeight: '700' }}>Faltan {daysLeft} días</span>
                      <a href={a.url} target="_blank" rel="noopener noreferrer"
                        style={{ color: AZUL, fontSize: '11px', textDecoration: 'none', background: '#EEF2F8', padding: '2px 8px', borderRadius: '6px' }}>
                        Ver en {a.fuente} ↗
                      </a>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            {[
              {
                key: 'uma_diaria', label: 'UMA Diaria', unit: '$/día',
                placeholder: '117.31',
                help: 'Unidad de Medida y Actualización. Publicada por INEGI cada febrero. Se usa para calcular el costo de Modalidad 40.',
                badge: 'INEGI 2026', badgeColor: '#3b82f6'
              },
              {
                key: 'salario_minimo', label: 'Salario Mínimo General', unit: '$/día',
                placeholder: '315.04',
                help: 'Salario mínimo diario vigente publicado por CONASAMI. Se usa como base para calcular el SDI en veces salario mínimo.',
                badge: 'CONASAMI 2026', badgeColor: '#8b5cf6'
              },
              {
                key: 'pmg_mensual', label: 'PMG Ley 73', unit: '$/mes',
                placeholder: '10636.54',
                help: 'Pensión Mínima Garantizada para trabajadores bajo Ley 73. Es el piso mínimo que el IMSS garantiza independientemente del cálculo.',
                badge: 'Ley 73', badgeColor: AZUL
              },
              {
                key: 'pmg_l97', label: 'Pensión Garantizada Ley 97', unit: '$/mes',
                placeholder: '4345.72',
                help: 'Pensión mínima garantizada para trabajadores bajo Ley 97 (AFORE). El gobierno la paga si el saldo AFORE no alcanza para una renta suficiente.',
                badge: 'Ley 97', badgeColor: '#0891b2'
              },
              {
                key: 'rendimiento_afore_default', label: 'Rendimiento AFORE', unit: '% anual',
                placeholder: '6',
                help: 'Rendimiento anual promedio estimado para proyectar el crecimiento del saldo AFORE. Se usa como valor default conservador en Ley 97.',
                badge: 'Default conservador', badgeColor: VERDE
              },
              {
                key: 'inflacion_uma', label: 'Inflación estimada', unit: '% anual',
                placeholder: '4.5',
                help: 'Tasa de inflación anual para convertir pensiones futuras a pesos de hoy (poder adquisitivo actual). Permite comparar de forma justa.',
                badge: 'Para pesos de hoy', badgeColor: NARANJA
              },
            ].map(f => (
              <div key={f.key} style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ ...labelSt, marginBottom: 0, flex: 1 }}>{f.label}</label>
                  <span style={{ fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', background: f.badgeColor + '15', color: f.badgeColor, whiteSpace: 'nowrap', marginLeft: '4px' }}>{f.badge}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <input type="number" step="0.01" value={(perfil as any)[f.key]}
                    onChange={e => set(f.key as keyof Perfil, parseFloat(e.target.value) || 0)}
                    placeholder={f.placeholder}
                    style={editing ? { flex: 1, padding: '8px 10px', border: '1.5px solid #2c92d5', borderRadius: '7px', fontSize: '14px', fontWeight: '700', color: '#1e293b', background: '#e8f4fd', outline: 'none', fontFamily: 'inherit' } : { flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '14px', fontWeight: '700', color: '#374151', background: '#F8FAFC', fontFamily: 'inherit', cursor: 'default' }} disabled={!editing} />
                  <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', fontWeight: '600' }}>{f.unit}</span>
                </div>
                <p style={{ fontSize: '10px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>{f.help}</p>
              </div>
            ))}
          </div>

          {/* Porcentajes Mod 40 — ahora editables */}
          <div style={{ background: '#fff7ed', borderRadius: '10px', padding: '16px', border: '1px solid #fed7aa' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '16px' }}>📋</span>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#92400e', margin: 0 }}>Porcentajes Modalidad 40</p>
                <p style={{ fontSize: '11px', color: '#b45309', margin: '2px 0 0' }}>Cuota mensual como % del salario cotizable. Aumenta cada año según IMSS. Edita solo si hay actualización oficial.</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
              {[2026, 2027, 2028, 2029, 2030].map(year => (
                <div key={year}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#92400e', marginBottom: '4px', textTransform: 'uppercase' }}>{year}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <input type="number" step="0.001"
                      value={(perfil as any)[`mod40_${year}`]}
                      onChange={e => set(`mod40_${year}` as keyof Perfil, parseFloat(e.target.value) || 0)}
                      style={editing ? { width: '100%', padding: '8px 8px', border: '1.5px solid #fed7aa', borderRadius: '7px', fontSize: '13px', fontWeight: '700', color: '#92400e', background: 'white', outline: 'none', fontFamily: 'inherit' } : { width: '100%', padding: '8px 8px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', fontWeight: '700', color: '#374151', background: '#F8FAFC', fontFamily: 'inherit', cursor: 'default' }} disabled={!editing} />
                    <span style={{ fontSize: '11px', color: '#b45309', fontWeight: '600' }}>%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── SECCIÓN 3: Preview PDF ── */}
        <div style={{ background: 'white', borderRadius: '14px', padding: '24px', border: '1px solid #e2e8f0' }}>
          {sectionTitle('📄', 'Vista previa del PDF', 'Así se verá el encabezado de tus propuestas')}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ background: AZUL, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {perfil.logo_url && (
                  <div style={{ background: 'white', borderRadius: '5px', padding: '3px', height: '32px', display: 'flex', alignItems: 'center' }}>
                    <img src={perfil.logo_url} alt="Logo"
                      style={{ height: '28px', maxWidth: '80px', objectFit: 'contain' }}
                      onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
                  </div>
                )}
                <div>
                  <div style={{ color: 'white', fontWeight: '700', fontSize: '13px' }}>{perfil.razon_social || perfil.nombre || 'Nombre del asesor'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '10px' }}>
                    {[perfil.rfc, perfil.telefono, perfil.email_contacto].filter(Boolean).join(' · ') || 'RFC · Teléfono · Email'}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'white', fontSize: '12px', fontWeight: '700' }}>Diagnóstico Pensional</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '10px' }}>{new Date().toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })}</div>
                <div style={{ color: NARANJA, fontSize: '9px', fontWeight: '600', marginTop: '2px' }}>Válida por {perfil.vigencia_propuesta} días</div>
              </div>
            </div>
            <div style={{ background: '#F4F6FB', padding: '7px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>Folio: KSE-2026-000001 · Documento confidencial</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Página 1 de 2 · Powered by</span>
                <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700' }}>KSE Pensiones</span>
              </div>
            </div>
          </div>
        </div>

        {/* Barra sticky inferior */}
        <div style={{ position: 'sticky', bottom: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', marginBottom: '8px' }}>
          <div>
            {saveError && <p style={{ fontSize: '12px', color: '#ef4444', margin: 0, fontWeight: '600' }}>⚠️ {saveError}</p>}
            {!saveError && saved && <p style={{ fontSize: '12px', color: VERDE, margin: 0, fontWeight: '600' }}>✓ Configuración guardada correctamente</p>}
            {!saveError && !saved && !editing && lastSaved && (
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                ✓ Guardado el {lastSaved.toLocaleDateString('es-MX', { day:'numeric', month:'short' })} a las {lastSaved.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}
              </p>
            )}
            {!saveError && !saved && editing && (
              <p style={{ fontSize: '12px', color: NARANJA, margin: 0, fontWeight: '500' }}>✏️ Editando — los cambios no se han guardado</p>
            )}
            {!saveError && !saved && !editing && !lastSaved && (
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Haz clic en Editar para modificar tu configuración</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!editing ? (
              <button onClick={() => { setEditing(true); setSaveError(null) }}
                style={{ padding: '10px 24px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                ✏️ Editar configuración
              </button>
            ) : (
              <>
                <button onClick={() => { setPerfil(perfilOriginal); setEditing(false); setErrors({}); setSaveError(null) }}
                  style={{ padding: '10px 20px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                  ✕ Cancelar
                </button>
                <button onClick={guardar} disabled={saving}
                  style={{ padding: '10px 28px', background: saving ? '#94a3b8' : VERDE, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Guardando...' : '💾 Guardar cambios'}
                </button>
              </>
            )}
          </div>
        </div>

        </div>
      </div>
    </div>
  )
}
