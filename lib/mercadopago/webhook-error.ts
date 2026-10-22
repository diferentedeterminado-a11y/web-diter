export type NotificationDisposition = 'process' | 'ignore' | 'retry';

export type PaymentWriteDecision = 'register' | 'catalog_mismatch';

const NOTIFICATION_TYPE = /^[a-z0-9_]{1,40}$/i;

export function notificationDisposition(type: string | null | undefined): NotificationDisposition {
  const value = type?.trim() ?? '';
  if (value === 'payment') {
    return 'process';
  }

  if (value.length > 0 && NOTIFICATION_TYPE.test(value)) {
    return 'ignore';
  }

  return 'retry';
}

export function webhookFailureStatus(error: unknown): 500 {
  void error;
  return 500;
}

export function decidePaymentWrite(input: {
  status: string | null;
  externalReference: string | null;
  checkoutFound: boolean;
  amount: number | null;
  currency: string | null;
  catalogAmount: number | null;
  catalogCurrency: string | null;
}): PaymentWriteDecision {
  if (
    input.status !== 'approved' ||
    !input.externalReference ||
    !input.checkoutFound ||
    input.catalogAmount === null ||
    input.catalogCurrency === null ||
    input.amount !== input.catalogAmount ||
    input.currency !== input.catalogCurrency
  ) {
    return 'catalog_mismatch';
  }

  return 'register';
}
