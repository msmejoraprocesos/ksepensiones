# Pendientes — KSE Pensiones

Lo que queda abierto, ordenado por impacto. Cerrar la línea al terminar.

## Bloqueantes

- [ ] **Validación visual de la app.** Diecisiete commits sin ver la aplicación corriendo. El cambio de fuente y el barrido de tipografía (82 sustituciones automáticas) tocan cada pixel y ningún test los juzga.
- [ ] **Confirmar deploy en Vercel.** El build falla localmente por variables de Supabase ausentes; nadie ha verificado que allá pase.
- [ ] **Sustento del pago retroactivo.** No se encontró fundamento legal para esa mecánica en la LSS. El Art. 219 fija plazo para *solicitar*, no para pagar hacia atrás, y el Art. 220 termina la continuación a los dos meses sin pago. Es el escenario más caro que ofrece la herramienta.
- [x] Migraciones aplicadas en KSE: parámetros configurables y cartera.
- [ ] **Correr `supabase/migraciones/20260912_rls_cartera.sql`** en KSE. Sin ella, cualquier usuario con sesión puede leer y escribir contratos y pagos.

## Producto

- [ ] **Auditar rutas que usan `service_role`.** Se restauraron los GRANT tras encontrar un revoke masivo, pero nunca se verificó qué llevaba tiempo fallando en silencio.
- [ ] **Denominador oficial del retorno.** La app divide entre inversión neta, el Excel entre costo total. Documentado en `lib/design-tokens.ts`; falta confirmación formal.

## Módulo de cartera

Completo. Diseño en `docs/MODULO-CARTERA.md`.

Alta de cliente con creación de organización, contrato y administrador · registro de pagos con extensión de vigencia y reactivación · acuerdos de palabra con recordatorio · tablero con semáforo · cotizador y tabla de precios editable · suspensión con confirmación · validación de acceso en el layout.

Pendiente menor: definir los montos reales de la tabla de precios (los sembrados son provisionales).

## Si se retoma el cobro

El módulo de suscripción con Stripe se eliminó en esta fase. Lo que quedó en pie por si se retoma:

- Columnas en `organizaciones`: `plan`, `asientos`, `vigencia_hasta`, `dias_gracia`, `cancelar_al_periodo`, `stripe_customer_id`, `stripe_subscription_id`. No se borraron: eliminar datos es irreversible y no estorban.
- El acceso nunca dependió de Stripe. `vigencia_hasta` se administra a mano desde Admin por organización y solo se muestra informativamente.
- Variables de entorno en Vercel (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, los `STRIPE_PRICE_*`) quedaron sin uso. Conviene retirarlas.
- Si hay un webhook configurado en el panel de Stripe apuntando a `/api/stripe/webhook`, ya no existe: desactivarlo para que deje de reintentar.

## Transversal

- [x] Paginación y ordenamiento en Clientes y Reportes.
- [x] Mensajes de error específicos. Cero `alert()` en la aplicación.
- [x] Skeletons de carga en Cartera y Dashboard.
- [x] Manifest PWA. La aplicación es instalable.
- [x] Responsividad general fuera de la calculadora.
- [x] Validación en tiempo real (`useValidacion`), aplicada en Alta de cliente.
- [x] Confirmación al cerrar modales con datos capturados (`useConfirmarCierre`).

## Calidad

- [x] Tests de resistencia a datos vacíos e incompletos. Encontraron un bug real: una fecha ilegible producía NaN y de ahí un estado de cobranza impredecible.

## Cerrados en la sesión del 12 sep 2026

Modalidad 10 separada de la comparativa · indexación real por INPC · prorrateo de meses por año · termómetro de Proyección corregido y unificado · etiquetas reinterpretables · glosario de Modalidad 10 · 11 pantallas migradas al sistema de diseño · responsividad y cajón lateral · retroalimentación fuera de pantalla · marca de agua retirada · ortografía · tokens centralizados · Inter vía next/font · guía de interpretación del termómetro · compuerta de elegibilidad conectada · riesgo de fallecimiento explícito · recargos e INPC configurables · 104 tests (30 de regresión)
