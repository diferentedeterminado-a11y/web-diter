'use client';

import { SERVICE_CATALOG } from '@/lib/mercadopago/catalog';
import { parseCompletedQuestions, questionRejectionMessage } from '@/lib/lecturas/services';
import Image from 'next/image';
import {
  artDateKey,
  artWeekdayIndex,
  daysInMonth,
  resolveDemoSlots,
  type DemoSlotKind,
} from './demo-slots';
import { useMemo, useState, useSyncExternalStore } from 'react';

type QuestionService = {
  id: 'lecturas-3-preguntas' | 'lecturas-6-preguntas' | 'lecturas-10-preguntas';
  label: string;
  price: number;
  questions: 3 | 6 | 10;
  kind: 'questions';
};

type CallService = {
  id: 'lecturas-llamada-45';
  label: string;
  price: number;
  questions: 0;
  kind: 'call';
};

type PreviewService = QuestionService | CallService;

const SERVICES: PreviewService[] = [
  {
    id: 'lecturas-3-preguntas',
    label: '3 Preguntas',
    price: SERVICE_CATALOG['lecturas-3-preguntas'].unitPrice,
    questions: 3,
    kind: 'questions',
  },
  {
    id: 'lecturas-6-preguntas',
    label: '6 Preguntas',
    price: SERVICE_CATALOG['lecturas-6-preguntas'].unitPrice,
    questions: 6,
    kind: 'questions',
  },
  {
    id: 'lecturas-10-preguntas',
    label: '10 Preguntas',
    price: SERVICE_CATALOG['lecturas-10-preguntas'].unitPrice,
    questions: 10,
    kind: 'questions',
  },
  {
    id: 'lecturas-llamada-45',
    label: 'Llamada 45 min (Ilimitadas)',
    price: SERVICE_CATALOG['lecturas-llamada-45'].unitPrice,
    questions: 0,
    kind: 'call',
  },
];

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const inputClass =
  'w-full bg-purple-950/40 border border-amber-500/20 rounded-xl px-3.5 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-400';

function formatArs(value: number): string {
  return `$${value.toLocaleString('es-AR')}`;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatLongDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day, 15)));
}

function formatMonthTitle(year: number, month: number): string {
  const title = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1, 15)));

  return title.charAt(0).toUpperCase() + title.slice(1);
}

function slotKey(dateKey: string, hour: number): string {
  return `${dateKey}-${hour}`;
}

function subscribeArtDate(): () => void {
  return () => undefined;
}

function clientArtDate(): string {
  return artDateKey(new Date());
}

function serverArtDate(): string {
  return '';
}

