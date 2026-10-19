import { getDatabase } from '@/lib/neon';
import { isUndefinedLecturaSchema } from '@/lib/lecturas/store';
import {
  QUESTION_NOTICE_BATCH,
  buildCallConfirmedNotice,
  buildQuestionNotice,
  buildSlotIncidentNotice,
  lecturaEmailDispatchEnabled,
  mailErrorCode,
  mailOutcome,
  sendQuestionNotice,
  wholeArs,
  type CallConfirmedNoticeOrder,
  type QuestionNoticeOrder,
  type SlotIncidentNoticeOrder,
} from '@/lib/lecturas/question-notice';

type ClaimRow = {
  notification_id: string;
  checkout_id: string;
  kind: string;
};

type OrderRow = {
  service_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  questions: unknown;
  confirmed_at: string | Date;
  charged_amount: unknown;
};

type IncidentRow = {
  service_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  payment_id: string | null;
  starts_at: string | Date | null;
  incident_status: string;
  charged_amount: unknown;
};

export type QuestionNoticeDispatchResult = {
  skipped: boolean;
  sent: number;
  retry: number;
  failed: number;
};

function asOrder(checkoutId: string, row: OrderRow): QuestionNoticeOrder {
  return {
    checkoutId,
    serviceId: String(row.service_id),
    customerName: String(row.customer_name),
    customerEmail: String(row.customer_email),
    customerPhone: String(row.customer_phone),
    questions: row.questions,
    confirmedAt: new Date(row.confirmed_at),
    amountArs: wholeArs(row.charged_amount),
  };
}

function asIncident(checkoutId: string, row: IncidentRow): SlotIncidentNoticeOrder {
  return {
    checkoutId,
    serviceId: String(row.service_id),
    customerName: String(row.customer_name),
    customerEmail: String(row.customer_email),
    customerPhone: String(row.customer_phone),
    amountArs: wholeArs(row.charged_amount),
    paymentId: row.payment_id ? String(row.payment_id) : null,
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    open: row.incident_status === 'open',
  };
}


async function finishNotice(
  notificationId: string,
  outcome: 'sent' | 'retry' | 'fail' | 'release',
  errorCode: string | null,
  providerMessageId: string | null,
): Promise<void> {
  const sql = getDatabase();
  await sql`
    SELECT lectura_finish_notice(
      ${notificationId}::uuid,
      ${outcome},
      ${errorCode},
      ${providerMessageId}
    )
  `;
}

export async function enqueuePaidQuestionNotice(checkoutId: string): Promise<void> {
  const sql = getDatabase();
  await sql`SELECT lectura_enqueue_question_notice(${checkoutId}::uuid)`;
  await sql`SELECT lectura_backfill_question_notices()`;
}

export async function enqueueCallConfirmedNotice(checkoutId: string): Promise<void> {
  const sql = getDatabase();
  await sql`SELECT lectura_enqueue_call_notice(${checkoutId}::uuid)`;
  await sql`SELECT lectura_backfill_call_notices()`;
}

export async function enqueueSlotIncidentNotice(checkoutId: string): Promise<void> {
  const sql = getDatabase();
  await sql`SELECT lectura_enqueue_slot_incident(${checkoutId}::uuid)`;
  await sql`SELECT lectura_backfill_slot_incidents()`;
}

