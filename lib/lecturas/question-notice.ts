import { getServiceById } from '@/lib/mercadopago/catalog';
import { isQuestionServiceId, questionCountFor } from '@/lib/lecturas/services';
import { ART_TIME_ZONE } from '@/lib/lecturas/time';

export const QUESTION_NOTICE_KIND = 'questions_paid';
export const SLOT_INCIDENT_KIND = 'slot_incident';
export const CALL_CONFIRMED_KIND = 'call_confirmed';
export const QUESTION_NOTICE_RECIPIENT = 'diferentedeterminado@gmail.com';
export const QUESTION_NOTICE_BATCH = 5;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM_PATTERN = /^(?:[^<>\r\n]+<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/;

export class LecturaMailError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'LecturaMailError';
    this.code = code;
  }
}

export type QuestionNoticeOrder = {
  checkoutId: string;
  serviceId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  questions: unknown;
  confirmedAt: Date;
  amountArs: number | null;
};

export type CallConfirmedNoticeOrder = {
  checkoutId: string;
  serviceId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  startsAt: Date | null;
  confirmed: boolean;
};

export type SlotIncidentNoticeOrder = {
  checkoutId: string;
  serviceId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  amountArs: number | null;
  paymentId: string | null;
  startsAt: Date | null;
  open: boolean;
};

export type QuestionNoticeMessage = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

export function lecturaEmailDispatchEnabled(): boolean {
  return process.env.LECTURAS_EMAIL_ENABLED === 'true'
    && Boolean(process.env.RESEND_API_KEY)
    && Boolean(process.env.RESEND_FROM_EMAIL);
}

function singleLine(value: string, max: number): string {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

export function safeMailbox(value: string): string | null {
  const email = singleLine(value, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return null;
  }

  return email;
}

function safeFrom(value: string): string | null {
  const from = singleLine(value, 200);
  if (!FROM_PATTERN.test(from) || from.split('@').length !== 2) {
    return null;
  }

  return from;
}

function readQuestions(value: unknown, maximum: number): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const questions: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return null;
    }

    const question = item.trim();
    if (!question) {
      continue;
    }

    if (question.length > 1500) {
      return null;
    }

    questions.push(question);
  }

  if (questions.length < 1 || questions.length > maximum) {
    return null;
  }

  return questions;
}

export function wholeArs(value: unknown): number | null {
  const amount = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000 || Math.round(amount) !== amount) {
    return null;
  }

  return amount;
}

function formatArs(amount: number): string {
  return `$${new Intl.NumberFormat('es-AR').format(amount)} ARS`;
}