function MercadoPagoLogo({ heightClass = 'h-9' }: { heightClass?: string }) {
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

export default function LecturasPreviewPage() {
  const todayKey = useSyncExternalStore(subscribeArtDate, clientArtDate, serverArtDate) || null;
  const todayYear = todayKey ? Number(todayKey.slice(0, 4)) : 0;
  const todayMonth = todayKey ? Number(todayKey.slice(5, 7)) : 0;
  const demoSlots = useMemo(() => (todayKey ? resolveDemoSlots(todayKey) : []), [todayKey]);
  const occupied = useMemo(() => {
    const map = new Map<string, DemoSlotKind>();
    demoSlots.forEach((slot) => {
      map.set(slotKey(slot.dateKey, slot.hour), slot.kind);
    });
    return map;
  }, [demoSlots]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mp' | 'cbu'>('mp');
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [monthOverride, setMonthOverride] = useState<{ year: number; month: number } | null>(null);
  const visibleMonth = useMemo(() => {
    if (monthOverride) {
      return monthOverride;
    }
    if (!todayKey) {
      return null;
    }
    return { year: Number(todayKey.slice(0, 4)), month: Number(todayKey.slice(5, 7)) };
  }, [monthOverride, todayKey]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [slotHint, setSlotHint] = useState('');
  const [toast, setToast] = useState('');

  const service = SERVICES[selectedIndex];

  const openCheckout = () => {
    setQuestions(Array.from({ length: service.questions }, () => ''));
    setPaymentMethod('mp');
    setErrors({});
    setNotice('');
    setSlotHint('');
    setHour(null);
    const key = todayKey ?? artDateKey(new Date());
    if (!todayKey) {
      setMonthOverride({
        year: Number(key.slice(0, 4)),
        month: Number(key.slice(5, 7)),
      });
    }
    setDateKey(service.kind === 'call' ? key : null);
    setCheckoutOpen(true);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copiado`);
    } catch {
      showToast('No se pudo copiar');
    }
  };

  const shiftMonth = (delta: number) => {
    setMonthOverride((current) => {
      const base = current ?? (todayKey ? { year: todayYear, month: todayMonth } : null);
      if (!base) {
        return current;
      }
      const next = new Date(Date.UTC(base.year, base.month - 1 + delta, 1, 15));
      const year = next.getUTCFullYear();
      const month = next.getUTCMonth() + 1;
      if (year < todayYear || (year === todayYear && month < todayMonth)) {
        return base;
      }
      return { year, month };
    });
  };

  const calendarDays = useMemo(() => {
    if (!visibleMonth) {
      return [];
    }

    const leading = artWeekdayIndex(visibleMonth.year, visibleMonth.month, 1);
    const total = daysInMonth(visibleMonth.year, visibleMonth.month);
    const cells: Array<{ dateKey: string; day: number } | null> = Array.from({ length: leading }, () => null);

    for (let day = 1; day <= total; day += 1) {
      const key = `${visibleMonth.year}-${String(visibleMonth.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ dateKey: key, day });
    }

    return cells;
  }, [visibleMonth]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (service.kind === 'questions') {
      const parsed = parseCompletedQuestions(service.id, questions);
      if (!parsed.ok && parsed.reason === 'too_long' && parsed.index !== undefined) {
        nextErrors[`q-${parsed.index}`] = questionRejectionMessage(parsed) ?? 'La pregunta puede tener hasta 1500 caracteres.';
      } else if (!parsed.ok) {
        nextErrors.questions = questionRejectionMessage(parsed) ?? 'Escribí al menos una pregunta.';
      }
    } else {
      if (!dateKey) {
        nextErrors.date = 'Elegí una fecha.';
      }
      if (hour === null) {
        nextErrors.hour = 'Elegí un horario libre.';
      }
    }

    if (!name.trim()) {
      nextErrors.name = 'Ingresá tu nombre completo.';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Ingresá un correo electrónico válido.';
    }

    if (phone.replace(/\D/g, '').length < 8) {
      nextErrors.phone = 'Ingresá un WhatsApp válido.';
    }

    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      document.getElementById(`field-${firstInvalid}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }

    return Object.keys(nextErrors).length === 0;
  };

  const simulatePayment = (method: 'mp' | 'cbu') => {
    setNotice('');
    if (!validate()) {
      return;
    }

    setNotice(
      method === 'mp'
        ? 'Previsualización: no se creó una preferencia ni se inició un cobro en Mercado Pago.'
        : 'Previsualización: la transferencia no se registró ni se envió por WhatsApp.'
    );
  };

  const selectHour = (value: number) => {
    if (!dateKey) {
      return;
    }

    const kind = occupied.get(slotKey(dateKey, value));
    if (kind) {
      setHour(null);
      setSlotHint('Ese horario está ocupado.');
      return;
    }

    setHour(value);
    setSlotHint('');
    setErrors((current) => {
      const next = { ...current };
      delete next.hour;
      return next;
    });
  };

  return (
    <div className="relative min-h-screen bg-[#0B0813] text-[#E2E8F0] font-sans selection:bg-purple-900 selection:text-amber-200">
      <div className="pointer-events-none fixed left-10 top-1/4 h-72 w-72 rounded-full bg-purple-900/20 blur-[100px] md:h-96 md:w-96" />
      <div className="pointer-events-none fixed bottom-1/4 right-10 h-72 w-72 rounded-full bg-amber-600/10 blur-[120px] md:h-96 md:w-96" />

      <div
        className={`fixed right-5 top-5 z-[60] rounded-xl bg-amber-500 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 shadow-[0_0_25px_rgba(212,175,55,0.35)] transition ${
          toast ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-20 opacity-0'
        }`}
      >
        {toast}
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold uppercase tracking-[0.18em] text-amber-300">Previsualización aislada</p>
          <p className="mt-1 font-light leading-relaxed">
            Esta pantalla no modifica la web actual. Los horarios ocupados son datos de demostración. Los botones de pago no generan cobros.
          </p>
        </div>

        <header className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B0813] shadow-[0_0_25px_rgba(212,175,55,0.35)] ring-1 ring-amber-400/70">
            <span className="font-serif text-lg text-amber-300">✧</span>
          </div>
          <div>
            <p className="bg-gradient-to-r from-[#FFF099] via-[#D4AF37] to-[#AA7C11] bg-clip-text font-serif text-xl font-bold uppercase tracking-widest text-transparent">
              Grupo Diter
            </p>
            <p className="text-[9px] uppercase tracking-[0.25em] text-purple-300/70">Sanación & Videncia</p>
          </div>
        </header>

        <section className="flex flex-col justify-between rounded-2xl border border-amber-500/25 bg-[#1A112B]/80 p-6 backdrop-blur-sm sm:p-8">
          <div>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-purple-400">Lecturas vinculares</span>
                <h1 className="mt-1 font-serif text-2xl font-bold text-white">Lecturas y Videncias</h1>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-purple-900/40 text-xl text-amber-400">
                ◉
              </div>
            </div>

            <p className="mb-6 text-sm font-light leading-relaxed text-gray-300">
              Explorá tus inquietudes sobre el amor, las relaciones y tu camino personal mediante nuestras lecturas de tarot y videncia. Elegí la modalidad que prefieras y recibí orientación personalizada.
            </p>

            <div className="mb-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-200/80">Selecciona el formato de tu consulta:</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SERVICES.map((item, index) => {
                  const active = selectedIndex === index;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedIndex(index)}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left text-xs transition ${
                        active
                          ? 'border-[#D4AF37] bg-amber-500/15'
                          : 'border-amber-500/20 bg-white/5 hover:border-amber-500/60'
                      }`}
                    >
                      <span className="font-medium text-gray-200">{item.label}</span>
                      <span className="font-bold text-amber-300">{formatArs(item.price)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="mb-6 text-sm font-light leading-relaxed text-purple-100/80">
              Elegí la cantidad de preguntas que querés realizar. Nuestro equipo realizará una lectura de tarot y videncia y te enviará las respuestas por correo electrónico.
            </p>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-purple-900/50 pt-4 sm:flex-row">
            <div>
              <span className="block text-xs text-gray-400">Monto total a abonar:</span>
              <span className="font-serif text-2xl font-bold text-amber-400">{formatArs(service.price)} ARS</span>
            </div>
            <button
              type="button"
              onClick={openCheckout}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B8860B] px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#0B0813] transition hover:from-[#F5D77F] hover:to-[#D4AF37] sm:w-auto"
            >
              <span>Continuar con mi lectura</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <details className="mt-6 rounded-2xl border border-purple-500/30 bg-purple-950/30 px-4 py-3 text-sm text-purple-100">
          <summary className="cursor-pointer font-semibold text-amber-200">Datos de demostración del calendario</summary>
          <p className="mt-3 font-light leading-relaxed">
            El cliente ve un único estado, Ocupado. Por dentro, cada franja es una reserva existente o un bloqueo administrativo.
          </p>
          <ul className="mt-3 space-y-2">
            {demoSlots.map((slot) => (
              <li key={slotKey(slot.dateKey, slot.hour)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-xs">
                <span>
                  {formatLongDate(slot.dateKey)} · {formatHour(slot.hour)}
                </span>
                <span className="uppercase tracking-wider text-amber-300">
                  {slot.kind === 'reservation' ? 'Interno: reserva' : 'Interno: bloqueo'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-md sm:items-center sm:px-4">
          <div className="relative my-0 max-h-[100vh] w-full overflow-y-auto rounded-t-3xl border border-amber-500/40 bg-[#140C22] p-5 text-left sm:my-8 sm:max-h-[92vh] sm:max-w-3xl sm:rounded-3xl sm:p-8">
            <button
              type="button"
              onClick={() => setCheckoutOpen(false)}
              className="absolute right-5 top-5 text-xl text-gray-400 hover:text-amber-400"
              aria-label="Cerrar"
            >
              ×
            </button>

            {service.kind === 'questions' ? (
              <QuestionsCheckout
                service={service}
                questions={questions}
                errors={errors}
                onQuestionChange={(index, value) => {
                  setQuestions((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
                  setErrors((current) => {
                    const next = { ...current };
                    delete next[`q-${index}`];
                    return next;
                  });
                }}
              />
            ) : (
              <CallCheckout
                dateKey={dateKey}
                hour={hour}
                errors={errors}
                slotHint={slotHint}
                calendarDays={calendarDays}
                visibleMonth={visibleMonth}
                todayKey={todayKey ?? ''}
                occupied={occupied}
                canGoBack={Boolean(visibleMonth) && !(visibleMonth?.year === todayYear && visibleMonth?.month === todayMonth)}
                onShiftMonth={shiftMonth}
                onSelectDate={(nextDate) => {
                  setDateKey(nextDate);
                  setHour(null);
                  setSlotHint('');
                  setErrors((current) => {
                    const next = { ...current };
                    delete next.date;
                    delete next.hour;
                    return next;
                  });
                }}
                onSelectHour={selectHour}
              />
            )}

            <CustomerFields
              name={name}
              email={email}
              phone={phone}
              errors={errors}
              onName={(value) => {
                setName(value);
                setErrors((current) => {
                  const next = { ...current };
                  delete next.name;
                  return next;
                });
              }}
              onEmail={(value) => {
                setEmail(value);
                setErrors((current) => {
                  const next = { ...current };
                  delete next.email;
                  return next;
                });
              }}
              onPhone={(value) => {
                setPhone(value);
                setErrors((current) => {
                  const next = { ...current };
                  delete next.phone;
                  return next;
                });
              }}
            />

            <PaymentMethods
              paymentMethod={paymentMethod}
              notice={notice}
              onSelect={setPaymentMethod}
              onPay={simulatePayment}
              onCopy={copyText}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionsCheckout({
  service,
  questions,
  errors,
  onQuestionChange,
}: {
  service: QuestionService;
  questions: string[];
  errors: Record<string, string>;
  onQuestionChange: (index: number, value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-purple-300">Checkout de lectura</p>
      <h2 className="mt-1 font-serif text-2xl font-bold text-white">Tu lectura personalizada</h2>

      <div className="mb-6 mt-5 rounded-2xl border border-amber-500/20 bg-purple-950/50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-widest text-amber-300">Servicio seleccionado</span>
            <div className="font-serif text-base font-bold text-white">Lecturas y Videncias</div>
            <div className="text-sm text-purple-200">{service.label}</div>
            <div className="mt-1 text-xs text-gray-400">{service.questions} preguntas</div>
          </div>
          <div className="text-right">
            <span className="block text-[10px] text-gray-400">Precio final</span>
            <span className="font-serif text-xl font-bold text-amber-400">{formatArs(service.price)} ARS</span>
          </div>
        </div>
      </div>

      <h3 className="font-serif text-lg font-bold text-white">¿Cómo funciona tu lectura?</h3>
      <p className="mt-2 text-sm font-light leading-relaxed text-gray-300">
        Escribí las preguntas que querés que respondamos. Realizaremos una sesión de videncia y una tirada de cartas para ofrecerte orientación personalizada.
      </p>
      <p className="mt-2 text-sm font-light leading-relaxed text-gray-300">
        Una vez confirmado el pago, recibirás las respuestas por correo electrónico en un plazo aproximado de 15 minutos.
      </p>
      <div className="mb-6 mt-4 rounded-xl border border-amber-400/60 bg-amber-500/15 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-100">
        Respuestas por email en aproximadamente 15 minutos después de la confirmación del pago.
      </div>

      <div className="mb-6 space-y-4">
        {questions.map((question, index) => {
          const field = `q-${index}`;
          return (
            <div key={field} id={`field-${field}`}>
              <label htmlFor={field} className="mb-1.5 block text-sm font-semibold text-amber-100">
                Pregunta {index + 1}
              </label>
              <textarea
                id={field}
                value={question}
                rows={3}
                onChange={(event) => onQuestionChange(index, event.target.value)}
                placeholder="Escribí tu pregunta con el detalle que quieras compartir"
                className={`${inputClass} min-h-28 resize-y ${errors[field] ? 'border-red-400' : ''}`}
              />
              {errors[field] && <p className="mt-1 text-xs text-red-300">{errors[field]}</p>}
            </div>
          );
        })}
        <p id="field-questions" className="text-sm font-light leading-relaxed text-gray-300">
          Podés escribir hasta la cantidad de preguntas incluidas en tu lectura. No es obligatorio completar todas para continuar con el pago.
        </p>
        {errors.questions && <p className="text-xs text-red-300">{errors.questions}</p>}
      </div>
    </div>
  );
}

function CallCheckout({
  dateKey,
  hour,
  errors,
  slotHint,
  calendarDays,
  visibleMonth,
  todayKey,
  occupied,
  canGoBack,
  onShiftMonth,
  onSelectDate,
  onSelectHour,
}: {
  dateKey: string | null;
  hour: number | null;
  errors: Record<string, string>;
  slotHint: string;
  calendarDays: Array<{ dateKey: string; day: number } | null>;
  visibleMonth: { year: number; month: number } | null;
  todayKey: string;
  occupied: Map<string, DemoSlotKind>;
  canGoBack: boolean;
  onShiftMonth: (delta: number) => void;
  onSelectDate: (dateKey: string) => void;
  onSelectHour: (hour: number) => void;
}) {
  return (
    <div>
      <h2 className="pr-8 font-serif text-2xl font-bold text-white">Reservá tu Llamada de Videncia</h2>
      <p className="mt-1 text-sm text-purple-200">Asesorías y consultas espirituales personalizadas.</p>
      <div className="mb-5 mt-4 rounded-xl border border-amber-400/60 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">
        Disponibilidad las 24 horas, todos los días.
      </div>
      <p className="text-sm font-light leading-relaxed text-gray-300">
        Elegí el día y horario que prefieras para tu consulta. Durante 45 minutos realizaremos una sesión personalizada de videncia y tarot para abordar tus inquietudes.
      </p>
      <p className="mt-2 text-sm font-light leading-relaxed text-gray-300">
        Una vez confirmado el pago, recibirás por correo electrónico los detalles de tu reserva.
      </p>

      <div id="field-date" className="mt-6 rounded-2xl border border-amber-500/20 bg-purple-950/40 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onShiftMonth(-1)}
            disabled={!canGoBack}
            className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-sm text-amber-200 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Mes anterior"
          >
            ←
          </button>
          <p className="font-serif text-lg text-white">
            {visibleMonth ? formatMonthTitle(visibleMonth.year, visibleMonth.month) : 'Calendario'}
          </p>
          <button
            type="button"
            onClick={() => onShiftMonth(1)}
            className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-sm text-amber-200"
            aria-label="Mes siguiente"
          >
            →
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wider text-amber-200/70">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="py-1">
              {label}
            </span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendarDays.map((cell, index) => {
            if (!cell) {
              return <span key={`empty-${index}`} />;
            }

            const isPast = cell.dateKey < todayKey;
            const isSelected = cell.dateKey === dateKey;
            const isToday = cell.dateKey === todayKey;

            return (
              <button
                key={cell.dateKey}
                type="button"
                disabled={isPast}
                onClick={() => onSelectDate(cell.dateKey)}
                className={`h-10 rounded-lg text-sm transition ${
                  isSelected
                    ? 'border border-[#D4AF37] bg-[#5B2D9B] font-semibold text-white'
                    : isPast
                      ? 'cursor-not-allowed text-gray-600'
                      : 'border border-transparent text-gray-100 hover:border-amber-400/40 hover:bg-purple-900/50'
                } ${isToday && !isSelected ? 'text-amber-200' : ''}`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
        {errors.date && <p className="mt-2 text-xs text-red-300">{errors.date}</p>}
      </div>

      <div id="field-hour" className="mt-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200/90">Horarios de inicio</p>
          <p className="text-[11px] text-gray-400">Argentina (UTC−3) · sesión de 45 min</p>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
          <span className="rounded-full border border-purple-400/30 bg-[#2A1848] px-2 py-1 text-purple-50">Libre</span>
          <span className="rounded-full border border-white/5 bg-[#0C0814] px-2 py-1 text-gray-500">Ocupado</span>
          <span className="rounded-full border border-[#D4AF37] bg-[#5B2D9B] px-2 py-1 text-white">Elegido</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {HOURS.map((value) => {
            const kind = dateKey ? occupied.get(slotKey(dateKey, value)) : undefined;
            const selected = hour === value;
            const stateClass = selected
              ? 'border-[#D4AF37] bg-[#5B2D9B] text-white shadow-[0_0_18px_rgba(212,175,55,0.28)]'
              : kind
                ? 'cursor-not-allowed border-white/5 bg-[#0C0814] text-gray-500'
                : 'border-purple-400/30 bg-[#2A1848] text-purple-50 hover:border-amber-400/50';

            return (
              <button
                key={value}
                type="button"
                disabled={!dateKey}
                onClick={() => onSelectHour(value)}
                aria-pressed={selected}
                className={`rounded-xl border px-2 py-2 text-center transition ${stateClass}`}
              >
                <span className="block text-sm font-semibold">{formatHour(value)}</span>
                <span className="mt-0.5 block text-[10px] uppercase tracking-wider">
                  {selected ? 'Elegido' : kind ? 'Ocupado' : 'Libre'}
                </span>
              </button>
            );
          })}
        </div>
        {slotHint && <p className="mt-2 text-xs text-amber-200">{slotHint}</p>}
        {errors.hour && <p className="mt-2 text-xs text-red-300">{errors.hour}</p>}
      </div>

      <div className="mb-6 mt-5 rounded-2xl border border-amber-500/20 bg-purple-950/50 p-4 text-sm">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">Resumen</p>
        <div className="mt-2 space-y-1.5 text-gray-200">
          <p>Llamada de 45 minutos</p>
          <p>Fecha: {dateKey ? formatLongDate(dateKey) : 'Sin seleccionar'}</p>
          <p>Horario: {hour === null ? 'Sin seleccionar' : `${formatHour(hour)} · 45 min`}</p>
          <p className="font-serif text-lg font-bold text-amber-400">Precio: {formatArs(SERVICE_CATALOG['lecturas-llamada-45'].unitPrice)} ARS</p>
        </div>
      </div>
    </div>
  );
}

function CustomerFields({
  name,
  email,
  phone,
  errors,
  onName,
  onEmail,
  onPhone,
}: {
  name: string;
  email: string;
  phone: string;
  errors: Record<string, string>;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onPhone: (value: string) => void;
}) {
  return (
    <div className="mb-6 space-y-3">
      <div id="field-name">
        <label htmlFor="cust-name" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-300">
          Nombre completo *
        </label>
        <input
          id="cust-name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Ej: María Gómez"
          autoComplete="name"
          className={`${inputClass} ${errors.name ? 'border-red-400' : ''}`}
        />
        {errors.name && <p className="mt-1 text-xs text-red-300">{errors.name}</p>}
      </div>
      <div id="field-email">
        <label htmlFor="cust-email" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-300">
          Correo electrónico *
        </label>
        <input
          id="cust-email"
          type="email"
          value={email}
          onChange={(event) => onEmail(event.target.value)}
          placeholder="tuemail@ejemplo.com"
          autoComplete="email"
          className={`${inputClass} ${errors.email ? 'border-red-400' : ''}`}
        />
        {errors.email && <p className="mt-1 text-xs text-red-300">{errors.email}</p>}
      </div>
      <div id="field-phone">
        <label htmlFor="cust-phone" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-300">
          WhatsApp *
        </label>
        <input
          id="cust-phone"
          type="tel"
          value={phone}
          onChange={(event) => onPhone(event.target.value)}
          placeholder="5492612738086"
          autoComplete="tel"
          className={`${inputClass} ${errors.phone ? 'border-red-400' : ''}`}
        />
        {errors.phone && <p className="mt-1 text-xs text-red-300">{errors.phone}</p>}
      </div>
    </div>
  );
}

function PaymentMethods({
  paymentMethod,
  notice,
  onSelect,
  onPay,
  onCopy,
}: {
  paymentMethod: 'mp' | 'cbu';
  notice: string;
  onSelect: (method: 'mp' | 'cbu') => void;
  onPay: (method: 'mp' | 'cbu') => void;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-200/90">Selecciona el método de pago:</p>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onSelect('mp')}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3.5 text-center transition ${
            paymentMethod === 'mp'
              ? 'border-sky-400 bg-sky-500/15 shadow-[0_0_15px_rgba(0,158,227,0.25)]'
              : 'border-amber-500/20 bg-[#120C1F]/60'
          }`}
        >
          <MercadoPagoLogo />
          <span className="text-xs font-bold leading-tight text-white">Mercado Pago</span>
        </button>
        <button
          type="button"
          onClick={() => onSelect('cbu')}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3.5 text-center transition ${
            paymentMethod === 'cbu'
              ? 'border-[#D4AF37] bg-amber-500/15 shadow-[0_0_15px_rgba(212,175,55,0.25)]'
              : 'border-amber-500/20 bg-[#120C1F]/60'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M4 10h16M6 10v7M10 10v7M14 10v7M18 10v7M3 19h18M12 3.5 21 10H3L12 3.5Z" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-bold leading-tight text-white">Transferencia</span>
        </button>
      </div>

      {paymentMethod === 'mp' ? (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-950/30 p-4 text-xs text-sky-100">
          <div className="mb-3 flex items-center gap-3">
            <MercadoPagoLogo heightClass="h-8" />
            <span className="font-semibold text-sky-100">Pago procesado por Mercado Pago</span>
          </div>
          <p className="mb-4 text-[11px] font-light leading-relaxed text-gray-300">
            Serás redirigido de forma segura a Mercado Pago para abonar con tarjeta de crédito, débito o dinero en cuenta.
          </p>
          <button
            type="button"
            onClick={() => onPay('mp')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#009EE3] to-[#007EA7] py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_4px_15px_rgba(0,158,227,0.3)] transition hover:from-[#20B3F7] hover:to-[#009EE3]"
          >
            Pagar ahora con Mercado Pago
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-100">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Datos bancarios para transferir</span>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">Acreditación inmediata</span>
          </div>
          <div className="space-y-2 rounded-xl border border-amber-500/20 bg-purple-950/70 p-3.5 text-[11px]">
            <div className="flex items-center justify-between border-b border-purple-900/50 py-1">
              <span className="text-gray-400">Titular</span>
              <span className="font-semibold text-white">Grupo Diter Espiritual S.A.</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-purple-900/50 py-1">
              <span className="text-gray-400">CBU</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-amber-300">0000003100084930291048</span>
                <button type="button" onClick={() => onCopy('0000003100084930291048', 'CBU')} className="text-amber-400">
                  Copiar
                </button>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 py-1">
              <span className="text-gray-400">Alias</span>
              <span className="flex items-center gap-2">
                <span className="font-mono font-bold text-amber-300">GRUPO.DITER.MP</span>
                <button type="button" onClick={() => onCopy('GRUPO.DITER.MP', 'Alias')} className="text-amber-400">
                  Copiar
                </button>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onPay('cbu')}
            className="mt-4 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B8860B] py-3.5 text-xs font-bold uppercase tracking-wider text-[#0B0813]"
          >
            Enviar comprobante por WhatsApp
          </button>
        </div>
      )}

      {notice && (
        <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
