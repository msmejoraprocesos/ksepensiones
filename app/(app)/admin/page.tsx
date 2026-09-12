'use client'
/**
 * /admin/formulas — KSE Pensiones
 * ════════════════════════════════════════════════════════════════════
 * Página exclusiva del administrador para ver y ajustar las constantes
 * configurables del sistema pensional.
 *
 * Constantes FIJAS (solo cambian con la ley) → solo lectura
 * Constantes CONFIGURABLES (UMA, PMG, tasas Mod40) → editables
 *
 * Todo lo que aquí se edita se guarda en la tabla `configuracion_sistema`
 * de Supabase y es leída por la calculadora en tiempo real.
 * ════════════════════════════════════════════════════════════════════
 */

import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { avisoError } from '@/app/utils/avisos'
