-- Integridad de lecturas vinculares.
-- Efecto: agrega tablas y funciones. No borra pedidos ni reservas.
-- Reemplaza lectura_reserve_slot con la misma firma para vencer también
-- las transferencias y limitar solicitudes abiertas.
-- No modifica las tablas de Mercado Pago.
-- Se puede volver a ejecutar.
-- No aplicar sobre Neon ni producción hasta una autorización explícita.

CREATE TABLE IF NOT EXISTS lectura_payment_events (
  payment_id text PRIMARY KEY,
  checkout_id uuid NOT NULL REFERENCES lectura_orders (checkout_id),
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT lectura_payment_events_status CHECK (status ~ '^[a-z_]{1,40}$')
);

CREATE TABLE IF NOT EXISTS lectura_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES lectura_orders (checkout_id),
  payment_id text,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  starts_at timestamptz,
  operator_notice text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  resolved_at timestamptz,
  CONSTRAINT lectura_incidents_kind CHECK (kind IN ('paid_without_slot')),
  CONSTRAINT lectura_incidents_status CHECK (status IN ('open', 'resolved')),
  CONSTRAINT lectura_incidents_delivery CHECK (delivery_status IN ('pending', 'sent', 'suppressed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS lectura_incidents_one_open
  ON lectura_incidents (checkout_id, kind)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS lectura_validation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid,
  action text NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT lectura_validation_log_action CHECK (action IN ('approved', 'rejected')),
  CONSTRAINT lectura_validation_log_outcome CHECK (
    outcome IN (
      'missing',
      'not_transfer',
      'not_pending',
      'approved',
      'confirmed',
      'incident',
      'rejected',
      'ignored'
    )
  )
);

CREATE TABLE IF NOT EXISTS lectura_rate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lectura_rate_events_subject_time
  ON lectura_rate_events (subject_hash, created_at);

CREATE OR REPLACE FUNCTION lectura_expire_stale_reservations()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE lectura_reservations
  SET status = 'expired', updated_at = NOW()
  WHERE status IN ('hold', 'pending_transfer')
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at <= NOW();
END;
$$;

CREATE OR REPLACE FUNCTION lectura_register_rate(
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_subject_hash IS NULL OR length(p_subject_hash) < 32 OR p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'rate_invalid' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM lectura_rate_events
  WHERE created_at < NOW() - INTERVAL '1 day';

  INSERT INTO lectura_rate_events (subject_hash)
  VALUES (p_subject_hash);

  SELECT COUNT(*) INTO v_count
  FROM lectura_rate_events
  WHERE subject_hash = p_subject_hash
    AND created_at > NOW() - make_interval(secs => p_window_seconds);

  IF v_count > p_limit THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION lectura_reserve_slot(
  p_checkout_id uuid,
  p_service_id text,
  p_starts_at timestamptz,
  p_status text,
  p_hold_expires_at timestamptz,
  p_name text,
  p_email text,
  p_phone text,
  p_payment_method text
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_phone text := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
  IF p_status NOT IN ('hold', 'pending_transfer') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001';
  END IF;

  PERFORM lectura_expire_stale_reservations();
  PERFORM pg_advisory_xact_lock(hashtext('lectura-person-email:' || lower(p_email)));
  PERFORM pg_advisory_xact_lock(hashtext('lectura-person-phone:' || v_phone));
  PERFORM pg_advisory_xact_lock(hashtext('lectura-slot:' || p_starts_at::text));

  IF EXISTS (
    SELECT 1
    FROM lectura_reservations AS reservation
    JOIN lectura_orders AS lectura_order ON lectura_order.checkout_id = reservation.checkout_id
    WHERE reservation.status IN ('hold', 'pending_transfer')
      AND (
        lower(lectura_order.customer_email) = lower(p_email)
        OR (
          v_phone <> ''
          AND regexp_replace(lectura_order.customer_phone, '\D', '', 'g') = v_phone
        )
      )
  ) THEN
    RAISE EXCEPTION 'slot_limit' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM lectura_slot_blocks WHERE starts_at = p_starts_at
  ) OR EXISTS (
    SELECT 1
    FROM lectura_reservations
    WHERE starts_at = p_starts_at
      AND status IN ('hold', 'pending_transfer', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = '23505';
  END IF;

  INSERT INTO lectura_orders (
    checkout_id,
    service_id,
    customer_name,
    customer_email,
    customer_phone,
    question_count,
    questions,
    payment_method,
    payment_status
  ) VALUES (
    p_checkout_id,
    p_service_id,
    p_name,
    p_email,
    p_phone,
    NULL,
    NULL,
    p_payment_method,
    'pending'
  );

  INSERT INTO lectura_reservations (
    id,
    checkout_id,
    starts_at,
    duration_minutes,
    status,
    hold_expires_at
  ) VALUES (
    gen_random_uuid(),
    p_checkout_id,
    p_starts_at,
    45,
    p_status,
    p_hold_expires_at
  );

  RETURN p_checkout_id;
END;
$$;

CREATE OR REPLACE FUNCTION lectura_record_payment(
  p_checkout_id uuid,
  p_payment_id text,
  p_status text
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_recorded text;
  v_owner uuid;
  v_reservation_id uuid;
  v_reservation_status text;
  v_starts_at timestamptz;
  v_notice text;
BEGIN
  IF p_payment_id IS NULL OR length(p_payment_id) < 1 OR length(p_payment_id) > 80 THEN
    RETURN 'ignored';
  END IF;

  IF p_status !~ '^[a-z_]{1,40}$' THEN
    RETURN 'ignored';
  END IF;

  PERFORM 1
  FROM lectura_orders
  WHERE checkout_id = p_checkout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  WITH upsert AS (
    INSERT INTO lectura_payment_events (payment_id, checkout_id, status)
    VALUES (p_payment_id, p_checkout_id, p_status)
    ON CONFLICT (payment_id) DO UPDATE
    SET status = EXCLUDED.status, updated_at = NOW()
    WHERE lectura_payment_events.checkout_id = EXCLUDED.checkout_id
      AND (
        CASE EXCLUDED.status
          WHEN 'approved' THEN lectura_payment_events.status NOT IN ('refunded', 'charged_back')
          WHEN 'refunded' THEN TRUE
          WHEN 'charged_back' THEN TRUE
          ELSE lectura_payment_events.status NOT IN ('approved', 'refunded', 'charged_back')
        END
      )
    RETURNING status
  )
  SELECT status INTO v_recorded FROM upsert;

  IF NOT FOUND THEN
    SELECT checkout_id, status
    INTO v_owner, v_recorded
    FROM lectura_payment_events
    WHERE payment_id = p_payment_id;

    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'payment_event_failed' USING ERRCODE = 'P0001';
    END IF;

    IF v_owner <> p_checkout_id THEN
      RAISE EXCEPTION 'payment_checkout_mismatch' USING ERRCODE = 'P0001';
    END IF;

    IF p_status = 'approved' AND v_recorded IN ('refunded', 'charged_back') THEN
      RETURN 'ignored';
    END IF;
  END IF;

  IF p_status IN ('refunded', 'charged_back') THEN
    UPDATE lectura_orders
    SET payment_status = 'rejected', updated_at = NOW()
    WHERE checkout_id = p_checkout_id
      AND payment_status IN ('pending', 'approved');

    UPDATE lectura_reservations
    SET status = 'cancelled', updated_at = NOW()
    WHERE checkout_id = p_checkout_id
      AND status IN ('hold', 'pending_transfer', 'confirmed');

    RETURN 'reversed';
  END IF;

  IF p_status <> 'approved' THEN
    RETURN 'attempt_recorded';
  END IF;

  UPDATE lectura_orders
  SET payment_status = 'approved', updated_at = NOW()
  WHERE checkout_id = p_checkout_id
    AND payment_status IN ('pending', 'approved', 'rejected', 'cancelled');

  PERFORM lectura_expire_stale_reservations();

  SELECT id, status, starts_at
  INTO v_reservation_id, v_reservation_status, v_starts_at
  FROM lectura_reservations
  WHERE checkout_id = p_checkout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'approved';
  END IF;

  IF v_reservation_status = 'confirmed' THEN
    RETURN 'confirmed';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lectura-slot:' || v_starts_at::text));

  IF v_reservation_status IN ('hold', 'pending_transfer')
    AND EXISTS (
      SELECT 1
      FROM lectura_reservations
      WHERE id = v_reservation_id
        AND status IN ('hold', 'pending_transfer')
        AND hold_expires_at > NOW()
    )
    AND NOT EXISTS (
      SELECT 1 FROM lectura_slot_blocks WHERE starts_at = v_starts_at
    ) THEN
    UPDATE lectura_reservations
    SET status = 'confirmed', hold_expires_at = NULL, updated_at = NOW()
    WHERE id = v_reservation_id
      AND status IN ('hold', 'pending_transfer');

    UPDATE lectura_incidents
    SET status = 'resolved', resolved_at = NOW()
    WHERE checkout_id = p_checkout_id
      AND kind = 'paid_without_slot'
      AND status = 'open';

    RETURN 'confirmed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM lectura_slot_blocks WHERE starts_at = v_starts_at
  ) OR EXISTS (
    SELECT 1
    FROM lectura_reservations
    WHERE starts_at = v_starts_at
      AND checkout_id <> p_checkout_id
      AND status IN ('hold', 'pending_transfer', 'confirmed')
  ) THEN
    UPDATE lectura_reservations
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_reservation_id
      AND status IN ('hold', 'pending_transfer');

    v_notice := 'Pago aprobado y el horario ya no está disponible. '
      || 'La reserva no quedó confirmada. Requiere reprogramación o revisión manual de devolución. '
      || 'Checkout ' || p_checkout_id::text || '.';

    INSERT INTO lectura_incidents (
      checkout_id,
      payment_id,
      kind,
      status,
      starts_at,
      operator_notice,
      delivery_status
    )
    SELECT
      p_checkout_id,
      p_payment_id,
      'paid_without_slot',
      'open',
      v_starts_at,
      v_notice,
      'pending'
    WHERE NOT EXISTS (
      SELECT 1
      FROM lectura_incidents
      WHERE checkout_id = p_checkout_id
        AND kind = 'paid_without_slot'
        AND status = 'open'
    );

    RETURN 'incident';
  END IF;

  BEGIN
    UPDATE lectura_reservations
    SET status = 'confirmed', hold_expires_at = NULL, updated_at = NOW()
    WHERE id = v_reservation_id
      AND status IN ('expired', 'cancelled', 'rejected', 'hold', 'pending_transfer');

    UPDATE lectura_incidents
    SET status = 'resolved', resolved_at = NOW()
    WHERE checkout_id = p_checkout_id
      AND kind = 'paid_without_slot'
      AND status = 'open';
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE lectura_reservations
      SET status = 'expired', updated_at = NOW()
      WHERE id = v_reservation_id
        AND status IN ('hold', 'pending_transfer');

      INSERT INTO lectura_incidents (
        checkout_id,
        payment_id,
        kind,
        status,
        starts_at,
        operator_notice,
        delivery_status
      )
      SELECT
        p_checkout_id,
        p_payment_id,
        'paid_without_slot',
        'open',
        v_starts_at,
        'Pago aprobado y el horario fue tomado por otra reserva. La reserva no quedó confirmada.',
        'pending'
      WHERE NOT EXISTS (
        SELECT 1
        FROM lectura_incidents
        WHERE checkout_id = p_checkout_id
          AND kind = 'paid_without_slot'
          AND status = 'open'
      );

      RETURN 'incident';
  END;

  RETURN 'confirmed';
END;
$$;

CREATE OR REPLACE FUNCTION lectura_staff_decision(
  p_checkout_id uuid,
  p_decision text
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_method text;
  v_payment_status text;
  v_result text;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_decision' USING ERRCODE = 'P0001';
  END IF;

  SELECT payment_method, payment_status
  INTO v_method, v_payment_status
  FROM lectura_orders
  WHERE checkout_id = p_checkout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO lectura_validation_log (checkout_id, action, outcome)
    VALUES (p_checkout_id, p_decision, 'missing');
    RETURN 'missing';
  END IF;

  IF v_method <> 'transfer' THEN
    INSERT INTO lectura_validation_log (checkout_id, action, outcome)
    VALUES (p_checkout_id, p_decision, 'not_transfer');
    RETURN 'not_transfer';
  END IF;

  IF p_decision = 'approved' THEN
    v_result := lectura_record_payment(
      p_checkout_id,
      'transfer:' || p_checkout_id::text,
      'approved'
    );

    INSERT INTO lectura_validation_log (checkout_id, action, outcome)
    VALUES (p_checkout_id, 'approved', v_result);

    RETURN v_result;
  END IF;

  IF v_payment_status <> 'pending' THEN
    INSERT INTO lectura_validation_log (checkout_id, action, outcome)
    VALUES (p_checkout_id, 'rejected', 'not_pending');
    RETURN 'not_pending';
  END IF;

  PERFORM lectura_expire_stale_reservations();

  UPDATE lectura_orders
  SET payment_status = 'rejected', updated_at = NOW()
  WHERE checkout_id = p_checkout_id
    AND payment_status = 'pending';

  UPDATE lectura_reservations
  SET status = 'cancelled', updated_at = NOW()
  WHERE checkout_id = p_checkout_id
    AND status IN ('hold', 'pending_transfer');

  INSERT INTO lectura_validation_log (checkout_id, action, outcome)
  VALUES (p_checkout_id, 'rejected', 'rejected');

  RETURN 'rejected';
END;
$$;
