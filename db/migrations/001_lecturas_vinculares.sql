-- Lecturas vinculares.
-- Efecto: crea tablas y una función nuevas. No modifica las tablas de Mercado Pago,
-- no borra datos y se puede volver a ejecutar.

CREATE TABLE IF NOT EXISTS lectura_orders (
  checkout_id uuid PRIMARY KEY,
  service_id text NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  question_count integer,
  questions jsonb,
  payment_method text NOT NULL,
  payment_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT lectura_orders_payment_method CHECK (payment_method IN ('mercadopago', 'transfer')),
  CONSTRAINT lectura_orders_payment_status CHECK (
    payment_status IN ('pending', 'approved', 'rejected', 'cancelled')
  ),
  CONSTRAINT lectura_orders_questions_shape CHECK (
    (
      service_id = 'lecturas-llamada-45'
      AND questions IS NULL
      AND question_count IS NULL
    )
    OR (
      service_id <> 'lecturas-llamada-45'
      AND jsonb_typeof(questions) = 'array'
      AND question_count = jsonb_array_length(questions)
    )
  )
);

CREATE TABLE IF NOT EXISTS lectura_reservations (
  id uuid PRIMARY KEY,
  checkout_id uuid NOT NULL UNIQUE REFERENCES lectura_orders (checkout_id),
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 45,
  status text NOT NULL,
  hold_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT lectura_reservations_status CHECK (
    status IN ('hold', 'pending_transfer', 'confirmed', 'expired', 'cancelled', 'rejected')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS lectura_reservations_one_active_slot
  ON lectura_reservations (starts_at)
  WHERE status IN ('hold', 'pending_transfer', 'confirmed');

CREATE TABLE IF NOT EXISTS lectura_slot_blocks (
  id uuid PRIMARY KEY,
  starts_at timestamptz NOT NULL UNIQUE,
  duration_minutes integer NOT NULL DEFAULT 45,
  reason text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

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
BEGIN
  IF p_status NOT IN ('hold', 'pending_transfer') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lectura-slot:' || p_starts_at::text));

  UPDATE lectura_reservations
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'hold'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at <= NOW();

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
