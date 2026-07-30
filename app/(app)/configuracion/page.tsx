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
  pct_afore_mod40: number
  tasa_m10: number
  pct_actualizacion_inpc: number
  pct_recargos_retroactivo: number
  mod40_2026: number
  mod40_2027: number
  mod40_2028: number
  mod40_2029: number
  mod40_2030: number
  uma_actualizada_en: string | null
  sm_actualizado_en: string | null
  pmg_actualizado_en: string | null
  encabezado_color: string
  encabezado_titulo: string
  encabezado_logo_size: number
  encabezado_font_size: number
}

const DEFAULTS: Perfil = {
  nombre: '', razon_social: '', rfc: '', telefono: '', email_contacto: '',
  direccion: '', logo_url: null, banner_url: null, vigencia_propuesta: 30,
  uma_diaria: 117.31, salario_minimo: 315.04, pmg_mensual: 10636.54,
  pmg_l97: 4345.72, rendimiento_afore_default: 6, inflacion_uma: 4.5, pct_afore_mod40: 20,
  mod40_2026: 14.438, mod40_2027: 15.528, mod40_2028: 16.619,
  mod40_2029: 17.709, mod40_2030: 18.800,
  tasa_m10: 10.075, pct_actualizacion_inpc: 7.27, pct_recargos_retroactivo: 41.80,
  uma_actualizada_en: null, sm_actualizado_en: null, pmg_actualizado_en: null,
  encabezado_color: '#1B3A6B', encabezado_titulo: 'Diagnóstico Pensional',
  encabezado_logo_size: 28, encabezado_font_size: 13,
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
  const [showCambiarPassword, setShowCambiarPassword] = useState(false)
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [msgPassword, setMsgPassword] = useState('')
  const [saved, setSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof Perfil, string>>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const [materiales, setMateriales] = useState<{id:string;nombre:string;descripcion:string|null;tipo:string;url:string|null;activo:boolean;orden:number;archivo_url?:string|null;created_at?:string;folio?:string}[]>([])
  const [materialesNuevos, setMaterialesNuevos] = useState<{tempId:string;nombre:string;descripcion:string;tipo:string;url:string;archivo_url?:string}[]>([])
  const [savingMaterial, setSavingMaterial] = useState(false)
  const [showMaterialDetalle, setShowMaterialDetalle] = useState<any>(null)
  const [uploadingAdjunto, setUploadingAdjunto] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [materialError, setMaterialError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [editing, setEditing] = useState(false)
  const [perfilOriginal, setPerfilOriginal] = useState<Perfil>(DEFAULTS)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      loadMateriales(session.user.id)
      supabase.from('perfiles_usuario').select('*, organizaciones(nombre)').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (data) {
            const loaded = { ...DEFAULTS, ...data, org_nombre: (data as any).organizaciones?.nombre ?? null }
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

  async function loadMateriales(uid: string) {
    const { data } = await supabase.from('materiales_apoyo').select('*').eq('asesor_id', uid).order('orden')
    setMateriales(data ?? [])
  }

  function agregarFilaMaterial() {
    setMaterialesNuevos(prev => [...prev, { tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, nombre: '', descripcion: '', tipo: 'general', url: '' }])
  }

  async function quitarFilaMaterial(tempId: string) {
    const fila = materialesNuevos.find(f => f.tempId === tempId)
    if (fila?.archivo_url) {
      // Eliminar el archivo huérfano subido a Storage
      try {
        const urlParts = fila.archivo_url.split('/').pop()?.split('?')[0]
        if (urlParts) await supabase.storage.from('logos').remove([`materiales/${urlParts}`])
      } catch { /* noop */ }
    }
    setMaterialesNuevos(prev => prev.filter(f => f.tempId !== tempId))
    setMaterialError(null)
  }

  async function toggleMaterial(id: string, activo: boolean) {
    await supabase.from('materiales_apoyo').update({ activo }).eq('id', id)
    setMateriales(prev => prev.map(m => m.id === id ? { ...m, activo } : m))
  }

  async function eliminarMaterial(id: string) {
    const { error } = await supabase.from('materiales_apoyo').delete().eq('id', id)
    if (error) { setMaterialError('Error al eliminar: ' + error.message); return }
    setMateriales(prev => prev.filter(m => m.id !== id))
  }

  async function cambiarPassword() {
    if (nuevaPassword.length < 6) { setMsgPassword('❌ Mínimo 6 caracteres'); return }
    if (nuevaPassword !== confirmarPassword) { setMsgPassword('❌ Las contraseñas no coinciden'); return }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword })
    if (error) {
      setMsgPassword('❌ Error: ' + error.message)
    } else {
      setMsgPassword('✅ Contraseña actualizada correctamente')
      setNuevaPassword('')
      setConfirmarPassword('')
      setTimeout(() => { setShowCambiarPassword(false); setMsgPassword('') }, 2000)
    }
    setSavingPassword(false)
  }

  async function guardar() {
    if (!validate()) return

    // Validar materiales pendientes antes de continuar
    const incompletos = materialesNuevos.filter(f => !f.nombre.trim() || !f.tipo || !f.archivo_url)
    if (incompletos.length > 0) {
      setMaterialError(`Completa nombre, tipo y adjunto en ${incompletos.length > 1 ? 'los materiales pendientes' : 'el material pendiente'} antes de guardar.`)
      return
    }

    setSaving(true)
    setSaveError(null)
    setMaterialError(null)

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

    if (error) {
      setSaving(false)
      setSaveError('Error al guardar: ' + error.message)
      return
    }

    // Insertar materiales nuevos pendientes
    if (materialesNuevos.length > 0) {
      const inserts = materialesNuevos.map((f, i) => ({
        asesor_id: uid,
        nombre: f.nombre,
        descripcion: f.descripcion || null,
        tipo: f.tipo,
        url: f.url || null,
        archivo_url: f.archivo_url || null,
        activo: true,
        orden: materiales.length + i,
      }))
      const { data: insertedData, error: matError } = await supabase.from('materiales_apoyo').insert(inserts).select()
      if (matError) {
        setSaving(false)
        setMaterialError('Error al guardar materiales: ' + matError.message)
        return
      }
      if (insertedData) setMateriales(prev => [...prev, ...insertedData])
      setMaterialesNuevos([])
    }

    setSaving(false)
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
    // Get fresh session FIRST to ensure correct user id for the storage path
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id || userId
    if (!uid) {
      setLogoError('No se pudo identificar tu sesión. Recarga la página e intenta de nuevo.')
      setUploadingLogo(false)
      return
    }
    setLogoError(null)

    // Show instant local preview while uploading
    const localUrl = URL.createObjectURL(file)
    setPerfil(p => ({ ...p, logo_url: localUrl }))

    const ext = file.name.split('.').pop()
    const path = `logos/${uid}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      const finalUrl = data.publicUrl + '?t=' + Date.now()
      // Update local state only — does NOT persist to DB until "Guardar cambios"
      setPerfil(p => ({ ...p, logo_url: finalUrl }))
    } else {
      setLogoError('Error al subir el logo: ' + error.message)
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
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: 'clamp(12px, 3vw, 32px)', display: 'flex', flexDirection: 'column', gap: '20px' }}>

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

          {/* Logo: subir (izq) + mini preview (der) */}
          <div style={{ marginBottom: '20px', display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label style={labelSt}>Logo del asesor</label>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px', lineHeight: 1.5 }}>
                Aparece en el PDF de propuesta junto a tu nombre. PNG con fondo transparente recomendado, mínimo 200×80px.
              </p>
              {editing ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: uploadingLogo ? '#f1f5f9' : '#EEF2F8', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: uploadingLogo ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', color: AZUL }}>
                    {uploadingLogo ? '⏳ Subiendo...' : '📁 Subir logo'}
                    <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} style={{ display: 'none' }} disabled={uploadingLogo} />
                  </label>
                  {perfil.logo_url && (
                    <button onClick={() => {
                      setPerfil(p => ({ ...p, logo_url: null }))
                      if (fileRef.current) fileRef.current.value = ''
                    }} style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Quitar logo
                    </button>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                  Activa el modo Editar para cambiar el logo
                </p>
              )}
              {logoError && <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px' }}>⚠️ {logoError}</p>}
            </div>

            {/* Mini preview a la derecha */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ width: '120px', height: '90px', border: `2px ${perfil.logo_url ? 'solid #bbf7d0' : 'dashed #e2e8f0'}`, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: perfil.logo_url ? '#f0fdf4' : '#F8FAFC', overflow: 'hidden' }}>
                {perfil.logo_url ? (
                  <img src={perfil.logo_url} alt="Logo activo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '26px' }}>🏢</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Sin logo</div>
                  </div>
                )}
              </div>
              {perfil.logo_url && <p style={{ fontSize: '10px', color: VERDE, fontWeight: '600', marginTop: '4px', textAlign: 'center' }}>✓ Guardado</p>}
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
              {(perfil as any).org_nombre && (
                <div style={{ marginTop: '8px', padding: '6px 10px', background: '#EEF2F8', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#6B7280' }}>Organización:</span>
                  <span style={{ fontSize: '12px', fontWeight: '700' as const, color: AZUL }}>{(perfil as any).org_nombre}</span>
                </div>
              )}
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
          </div>
        </div>

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
              {
                key: 'pct_afore_mod40', label: '% de Mod 40 que regresa AFORE', unit: '%',
                placeholder: '20',
                help: 'De cada cuota mensual de Modalidad 40, este porcentaje se deposita en la subcuenta de Retiro 97 y se regresa al trabajador en una sola exhibición al pensionarse (el resto financia el seguro de Cesantía/Vejez). Estimado de mercado ~20% — verifica periódicamente en CONSAR (gob.mx/consar), ya que no hay una tasa única oficial publicada y puede variar según el caso.',
                badge: 'Validar periódicamente', badgeColor: '#0891b2'
              },
              {
                key: 'tasa_m10', label: 'Tasa cuotas Modalidad 10', unit: '% anual',
                placeholder: '22',
                help: 'Porcentaje de cuotas obrero-patronales que paga mensualmente un trabajador en Modalidad 10 (sobre su SDI × 30.4 días). El IMSS puede ajustarla. Verificar periódicamente en imss.gob.mx.',
                badge: 'Verificar en IMSS', badgeColor: '#7c3aed'
              },
              {
                key: 'pct_actualizacion_inpc', label: 'Actualización INPC retroactivo', unit: '%',
                placeholder: '7.27',
                help: 'Porcentaje de actualización por inflación (INPC acumulado) que aplica el SAT sobre el costo del pago retroactivo de Mod 40. Se actualiza anualmente según el INPC publicado por BANXICO. Verificar en sat.gob.mx.',
                badge: 'Actualizar cada enero', badgeColor: NARANJA
              },
              {
                key: 'pct_recargos_retroactivo', label: 'Recargos retroactivo Mod 40', unit: '%',
                placeholder: '41.80',
                help: 'Porcentaje de recargos que aplica el SAT sobre el costo base del pago retroactivo de Mod 40. Corresponde a la tabla de recargos para el período de adeudo. Verificar en sat.gob.mx al iniciar cada trámite retroactivo.',
                badge: 'Verificar en SAT', badgeColor: '#dc2626'
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
        <div id="encabezado" style={{ background: 'white', borderRadius: '14px', padding: '24px', border: '1px solid #e2e8f0' }}>
          {sectionTitle('🎨', 'Encabezado de propuestas PDF', 'Personaliza cómo se ve el encabezado en tus documentos')}

          {/* Configuración del encabezado */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={labelSt}>Título del documento</label>
              <input value={perfil.encabezado_titulo} onChange={e => set('encabezado_titulo', e.target.value)} placeholder="Diagnóstico Pensional" style={editing ? inputSt() : disabledSt} disabled={!editing} />
            </div>
            <div>
              <label style={labelSt}>Color del encabezado</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" value={perfil.encabezado_color} onChange={e => set('encabezado_color', e.target.value)}
                  style={{ width: '40px', height: '36px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: editing ? 'pointer' : 'default', padding: '2px' }} disabled={!editing} />
                <input value={perfil.encabezado_color} onChange={e => set('encabezado_color', e.target.value)} placeholder="#1B3A6B" style={editing ? inputSt() : disabledSt} disabled={!editing} />
              </div>
            </div>
            <div>
              <label style={labelSt}>Tamaño del logo (px)</label>
              <input type="range" min="20" max="48" value={perfil.encabezado_logo_size} onChange={e => set('encabezado_logo_size', parseInt(e.target.value))}
                style={{ width: '100%' }} disabled={!editing} />
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0', textAlign: 'right' }}>{perfil.encabezado_logo_size}px</p>
            </div>
            <div>
              <label style={labelSt}>Tamaño de fuente (px)</label>
              <input type="range" min="10" max="18" value={perfil.encabezado_font_size} onChange={e => set('encabezado_font_size', parseInt(e.target.value))}
                style={{ width: '100%' }} disabled={!editing} />
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0', textAlign: 'right' }}>{perfil.encabezado_font_size}px</p>
            </div>
          </div>

          {/* Vista previa */}
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Vista previa</p>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ background: perfil.encabezado_color, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {perfil.logo_url && (
                  <div style={{ background: 'white', borderRadius: '5px', padding: '3px', height: `${perfil.encabezado_logo_size + 4}px`, display: 'flex', alignItems: 'center' }}>
                    <img src={perfil.logo_url} alt="Logo"
                      style={{ height: `${perfil.encabezado_logo_size}px`, maxWidth: '80px', objectFit: 'contain' }}
                      onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
                  </div>
                )}
                <div>
                  <div style={{ color: 'white', fontWeight: '700', fontSize: `${perfil.encabezado_font_size}px` }}>{perfil.razon_social || perfil.nombre || 'Nombre del asesor'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: `${Math.max(8, perfil.encabezado_font_size - 3)}px` }}>
                    {[perfil.rfc, perfil.telefono, perfil.email_contacto].filter(Boolean).join(' · ') || 'RFC · Teléfono · Email'}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'white', fontSize: `${Math.max(10, perfil.encabezado_font_size - 1)}px`, fontWeight: '700' }}>{perfil.encabezado_titulo || 'Diagnóstico Pensional'}</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: `${Math.max(8, perfil.encabezado_font_size - 3)}px` }}>{new Date().toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })}</div>
              </div>
            </div>
            {/* Pie - NO editable */}
            <div style={{ background: '#F4F6FB', padding: '7px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>Folio: KSE-2026-000001 · Documento confidencial</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Página 1 de 2 · Powered by</span>
                <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700' }}>KSE Pensiones</span>
              </div>
            </div>
          </div>
          <p style={{ fontSize: '10px', color: '#94a3b8', margin: '8px 0 0' }}>
            ℹ️ El folio, la paginación y "Powered by KSE Pensiones" no son editables.
          </p>

          {/* Leyenda de vigencia en el PDF */}
          <div style={{ marginTop: '14px', padding: '10px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '11px', color: '#92400e' }}>
            📌 Cada PDF generado incluirá automáticamente la leyenda: <em>"La información presentada está sujeta a cambios en la normativa y variables del IMSS. Tiene un margen de certeza de 30 días a partir de su fecha de emisión."</em>
          </div>
        </div>

        {/* ── MATERIALES DE APOYO ── */}
          <div id="materiales" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: '0 0 2px' }}>📚 Catálogo de materiales de apoyo</p>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Documentos y links que puedes enviar por WhatsApp al dar de alta un cliente</p>
              </div>
              {editing && (
                <button onClick={agregarFilaMaterial}
                  style={{ padding: '8px 16px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  + Agregar material
                </button>
              )}
            </div>

            {materialError && (
              <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>
                ⚠️ {materialError}
              </div>
            )}
            {materialesNuevos.length > 0 && (
              <div style={{ padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '12px', color: '#92400e', marginBottom: '12px' }}>
                📌 Tienes {materialesNuevos.length} material{materialesNuevos.length > 1 ? 'es' : ''} sin guardar. Completa los campos requeridos (*) y presiona <strong>Guardar cambios</strong> para confirmarlos.
              </div>
            )}
            {materiales.length === 0 && materialesNuevos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', background: '#F4F6FB', borderRadius: '10px', color: '#94a3b8', fontSize: '13px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                No hay materiales configurados.<br />
                Agrega guías, videos o links que ayuden a tus clientes a entender el proceso.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F4F6FB' }}>
                      {['ID', 'Nombre', 'Descripción', 'Adjunto', 'Fecha', ''].map((h, i) => (
                        <th key={i} style={{ padding: '8px 12px', textAlign: i === 0 ? 'center' : 'left', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {materialesNuevos.map((fila, idx) => (
                      <tr key={fila.tempId} style={{ background: '#FFF7ED', borderBottom: '1px solid #fed7aa' }}>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: '600', fontFamily: 'monospace', fontSize: '11px' }}>—</td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <select value={fila.tipo} onChange={e => setMaterialesNuevos(prev => prev.map(f => f.tempId === fila.tempId ? { ...f, tipo: e.target.value } : f))}
                              style={{ padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', fontFamily: 'inherit', background: 'white' }}>
                              <option value="general">📄 General</option>
                              <option value="guia">📋 Guía / Manual</option>
                              <option value="video">🎥 Video</option>
                              <option value="calculadora">🧮 Calculadora</option>
                            </select>
                            <input value={fila.nombre} onChange={e => setMaterialesNuevos(prev => prev.map(f => f.tempId === fila.tempId ? { ...f, nombre: e.target.value } : f))}
                              placeholder="Nombre del material *"
                              style={{ padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', fontWeight: '600' }} />
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input value={fila.descripcion} onChange={e => setMaterialesNuevos(prev => prev.map(f => f.tempId === fila.tempId ? { ...f, descripcion: e.target.value } : f))}
                            placeholder="Descripción (opcional)"
                            style={{ width: '100%', padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {fila.archivo_url ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: VERDE, background: '#f0fdf4', padding: '3px 8px', borderRadius: '6px', fontWeight: '600' }}>
                              ✓ Adjunto
                            </span>
                          ) : (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: uploadingAdjunto ? '#94a3b8' : AZUL, background: '#EEF2F8', padding: '3px 8px', borderRadius: '6px', fontWeight: '600', cursor: uploadingAdjunto ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                              {uploadingAdjunto ? '⏳...' : '📎 Adjuntar *'}
                              <input type="file" accept=".pdf,image/*,.doc,.docx" style={{ display: 'none' }} disabled={uploadingAdjunto}
                                onChange={async e => {
                                  const f = e.target.files?.[0]
                                  if (!f) return
                                  setUploadingAdjunto(true)
                                  setMaterialError(null)
                                  const { data: { session } } = await supabase.auth.getSession()
                                  const uid = session?.user?.id || userId
                                  if (!uid) {
                                    setMaterialError('No se pudo identificar tu sesión. Recarga la página e intenta de nuevo.')
                                    setUploadingAdjunto(false)
                                    return
                                  }
                                  const ext = f.name.split('.').pop()
                                  const path = `materiales/${uid}-${Date.now()}-${idx}.${ext}`
                                  const { error } = await supabase.storage.from('logos').upload(path, f, { upsert: true })
                                  if (!error) {
                                    const { data } = supabase.storage.from('logos').getPublicUrl(path)
                                    setMaterialesNuevos(prev => prev.map(item => item.tempId === fila.tempId ? { ...item, archivo_url: data.publicUrl } : item))
                                  } else {
                                    setMaterialError('Error al subir archivo: ' + error.message)
                                  }
                                  setUploadingAdjunto(false)
                                }} />
                            </label>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap' }}>Sin guardar</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <button onClick={() => quitarFilaMaterial(fila.tempId)}
                            style={{ padding: '4px 10px', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '10px', cursor: 'pointer', background: '#fef2f2', color: '#ef4444' }}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {materiales.map((m, i) => (
                      <tr key={m.id} style={{ background: m.activo ? (i % 2 === 0 ? 'white' : '#F8FAFC') : '#F8FAFC', opacity: m.activo ? 1 : 0.55, borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: '600', fontFamily: 'monospace', fontSize: '11px' }}>{(m as any).folio || i + 1}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '15px' }}>{m.tipo === 'video' ? '🎥' : m.tipo === 'guia' ? '📋' : m.tipo === 'calculadora' ? '🧮' : '📄'}</span>
                            <span style={{ fontWeight: '600', color: '#374151' }}>{m.nombre}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b', maxWidth: '240px' }}>{m.descripcion || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {(m as any).archivo_url ? (
                            <button onClick={async () => {
                              try {
                                const res = await fetch((m as any).archivo_url)
                                const blob = await res.blob()
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                const urlParts = (m as any).archivo_url.split('/')
                                a.download = urlParts[urlParts.length - 1].split('?')[0] || m.nombre
                                document.body.appendChild(a)
                                a.click()
                                document.body.removeChild(a)
                                URL.revokeObjectURL(url)
                              } catch {
                                window.open((m as any).archivo_url, '_blank')
                              }
                            }}
                              title={(m as any).archivo_url}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: AZUL, background: '#EEF2F8', padding: '3px 8px', borderRadius: '6px', fontWeight: '600', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                              📎 Descargar
                            </button>
                          ) : m.url ? (
                            <a href={m.url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: AZUL, textDecoration: 'none', background: '#EEF2F8', padding: '3px 8px', borderRadius: '6px', fontWeight: '600' }}>
                              🔗 Ver link
                            </a>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#cbd5e1' }}>Sin adjunto</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {m.created_at ? new Date(m.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {editing && (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button onClick={() => toggleMaterial(m.id, !m.activo)}
                                style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '10px', cursor: 'pointer', background: 'white', color: '#64748b', whiteSpace: 'nowrap' }}>
                                {m.activo ? 'Desactivar' : 'Activar'}
                              </button>
                              <button onClick={() => eliminarMaterial(m.id)}
                                style={{ padding: '4px 8px', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '10px', cursor: 'pointer', background: '#fef2f2', color: '#ef4444' }}>
                                🗑️
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                <button onClick={async () => {
                  setPerfil(perfilOriginal); setEditing(false); setErrors({}); setSaveError(null); setMaterialError(null)
                  // Limpiar archivos huérfanos de materiales no guardados
                  for (const fila of materialesNuevos) {
                    if (fila.archivo_url) {
                      try {
                        const urlParts = fila.archivo_url.split('/').pop()?.split('?')[0]
                        if (urlParts) await supabase.storage.from('logos').remove([`materiales/${urlParts}`])
                      } catch { /* noop */ }
                    }
                  }
                  setMaterialesNuevos([])
                }}
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

          {/* Cambiar contraseña */}
          <div style={{ marginTop: '16px', padding: '16px', background: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#374151', margin: '0 0 2px' }}>🔒 Contraseña</p>
                <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>Cambia tu contraseña de acceso al sistema</p>
              </div>
              <button onClick={() => { setShowCambiarPassword(!showCambiarPassword); setMsgPassword('') }}
                style={{ padding: '7px 16px', background: showCambiarPassword ? '#F4F6FB' : '#1B3A6B', color: showCambiarPassword ? '#374151' : 'white', border: '1px solid #E5E7EB', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', borderRadius: '6px' }}>
                {showCambiarPassword ? 'Cancelar' : 'Cambiar contraseña'}
              </button>
            </div>
            {showCambiarPassword && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
                {[
                  { label: 'Nueva contraseña', value: nuevaPassword, set: setNuevaPassword },
                  { label: 'Confirmar contraseña', value: confirmarPassword, set: setConfirmarPassword },
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ fontSize: '10.5px', fontWeight: '600', color: '#6B7280', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                    <input type="password" value={f.value} onChange={e => f.set(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit', borderRadius: '6px' }} />
                  </div>
                ))}
                {msgPassword && (
                  <p style={{ fontSize: '12px', color: msgPassword.startsWith('✅') ? '#065F46' : '#DC2626', margin: 0, fontWeight: '600' }}>{msgPassword}</p>
                )}
                <button onClick={cambiarPassword} disabled={savingPassword || !nuevaPassword}
                  style={{ padding: '10px', background: '#1B3A6B', color: 'white', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', borderRadius: '6px', opacity: savingPassword || !nuevaPassword ? 0.6 : 1 }}>
                  {savingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
                </button>
              </div>
            )}
          </div>

      </div>
    </div>
  )
}
