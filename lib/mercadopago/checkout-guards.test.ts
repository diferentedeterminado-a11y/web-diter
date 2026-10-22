import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getServiceById } from './catalog.ts';
import {
  assessRemotePayments,
  classifyCheckoutReturn,
  isDefinitivePaymentConfirmation,
  reduceRemotePaymentStatuses,
  returnMessage,
} from '../lecturas/return-status.ts';
import { decidePaymentWrite, notificationDisposition, webhookFailureStatus } from './webhook-error.ts';
import { lookupRemotePayment } from './remote-payment.ts';

const CHECKOUT_ID = 'e37d5ff6-858e-4d7f-bed3-0c30ae63abf7';
const limpieza = getServiceById('limpiezas-personal');

const base = {
  service: 'questions' as const,
  paymentStatus: 'pending',
  reservationStatus: null,
  openIncident: false,
  paymentEventStatus: null,
  remoteStatus: null,
};

test('un pago inexistente sigue siendo reintentable', () => {
  assert.equal(webhookFailureStatus({ name: 'MPNotFoundError', status: 404 }), 500);
  assert.equal(webhookFailureStatus({ status: 404 }), 500);
});

test('una falla de Mercado Pago sigue siendo reintentable', () => {
  assert.equal(webhookFailureStatus({ name: 'MPServerError', status: 503 }), 500);
  assert.equal(webhookFailureStatus({ status: 429 }), 500);
  assert.equal(webhookFailureStatus(new Error('database down')), 500);
  assert.equal(webhookFailureStatus({ status: 401 }), 500);
});

test('solo una notificación de pago se consulta como pago', () => {
  assert.equal(notificationDisposition('payment'), 'process');
  assert.equal(notificationDisposition('merchant_order'), 'ignore');
  assert.equal(notificationDisposition(null), 'retry');
  assert.equal(notificationDisposition(''), 'retry');
});

test('un pago aprobado con catálogo correcto se puede registrar una sola vez', () => {
  assert.ok(limpieza);
  const decision = decidePaymentWrite({
    status: 'approved',
    externalReference: CHECKOUT_ID,
    checkoutFound: true,
    amount: limpieza.unitPrice,
    currency: limpieza.currency,
    catalogAmount: limpieza.unitPrice,
    catalogCurrency: limpieza.currency,
  });
  assert.equal(decision, 'register');
  assert.equal(decidePaymentWrite({
    status: 'approved',
    externalReference: CHECKOUT_ID,
    checkoutFound: true,
    amount: limpieza.unitPrice - 1,
    currency: limpieza.currency,
    catalogAmount: limpieza.unitPrice,
    catalogCurrency: limpieza.currency,
  }), 'catalog_mismatch');

  const source = readFileSync(new URL('../../app/api/mercadopago/webhook/route.ts', import.meta.url), 'utf8');
  const typeCheck = source.indexOf('notificationDisposition');
  const paymentLookup = source.indexOf('paymentClient.get');
  assert.ok(typeCheck > 0 && typeCheck < paymentLookup);
  assert.match(source, /ON CONFLICT \(payment_id\) DO NOTHING/);
  assert.equal(source.includes("payment: 'not_found'"), false);
  assert.match(source, /meta_purchase_sent_at IS NULL/);
});

test('la URL de retorno no decide el estado', () => {
  assert.equal(classifyCheckoutReturn(null).state, 'unknown');
  assert.equal(classifyCheckoutReturn(base).state, 'processing');
  assert.equal(classifyCheckoutReturn({ ...base, remoteStatus: 'none' }).state, 'processing');
});

test('la confirmación exige un pago aprobado verificado', () => {
  assert.equal(classifyCheckoutReturn({ ...base, paymentStatus: 'approved' }).state, 'approved');
  assert.equal(classifyCheckoutReturn({ ...base, remoteStatus: 'approved' }).state, 'registering');
  assert.equal(
    classifyCheckoutReturn({ ...base, service: 'other', paymentStatus: null, remoteStatus: 'approved' }).state,
    'approved',
  );
  assert.match(returnMessage('approved', 'questions'), /Pago registrado/);
  assert.doesNotMatch(returnMessage('processing', 'questions'), /Pago registrado/);
});

