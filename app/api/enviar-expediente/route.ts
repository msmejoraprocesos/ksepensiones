import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { emailDestino, clienteNombre, institucionNombre, monto, tasa, plazo, cuota, pensionSin, pensionCon, documentos } = await req.json()
    if (!emailDestino) return NextResponse.json({ error: 'Email de destino requerido' }, { status: 400 })

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'Servicio de email no configurado' }, { status: 500 })

    const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="background:#1B3A6B;padding:24px 32px;text-align:center;border-radius:8px 8px 0 0">
  <div style="font-size:20px;font-weight:900;color:white">KSE PENSIONES</div>
  <div style="font-size:11px;color:#93C5FD;margin-top:4px">Expediente para Financiamiento Pensional</div>
</td></tr>
<tr><td style="background:white;padding:28px 32px">
  <p style="font-size:15px;font-weight:700;color:#111827;margin:0 0 4px">Expediente: ${clienteNombre}</p>
  <p style="font-size:13px;color:#6B7280;margin:0 0 20px">Enviado para su evaluación en ${institucionNombre}</p>

  <div style="background:#F4F6FB;border:1px solid #E5E7EB;border-left:4px solid #F05B21;border-radius:6px;padding:16px;margin:0 0 20px">
    <p style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px">Datos del financiamiento</p>
    <table width="100%" cellpadding="4" cellspacing="0">
      <tr><td style="font-size:12px;color:#6B7280">Monto solicitado</td><td style="font-size:13px;font-weight:700;color:#1B3A6B;text-align:right">${fmtMXN(monto)}</td></tr>
      <tr><td style="font-size:12px;color:#6B7280">Tasa anual</td><td style="font-size:13px;font-weight:700;color:#374151;text-align:right">${tasa}%</td></tr>
      <tr><td style="font-size:12px;color:#6B7280">Plazo</td><td style="font-size:13px;font-weight:700;color:#374151;text-align:right">${plazo} meses</td></tr>
      <tr><td style="font-size:12px;color:#6B7280">Cuota mensual estimada</td><td style="font-size:13px;font-weight:700;color:#F05B21;text-align:right">${fmtMXN(cuota)}</td></tr>
      ${pensionSin ? `<tr><td style="font-size:12px;color:#6B7280">Pensión sin Modalidad 40</td><td style="font-size:13px;color:#374151;text-align:right">${fmtMXN(pensionSin)}/mes</td></tr>` : ''}
      ${pensionCon ? `<tr><td style="font-size:12px;color:#6B7280">Pensión con Modalidad 40</td><td style="font-size:13px;font-weight:700;color:#2E8B57;text-align:right">${fmtMXN(pensionCon)}/mes</td></tr>` : ''}
    </table>
  </div>

  <p style="font-size:12px;font-weight:700;color:#374151;margin:0 0 8px">Documentos incluidos en este expediente (${documentos.length}):</p>
  <table width="100%" cellpadding="0" cellspacing="0">
    ${(documentos as string[]).map((d: string) => `<tr><td style="padding:5px 0;border-bottom:1px solid #F3F4F6;font-size:12px;color:#374151">✓ ${d}</td></tr>`).join('')}
  </table>

  <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:6px;padding:12px;margin-top:20px">
    <p style="font-size:12px;color:#065F46;margin:0">Este expediente fue generado mediante <strong>KSE Pensiones</strong>, sistema especializado en diagnóstico pensional. Para cualquier duda contacta directamente con el asesor que lo envió.</p>
  </div>
</td></tr>
<tr><td style="background:#1B3A6B;padding:16px 32px;text-align:center;border-radius:0 0 8px 8px">
  <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0">KSE Pensiones · Sistema de Diagnóstico Pensional · México</p>
</td></tr>
</table></td></tr></table>
</body></html>`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'KSE Pensiones <onboarding@resend.dev>',
        to: [emailDestino],
        subject: `📁 Expediente pensional: ${clienteNombre} — Para evaluación en ${institucionNombre}`,
        html,
      })
    })

    const emailData = await emailRes.json()
    if (emailData.error) return NextResponse.json({ error: emailData.error.message || 'Error al enviar' }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
