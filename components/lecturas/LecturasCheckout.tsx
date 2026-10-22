'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { BuildingColumnsIcon, CopyIcon } from '@/components/icons';
import { MercadoPagoLogo } from '@/components/lecturas/MercadoPagoLogo';
import { createMetaEventId } from '@/lib/meta/event-id';
import { hasMetaConsent } from '@/lib/meta/consent';
import { trackInitiateCheckout, trackViewContent } from '@/lib/meta/pixel';
import {
  isCallServiceId,
  isQuestionServiceId,
  parseCompletedQuestions,
  questionCountFor,
  questionRejectionMessage,
  type LecturaServiceId,
} from '@/lib/lecturas/services';
import {
  artDateKeyFromDate,
  artWeekdayIndex,
  daysInMonth,
  formatArtMonthTitle,
  formatLongArtDate,
  isPastSlot,
} from '@/lib/lecturas/time';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DRAFT_KEY = 'diter-lectura-draft-v1';

const inputClass =
  'w-full rounded-xl border border-amber-500/20 bg-purple-950/40 px-3.5 py-3 text-base text-white placeholder-gray-500 focus:border-amber-400 focus:outline-none';

type OccupiedSlot = { date: string; hour: number };

function formatArs(value: number): string {
  return `$${value.toLocaleString('es-AR')}`;
}

