import type { ReactNode } from 'react';

type IconProps = {
  className?: string;
};

function Icon({ className = '', children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={`inline-block h-[1em] w-[1em] shrink-0 align-[-0.125em] ${className}`}
    >
      {children}
    </svg>
  );
}

export function CircleCheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        fillRule="evenodd"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.22 7.22-5.15 6.05-2.4-2.28a1 1 0 0 0-1.44 1.39l3.2 3.04a1 1 0 0 0 1.5-.08l5.85-6.88a1 1 0 1 0-1.56-1.24Z"
      />
    </Icon>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 5C7 5 3.1 8.1 1.5 12 3.1 15.9 7 19 12 19s8.9-3.1 10.5-7C20.9 8.1 17 5 12 5Zm0 11.2A4.2 4.2 0 1 1 12 7.8a4.2 4.2 0 0 1 0 8.4Z" />
      <circle cx="12" cy="12" r="2.1" />
    </Icon>
  );
}

export function WandIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3.2 19.4 14.6 8l1.4 1.4L4.6 20.8a1 1 0 0 1-1.4-1.4Z" />
      <path d="M16.2 4.2 17.4 6.6 19.8 7.8 17.4 9 16.2 11.4 15 9 12.6 7.8 15 6.6 16.2 4.2ZM8.2 3.2 8.8 4.6 10.2 5.2 8.8 5.8 8.2 7.2 7.6 5.8 6.2 5.2 7.6 4.6 8.2 3.2ZM19.4 13.2 20 14.4 21.2 15 20 15.6 19.4 16.8 18.8 15.6 17.6 15 18.8 14.4 19.4 13.2Z" />
    </Icon>
  );
}

export function XMarkIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6.2 4.8 12 10.6 17.8 4.8 19.2 6.2 13.4 12 19.2 17.8 17.8 19.2 12 13.4 6.2 19.2 4.8 17.8 10.6 12 4.8 6.2 6.2 4.8Z" />
    </Icon>
  );
}

export function BarsIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 6.5h18v2H3v-2Zm0 4.5h18v2H3v-2Zm0 4.5h18v2H3v-2Z" />
    </Icon>
  );
}

export function CompassIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        fillRule="evenodd"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm2.7 4.1-1.7 4.4-4.4 1.7 1.7-4.4 4.4-1.7Z"
      />
    </Icon>
  );
}

export function AnkhIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        fillRule="evenodd"
        d="M12 2.2a4.3 4.3 0 0 0-1.35 8.4V12H7.1a1.1 1.1 0 0 0 0 2.2h3.55v5.5a1.35 1.35 0 0 0 2.7 0V14.2h3.55a1.1 1.1 0 0 0 0-2.2h-3.55v-1.4A4.3 4.3 0 0 0 12 2.2Zm0 2.2a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Z"
      />
    </Icon>
  );
}

export function UserShieldIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M9 11.2a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6ZM3.2 18.8c.4-2.6 2.7-4.2 5.8-4.2.7 0 1.4.1 2 .3-.5.7-.8 1.5-.9 2.4-.7.3-1.2.8-1.5 1.5H4.4c-.5 0-1-.4-1.1-1Z" />
      <path d="M16.2 10.2 12.4 11.6v3.1c0 2.2 1.4 3.7 3.8 4.5 2.4-.8 3.8-2.3 3.8-4.5v-3.1l-3.8-1.4Z" />
    </Icon>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 2.6 14.7 8.7 21.3 9.4 16.4 13.9 17.8 20.4 12 17.1 6.2 20.4 7.6 13.9 2.7 9.4 9.3 8.7 12 2.6Z" />
    </Icon>
  );
}

export function CreditCardIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Zm1.8 2.2V7.2h14.4v1.5H4.8Zm0 2.6h14.4v6.2c0 .4-.3.7-.7.7h-13a.7.7 0 0 1-.7-.7v-6.2Z" />
    </Icon>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M13.2 5.2 19.5 11.5H3v2h16.5l-6.3 6.3 1.4 1.4L22.8 12 14.6 3.8l-1.4 1.4Z" />
    </Icon>
  );
}

export function FireIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12.2 2s.2 2.6-.8 4.2c-.6.9-.4 1.8.2 2.4.7.7 1.8.4 2.2-.4.2 1.6-.2 2.6-1 3.4 1.8-.3 3.4-1.6 3.4-3.8 2.2 1.6 3.3 4 3.3 6.3 0 4.2-3.3 7.4-7.5 7.4S4.5 18.3 4.5 14.1c0-2.6 1.3-4.6 2.6-6.1.8 1.5 2.1 2.2 3.2 1.6-.6-1.4-1.1-2.6-1.1-4.1C9.2 4.2 10.4 2.8 12.2 2Z" />
    </Icon>
  );
}

export function HeartPulseIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        fillRule="evenodd"
        d="M12 20.2s-6.8-4.1-6.8-9c0-2.5 1.8-4.4 4.1-4.4 1.3 0 2.4.6 2.7 1.7.3-1.1 1.4-1.7 2.7-1.7 2.3 0 4.1 1.9 4.1 4.4 0 4.9-6.8 9-6.8 9ZM7.6 11.2l1.7-.3.8 1.7 1.5-3.2 1.3 1.8h2.1v1.5h-2.8l-.7-1-1.4 3-1.3-2.7-1.3.3-.9-1.1Z"
      />
    </Icon>
  );
}

