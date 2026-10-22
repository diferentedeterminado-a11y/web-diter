export const PAYMENT_RECEIVED_MESSAGE = 'Pago registrado. Tus datos quedaron guardados.';

export const CALL_RESCHEDULE_MESSAGE = 'Recibimos tu pago, pero el horario de la llamada ya no está disponible. La reserva no quedó confirmada. Vamos a contactarte para reprogramarla o resolver el pago.';

export const CALL_PENDING_MESSAGE = 'Estamos registrando tu pago. Si el horario ya no está disponible, la reserva no queda confirmada y te contactamos para reprogramarla o resolver el pago.';

export const QUESTION_PENDING_MESSAGE = 'Estamos registrando tu pago. Tus preguntas quedaron guardadas.';

export type ReturnService = 'call' | 'questions' | 'other';

export type ReturnState =
  | 'unknown'
  | 'unavailable'
  | 'processing'
  | 'pending_verification'
  | 'registering'
  | 'approved'
  | 'reschedule'
  | 'rejected'
  | 'cancelled';

export type RemotePaymentStatus =
  | 'approved'
  | 'pending'
  | 'pending_verification'
  | 'rejected'
  | 'cancelled'
  | 'none'
  | 'unavailable';

export type RemotePaymentView = {
  status: string;
  amount: number | null;
  currency: string | null;
  externalReference: string | null;
};

export type CheckoutReturnInput = {
  service: ReturnService;
  paymentStatus: string | null;
  reservationStatus: string | null;
  openIncident: boolean;
  paymentEventStatus: string | null;
  remoteStatus: RemotePaymentStatus | null;
};

export type CheckoutReturnView = {
  state: ReturnState;
  service: ReturnService | null;
};

const REJECTED_EVENT = new Set(['rejected', 'refunded', 'charged_back']);

export function returnServiceKind(serviceId: string): ReturnService {
  if (serviceId === 'lecturas-llamada-45') {
    return 'call';
  }

  if (serviceId.startsWith('lecturas-')) {
    return 'questions';
  }

  return 'other';
}

export function reduceRemotePaymentStatuses(statuses: string[]): Exclude<RemotePaymentStatus, 'unavailable'> {
  if (statuses.includes('approved')) {
    return 'approved';
  }

  if (statuses.some((status) => status === 'pending' || status === 'in_process' || status === 'in_mediation' || status === 'authorized')) {
    return 'pending';
  }

  if (statuses.includes('cancelled') && !statuses.some((status) => REJECTED_EVENT.has(status))) {
    return 'cancelled';
  }

  if (statuses.some((status) => REJECTED_EVENT.has(status))) {
    return 'rejected';
  }

  if (statuses.length === 0) {
    return 'none';
  }

  return 'pending';
}

export function assessRemotePayments(
  payments: RemotePaymentView[],
  expected: { checkoutId: string; amount: number | null; currency: string | null },
): Exclude<RemotePaymentStatus, 'unavailable'> {
  const approved = payments.filter((payment) => payment.status === 'approved');
  const verified = approved.filter((payment) =>
    payment.externalReference === expected.checkoutId &&
    expected.amount !== null &&
    expected.currency !== null &&
    payment.amount === expected.amount &&
    payment.currency === expected.currency
  );

  if (verified.length > 0) {
    return 'approved';
  }

  if (approved.length > 0) {
    return 'pending_verification';
  }

  return reduceRemotePaymentStatuses(payments.map((payment) => payment.status));
}

export function isDefinitivePaymentConfirmation(state: ReturnState): boolean {
  return state === 'approved';
}

export function classifyCheckoutReturn(input: CheckoutReturnInput | null): CheckoutReturnView {
  if (!input) {
    return { state: 'unknown', service: null };
  }

  const service = input.service;

  if (input.paymentStatus === 'approved') {
    if (service === 'call' && (input.openIncident || input.reservationStatus !== 'confirmed')) {
      return { state: 'reschedule', service };
    }

    return { state: 'approved', service };
  }

  if (input.paymentStatus === 'rejected' || (input.paymentEventStatus !== null && REJECTED_EVENT.has(input.paymentEventStatus))) {
    return { state: 'rejected', service };
  }

  if (input.paymentStatus === 'cancelled' || input.paymentEventStatus === 'cancelled') {
    return { state: 'cancelled', service };
  }

  if (input.remoteStatus === 'pending_verification') {
    return { state: 'pending_verification', service };
  }

  if (input.remoteStatus === 'approved') {
    return { state: input.paymentStatus === null ? 'approved' : 'registering', service };
  }

  if (input.remoteStatus === 'rejected') {
    return { state: 'rejected', service };
  }

  if (input.remoteStatus === 'cancelled') {
    return { state: 'cancelled', service };
  }

  if (input.remoteStatus === 'unavailable') {
    return { state: 'unavailable', service };
  }

  return { state: 'processing', service };
}

export function returnMessage(state: ReturnState, service: ReturnService | null): string {
  if (state === 'approved' && service === 'call') {
    return 'Pago registrado. Tu llamada quedó confirmada.';
  }

  if (state === 'approved' && service === 'questions') {
    return PAYMENT_RECEIVED_MESSAGE;
  }

  if (state === 'approved') {
    return 'Mercado Pago confirmó tu pago.';
  }

  if (state === 'registering' && service === 'call') {
    return CALL_PENDING_MESSAGE;
  }

  if (state === 'registering' && service === 'questions') {
    return QUESTION_PENDING_MESSAGE;
  }

  if (state === 'registering') {
    return 'Mercado Pago aprobó el pago. Lo estamos registrando. No inicies otro pago.';
  }

  if (state === 'reschedule') {
    return CALL_RESCHEDULE_MESSAGE;
  }

  if (state === 'rejected') {
    return 'El pago fue rechazado. Podés volver al servicio e intentar de nuevo cuando quieras.';
  }

  if (state === 'cancelled') {
    return 'El pago fue cancelado. Podés volver al servicio e intentar de nuevo cuando quieras.';
  }

  if (state === 'pending_verification') {
    return 'Estamos verificando el pago. Todavía no podemos confirmarlo.';
  }

  if (state === 'unknown') {
    return 'No pudimos identificar la orden. Si ya pagaste, no inicies otro pago.';
  }

  if (state === 'unavailable') {
    return 'No pudimos consultar la confirmación. Actualizá esta página en unos minutos y no inicies otro pago.';
  }

  if (service === 'call') {
    return 'Todavía no confirmamos el pago de la llamada. No inicies otra reserva si ya pagaste.';
  }

  if (service === 'questions') {
    return 'Todavía no confirmamos el pago. Tus preguntas quedaron guardadas.';
  }

  return 'Todavía no hay un pago confirmado. Si ya lo enviaste, no inicies otro.';
}
