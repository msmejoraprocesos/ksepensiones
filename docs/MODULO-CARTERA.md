# Módulo de Cartera — diseño

Registro de clientes del SaaS, control de vigencia y gestión de cobranza.
Documento de trabajo: confirmar antes de construir.

## Qué resuelve

No olvidar cobrar, ver quién está por vencer, y que el vencimiento tenga
consecuencia real en el acceso.

## Hallazgo que condiciona todo

`organizaciones.activo` **no bloquea nada hoy**. El middleware solo valida
sesión; ni el layout ni ninguna ruta revisan el estado de la organización ni
`vigencia_hasta`. Una organización marcada como inactiva sigue teniendo acceso
completo.

Sin cerrar esto, el módulo avisa de la morosidad pero el cliente sigue usando
el sistema. Es la mitad que hace que el resto sirva.

## Modelo de datos

Se reutiliza `organizaciones` (ya tiene `plan`, `asientos`, `vigencia_hasta`,
`dias_gracia`, `activo`). Se agregan dos tablas:

### `contratos`
| Campo | Tipo | Nota |
|---|---|---|
| id | uuid | |
| organizacion_id | uuid | FK. Una persona física también es una organización de 1 asiento |
| tipo | text | `renta` \| `compra` |
| periodicidad | text | `mensual` \| `anual` \| `unico` — `unico` solo para compra |
| monto | numeric | Por periodo |
| asientos | int | Cuántos usuarios cubre |
| fecha_inicio | date | |
| fecha_fin | date | Null en compra |
| dias_tolerancia | int | Default 5 |
| estado | text | `activo` \| `vencido` \| `cancelado` |
| notas | text | |

### `pagos_contrato`
| Campo | Tipo | Nota |
|---|---|---|
| id | uuid | |
| contrato_id | uuid | FK |
| monto | numeric | Permite pagos parciales |
| fecha_pago | date | |
| metodo | text | transferencia, efectivo, etc. |
| periodo_cubierto_hasta | date | Lo que este pago extiende |
| referencia | text | Folio o comprobante |
| registrado_por | uuid | Auditoría |

## Flujos

### Alta de cliente
1. Se registra el contrato con sus fechas y monto.
2. Al registrar el primer pago: se calcula `vigencia_hasta`, se marca la
   organización como activa, y se dispara el alta de usuarios contra
   `api/admin/usuarios`, que ya crea la cuenta y envía credenciales por Resend.
3. El módulo no duplica esa lógica: la invoca.

### Renovación
Registrar un pago extiende `vigencia_hasta` desde la fecha mayor entre la
vigencia actual y hoy. Así un pago adelantado suma, y uno tardío no regala
los días de atraso.

### Vencimiento
Se evalúa `vigencia_hasta + dias_tolerancia`:
- **Por vencer** (dentro de 15 días): aviso en el tablero.
- **En tolerancia**: vencido pero dentro del margen. Acceso intacto, alerta visible.
- **Vencido**: pasado el margen. El sistema **propone** desactivar y pide
  confirmación — decisión explícita, nunca automática.

### Corte de acceso
Al confirmar, `organizaciones.activo = false`. Para que eso signifique algo hay
que agregar la validación: al cargar el layout, si la organización del usuario
está inactiva o su vigencia venció con tolerancia agotada, redirigir a una
pantalla de cuenta suspendida con datos de contacto.

## Tablero de cartera

Semáforo por días de atraso, con totales arriba: vigentes, por vencer, en
tolerancia, vencidos, y monto total por cobrar.

## Decisiones pendientes de confirmar

1. ¿La compra da acceso perpetuo, o también tiene vigencia de soporte?
2. ¿Los pagos parciales extienden proporcionalmente o solo al completar?
3. Al suspender, ¿se cortan todos los usuarios de la organización o hay excepciones?
4. ¿Quién puede registrar pagos: solo super-admin o también admin de organización?
