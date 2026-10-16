export type MetaAttribution = {
  fbp: string | null;
  fbc: string | null;
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const encodedName = `${encodeURIComponent(name)}=`;
  const match = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(encodedName));

  if (!match) {
    return null;
  }

  const value = match.slice(encodedName.length);
  return value ? decodeURIComponent(value) : null;
}

/**
 * Cookies de atribución de Meta para reutilizar luego en Conversions API.
 * No enviar a Pixel eventos; solo lectura permitida tras consentimiento.
 */
export function getMetaAttribution(): MetaAttribution {
  return {
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
  };
}
