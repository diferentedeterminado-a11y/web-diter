export const CHECKOUT_CURRENCY = 'ARS' as const;

export type ServiceId =
  | 'lecturas-3-preguntas'
  | 'lecturas-6-preguntas'
  | 'lecturas-10-preguntas'
  | 'lecturas-llamada-45'
  | 'limpiezas-personal'
  | 'limpiezas-hogar'
  | 'limpiezas-empresarial'
  | 'limpiezas-grupales'
  | 'amarres-consulta-previa'
  | 'exorcismos-llamada-evaluacion';

export type ServiceCategory = 'lecturas' | 'limpiezas' | 'amarres' | 'exorcismos';

export type CatalogService = {
  id: ServiceId;
  category: ServiceCategory;
  categoryTitle: string;
  variant: string;
  unitPrice: number;
  currency: typeof CHECKOUT_CURRENCY;
};

/**
 * Precios oficiales (ARS). Deben coincidir con los valores publicados en `app/page.tsx`.
 */
export const SERVICE_CATALOG: Record<ServiceId, CatalogService> = {
  'lecturas-3-preguntas': {
    id: 'lecturas-3-preguntas',
    category: 'lecturas',
    categoryTitle: 'Lecturas y Videncias',
    variant: '3 Preguntas Directas',
    unitPrice: 20000,
    currency: CHECKOUT_CURRENCY,
  },
  'lecturas-6-preguntas': {
    id: 'lecturas-6-preguntas',
    category: 'lecturas',
    categoryTitle: 'Lecturas y Videncias',
    variant: '6 Preguntas Profundas',
    unitPrice: 40000,
    currency: CHECKOUT_CURRENCY,
  },
  'lecturas-10-preguntas': {
    id: 'lecturas-10-preguntas',
    category: 'lecturas',
    categoryTitle: 'Lecturas y Videncias',
    variant: '10 Preguntas Exclusivas',
    unitPrice: 60000,
    currency: CHECKOUT_CURRENCY,
  },
  'lecturas-llamada-45': {
    id: 'lecturas-llamada-45',
    category: 'lecturas',
    categoryTitle: 'Lecturas y Videncias',
    variant: 'Llamada 45 min (Ilimitadas)',
    unitPrice: 100000,
    currency: CHECKOUT_CURRENCY,
  },
  'limpiezas-personal': {
    id: 'limpiezas-personal',
    category: 'limpiezas',
    categoryTitle: 'Limpiezas Energéticas',
    variant: 'Limpieza Personal Profunda',
    unitPrice: 350000,
    currency: CHECKOUT_CURRENCY,
  },
  'limpiezas-hogar': {
    id: 'limpiezas-hogar',
    category: 'limpiezas',
    categoryTitle: 'Limpiezas Energéticas',
    variant: 'Limpieza Hogar Espiritual',
    unitPrice: 450000,
    currency: CHECKOUT_CURRENCY,
  },
  'limpiezas-empresarial': {
    id: 'limpiezas-empresarial',
    category: 'limpiezas',
    categoryTitle: 'Limpiezas Energéticas',
    variant: 'Limpieza Empresarial (Llamada)',
    unitPrice: 65000,
    currency: CHECKOUT_CURRENCY,
  },
  'limpiezas-grupales': {
    id: 'limpiezas-grupales',
    category: 'limpiezas',
    categoryTitle: 'Limpiezas Energéticas',
    variant: 'Grupales (Viernes)',
    unitPrice: 20000,
    currency: CHECKOUT_CURRENCY,
  },
  'amarres-consulta-previa': {
    id: 'amarres-consulta-previa',
    category: 'amarres',
    categoryTitle: 'Amarres de Amor',
    variant: 'Consulta Previa de Evaluación',
    unitPrice: 60000,
    currency: CHECKOUT_CURRENCY,
  },
  'exorcismos-llamada-evaluacion': {
    id: 'exorcismos-llamada-evaluacion',
    category: 'exorcismos',
    categoryTitle: 'Exorcismos y Liberación Espiritual',
    variant: 'Llamada Previa para Evaluación',
    unitPrice: 80000,
    currency: CHECKOUT_CURRENCY,
  },
};

export const LECTURA_SERVICES: CatalogService[] = [
  SERVICE_CATALOG['lecturas-3-preguntas'],
  SERVICE_CATALOG['lecturas-6-preguntas'],
  SERVICE_CATALOG['lecturas-10-preguntas'],
  SERVICE_CATALOG['lecturas-llamada-45'],
];

export const LIMPIEZA_SERVICES: CatalogService[] = [
  SERVICE_CATALOG['limpiezas-personal'],
  SERVICE_CATALOG['limpiezas-hogar'],
  SERVICE_CATALOG['limpiezas-empresarial'],
  SERVICE_CATALOG['limpiezas-grupales'],
];

export function isServiceId(value: unknown): value is ServiceId {
  return typeof value === 'string' && value in SERVICE_CATALOG;
}

export function getServiceById(id: unknown): CatalogService | null {
  if (!isServiceId(id)) {
    return null;
  }

  return SERVICE_CATALOG[id];
}

export function getPreferenceTitle(service: CatalogService): string {
  return `${service.categoryTitle} - ${service.variant}`;
}
