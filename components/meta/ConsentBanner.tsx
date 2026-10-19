'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  readMetaConsent,
  subscribeMetaConsent,
  writeMetaConsent,
  type MetaConsentStatus,
} from '@/lib/meta/consent';
import MetaPixel from '@/components/meta/MetaPixel';

function subscribeConsent(onStoreChange: () => void): () => void {
  return subscribeMetaConsent(() => onStoreChange());
}

function serverConsent(): MetaConsentStatus | null {
  return null;
}

function subscribeHydration(): () => void {
  return () => undefined;
}

function clientHydrated(): boolean {
  return true;
}

function serverHydrated(): boolean {
  return false;
}

export default function ConsentBanner() {
  const storedConsent = useSyncExternalStore(subscribeConsent, readMetaConsent, serverConsent);
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
  const [choice, setChoice] = useState<MetaConsentStatus | null>(null);
  const consent = choice ?? storedConsent;

  const consentGranted = consent === 'granted';

  return (
    <>
      <MetaPixel consentGranted={consentGranted} />
      {hydrated && consent === null ? (
        <div className="fixed bottom-0 inset-x-0 z-[45] border-t border-amber-500/20 bg-[#0B0813]/95 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <p className="text-[11px] text-gray-300 leading-relaxed flex-1">
              Usamos cookies de medición de Meta para entender visitas e inicios de compra, con tu consentimiento.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  writeMetaConsent('denied');
                  setChoice('denied');
                }}
                className="px-3 py-2 rounded-xl text-[11px] uppercase tracking-wider border border-amber-500/20 text-gray-300"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => {
                  writeMetaConsent('granted');
                  setChoice('granted');
                }}
                className="px-3 py-2 rounded-xl text-[11px] uppercase tracking-wider font-semibold bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#0B0813]"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
