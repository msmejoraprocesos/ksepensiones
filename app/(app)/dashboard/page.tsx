export default function DashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'hidden' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', flexShrink: 0 }}>
        <h1 style={{ color: '#1F3A5F', fontSize: '20px', fontWeight: '700', margin: 0 }}>Dashboard</h1>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <p style={{ color: '#64748b' }}>Bienvenido a KSE Pensiones</p>
      </div>
    </div>
  )
}
