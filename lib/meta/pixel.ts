import { getServiceById, getPreferenceTitle, type CatalogService } from '@/lib/mercadopago/catalog';
import { hasMetaConsent } from '@/lib/meta/consent';
import { META_CURRENCY, META_PIXEL_ID } from '@/lib/meta/config';
import { createMetaEventId } from '@/lib/meta/event-id';

type FbqFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: (...args: unknown[]) => number;
};

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
  }
}

let pixelInitialized = false;
let lastPageViewPath: string | null = null;

function getFbq(): FbqFunction | null {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') {
    return null;
  }

  return window.fbq;
}

function safeTrack(eventName: string, params?: Record<string, unknown>, eventId?: string): void {
  if (!hasMetaConsent() || !pixelInitialized) {
    return;
  }

  const fbq = getFbq();
  if (!fbq) {
    return;
  }

  try {
    if (eventId) {
      fbq('track', eventName, params ?? {}, { eventID: eventId });
      return;
    }

    fbq('track', eventName, params ?? {});
  } catch {
    // El Pixel no debe interrumpir el checkout ni la navegación.
  }
}

export function ensureMetaPixelStub(): void {
  if (typeof window === 'undefined' || window.fbq) {
    return;
  }

  const fbq: FbqFunction = (...args: unknown[]) => {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
      return;
    }

    fbq.queue?.push(args);
  };

  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  window.fbq = fbq;
  window._fbq = fbq;
}

export function initMetaPixel(): boolean {
  if (!META_PIXEL_ID || !hasMetaConsent()) {
    return false;
  }

  ensureMetaPixelStub();

  const fbq = getFbq();
  if (!fbq) {
    return false;
  }

  if (pixelInitialized) {
    return true;
  }

  try {
    fbq('init', META_PIXEL_ID);
    pixelInitialized = true;
    return true;
  } catch {
    return false;
  }
}

export function trackPageView(path: string): void {
  if (!initMetaPixel()) {
    return;
  }

  if (lastPageViewPath === path) {
    return;
  }

  lastPageViewPath = path;
  safeTrack('PageView');
}

function catalogEventParams(service: CatalogService) {
  return {
    content_ids: [service.id],
    content_name: getPreferenceTitle(service),
    content_type: 'product',
    value: service.unitPrice,
    currency: service.currency || META_CURRENCY,
    num_items: 1,
  };
}

export function trackViewContent(serviceId: string): string | null {
  const service = getServiceById(serviceId);
  if (!service) {
    return null;
  }

  const eventId = createMetaEventId();
  safeTrack('ViewContent', catalogEventParams(service), eventId);
  return eventId;
}

export function trackInitiateCheckout(serviceId: string, eventId: string): boolean {
  const service = getServiceById(serviceId);
  if (!service || !eventId) {
    return false;
  }

  safeTrack('InitiateCheckout', catalogEventParams(service), eventId);
  return true;
}

export function isMetaPixelReady(): boolean {
  return pixelInitialized && Boolean(getFbq());
}
