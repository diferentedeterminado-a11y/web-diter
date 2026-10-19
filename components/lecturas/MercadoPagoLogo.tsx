import Image from 'next/image';

export function MercadoPagoLogo({ heightClass = 'h-9' }: { heightClass?: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-md bg-white px-2.5 py-1.5">
      <Image
        src="/brand/mercadopago.svg"
        alt="Mercado Pago"
        width={1049}
        height={426}
        className={`${heightClass} w-auto`}
      />
    </span>
  );
}
