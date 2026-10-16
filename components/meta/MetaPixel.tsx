'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { hasMetaConsent } from '@/lib/meta/consent';
import { META_PIXEL_ID } from '@/lib/meta/config';
import { ensureMetaPixelStub, initMetaPixel, trackPageView } from '@/lib/meta/pixel';

type MetaPixelProps = {
  consentGranted: boolean;
};

export default function MetaPixel({ consentGranted }: MetaPixelProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (!consentGranted || !META_PIXEL_ID || !hasMetaConsent()) {
      return;
    }

    ensureMetaPixelStub();
    initMetaPixel();
    trackPageView(pathname);
  }, [consentGranted, pathname]);

  if (!consentGranted || !META_PIXEL_ID) {
    return null;
  }

  return (
    <Script
      id="meta-pixel"
      src="https://connect.facebook.net/en_US/fbevents.js"
      strategy="afterInteractive"
      onReady={() => {
        initMetaPixel();
        trackPageView(pathname);
      }}
    />
  );
}
