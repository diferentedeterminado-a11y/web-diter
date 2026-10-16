'use client';

import { useEffect, useState } from 'react';
import {
  readMetaConsent,
  subscribeMetaConsent,
  writeMetaConsent,
  type MetaConsentStatus,
} from '@/lib/meta/consent';
import MetaPixel from '@/components/meta/MetaPixel';

export default function ConsentBanner() {
  const [consent, setConsent] = useState<MetaConsentStatus | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConsent(readMetaConsent());
    setHydrated(true);
    return subscribeMetaConsent(setConsent);
  }, []);

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
                  setConsent('denied');
                }}
                className="px-3 py-2 rounded-xl text-[11px] uppercase tracking-wider border border-amber-500/20 text-gray-300"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => {
                  writeMetaConsent('granted');
                  setConsent('granted');
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
