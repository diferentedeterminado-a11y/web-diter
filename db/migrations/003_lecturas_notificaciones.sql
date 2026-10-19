-- Cola de notificaciones de preguntas pagadas.
-- Efecto: agrega una tabla y funciones nuevas. No modifica pedidos, reservas,
-- pagos de Mercado Pago ni la función lectura_record_payment.
-- Se puede volver a ejecutar.
-- No aplicar sobre production hasta una autorización explícita.
-- No ejecutar sobre la rama backup-pre-migracion-002-diter.

CREATE TABLE IF NOT EXISTS lectura_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES lectura_orders (checkout_id),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT NOW(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT lectura_notifications_kind CHECK (kind IN ('questions_paid')),
  CONSTRAINT lectura_notifications_status CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  CONSTRAINT lectura_notifications_attempts CHECK (
    attempt_count >= 0
    AND max_attempts BETWEEN 1 AND 12
    AND attempt_count <= max_attempts
  ),
  CONSTRAINT lectura_notifications_error_code CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,40}$'
  ),
  CONSTRAINT lectura_notifications_provider_id CHECK (
    provider_message_id IS NULL OR provider_message_id ~ '^[A-Za-z0-9_-]{1,80}$'
  ),
  CONSTRAINT lectura_notifications_idempotent UNIQUE (checkout_id, kind)
);

CREATE INDEX IF NOT EXISTS lectura_notifications_due
  ON lectura_notifications (next_attempt_at, created_at)
  WHERE kind = 'questions_paid'
    AND status IN ('pending', 'sending', 'failed');

CREATE OR REPLACE FUNCTION lectura_enqueue_question_notice(p_checkout_id uuid)
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
    checkout_id,
    'questions_paid',
    'pending',
    NOW()
  FROM lectura_orders
  WHERE checkout_id = p_checkout_id
    AND payment_status = 'approved'
    AND service_id IN (
      'lecturas-3-preguntas',
      'lecturas-6-preguntas',
      'lecturas-10-preguntas'
    )
    AND questions IS NOT NULL
    AND jsonb_typeof(questions) = 'array'
    AND jsonb_array_length(questions) > 0
  ON CONFLICT (checkout_id, kind) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION lectura_backfill_question_notices()
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
    checkout_id,
    'questions_paid',
    'pending',
    NOW()
  FROM lectura_orders
  WHERE payment_status = 'approved'
    AND service_id IN (
      'lecturas-3-preguntas',
      'lecturas-6-preguntas',
      'lecturas-10-preguntas'
    )
    AND questions IS NOT NULL
    AND jsonb_typeof(questions) = 'array'
    AND jsonb_array_length(questions) > 0
  ON CONFLICT (checkout_id, kind) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION lectura_claim_question_notice()
RETURNS TABLE (notification_id uuid, checkout_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_checkout uuid;
BEGIN
  SELECT notification.id, notification.checkout_id
  INTO v_id, v_checkout
  FROM lectura_notifications AS notification
  WHERE notification.kind = 'questions_paid'
    AND notification.attempt_count < notification.max_attempts
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
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION lectura_finish_question_notice(
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
    AND kind = 'questions_paid'
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

CREATE OR REPLACE FUNCTION lectura_requeue_question_notice(p_checkout_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status
  INTO v_status
  FROM lectura_notifications
  WHERE checkout_id = p_checkout_id
    AND kind = 'questions_paid'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_status = 'sent' THEN
    RETURN 'sent';
  END IF;

  IF v_status = 'sending' THEN
    RETURN 'sending';
  END IF;

  UPDATE lectura_notifications
  SET
    status = 'pending',
    attempt_count = 0,
    claimed_at = NULL,
    sent_at = NULL,
    provider_message_id = NULL,
    last_error_code = NULL,
    next_attempt_at = NOW(),
    updated_at = NOW()
  WHERE checkout_id = p_checkout_id
    AND kind = 'questions_paid';

  RETURN 'requeued';
END;
$$;
