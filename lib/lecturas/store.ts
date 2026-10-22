import { getServiceById } from '@/lib/mercadopago/catalog';
import { getDatabase } from '@/lib/neon';

import {
  CHECKOUT_ATTEMPTS_PER_WINDOW,
  CHECKOUT_WINDOW_SECONDS,
  MP_HOLD_MINUTES,
  TRANSFER_HOLD_HOURS,
  type LecturaQuestionServiceId,
} from '@/lib/lecturas/services';
import { artSlotFromUtc } from '@/lib/lecturas/time';

export class SlotTakenError extends Error {
  constructor() {
    super('slot_taken');
    this.name = 'SlotTakenError';
  }
}

export class SlotLimitError extends Error {
  constructor() {
    super('slot_limit');
    this.name = 'SlotLimitError';
  }
}

export class RateLimitError extends Error {
  constructor() {
    super('rate_limited');
    this.name = 'RateLimitError';
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSlotTaken(error: unknown): boolean {
  const message = errorText(error);
  return message.includes('slot_taken') || message.includes('23505') || message.includes('duplicate key');
}

function isSlotLimit(error: unknown): boolean {
  return errorText(error).includes('slot_limit');
}

function isRateLimited(error: unknown): boolean {
  return errorText(error).includes('rate_limited');
}

export function isUndefinedLecturaSchema(error: unknown): boolean {
  const message = errorText(error);
  return message.includes('42P01')
    || message.includes('42883')
    || (message.includes('does not exist') && message.includes('lectura_'));
}

export async function saveQuestionOrder(input: {
  checkoutId: string;
  serviceId: LecturaQuestionServiceId;
  name: string;
  email: string;
  phone: string;
  questions: string[];
  amountArs: number;
  paymentMethod: 'mercadopago' | 'transfer';
}): Promise<void> {
  const sql = getDatabase();

  await sql`
    INSERT INTO lectura_orders (
      checkout_id,
      service_id,
      customer_name,
      customer_email,
      customer_phone,
      question_count,
      questions,
      amount_ars,
      currency,
      payment_method,
      payment_status
    )
    VALUES (
      ${input.checkoutId}::uuid,
      ${input.serviceId},
      ${input.name},
      ${input.email},
      ${input.phone},
      ${input.questions.length},
      ${JSON.stringify(input.questions)}::jsonb,
      ${input.amountArs},
      'ARS',
      ${input.paymentMethod},
      'pending'
    )
  `;
}

export async function reserveCallSlot(input: {
  checkoutId: string;
  name: string;
  email: string;
  phone: string;
  startsAt: Date;
  paymentMethod: 'mercadopago' | 'transfer';
}): Promise<void> {
  const sql = getDatabase();
  const status = input.paymentMethod === 'mercadopago' ? 'hold' : 'pending_transfer';
  const holdMs = input.paymentMethod === 'mercadopago'
    ? MP_HOLD_MINUTES * 60 * 1000
    : TRANSFER_HOLD_HOURS * 60 * 60 * 1000;
  const holdExpiresAt = new Date(Date.now() + holdMs).toISOString();

  try {
    await sql`
      SELECT lectura_reserve_slot(
        ${input.checkoutId}::uuid,
        ${'lecturas-llamada-45'},
        ${input.startsAt.toISOString()}::timestamptz,
        ${status},
        ${holdExpiresAt}::timestamptz,
        ${input.name},
        ${input.email},
        ${input.phone},
        ${input.paymentMethod}
      )
    `;
  } catch (error) {
    if (isSlotLimit(error)) {
      throw new SlotLimitError();
    }

    if (isSlotTaken(error)) {
      throw new SlotTakenError();
    }

    throw error;
  }

  const service = getServiceById('lecturas-llamada-45');
  if (!service) {
    return;
  }

  await sql`
    UPDATE lectura_orders
    SET amount_ars = ${service.unitPrice}, currency = 'ARS', updated_at = NOW()
    WHERE checkout_id = ${input.checkoutId}::uuid
      AND amount_ars IS NULL
  `;
}

export async function registerCheckoutAttempt(subjectHash: string): Promise<void> {
  const sql = getDatabase();

  try {
    await sql`
      SELECT lectura_register_rate(
        ${subjectHash},
        ${CHECKOUT_ATTEMPTS_PER_WINDOW},
        ${CHECKOUT_WINDOW_SECONDS}
      )
    `;
  } catch (error) {
    if (isRateLimited(error)) {
      throw new RateLimitError();
    }

    throw error;
  }
}

export async function cancelPendingLectura(checkoutId: string): Promise<void> {
  const sql = getDatabase();

  await sql.transaction([
    sql`
      UPDATE lectura_reservations
      SET status = 'cancelled', updated_at = NOW()
      WHERE checkout_id = ${checkoutId}::uuid
        AND status IN ('hold', 'pending_transfer')
    `,
    sql`
      UPDATE lectura_orders
      SET payment_status = 'cancelled', updated_at = NOW()
      WHERE checkout_id = ${checkoutId}::uuid
        AND payment_status = 'pending'
    `,
  ]);
}

export async function listOccupiedSlots(from: Date, to: Date): Promise<Array<{ date: string; hour: number }>> {
  const sql = getDatabase();

  await sql`SELECT lectura_expire_stale_reservations()`;

  const rows = await sql`
    SELECT starts_at
    FROM lectura_reservations
    WHERE starts_at >= ${from.toISOString()}::timestamptz
      AND starts_at < ${to.toISOString()}::timestamptz
      AND (
        status = 'confirmed'
        OR (
          status IN ('hold', 'pending_transfer')
          AND hold_expires_at > NOW()
        )
      )
    UNION
    SELECT starts_at
    FROM lectura_slot_blocks
    WHERE starts_at >= ${from.toISOString()}::timestamptz
      AND starts_at < ${to.toISOString()}::timestamptz
  `;

  return rows.map((row) => {
    const slot = artSlotFromUtc(new Date(String(row.starts_at)));
    return { date: slot.dateKey, hour: slot.hour };
  });
}

export async function applyLecturaPayment(
  checkoutId: string,
  mpStatus: string,
  paymentId: string,
): Promise<string> {
  const status = /^[a-z_]{1,40}$/.test(mpStatus) ? mpStatus : 'pending';
  if (!/^[A-Za-z0-9:_-]{1,80}$/.test(paymentId)) {
    return 'ignored';
  }

  const sql = getDatabase();
  const rows = await sql`
    SELECT lectura_record_payment(
      ${checkoutId}::uuid,
      ${paymentId},
      ${status}
    ) AS result
  `;

  return String(rows[0]?.result ?? 'ignored');
}

export async function validatePendingLectura(
  checkoutId: string,
  decision: 'approved' | 'rejected'
): Promise<string> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT lectura_staff_decision(
      ${checkoutId}::uuid,
      ${decision}
    ) AS result
  `;

  return String(rows[0]?.result ?? 'missing');
}

export async function listOpenIncidents(): Promise<Array<{
  id: string;
  checkoutId: string;
  paymentId: string | null;
  kind: string;
  status: string;
  startsAt: string | null;
  operatorNotice: string;
  deliveryStatus: string;
  createdAt: string;
}>> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT
      id,
      checkout_id,
      payment_id,
      kind,
      status,
      starts_at,
      operator_notice,
      delivery_status,
      created_at
    FROM lectura_incidents
    WHERE status = 'open'
    ORDER BY created_at ASC
  `;

  return rows.map((row) => ({
    id: String(row.id),
    checkoutId: String(row.checkout_id),
    paymentId: row.payment_id ? String(row.payment_id) : null,
    kind: String(row.kind),
    status: String(row.status),
    startsAt: row.starts_at ? new Date(String(row.starts_at)).toISOString() : null,
    operatorNotice: String(row.operator_notice),
    deliveryStatus: String(row.delivery_status),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

export async function readLecturaPaymentStatus(checkoutId: string): Promise<string | null> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT payment_status
    FROM lectura_orders
    WHERE checkout_id = ${checkoutId}::uuid
    LIMIT 1
  `;

  if (rows.length === 0) {
    return null;
  }

  return String(rows[0].payment_status);
}

export async function readLecturaFulfillment(checkoutId: string): Promise<{
  serviceId: string;
  paymentStatus: string;
  paymentMethod: string;
  reservationStatus: string | null;
  openIncident: boolean;
  paymentEventStatus: string | null;
} | null> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT
      service_id,
      payment_status,
      payment_method,
      (
        SELECT reservation.status
        FROM lectura_reservations AS reservation
        WHERE reservation.checkout_id = lectura_order.checkout_id
      ) AS reservation_status,
      EXISTS (
        SELECT 1
        FROM lectura_incidents AS incident
        WHERE incident.checkout_id = lectura_order.checkout_id
          AND incident.kind = 'paid_without_slot'
          AND incident.status = 'open'
      ) AS open_incident,
      (
        SELECT payment_event.status
        FROM lectura_payment_events AS payment_event
        WHERE payment_event.checkout_id = lectura_order.checkout_id
        ORDER BY payment_event.updated_at DESC
        LIMIT 1
      ) AS payment_event_status
    FROM lectura_orders AS lectura_order
    WHERE lectura_order.checkout_id = ${checkoutId}::uuid
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    serviceId: String(row.service_id),
    paymentStatus: String(row.payment_status),
    paymentMethod: String(row.payment_method),
    reservationStatus: row.reservation_status ? String(row.reservation_status) : null,
    openIncident: row.open_incident === true || row.open_incident === 't' || row.open_incident === 'true',
    paymentEventStatus: row.payment_event_status ? String(row.payment_event_status) : null,
  };
}

export async function readCheckoutServiceId(checkoutId: string): Promise<string | null> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT service_id
    FROM mercadopago_checkouts
    WHERE checkout_id = ${checkoutId}::uuid
    LIMIT 1
  `;

  const serviceId = rows[0]?.service_id;
  return typeof serviceId === 'string' && serviceId.length > 0 ? serviceId : null;
}