export function CircleInfoIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        fillRule="evenodd"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.1 5.2a1.2 1.2 0 1 1 2.2 0 1.2 1.2 0 0 1-2.2 0ZM11 10.2h2V17h-2v-6.8Z"
      />
    </Icon>
  );
}

export function CalendarCheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M8 3.2h1.4V5h5.2V3.2H16V5h1.6A2.4 2.4 0 0 1 20 7.4V18a2.4 2.4 0 0 1-2.4 2.4H6.4A2.4 2.4 0 0 1 4 18V7.4A2.4 2.4 0 0 1 6.4 5H8V3.2Zm10.2 6.2H5.8V18c0 .3.3.6.6.6h11.2c.3 0 .6-.3.6-.6V9.4Z" />
      <path d="m10.2 15.6-1.7-1.6 1.1-1.1 1.2 1.1 2.8-2.7 1.1 1.1-3.9 3.8a.8.8 0 0 1-.6.3.8.8 0 0 1-.6-.3l.6-.6Z" />
    </Icon>
  );
}

export function ShieldHalvedIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 2.4 4.8 5.1v6.3c0 4.3 2.9 7.3 7.2 8.8 4.3-1.5 7.2-4.5 7.2-8.8V5.1L12 2.4Z" />
      <path fillOpacity="0.45" d="M12 4.1v14.4c3.3-1.2 5.5-3.6 5.5-7.1V6.1L12 4.1Z" />
    </Icon>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        fillRule="evenodd"
        d="M7 10V8.2a5 5 0 0 1 10 0V10h1.2A1.8 1.8 0 0 1 20 11.8v7.4A1.8 1.8 0 0 1 18.2 21H5.8A1.8 1.8 0 0 1 4 19.2v-7.4A1.8 1.8 0 0 1 5.8 10H7Zm2 0h6V8.2a3 3 0 0 0-6 0V10Z"
      />
    </Icon>
  );
}

export function PhoneVolumeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M7.2 3.4c.4-.4 1-.5 1.5-.2l2.1 1.2c.5.3.7.9.5 1.4L10.4 8c-.1.4 0 .8.3 1.1l4.2 4.2c.3.3.7.4 1.1.3l2.2-.9c.5-.2 1.1 0 1.4.5l1.2 2.1c.3.5.2 1.1-.2 1.5l-1.2 1.2c-.8.8-2 .9-3.6.4-2.4-.8-5.1-2.6-7.4-4.9S4.2 10.4 3.4 8c-.5-1.6-.4-2.8.4-3.6l1.2-1.2 2.2.2Z" />
      <path d="M15.2 4.2a6.2 6.2 0 0 1 4.6 4.6l-1.6.4a4.6 4.6 0 0 0-3.4-3.4l.4-1.6Zm.2 2.8a3.2 3.2 0 0 1 2.2 2.2l-1.5.3a1.7 1.7 0 0 0-1-1l.3-1.5Z" />
    </Icon>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M14.2 2.6a8.6 8.6 0 1 0 7.2 12.4 7.2 7.2 0 0 1-7.2-12.4Z" />
    </Icon>
  );
}

export function ShieldCatIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M7.2 3.2 5.4 7.2h13.2L16.8 3.2 14.6 5.4 12 3.2 9.4 5.4 7.2 3.2Z" />
      <path d="M6.2 8.4h11.6l.6 2.4c.4 1.7.1 3.4-.6 4.8-1 2-2.8 3.4-5.8 4.4-3-1-4.8-2.4-5.8-4.4-.7-1.4-1-3.1-.6-4.8l.6-2.4Z" />
      <circle cx="10" cy="13" r="0.9" fill="#140C22" />
      <circle cx="14" cy="13" r="0.9" fill="#140C22" />
    </Icon>
  );
}

export function BuildingColumnsIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3 3 8v1.6h18V8L12 3Zm-7.2 8.2h2.2V17H4.8v-5.8Zm4.6 0h2.2V17H9.4v-5.8Zm4.6 0h2.2V17h-2.2v-5.8Zm4.6 0H21V17h-2.4v-5.8ZM3 18.4h18V21H3v-2.6Z" />
    </Icon>
  );
}

export function SpinnerIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`inline-block h-[1em] w-[1em] shrink-0 animate-spin ${className}`}
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function CopyIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      className={`inline-block h-[1em] w-[1em] shrink-0 align-[-0.125em] ${className}`}
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15.2V5.8A1.8 1.8 0 0 1 6.8 4H16" strokeLinecap="round" />
    </svg>
  );
}

export function WhatsAppIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.02A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.23 8.22Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.28Z" />
    </Icon>
  );
}

export function BoltIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M13.2 2 4.5 13.2h5.2L9.2 22l9.3-12.2h-5.4L13.2 2Z" />
    </Icon>
  );
}
