import { SERVICE_CATALOG, type ServiceId } from '@/lib/mercadopago/catalog';

export const LECTURA_QUESTION_COUNTS = {
  'lecturas-3-preguntas': 3,
  'lecturas-6-preguntas': 6,
  'lecturas-10-preguntas': 10,
} as const;

export type LecturaQuestionServiceId = keyof typeof LECTURA_QUESTION_COUNTS;
export type LecturaServiceId = LecturaQuestionServiceId | 'lecturas-llamada-45';

const LECTURA_IDS = new Set<string>([
  'lecturas-3-preguntas',
  'lecturas-6-preguntas',
  'lecturas-10-preguntas',
  'lecturas-llamada-45',
]);

export function isLecturaServiceId(value: string): value is LecturaServiceId {
  return LECTURA_IDS.has(value);
}

export function isCallServiceId(value: string): value is 'lecturas-llamada-45' {
  return value === 'lecturas-llamada-45';
}

export function isQuestionServiceId(value: string): value is LecturaQuestionServiceId {
  return value in LECTURA_QUESTION_COUNTS;
}

export function questionCountFor(serviceId: LecturaServiceId): number {
  if (isCallServiceId(serviceId)) {
    return 0;
  }

  return LECTURA_QUESTION_COUNTS[serviceId];
}

const QUESTION_TEXT_MAX = 1500;

export type ParsedQuestions =
  | { ok: true; questions: string[] }
  | { ok: false; reason: 'empty' | 'too_long' | 'too_many' | 'invalid'; index?: number };

export function parseCompletedQuestions(
  serviceId: LecturaQuestionServiceId,
  value: unknown,
): ParsedQuestions {
  const maximum = LECTURA_QUESTION_COUNTS[serviceId];
  if (!Array.isArray(value) || value.length > maximum) {
    return { ok: false, reason: value && Array.isArray(value) ? 'too_many' : 'invalid' };
  }

  const questions: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== 'string') {
      return { ok: false, reason: 'invalid', index };
    }

    const question = item.trim();
    if (!question) {
      continue;
    }

    if (question.length > QUESTION_TEXT_MAX) {
      return { ok: false, reason: 'too_long', index };
    }

    questions.push(question);
  }

  if (questions.length < 1) {
    return { ok: false, reason: 'empty' };
  }

  return { ok: true, questions };
}

export function questionRejectionMessage(parsed: ParsedQuestions): string | null {
  if (parsed.ok) {
    return null;
  }

  if (parsed.reason === 'empty') {
    return 'Escribí al menos una pregunta.';
  }

  if (parsed.reason === 'too_long') {
    return 'La pregunta puede tener hasta 1500 caracteres.';
  }

  if (parsed.reason === 'too_many') {
    return 'Podés escribir hasta la cantidad de preguntas incluidas en tu lectura.';
  }

  return 'Revisá las preguntas antes de continuar.';
}

export function lecturaLabel(serviceId: ServiceId): string {
  return SERVICE_CATALOG[serviceId].variant;
}

export const MP_HOLD_MINUTES = 30;
export const TRANSFER_HOLD_HOURS = 48;
export const CHECKOUT_ATTEMPTS_PER_WINDOW = 10;
export const CHECKOUT_WINDOW_SECONDS = 15 * 60;
