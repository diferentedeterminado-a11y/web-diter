export const PAYMENT_RECEIVED_MESSAGE = 'Pago registrado. Tus datos quedaron guardados.';

export const CALL_RESCHEDULE_MESSAGE = 'Recibimos tu pago, pero el horario de la llamada ya no está disponible. La reserva no quedó confirmada. Vamos a contactarte para reprogramarla o resolver el pago.';

export const CALL_PENDING_MESSAGE = 'Estamos registrando tu pago. Si el horario ya no está disponible, la reserva no queda confirmada y te contactamos para reprogramarla o resolver el pago.';

export const QUESTION_PENDING_MESSAGE = 'Estamos registrando tu pago. Tus preguntas quedaron guardadas.';

export type LecturaFulfillment = 'unknown' | 'pending' | 'received' | 'reschedule';

export type LecturaFulfillmentView = {
  fulfillment: LecturaFulfillment;
  service: 'call' | 'questions' | null;
};

export function classifyLecturaFulfillment(row: {
  serviceId: string;
  paymentStatus: string;
  reservationStatus: string | null;
  openIncident: boolean;
} | null): LecturaFulfillmentView {
  if (!row) {
    return { fulfillment: 'unknown', service: null };
  }

  const service = row.serviceId === 'lecturas-llamada-45' ? 'call' : 'questions';
  if (row.paymentStatus !== 'approved') {
    return { fulfillment: 'pending', service };
  }

  if (service === 'call' && (row.openIncident || row.reservationStatus !== 'confirmed')) {
    return { fulfillment: 'reschedule', service };
  }

  return { fulfillment: 'received', service };
}