export async function requeuePaidQuestionNotice(checkoutId: string): Promise<string> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT lectura_requeue_question_notice(${checkoutId}::uuid) AS result
  `;
  return String(rows[0]?.result ?? 'missing');
}

async function markIncidentDelivery(checkoutId: string, deliveryStatus: 'sent' | 'suppressed'): Promise<void> {
  const sql = getDatabase();
  await sql`
    UPDATE lectura_incidents
    SET delivery_status = ${deliveryStatus}
    WHERE checkout_id = ${checkoutId}::uuid
      AND kind = 'paid_without_slot'
      AND delivery_status = 'pending'
  `;
}

export async function dispatchLecturaNotices(): Promise<QuestionNoticeDispatchResult> {
  if (!lecturaEmailDispatchEnabled()) {
    return { skipped: true, sent: 0, retry: 0, failed: 0 };
  }

  const sql = getDatabase();
  await sql`SELECT lectura_backfill_question_notices()`;
  await sql`SELECT lectura_backfill_slot_incidents()`;
  await sql`SELECT lectura_backfill_call_notices()`;

  const result = { skipped: false, sent: 0, retry: 0, failed: 0 };
  for (let index = 0; index < QUESTION_NOTICE_BATCH; index += 1) {
    const claimed = (await sql`
      SELECT notification_id, checkout_id, kind
      FROM lectura_claim_due_notice()
    `) as ClaimRow[];
    const claim = claimed[0];
    if (!claim) {
      break;
    }

    const notificationId = String(claim.notification_id);
    const checkoutId = String(claim.checkout_id);
    const kind = String(claim.kind);

    try {
      if (kind === 'slot_incident') {
        const incidents = (await sql`
          SELECT
            lectura_order.service_id,
            lectura_order.customer_name,
            lectura_order.customer_email,
            lectura_order.customer_phone,
            incident.payment_id,
            incident.starts_at,
            incident.status AS incident_status,
            COALESCE(
              (
                SELECT payment.amount
                FROM lectura_payment_events AS payment_event
                INNER JOIN mercadopago_payments AS payment
                  ON payment.payment_id = payment_event.payment_id
                WHERE payment_event.checkout_id = lectura_order.checkout_id
                  AND payment_event.status = 'approved'
                  AND payment.currency = 'ARS'
                ORDER BY payment_event.updated_at DESC
                LIMIT 1
              ),
              lectura_order.amount_ars
            ) AS charged_amount
          FROM lectura_orders AS lectura_order
          INNER JOIN lectura_incidents AS incident
            ON incident.checkout_id = lectura_order.checkout_id
            AND incident.kind = 'paid_without_slot'
          WHERE lectura_order.checkout_id = ${checkoutId}::uuid
          ORDER BY incident.created_at DESC
          LIMIT 1
        `) as IncidentRow[];
        const incident = incidents[0] ? asIncident(checkoutId, incidents[0]) : null;
        if (incident && !incident.open) {
          await finishNotice(notificationId, 'fail', 'incident_resolved', null);
          await markIncidentDelivery(checkoutId, 'suppressed');
          result.failed += 1;
          continue;
        }

        const message = incident ? buildSlotIncidentNotice(incident) : null;
        if (!message) {
          await finishNotice(notificationId, 'fail', 'notice_not_eligible', null);
          result.failed += 1;
          continue;
        }

        const providerMessageId = await sendQuestionNotice(message);
        await finishNotice(notificationId, 'sent', null, providerMessageId);
        await markIncidentDelivery(checkoutId, 'sent');
        result.sent += 1;
        continue;
      }

      if (kind === 'call_confirmed') {
        const calls = (await sql`
          SELECT
            lectura_order.service_id,
            lectura_order.customer_name,
            lectura_order.customer_email,
            lectura_order.customer_phone,
            reservation.starts_at,
            reservation.status AS reservation_status
          FROM lectura_orders AS lectura_order
          INNER JOIN lectura_reservations AS reservation
            ON reservation.checkout_id = lectura_order.checkout_id
          WHERE lectura_order.checkout_id = ${checkoutId}::uuid
            AND lectura_order.payment_status = 'approved'
          LIMIT 1
        `) as Array<{
          service_id: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          starts_at: string | Date | null;
          reservation_status: string;
        }>;
        const call = calls[0];
        const notice: CallConfirmedNoticeOrder | null = call
          ? {
            checkoutId,
            serviceId: String(call.service_id),
            customerName: String(call.customer_name),
            customerEmail: String(call.customer_email),
            customerPhone: String(call.customer_phone),
            startsAt: call.starts_at ? new Date(call.starts_at) : null,
            confirmed: call.reservation_status === 'confirmed',
          }
          : null;
        const callMessage = notice ? buildCallConfirmedNotice(notice) : null;
        if (!callMessage) {
          await finishNotice(notificationId, 'fail', 'notice_not_eligible', null);
          result.failed += 1;
          continue;
        }

        const callProviderId = await sendQuestionNotice(callMessage);
        await finishNotice(notificationId, 'sent', null, callProviderId);
        result.sent += 1;
        continue;
      }

      const orders = (await sql`
        SELECT
          lectura_order.service_id,
          lectura_order.customer_name,
          lectura_order.customer_email,
          lectura_order.customer_phone,
          lectura_order.questions,
          COALESCE(
            (
              SELECT payment_event.updated_at
              FROM lectura_payment_events AS payment_event
              WHERE payment_event.checkout_id = lectura_order.checkout_id
                AND payment_event.status = 'approved'
              ORDER BY payment_event.updated_at DESC
              LIMIT 1
            ),
            lectura_order.updated_at
          ) AS confirmed_at,
          COALESCE(
            (
              SELECT payment.amount
              FROM lectura_payment_events AS payment_event
              INNER JOIN mercadopago_payments AS payment
                ON payment.payment_id = payment_event.payment_id
              WHERE payment_event.checkout_id = lectura_order.checkout_id
                AND payment_event.status = 'approved'
                AND payment.currency = 'ARS'
              ORDER BY payment_event.updated_at DESC
              LIMIT 1
            ),
            lectura_order.amount_ars
          ) AS charged_amount
        FROM lectura_orders AS lectura_order
        WHERE lectura_order.checkout_id = ${checkoutId}::uuid
          AND lectura_order.payment_status = 'approved'
        LIMIT 1
      `) as OrderRow[];
      const message = orders[0] && kind === 'questions_paid'
        ? buildQuestionNotice(asOrder(checkoutId, orders[0]))
        : null;
      if (!message) {
        await finishNotice(notificationId, 'fail', 'notice_not_eligible', null);
        result.failed += 1;
        continue;
      }

      const providerMessageId = await sendQuestionNotice(message);
      await finishNotice(notificationId, 'sent', null, providerMessageId);
      result.sent += 1;
    } catch (error) {
      const code = mailErrorCode(error);
      const outcome = mailOutcome(error);
      console.error('lectura_question_notice_failed', code);
      await finishNotice(notificationId, outcome, code, null);
      if (outcome === 'retry') {
        result.retry += 1;
      } else {
        result.failed += 1;
      }
    }
  }

  return result;
}

export async function dispatchLecturaQuestionNotices(): Promise<QuestionNoticeDispatchResult> {
  return dispatchLecturaNotices();
}

export async function scheduleLecturaQuestionNotice(checkoutId: string, paymentResult: string): Promise<void> {
  try {
    if (paymentResult === 'approved') {
      await enqueuePaidQuestionNotice(checkoutId);
    }
    if (paymentResult === 'incident') {
      await enqueueSlotIncidentNotice(checkoutId);
    }
    if (paymentResult === 'confirmed') {
      await enqueueCallConfirmedNotice(checkoutId);
    }
    await dispatchLecturaNotices();
  } catch (error) {
    if (isUndefinedLecturaSchema(error)) {
      return;
    }

    console.error('lectura_question_notice_failed', 'dispatch_error');
  }
}