function formatConfirmedAt(value: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ART_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

export function buildQuestionNotice(order: QuestionNoticeOrder): QuestionNoticeMessage | null {
  if (!isQuestionServiceId(order.serviceId)) {
    return null;
  }

  const service = getServiceById(order.serviceId);
  const questions = readQuestions(order.questions, questionCountFor(order.serviceId));
  const amountArs = wholeArs(order.amountArs);
  const replyTo = safeMailbox(order.customerEmail);
  const from = safeFrom(process.env.RESEND_FROM_EMAIL ?? '');
  const to = safeMailbox(process.env.LECTURAS_NOTIFY_EMAIL || QUESTION_NOTICE_RECIPIENT);
  if (!service || !questions || amountArs === null || !replyTo || !from || !to || Number.isNaN(order.confirmedAt.getTime())) {
    return null;
  }

  const name = singleLine(order.customerName, 200);
  const phone = singleLine(order.customerPhone, 30);
  if (!name || !phone) {
    return null;
  }

  const questionLines = questions.map((question, index) => `${index + 1}. ${question}`).join('\n');
  const text = [
    'Nueva lectura pagada',
    '',
    `Servicio: ${service.categoryTitle} — ${service.variant}`,
    `Importe: ${formatArs(amountArs)}`,
    `Pedido: ${order.checkoutId}`,
    `Confirmado: ${formatConfirmedAt(order.confirmedAt)}`,
    '',
    `Cliente: ${name}`,
    `Email: ${replyTo}`,
    `WhatsApp: ${phone}`,
    '',
    'Preguntas:',
    questionLines,
  ].join('\n');

  return {
    from,
    to,
    replyTo,
    subject: `Lectura pagada: ${service.variant} (${order.checkoutId})`,
    text,
    idempotencyKey: `lectura-questions-paid-${order.checkoutId}`,
  };
}

export function buildCallConfirmedNotice(order: CallConfirmedNoticeOrder): QuestionNoticeMessage | null {
  if (!order.confirmed || order.serviceId !== 'lecturas-llamada-45' || !order.startsAt || Number.isNaN(order.startsAt.getTime())) {
    return null;
  }

  const service = getServiceById(order.serviceId);
  const replyTo = safeMailbox(order.customerEmail);
  const from = safeFrom(process.env.RESEND_FROM_EMAIL ?? '');
  const to = safeMailbox(process.env.LECTURAS_NOTIFY_EMAIL || QUESTION_NOTICE_RECIPIENT);
  if (!service || !replyTo || !from || !to) {
    return null;
  }

  const name = singleLine(order.customerName, 200);
  const phone = singleLine(order.customerPhone, 30);
  if (!name || !phone) {
    return null;
  }

  const slot = formatConfirmedAt(order.startsAt);
  const text = [
    'Llamada de videncia confirmada',
    '',
    `Servicio: ${service.categoryTitle} — ${service.variant}`,
    `Pedido: ${order.checkoutId}`,
    `Llamada: ${slot}`,
    'Zona horaria: Argentina',
    '',
    `Cliente: ${name}`,
    `Email: ${replyTo}`,
    `WhatsApp: ${phone}`,
  ].join('\n');

  return {
    from,
    to,
    replyTo,
    subject: `Llamada confirmada (${order.checkoutId})`,
    text,
    idempotencyKey: `lectura-call-confirmed-${order.checkoutId}`,
  };
}

export function buildSlotIncidentNotice(order: SlotIncidentNoticeOrder): QuestionNoticeMessage | null {
  if (!order.open || order.serviceId !== 'lecturas-llamada-45') {
    return null;
  }

  const service = getServiceById(order.serviceId);
  const amountArs = wholeArs(order.amountArs);
  const replyTo = safeMailbox(order.customerEmail);
  const from = safeFrom(process.env.RESEND_FROM_EMAIL ?? '');
  const to = safeMailbox(process.env.LECTURAS_NOTIFY_EMAIL || QUESTION_NOTICE_RECIPIENT);
  if (!service || amountArs === null || !replyTo || !from || !to) {
    return null;
  }

  const name = singleLine(order.customerName, 200);
  const phone = singleLine(order.customerPhone, 30);
  const paymentId = order.paymentId ? singleLine(order.paymentId, 80) : 'sin identificador';
  if (!name || !phone) {
    return null;
  }

  const slot = order.startsAt && !Number.isNaN(order.startsAt.getTime())
    ? formatConfirmedAt(order.startsAt)
    : 'sin horario registrado';
  const text = [
    'Pago recibido sin horario confirmado',
    '',
    'El pago fue recibido, pero la reserva no quedó confirmada.',
    'Hay que reprogramar la llamada o revisar una devolución manual.',
    '',
    `Servicio: ${service.categoryTitle} — ${service.variant}`,
    `Importe: ${formatArs(amountArs)}`,
    `Pedido: ${order.checkoutId}`,
    `Pago: ${paymentId}`,
    `Horario solicitado: ${slot}`,
    '',
    `Cliente: ${name}`,
    `Email: ${replyTo}`,
    `WhatsApp: ${phone}`,
  ].join('\n');

  return {
    from,
    to,
    replyTo,
    subject: `Pago de llamada sin horario confirmado (${order.checkoutId})`,
    text,
    idempotencyKey: `lectura-slot-incident-${order.checkoutId}`,
  };
}

export function mailErrorCode(error: unknown): string {
  if (error instanceof LecturaMailError && /^[a-z0-9_]{1,40}$/.test(error.code)) {
    return error.code;
  }

  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'provider_timeout';
  }

  return 'provider_error';
}

export function mailOutcome(error: unknown): 'retry' | 'fail' {
  const code = mailErrorCode(error);
  if (code === 'provider_timeout' || code === 'provider_http_408' || code === 'provider_http_429' || /^provider_http_5\d\d$/.test(code)) {
    return 'retry';
  }

  return 'fail';
}

export async function sendQuestionNotice(message: QuestionNoticeMessage): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new LecturaMailError('provider_unconfigured');
  }

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        reply_to: message.replyTo,
        subject: message.subject,
        text: message.text,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new LecturaMailError('provider_timeout');
    }

    throw new LecturaMailError('provider_error');
  }

  if (!response.ok) {
    const status = response.status;
    throw new LecturaMailError(
      status >= 100 && status <= 599 ? `provider_http_${status}` : 'provider_error',
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const id = payload && typeof payload === 'object' && 'id' in payload ? payload.id : null;
  if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    return id;
  }

  return null;
}
