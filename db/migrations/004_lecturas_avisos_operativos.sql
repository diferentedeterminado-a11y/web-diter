-- Avisos operativos de lecturas.
-- Efecto: guarda el importe del pedido y permite avisar un horario pagado sin reserva.
-- No modifica pedidos existentes, pagos de Mercado Pago ni lectura_record_payment.
-- Requiere 003. Se puede volver a ejecutar.
-- No aplicar sobre production hasta una autorización explícita.
-- No ejecutar sobre la rama backup-pre-migracion-002-diter.

ALTER TABLE lectura_orders
  ADD COLUMN IF NOT EXISTS amount_ars integer,
  ADD COLUMN IF NOT EXISTS currency text;

DO $$
BEGIN
  ALTER TABLE lectura_orders
    ADD CONSTRAINT lectura_orders_amount_currency
    CHECK (
      (amount_ars IS NULL AND currency IS NULL)
      OR (
        amount_ars BETWEEN 1 AND 100000000
        AND currency = 'ARS'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE lectura_notifications DROP CONSTRAINT IF EXISTS lectura_notifications_kind;

ALTER TABLE lectura_notifications
  ADD CONSTRAINT lectura_notifications_kind
  CHECK (kind IN ('questions_paid', 'slot_incident', 'call_confirmed'));

CREATE INDEX IF NOT EXISTS lectura_notifications_due_any
  ON lectura_notifications (next_attempt_at, created_at)
  WHERE status IN ('pending', 'sending', 'failed');

CREATE OR REPLACE FUNCTION lectura_enqueue_slot_incident(p_checkout_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO lectura_notifications (
    checkout_id,
    kind,
    status,
    next_attempt_at
  )
  SELECT
    incident.checkout_id,
    'slot_incident',
    'pending',
    NOW()
  FROM lectura_incidents AS incident
  WHERE incident.checkout_id = p_checkout_id
    AND incident.kind = 'paid_without_slot'
    AND incident.status = 'open'
    AND incident.delivery_status = 'pending'
  ON CONFLICT (checkout_id, kind) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION lectura_backfill_slot_incidents()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO lectura_notifications (
    checkout_id,
    kind,
    status,
    next_attempt_at
  )
  SELECT
    incident.checkout_id,
    'slot_incident',
    'pending',
    NOW()
  FROM lectura_incidents AS incident
  WHERE incident.kind = 'paid_without_slot'
    AND incident.status = 'open'
    AND incident.delivery_status = 'pending'
  ON CONFLICT (checkout_id, kind) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION lectura_claim_due_notice()
RETURNS TABLE (notification_id uuid, checkout_id uuid, kind text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_checkout uuid;
  v_kind text;
BEGIN
  SELECT notification.id, notification.checkout_id, notification.kind
  INTO v_id, v_checkout, v_kind
  FROM lectura_notifications AS notification
  WHERE notification.attempt_count < notification.max_attempts
    AND (
      (
        notification.status IN ('pending', 'failed')
        AND notification.next_attempt_at <= NOW()
      )
      OR (
        notification.status = 'sending'
        AND notification.claimed_at IS NOT NULL
        AND notification.claimed_at < NOW() - INTERVAL '5 minutes'
      )
    )
  ORDER BY notification.next_attempt_at, notification.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE lectura_notifications
  SET
    status = 'sending',
    claimed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_id;

  notification_id := v_id;
  checkout_id := v_checkout;
  kind := v_kind;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION lectura_finish_notice(
  p_id uuid,
  p_outcome text,
  p_error_code text,
  p_provider_message_id text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempts integer;
  v_max integer;
  v_error text;
  v_provider text;
BEGIN
  IF p_outcome NOT IN ('sent', 'retry', 'fail', 'release') THEN
    RAISE EXCEPTION 'notice_outcome_invalid' USING ERRCODE = 'P0001';
  END IF;

  v_error := NULL;
  IF p_error_code IS NOT NULL AND p_error_code ~ '^[a-z0-9_]{1,40}$' THEN
    v_error := p_error_code;
  ELSIF p_error_code IS NOT NULL THEN
    v_error := 'provider_error';
  END IF;

  v_provider := NULL;
  IF p_provider_message_id IS NOT NULL AND p_provider_message_id ~ '^[A-Za-z0-9_-]{1,80}$' THEN
    v_provider := p_provider_message_id;
  END IF;

  SELECT attempt_count, max_attempts
  INTO v_attempts, v_max
  FROM lectura_notifications
  WHERE id = p_id
    AND status = 'sending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_outcome = 'sent' THEN
    UPDATE lectura_notifications
    SET
      status = 'sent',
      sent_at = NOW(),
      claimed_at = NULL,
      provider_message_id = v_provider,
      last_error_code = NULL,
      attempt_count = LEAST(attempt_count + 1, max_attempts),
      updated_at = NOW()
    WHERE id = p_id;
    RETURN;
  END IF;

  IF p_outcome = 'release' THEN
    UPDATE lectura_notifications
    SET
      status = 'pending',
      claimed_at = NULL,
      next_attempt_at = NOW() + INTERVAL '15 minutes',
      last_error_code = COALESCE(v_error, 'provider_unconfigured'),
      updated_at = NOW()
    WHERE id = p_id;
    RETURN;
  END IF;

  IF p_outcome = 'fail' THEN
    UPDATE lectura_notifications
    SET
      status = 'failed',
      claimed_at = NULL,
      attempt_count = max_attempts,
      next_attempt_at = NOW() + INTERVAL '100 years',
      last_error_code = COALESCE(v_error, 'provider_error'),
      updated_at = NOW()
    WHERE id = p_id;
    RETURN;
  END IF;

  v_attempts := v_attempts + 1;

  UPDATE lectura_notifications
  SET
    attempt_count = v_attempts,
    claimed_at = NULL,
    last_error_code = COALESCE(v_error, 'provider_error'),
    updated_at = NOW(),
    status = CASE WHEN v_attempts >= v_max THEN 'failed' ELSE 'pending' END,
    next_attempt_at = CASE
      WHEN v_attempts >= v_max THEN NOW() + INTERVAL '100 years'
      WHEN v_attempts = 1 THEN NOW() + INTERVAL '1 minute'
      WHEN v_attempts = 2 THEN NOW() + INTERVAL '5 minutes'
      WHEN v_attempts = 3 THEN NOW() + INTERVAL '15 minutes'
      WHEN v_attempts = 4 THEN NOW() + INTERVAL '1 hour'
      ELSE NOW() + INTERVAL '6 hours'
    END
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION lectura_enqueue_call_notice(p_checkout_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO lectura_notifications (
    checkout_id,
    kind,
    status,
    next_attempt_at
  )
  SELECT
    lectura_order.checkout_id,
    'call_confirmed',
    'pending',
    NOW()
  FROM lectura_orders AS lectura_order
  INNER JOIN lectura_reservations AS reservation
    ON reservation.checkout_id = lectura_order.checkout_id
  WHERE lectura_order.checkout_id = p_checkout_id
    AND lectura_order.payment_status = 'approved'
    AND lectura_order.service_id = 'lecturas-llamada-45'
    AND reservation.status = 'confirmed'
  ON CONFLICT (checkout_id, kind) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION lectura_backfill_call_notices()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO lectura_notifications (
    checkout_id,
    kind,
    status,
    next_attempt_at
  )
  SELECT
    lectura_order.checkout_id,
    'call_confirmed',
    'pending',
    NOW()
  FROM lectura_orders AS lectura_order
  INNER JOIN lectura_reservations AS reservation
    ON reservation.checkout_id = lectura_order.checkout_id
  WHERE lectura_order.payment_status = 'approved'
    AND lectura_order.service_id = 'lecturas-llamada-45'
    AND reservation.status = 'confirmed'
  ON CONFLICT (checkout_id, kind) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;