test('un rechazo solo aparece cuando está confirmado', () => {
  assert.equal(classifyCheckoutReturn({ ...base, paymentEventStatus: 'rejected' }).state, 'rejected');
  assert.equal(classifyCheckoutReturn({ ...base, paymentStatus: 'cancelled' }).state, 'cancelled');
  assert.equal(classifyCheckoutReturn({ ...base, remoteStatus: 'rejected' }).state, 'rejected');
  assert.equal(classifyCheckoutReturn({ ...base, remoteStatus: 'none' }).state, 'processing');
});

test('una llamada pagada sin horario no se muestra como confirmada', () => {
  const view = classifyCheckoutReturn({
    ...base,
    service: 'call',
    paymentStatus: 'approved',
    reservationStatus: 'hold',
    openIncident: true,
  });
  assert.equal(view.state, 'reschedule');
});

test('varios pagos del mismo checkout priorizan el aprobado', () => {
  assert.equal(reduceRemotePaymentStatuses(['rejected', 'approved']), 'approved');
  assert.equal(reduceRemotePaymentStatuses([]), 'none');
  assert.equal(reduceRemotePaymentStatuses(['cancelled']), 'cancelled');
  assert.equal(reduceRemotePaymentStatuses(['in_process']), 'pending');
});

test('un importe o una moneda distinta del catálogo no confirman el pago', () => {
  assert.ok(limpieza);
  const expected = { checkoutId: CHECKOUT_ID, amount: limpieza.unitPrice, currency: limpieza.currency };
  const wrongAmount = assessRemotePayments([
    { status: 'approved', amount: limpieza.unitPrice - 1, currency: limpieza.currency, externalReference: CHECKOUT_ID },
  ], expected);
  const wrongCurrency = assessRemotePayments([
    { status: 'approved', amount: limpieza.unitPrice, currency: 'USD', externalReference: CHECKOUT_ID },
  ], expected);
  const wrongReference = assessRemotePayments([
    { status: 'approved', amount: limpieza.unitPrice, currency: limpieza.currency, externalReference: '11111111-1111-4111-8111-111111111111' },
  ], expected);

  for (const remoteStatus of [wrongAmount, wrongCurrency, wrongReference]) {
    assert.equal(remoteStatus, 'pending_verification');
    const view = classifyCheckoutReturn({ ...base, service: 'other', paymentStatus: null, remoteStatus });
    assert.equal(isDefinitivePaymentConfirmation(view.state), false);
    assert.doesNotMatch(returnMessage(view.state, view.service), /Pago registrado|confirmó tu pago/);
  }
});

test('un pago válido del catálogo sí confirma', () => {
  assert.ok(limpieza);
  const remoteStatus = assessRemotePayments([
    {
      status: 'approved',
      amount: limpieza.unitPrice,
      currency: limpieza.currency,
      externalReference: CHECKOUT_ID,
    },
  ], { checkoutId: CHECKOUT_ID, amount: limpieza.unitPrice, currency: limpieza.currency });
  const view = classifyCheckoutReturn({ ...base, service: 'other', paymentStatus: null, remoteStatus });
  assert.equal(view.state, 'approved');
  assert.equal(isDefinitivePaymentConfirmation(view.state), true);
  assert.match(returnMessage(view.state, 'other'), /confirmó tu pago/);
});

test('volver con status success sin pago aprobado no confirma', () => {
  const view = classifyCheckoutReturn({ ...base, remoteStatus: 'none' });
  assert.equal(view.state, 'processing');
  assert.equal(isDefinitivePaymentConfirmation(view.state), false);
  assert.doesNotMatch(returnMessage(view.state, 'questions'), /Pago registrado|confirmó tu pago/);
});

test('la consulta remota no devuelve datos del pagador', async () => {
  let requested = '';
  const result = await lookupRemotePayment(
    CHECKOUT_ID,
    'test-token',
    async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({
        results: [{ status: 'approved', transaction_amount: 350000, currency_id: 'ARS', external_reference: CHECKOUT_ID, payer: { email: 'secreto@example.com' } }],
      }), { status: 200 });
    },
  );

  assert.equal(result.availability, 'ok');
  assert.match(requested, /external_reference=e37d5ff6-858e-4d7f-bed3-0c30ae63abf7/);
  assert.equal(JSON.stringify(result).includes('secreto@example.com'), false);
});

test('una referencia ajena no consulta Mercado Pago', async () => {
  let called = false;
  const result = await lookupRemotePayment('no-es-uuid', 'test-token', async () => {
    called = true;
    return new Response('{}', { status: 200 });
  });
  assert.equal(called, false);
  assert.deepEqual(result, { availability: 'unavailable' });
});
