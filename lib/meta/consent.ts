export const META_CONSENT_STORAGE_KEY = 'diter_meta_consent';

export type MetaConsentStatus = 'granted' | 'denied';

const CONSENT_CHANGE_EVENT = 'diter-meta-consent-change';

export function readMetaConsent(): MetaConsentStatus | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.localStorage.getItem(META_CONSENT_STORAGE_KEY);
    if (value === 'granted' || value === 'denied') {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

export function hasMetaConsent(): boolean {
  return readMetaConsent() === 'granted';
}

export function writeMetaConsent(status: MetaConsentStatus): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(META_CONSENT_STORAGE_KEY, status);
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: status }));
  } catch {
    // localStorage puede no estar disponible.
  }
}

export function subscribeMetaConsent(listener: (status: MetaConsentStatus | null) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<MetaConsentStatus>;
    listener(customEvent.detail ?? readMetaConsent());
  };

  window.addEventListener(CONSENT_CHANGE_EVENT, handler);
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, handler);
}