function readDraft(serviceId: string): { questions?: unknown[]; name?: string; email?: string; phone?: string } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) {
      return null;
    }
    const draft = JSON.parse(raw) as { serviceId?: string; questions?: unknown[]; name?: string; email?: string; phone?: string };
    if (draft.serviceId !== serviceId) {
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function slotKey(date: string, hour: number): string {
  return `${date}-${hour}`;
}

function monthBounds(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { from, to };
}

export function LecturasCheckout({
  serviceId,
  label,
  price,
  onClose,
  onToast,
}: {
  serviceId: LecturaServiceId;
  label: string;
  price: number;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const isCall = isCallServiceId(serviceId);
  const questionTotal = questionCountFor(serviceId);
  const [clock] = useState(() => {
    const todayKey = artDateKeyFromDate(new Date());
    return {
      todayKey,
      year: Number(todayKey.slice(0, 4)),
      month: Number(todayKey.slice(5, 7)),
    };
  });
  const [visibleMonth, setVisibleMonth] = useState({ year: clock.year, month: clock.month });
  const [questions, setQuestions] = useState<string[]>(() => {
    const draft = readDraft(serviceId);
    if (draft && Array.isArray(draft.questions) && draft.questions.length === questionTotal) {
      return draft.questions.map((item) => (typeof item === 'string' ? item : ''));
    }
    return Array.from({ length: questionTotal }, () => '');
  });
  const [name, setName] = useState(() => readDraft(serviceId)?.name ?? '');
  const [email, setEmail] = useState(() => readDraft(serviceId)?.email ?? '');
  const [phone, setPhone] = useState(() => readDraft(serviceId)?.phone ?? '');
  const [paymentMethod, setPaymentMethod] = useState<'mp' | 'cbu'>('mp');
  const submitLockRef = useRef(false);
  const [dateKey, setDateKey] = useState<string | null>(isCall ? clock.todayKey : null);
  const [hour, setHour] = useState<number | null>(null);
  const [occupied, setOccupied] = useState<Set<string>>(new Set());
  const [availabilityReady, setAvailabilityReady] = useState(!isCall);
  const [availabilityError, setAvailabilityError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [slotHint, setSlotHint] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    trackViewContent(serviceId);
  }, [serviceId]);

  useEffect(() => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ serviceId, questions, name, email, phone })
    );
  }, [email, name, phone, questions, serviceId]);

  useEffect(() => {
    if (!isCall) {
      return;
    }

    const bounds = monthBounds(visibleMonth.year, visibleMonth.month);
    const controller = new AbortController();

    fetch(`/api/lecturas/availability?from=${bounds.from}&to=${bounds.to}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : 'No pudimos cargar los horarios.');
        }
        const next = new Set<string>();
        (data.occupied as OccupiedSlot[]).forEach((slot) => next.add(slotKey(slot.date, slot.hour)));
        setOccupied(next);
        setAvailabilityReady(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setAvailabilityError('No pudimos cargar la disponibilidad. Volvé a intentar.');
        setAvailabilityReady(false);
      });

    return () => controller.abort();
  }, [isCall, visibleMonth]);

  const todayYear = clock.year;
  const todayMonth = clock.month;
  const calendarDays = useMemo(() => {
    if (!visibleMonth) {
      return [];
    }

    const leading = artWeekdayIndex(visibleMonth.year, visibleMonth.month, 1);
    const total = daysInMonth(visibleMonth.year, visibleMonth.month);
    const cells: Array<{ dateKey: string; day: number } | null> = Array.from({ length: leading }, () => null);

    for (let day = 1; day <= total; day += 1) {
      cells.push({
        dateKey: `${visibleMonth.year}-${String(visibleMonth.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
      });
    }

    return cells;
  }, [visibleMonth]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!isCall && isQuestionServiceId(serviceId)) {
      const parsed = parseCompletedQuestions(serviceId, questions);
      if (!parsed.ok && parsed.reason === 'too_long' && parsed.index !== undefined) {
        nextErrors[`q-${parsed.index}`] = questionRejectionMessage(parsed) ?? 'La pregunta puede tener hasta 1500 caracteres.';
      } else if (!parsed.ok) {
        nextErrors.questions = questionRejectionMessage(parsed) ?? 'Escribí al menos una pregunta.';
      }
    } else if (isCall) {
      if (!dateKey) {
        nextErrors.date = 'Elegí una fecha.';
      }
      if (hour === null) {
        nextErrors.hour = 'Elegí un horario libre.';
      }
      if (!availabilityReady) {
        nextErrors.hour = 'Esperá a que cargue la disponibilidad.';
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
      document.getElementById(`field-${firstInvalid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return Object.keys(nextErrors).length === 0;
  };

  const copyBankDetail = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    onToast(`${label} copiado con éxito`);
  };

  const submit = async (method: 'mp' | 'cbu') => {
    if (submitLockRef.current) {
      return;
    }

    setNotice('');
    if (!validate()) {
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    const eventId = createMetaEventId();
    let keepLocked = false;

    try {
      const response = await fetch('/api/lecturas/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          paymentMethod: method === 'mp' ? 'mercadopago' : 'transfer',
          questions: isCall ? undefined : questions.map((question) => question.trim()),
          date: dateKey,
          hour,
          eventId,
          metaConsent: hasMetaConsent(),
        }),
      });
      const data = await response.json();

      if (response.status === 409) {
        setSlotHint('Ese horario está ocupado.');
        setHour(null);
        setOccupied((current) => {
          const next = new Set(current);
          if (dateKey && hour !== null) {
            next.add(slotKey(dateKey, hour));
          }
          return next;
        });
        setNotice(typeof data.error === 'string' ? data.error : 'Ese horario acaba de ocuparse.');
        return;
      }

      if (!response.ok) {
        setNotice(typeof data.error === 'string' ? data.error : 'No pudimos iniciar la solicitud.');
        return;
      }

      if (method === 'mp' && typeof data.init_point === 'string') {
        try {
          trackInitiateCheckout(serviceId, eventId);
        } catch {
          // El Pixel no debe frenar el pago.
        }
        keepLocked = true;
        window.location.href = data.init_point;
        return;
      }

      if (method === 'mp') {
        setNotice('No pudimos iniciar la solicitud.');
        return;
      }

      const priceFormatted = price.toLocaleString('es-AR');
      const message =
        `✨ *RESERVA DE TURNO - GRUPO DITER* ✨\n\n` +
        `*Servicio:* Lecturas y Videncias\n` +
        `*Modalidad:* ${label}\n` +
        `*Monto ARS:* $${priceFormatted}\n` +
        `*Método de Pago:* Transferencia Bancaria (CBU / ALIAS)\n` +
        `*Referencia:* ${data.checkoutId}\n\n` +
        `👤 *Cliente:* ${name.trim()}\n` +
        `📧 *Email:* ${email.trim()}\n` +
        `📱 *Teléfono:* ${phone.trim()}\n\n` +
        `Adjunto el comprobante. La solicitud queda pendiente hasta validar la transferencia.`;

      window.open(`https://wa.me/5492612738086?text=${encodeURIComponent(message)}`, '_blank');
      sessionStorage.removeItem(DRAFT_KEY);
      setNotice('Registramos tu solicitud como pendiente. La confirmación ocurre después de validar la transferencia.');
      onToast('Solicitud pendiente de validación');
    } catch {
      setNotice('Error de conexión con el servidor.');
    } finally {
      if (!keepLocked) {
        submitLockRef.current = false;
        setSubmitting(false);
      }
    }
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(Date.UTC(visibleMonth.year, visibleMonth.month - 1 + delta, 1, 15));
    const year = next.getUTCFullYear();
    const month = next.getUTCMonth() + 1;
    if (year < todayYear || (year === todayYear && month < todayMonth) || (year === visibleMonth.year && month === visibleMonth.month)) {
      return;
    }
    setAvailabilityReady(false);
    setOccupied(new Set());
    setHour(null);
    setVisibleMonth({ year, month });
  };

  const selectHour = (value: number) => {
    if (!dateKey || !availabilityReady) {
      return;
    }
    if (isPastSlot(dateKey, value)) {
      setHour(null);
      setSlotHint('Ese horario ya pasó.');
      return;
    }

    if (occupied.has(slotKey(dateKey, value))) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 sm:items-center sm:px-4 md:backdrop-blur-md">
      <div className="relative max-h-[100vh] w-full overflow-y-auto rounded-t-3xl border border-amber-500/40 bg-[#140C22] p-5 text-left sm:my-8 sm:max-h-[92vh] sm:max-w-3xl sm:rounded-3xl sm:p-8">
        <button type="button" onClick={onClose} className="absolute right-5 top-5 text-xl text-gray-400 hover:text-amber-400" aria-label="Cerrar">
          ×
        </button>

        {isCall ? (
          <CallSection
            dateKey={dateKey}
            hour={hour}
            errors={errors}
            slotHint={slotHint}
            availabilityError={availabilityError}
            calendarDays={calendarDays}
            visibleMonth={visibleMonth}
            todayKey={clock.todayKey}
            occupied={occupied}
            canGoBack={Boolean(visibleMonth) && !(visibleMonth?.year === todayYear && visibleMonth?.month === todayMonth)}
            onShiftMonth={shiftMonth}
            onSelectDate={(nextDate) => {
              setDateKey(nextDate);
              setHour(null);
              setSlotHint('');
            }}
            onSelectHour={selectHour}
          />
        ) : (
          <QuestionsSection
            label={label}
            price={price}
            questionTotal={questionTotal}
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
        )}

        <div className="mb-6 space-y-3">
          <Field id="field-name" label="Nombre completo *" error={errors.name}>
            <input id="cust-name" value={name} autoComplete="name" placeholder="Ej: María Gómez" onChange={(event) => setName(event.target.value)} className={`${inputClass} ${errors.name ? 'border-red-400' : ''}`} />
          </Field>
          <Field id="field-email" label="Correo electrónico *" error={errors.email}>
            <input id="cust-email" type="email" value={email} autoComplete="email" placeholder="tuemail@ejemplo.com" onChange={(event) => setEmail(event.target.value)} className={`${inputClass} ${errors.email ? 'border-red-400' : ''}`} />
          </Field>
          <Field id="field-phone" label="WhatsApp *" error={errors.phone}>
            <input id="cust-phone" type="tel" value={phone} autoComplete="tel" placeholder="5492612738086" onChange={(event) => setPhone(event.target.value)} className={`${inputClass} ${errors.phone ? 'border-red-400' : ''}`} />
          </Field>
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-200/90">Selecciona el método de pago:</p>
        <div className="mb-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setPaymentMethod('mp')} className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3.5 ${paymentMethod === 'mp' ? 'border-sky-400 bg-sky-500/15 shadow-[0_0_15px_rgba(0,158,227,0.25)]' : 'border-amber-500/20 bg-[#120C1F]/60'}`}>
            <MercadoPagoLogo />
            <span className="text-xs font-bold text-white">Mercado Pago</span>
          </button>
          <button type="button" onClick={() => setPaymentMethod('cbu')} className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3.5 ${paymentMethod === 'cbu' ? 'border-[#D4AF37] bg-amber-500/15 shadow-[0_0_15px_rgba(212,175,55,0.25)]' : 'border-amber-500/20 bg-[#120C1F]/60'}`}>
            <BuildingColumnsIcon className="text-lg text-amber-400" />
            <span className="text-xs font-bold text-white">Transferencia</span>
          </button>
        </div>

        {paymentMethod === 'mp' ? (
          <div className="rounded-2xl border border-sky-500/30 bg-sky-950/30 p-4 text-xs text-sky-100">
            <div className="mb-3 flex items-center gap-3">
              <MercadoPagoLogo heightClass="h-8" />
              <span className="font-semibold">Pago procesado por Mercado Pago</span>
            </div>
            <p className="mb-4 text-[11px] font-light leading-relaxed text-gray-300">
              Serás redirigido de forma segura a Mercado Pago para abonar con tarjeta de crédito, débito o dinero en cuenta.
            </p>
            <button type="button" disabled={submitting} onClick={() => submit('mp')} className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#009EE3] to-[#007EA7] py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_4px_15px_rgba(0,158,227,0.3)] disabled:opacity-60">
              {submitting ? 'Generando preferencia de pago...' : 'Pagar ahora con Mercado Pago'}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-100">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Datos bancarios para transferir</span>
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">Pendiente de validación</span>
            </div>
            <div className="space-y-2 rounded-xl border border-amber-500/20 bg-purple-950/70 p-3.5 text-[11px]">
              <div className="flex items-center justify-between gap-3 border-b border-purple-900/50 py-1">
                <span className="text-gray-400">Titular</span>
                <span className="text-right font-semibold text-white">Pablo Antonio Guzman Gomez</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-purple-900/50 py-1">
                <span className="text-gray-400">Banco</span>
                <span className="text-right font-semibold text-white">Macro</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-purple-900/50 py-1">
                <span className="text-gray-400">CVU/CBU</span>
                <span className="flex items-center gap-2">
                  <span className="break-all text-right font-mono text-amber-300">2850408140096168058568</span>
                  <button type="button" onClick={() => copyBankDetail('2850408140096168058568', 'CVU/CBU')} className="text-amber-400 hover:text-white" aria-label="Copiar CVU/CBU">
                    <CopyIcon />
                  </button>
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-1">
                <span className="text-gray-400">Alias</span>
                <span className="flex items-center gap-2">
                  <span className="break-all text-right font-mono font-bold text-amber-300">OBEDEZCO.ROSCA.VOCAL</span>
                  <button type="button" onClick={() => copyBankDetail('OBEDEZCO.ROSCA.VOCAL', 'Alias')} className="text-amber-400 hover:text-white" aria-label="Copiar alias">
                    <CopyIcon />
                  </button>
                </span>
              </div>
            </div>
            <button type="button" disabled={submitting} onClick={() => submit('cbu')} className="mt-4 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B8860B] py-3.5 text-xs font-bold uppercase tracking-wider text-[#0B0813] disabled:opacity-60">
              {submitting ? 'Registrando solicitud...' : 'Enviar comprobante por WhatsApp'}
            </button>
          </div>
        )}

        {notice && <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100" role="status">{notice}</p>}
      </div>
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div id={id}>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-300">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

function QuestionsSection({
  label,
  price,
  questionTotal,
  questions,
  errors,
  onQuestionChange,
}: {
  label: string;
  price: number;
  questionTotal: number;
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
            <div className="text-sm text-purple-200">{label}</div>
            <div className="mt-1 text-xs text-gray-400">{questionTotal} preguntas</div>
          </div>
          <div className="text-right">
            <span className="block text-[10px] text-gray-400">Precio final</span>
            <span className="font-serif text-xl font-bold text-amber-400">{formatArs(price)} ARS</span>
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
              <label htmlFor={field} className="mb-1.5 block text-sm font-semibold text-amber-100">Pregunta {index + 1}</label>
              <textarea id={field} value={question} rows={3} onChange={(event) => onQuestionChange(index, event.target.value)} placeholder="Escribí tu pregunta con el detalle que quieras compartir" className={`${inputClass} min-h-28 resize-y ${errors[field] ? 'border-red-400' : ''}`} />
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

function CallSection({
  dateKey,
  hour,
  errors,
  slotHint,
  availabilityError,
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
  availabilityError: string;
  calendarDays: Array<{ dateKey: string; day: number } | null>;
  visibleMonth: { year: number; month: number } | null;
  todayKey: string;
  occupied: Set<string>;
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
          <button type="button" onClick={() => onShiftMonth(-1)} disabled={!canGoBack} className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-sm text-amber-200 disabled:opacity-30" aria-label="Mes anterior">←</button>
          <p className="font-serif text-lg text-white">{visibleMonth ? formatArtMonthTitle(visibleMonth.year, visibleMonth.month) : 'Calendario'}</p>
          <button type="button" onClick={() => onShiftMonth(1)} className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-sm text-amber-200" aria-label="Mes siguiente">→</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wider text-amber-200/70">
          {WEEKDAYS.map((label) => <span key={label} className="py-1">{label}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendarDays.map((cell, index) => {
            if (!cell) {
              return <span key={`empty-${index}`} />;
            }
            const isPast = Boolean(todayKey) && cell.dateKey < todayKey;
            const isSelected = cell.dateKey === dateKey;
            return (
              <button key={cell.dateKey} type="button" disabled={isPast} onClick={() => onSelectDate(cell.dateKey)} className={`h-10 rounded-lg text-sm ${isSelected ? 'border border-[#D4AF37] bg-[#5B2D9B] font-semibold text-white' : isPast ? 'cursor-not-allowed text-gray-600' : 'text-gray-100 hover:bg-purple-900/50'}`}>
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
        {availabilityError && <p className="mb-3 text-xs text-red-300">{availabilityError}</p>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {HOURS.map((value) => {
            const taken = Boolean(dateKey) && occupied.has(slotKey(dateKey as string, value));
            const selected = hour === value;
            const stateClass = selected
              ? 'border-[#D4AF37] bg-[#5B2D9B] text-white shadow-[0_0_18px_rgba(212,175,55,0.28)]'
              : taken
                ? 'cursor-not-allowed border-white/5 bg-[#0C0814] text-gray-500'
                : 'border-purple-400/30 bg-[#2A1848] text-purple-50 hover:border-amber-400/50';
            return (
              <button key={value} type="button" disabled={!dateKey} onClick={() => onSelectHour(value)} aria-pressed={selected} className={`rounded-xl border px-2 py-2 text-center ${stateClass}`}>
                <span className="block text-sm font-semibold">{formatHour(value)}</span>
                <span className="mt-0.5 block text-[10px] uppercase tracking-wider">{selected ? 'Elegido' : taken ? 'Ocupado' : 'Libre'}</span>
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
          <p>Fecha: {dateKey ? formatLongArtDate(dateKey) : 'Sin seleccionar'}</p>
          <p>Horario: {hour === null ? 'Sin seleccionar' : `${formatHour(hour)} · 45 min`}</p>
          <p className="font-serif text-lg font-bold text-amber-400">Precio: {formatArs(100000)} ARS</p>
        </div>
      </div>
    </div>
  );
}
