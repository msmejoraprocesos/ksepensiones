'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

const AZUL = '#1F3A5F'
const VERDE = '#2E8B57'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    if (password.length < 8) { setError('Mínimo 8 caracteres.'); return }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else setDone(true)
    setLoading(false)
  }

  if (done) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6FB' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '48px 40px', maxWidth: '420px', width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(31,58,95,0.10)' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
        <h2 style={{ color: AZUL, marginBottom: '12px' }}>Contraseña actualizada</h2>
        <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px' }}>Tu contraseña fue restablecida exitosamente.</p>
        <button onClick={() => router.push('/login')}
          style={{ background: AZUL, color: 'white', border: 'none', borderRadius: '8px', padding: '12px 32px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
          Ir al inicio de sesión
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6FB' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '48px 40px', maxWidth: '420px', width: '100%', boxShadow: '0 4px 24px rgba(31,58,95,0.10)' }}>
        <h2 style={{ color: AZUL, marginBottom: '8px', fontSize: '20px', fontWeight: '700' }}>Nueva contraseña</h2>
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '28px' }}>Elige una contraseña segura (mínimo 8 caracteres).</p>
        <form onSubmit={handleReset}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Nueva contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Confirmar contraseña</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{ display: 'block', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: loading ? '#94a3b8' : VERDE, color: 'white', fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
