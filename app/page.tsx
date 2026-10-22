'use client';
import Testimonials from '@/components/Testimoniales';
import { LecturasCheckout } from '@/components/lecturas/LecturasCheckout';
import { MercadoPagoLogo } from '@/components/lecturas/MercadoPagoLogo';
import React, { useState, useEffect, useRef } from 'react';
import {
  AnkhIcon,
  ArrowRightIcon,
  BarsIcon,
  BoltIcon,
  BuildingColumnsIcon,
  CalendarCheckIcon,
  CircleCheckIcon,
  CircleInfoIcon,
  CompassIcon,
  CopyIcon,
  CreditCardIcon,
  EyeIcon,
  FireIcon,
  HeartPulseIcon,
  LockIcon,
  MoonIcon,
  PhoneVolumeIcon,
  ShieldCatIcon,
  ShieldHalvedIcon,
  SpinnerIcon,
  StarIcon,
  UserShieldIcon,
  WandIcon,
  WhatsAppIcon,
  XMarkIcon,
} from '@/components/icons';
import {
  LECTURA_SERVICES,
  LIMPIEZA_SERVICES,
  type ServiceId,
} from '@/lib/mercadopago/catalog';
import { createMetaEventId } from '@/lib/meta/event-id';
import { trackInitiateCheckout, trackViewContent } from '@/lib/meta/pixel';
import { hasMetaConsent } from '@/lib/meta/consent';
import { isLecturaServiceId } from '@/lib/lecturas/services';
import { returnMessage, type ReturnService, type ReturnState } from '@/lib/lecturas/return-status';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Estado del menú móvil
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Estados de Toast
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [returnNotice, setReturnNotice] = useState<{ message: string; state: ReturnState } | null>(null);
  const refreshReturnRef = useRef<(() => void) | null>(null);

  // Variantes seleccionadas por categoría
  const [variants, setVariants] = useState({
    lecturas: {
      id: LECTURA_SERVICES[0].id,
      name: LECTURA_SERVICES[0].variant,
      price: LECTURA_SERVICES[0].unitPrice,
      index: 0,
    },
    limpiezas: {
      id: LIMPIEZA_SERVICES[0].id,
      name: LIMPIEZA_SERVICES[0].variant,
      price: LIMPIEZA_SERVICES[0].unitPrice,
      index: 0,
    },
  });

  // Estado del Modal de Checkout (Únicamente Mercado Pago y CBU/Transferencia)
  const [modalOpen, setModalOpen] = useState(false);
  const [lecturasOpen, setLecturasOpen] = useState(false);
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState<'mp' | 'cbu'>('mp');
  const [selectedService, setSelectedService] = useState<{
    id: ServiceId | '';
    title: string;
    variant: string;
    price: number;
  }>({
    id: '',
    title: '',
    variant: '',
    price: 0,
  });

  // Datos del cliente
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [loadingMp, setLoadingMp] = useState(false);
  const checkoutInFlightRef = useRef(false);

  // Animación del Canvas Cosmos (Optimizado para Mobile)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const smallScreen = window.matchMedia('(max-width: 767px)');
    let frameId = 0;
    let stars: Array<{
      x: number;
      y: number;
      radius: number;
      color: string;
      alpha: number;
      speed: number;
      vx: number;
      vy: number;
    }> = [];

    const createStars = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const starCount = smallScreen.matches ? 40 : 90;
      stars = [];
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 1.5 + 0.2,
          color: Math.random() > 0.3 ? '#D4AF37' : '#C084FC',
          alpha: Math.random(),
          speed: Math.random() * 0.012 + 0.003,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
        });
      }
    };

    const paint = (moving: boolean) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach((star) => {
        if (moving) {
          star.alpha += star.speed;
          if (star.alpha > 1 || star.alpha < 0) {
            star.speed = -star.speed;
          }
          star.x += star.vx;
          star.y += star.vy;
          if (star.x < 0) star.x = canvas.width;
          if (star.x > canvas.width) star.x = 0;
          if (star.y < 0) star.y = canvas.height;
          if (star.y > canvas.height) star.y = 0;
        }

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = Math.abs(star.alpha);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };

    const shouldMove = () =>
      !reducedMotion.matches && !smallScreen.matches && document.visibilityState === 'visible';

    const stop = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    };

    const tick = () => {
      if (!shouldMove()) {
        stop();
        return;
      }
      paint(true);
      frameId = requestAnimationFrame(tick);
    };

    const sync = () => {
      stop();
      if (shouldMove()) {
        tick();
        return;
      }
      paint(false);
    };

    const onResize = () => {
      createStars();
      sync();
    };

    createStars();
    sync();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    smallScreen.addEventListener('change', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
      smallScreen.removeEventListener('change', onResize);
      stop();
    };
  }, []);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const reference = params.get('external_reference') ?? '';
    const checkoutId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference)
      ? reference
      : '';
    const returned = status === 'success' || status === 'failure' || status === 'pending';
    if (!returned) {
      return;
    }

    let timer = 0;
    let cancelled = false;
    let requestId = 0;
    const waiting = new Set(['processing', 'pending_verification', 'registering', 'unavailable']);

    const showReturn = (state: ReturnState, service: ReturnService | null) => {
      if (cancelled) {
        return;
      }
      setShowToast(false);
      setReturnNotice({ message: returnMessage(state, service), state });
      if (state === 'approved') {
        sessionStorage.removeItem('diter-lectura-draft-v1');
      }
    };

    const poll = async (attempt: number, id: number) => {
      if (!checkoutId) {
        showReturn('unknown', null);
        return;
      }

      try {
        const response = await fetch(`/api/lecturas/fulfillment?checkoutId=${encodeURIComponent(checkoutId)}`, { cache: 'no-store' });
        const data = await response.json() as { state?: ReturnState; service?: ReturnService | null };
        if (cancelled || id !== requestId) {
          return;
        }
        const state = response.ok && data.state ? data.state : 'unavailable';
        const service = data.service ?? null;
        showReturn(state, service);
        if (waiting.has(state) && attempt < 8) {
          timer = window.setTimeout(() => {
            void poll(attempt + 1, id);
          }, 2000);
        }
      } catch {
        if (!cancelled && id === requestId) {
          showReturn('unavailable', null);
        }
      }
    };

    const start = () => {
      window.clearTimeout(timer);
      requestId += 1;
      void poll(0, requestId);
    };

    refreshReturnRef.current = start;
    start();

    return () => {
      cancelled = true;
      refreshReturnRef.current = null;
      window.clearTimeout(timer);
    };
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    triggerToast(`${label} copiado con éxito`);
  };

  const handleSelectVariant = (
    category: 'lecturas' | 'limpiezas',
    index: number,
    id: ServiceId,
    name: string,
    price: number
  ) => {
    setVariants((prev) => ({
      ...prev,
      [category]: { id, name, price, index },
    }));
  };

  const openCheckoutModal = (
    serviceId: ServiceId,
    title: string,
    variantName: string,
    price: number
  ) => {
    setSelectedService({ id: serviceId, title, variant: variantName, price });
    setCurrentPaymentMethod('mp');
    setModalOpen(true);
    trackViewContent(serviceId);
  };

  const handleMercadoPagoPayment = async () => {
    if (!custName) {
      alert('Por favor ingresa tu Nombre Completo antes de proceder con el pago.');
      return;
    }
    if (!custEmail) {
      alert('Por favor ingresa tu Correo Electrónico.');
      return;
    }

    if (!selectedService.id) {
      alert('Ocurrió un error al generar el cobro en Mercado Pago.');
      return;
    }

    if (checkoutInFlightRef.current || loadingMp) {
      return;
    }

    checkoutInFlightRef.current = true;
    setLoadingMp(true);

    const eventId = createMetaEventId();

    try {
      const res = await fetch('/api/mercadopago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: selectedService.id,
          name: custName,
          email: custEmail,
          eventId,
          metaConsent: hasMetaConsent(),
        }),
      });

      const data = await res.json();

      if (data.init_point) {
        try {
          trackInitiateCheckout(selectedService.id, eventId);
        } catch {
          // Continuar la redirección aunque el Pixel falle o esté bloqueado.
        }
        window.location.href = data.init_point;
      } else {
        alert('Ocurrió un error al generar el cobro en Mercado Pago.');
        checkoutInFlightRef.current = false;
        setLoadingMp(false);
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión con el servidor.');
      checkoutInFlightRef.current = false;
      setLoadingMp(false);
    }
  };

  const confirmBookingViaWhatsApp = (methodLabel: string) => {
    const priceFormatted = selectedService.price.toLocaleString('es-AR');
    const name = custName || 'Cliente Sin Nombre';
    const email = custEmail || 'No especificado';
    const phone = custPhone || 'No especificado';

    const message =
      `✨ *RESERVA DE TURNO - GRUPO DITER* ✨\n\n` +
      `*Servicio:* ${selectedService.title}\n` +
      `*Modalidad:* ${selectedService.variant}\n` +
      `*Monto ARS:* $${priceFormatted}\n` +
      `*Método de Pago:* ${methodLabel}\n\n` +
      `👤 *Cliente:* ${name}\n` +
      `📧 *Email:* ${email}\n` +
      `📱 *Teléfono:* ${phone}\n\n` +
      `Adjunto comprobante o quedo a la espera de coordinar el horario de mi sesión.`;

    const encodedMsg = encodeURIComponent(message);
    window.open(`https://wa.me/5492612738086?text=${encodedMsg}`, '_blank');
    setModalOpen(false);
  };

  return (
    <>
      <div className="relative min-h-screen bg-[#0B0813] text-[#E2E8F0] font-sans overflow-x-hidden selection:bg-purple-900 selection:text-amber-200">
        {/* Toast Notification */}
        <div
          className={`fixed top-5 right-5 z-50 transform transition-all duration-300 bg-amber-500 text-slate-950 font-bold px-5 py-3 rounded-xl shadow-[0_0_25px_rgba(212,175,55,0.35)] flex items-center gap-2 pointer-events-none text-xs uppercase tracking-wider ${
            showToast ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0'
          }`}
        >
          <CircleCheckIcon className="text-lg" />
          <span>{toastMsg}</span>
        </div>
        {returnNotice ? (
          <div role="status" className={`fixed top-5 left-1/2 z-50 w-[min(40rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border px-5 py-4 text-sm font-semibold leading-relaxed text-slate-950 shadow-[0_0_25px_rgba(212,175,55,0.35)] ${returnNotice.state === 'approved' ? 'border-emerald-300 bg-emerald-100' : returnNotice.state === 'rejected' || returnNotice.state === 'cancelled' ? 'border-rose-300 bg-rose-100' : 'border-amber-300 bg-amber-100'}`}>
            <p>{returnNotice.message}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setReturnNotice(null);
                  document.getElementById('servicios')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="text-xs font-bold uppercase tracking-wider text-slate-800"
              >
                Volver a los servicios
              </button>
              {returnNotice.state === 'processing' || returnNotice.state === 'pending_verification' || returnNotice.state === 'registering' || returnNotice.state === 'unavailable' ? (
                <button
                  type="button"
                  onClick={() => refreshReturnRef.current?.()}
                  className="text-xs font-bold uppercase tracking-wider text-slate-800"
                >
                  Actualizar estado
                </button>
              ) : null}
              <button type="button" onClick={() => setReturnNotice(null)} className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Cerrar
              </button>
            </div>
          </div>
        ) : null}

        {/* Background Canvas Stars */}
        <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full pointer-events-none z-0" />

        {/* Ambient Orbs */}
        <div className="fixed top-1/4 left-10 hidden h-96 w-96 rounded-full bg-purple-900/15 blur-[100px] pointer-events-none z-0 md:block" />
        <div className="fixed bottom-1/3 right-10 hidden h-96 w-96 rounded-full bg-amber-600/10 blur-[120px] pointer-events-none z-0 md:block" />

        <div className="relative z-10 flex flex-col min-h-screen">
          {/* HEADER */}
          <header className="sticky top-0 z-40 bg-[#0B0813]/80 border-b border-amber-500/20 md:backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
              <a href="#" className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-600 via-purple-600 to-amber-300 p-[1px] flex items-center justify-center shadow-[0_0_25px_rgba(212,175,55,0.35)]">
                  <div className="w-full h-full bg-[#0B0813] rounded-full flex items-center justify-center">
                    <EyeIcon className="text-amber-400 text-lg" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="font-serif text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#FFF099] via-[#D4AF37] to-[#AA7C11] uppercase">
                    Grupo Diter
                  </span>
                  <span className="text-[9px] tracking-[0.25em] text-purple-300/70 uppercase">
                    Sanación & Videncia
                  </span>
                </div>
              </a>

              <nav className="hidden md:flex items-center gap-8 text-sm tracking-wider uppercase">
                <a href="#hero" className="text-gray-300 hover:text-amber-300 transition-colors">Inicio</a>
                <a href="#servicios" className="text-gray-300 hover:text-amber-300 transition-colors">Servicios</a>
                <a href="#nosotros" className="text-gray-300 hover:text-amber-300 transition-colors">Nosotros</a>
                <a href="#contacto" className="text-gray-300 hover:text-amber-300 transition-colors">Contacto</a>
              </nav>

              <div className="hidden sm:block">
                <a
                  href="#servicios"
                  className="bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#0B0813] hover:from-[#F5D77F] hover:to-[#D4AF37] px-5 py-2.5 rounded-full text-xs uppercase font-semibold flex items-center gap-2 shadow-[0_4px_15px_rgba(212,175,55,0.3)] transition"
                >
                  <WandIcon className="text-sm" />
                  <span>Reservar Turno</span>
                </a>
              </div>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden text-amber-400 text-2xl p-2 focus:outline-none"
              >
                {mobileMenuOpen ? <XMarkIcon /> : <BarsIcon />}
              </button>
            </div>

            {/* Menú Móvil */}
            {mobileMenuOpen && (
              <div className="md:hidden bg-[#120C1F]/95 border-b border-amber-500/20 px-6 py-6">
                <nav className="flex flex-col gap-4 text-center font-serif text-lg tracking-widest">
                  <a href="#hero" onClick={() => setMobileMenuOpen(false)} className="text-gray-200 hover:text-amber-400 py-2">Inicio</a>
                  <a href="#servicios" onClick={() => setMobileMenuOpen(false)} className="text-gray-200 hover:text-amber-400 py-2">Servicios Espirituales</a>
                  <a href="#nosotros" onClick={() => setMobileMenuOpen(false)} className="text-gray-200 hover:text-amber-400 py-2">Sobre Nosotros</a>
                  <a href="#contacto" onClick={() => setMobileMenuOpen(false)} className="text-gray-200 hover:text-amber-400 py-2">Contacto</a>
                  <a href="#servicios" onClick={() => setMobileMenuOpen(false)} className="bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#0B0813] py-3 rounded-xl text-xs uppercase font-bold tracking-wider mt-2">Reservar Turno</a>
                </nav>
              </div>
            )}
          </header>

          {/* HERO SECTION */}
          <section id="hero" className="relative pt-10 pb-16 md:pt-24 md:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/30 bg-purple-950/40 mb-6 md:mb-8 md:backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span className="text-xs font-medium tracking-widest text-amber-200 uppercase">
                Guía Espiritual & Sanación Alto Grado
              </span>
            </div>

            <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-wide leading-tight max-w-4xl mb-6">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFF099] via-[#D4AF37] to-[#AA7C11] block mb-2">
                GRUPO DITER
              </span>
              <span className="text-2xl sm:text-4xl lg:text-5xl text-gray-100 font-light italic">
                Sanación, Videncia & Liberación Espiritual
              </span>
            </h1>

            <p className="text-gray-300 text-base sm:text-lg max-w-2xl font-light leading-relaxed mb-8 md:mb-10">
              Descubre la verdad oculta y recupera el equilibrio energético de tu vida. Consulta con maestros clarividentes expertos en limpiezas profundas, unión amorosa y protección espiritual.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <a
                href="#servicios"
                className="bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#0B0813] hover:from-[#F5D77F] hover:to-[#D4AF37] px-8 py-4 rounded-xl text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-3 shadow-[0_4px_15px_rgba(212,175,55,0.3)] transition"
              >
                <CompassIcon className="text-lg" />
                <span>Explorar Servicios</span>
              </a>
              <a
                href="#nosotros"
                className="border border-[#D4AF37] text-[#F5D77F] hover:bg-amber-500/10 px-8 py-4 rounded-xl text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-3 transition"
              >
                <AnkhIcon className="text-lg" />
                <span>Conoce Sobre Nosotros </span>
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12 md:mt-16 w-full max-w-4xl border-t border-amber-500/20 pt-8 md:pt-10 text-left">
              <div className="flex items-center gap-4 p-3 rounded-lg bg-purple-950/20 border border-purple-800/30">
                <div className="text-amber-400 text-2xl w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <UserShieldIcon />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-amber-200 text-sm">Confidencialidad 100%</h4>
                  <p className="text-xs text-gray-400">Atención privada y código de reserva encriptado.</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3 rounded-lg bg-purple-950/20 border border-purple-800/30">
                <div className="text-amber-400 text-2xl w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <StarIcon />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-amber-200 text-sm">+10 Años de Experiencia</h4>
                  <p className="text-xs text-gray-400">Trayectoria respaldada en trabajos de alta magia.</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3 rounded-lg bg-purple-950/20 border border-purple-800/30">
                <div className="text-amber-400 text-2xl w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <CreditCardIcon />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-amber-200 text-sm">Múltiples Pagos</h4>
                  <p className="text-xs text-gray-400">Mercado Pago y Transferencia Bancaria.</p>
                </div>
              </div>
            </div>
          </section>

          {/* CATALOGO DE SERVICIOS */}
          <section id="servicios" className="py-16 md:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
            <div className="text-center mb-12 md:mb-16">
              <h2 className="text-xs uppercase tracking-[0.3em] text-amber-400 mb-2">Consulta Espiritual Especializada</h2>
              <h3 className="font-serif text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#FFF099] via-[#D4AF37] to-[#AA7C11]">
                Nuestros Servicios Sagrados
              </h3>
              <div className="w-24 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent mx-auto mt-4"></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* CARD A: LECTURAS Y VIDENCIAS */}
              <div className="bg-[#1A112B]/80 backdrop-blur-sm border border-amber-500/25 rounded-2xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-purple-400">Lecturas vinculares</span>
                      <h4 className="font-serif text-2xl font-bold text-white mt-1">Lecturas y Videncias</h4>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-purple-900/40 border border-amber-500/30 flex items-center justify-center text-amber-400 text-2xl shrink-0">
                      <EyeIcon />
                    </div>
                  </div>

                  <p className="text-sm text-gray-300 mb-6 font-light leading-relaxed">
                    Explorá tus inquietudes sobre el amor, las relaciones y tu camino personal mediante nuestras lecturas de tarot y videncia. Elegí la modalidad que prefieras y recibí orientación personalizada.
                  </p>

                  <div className="mb-6">
                    <label className="block text-xs uppercase tracking-wider text-amber-200/80 mb-3 font-semibold">
                      Selecciona el formato de tu consulta:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {LECTURA_SERVICES.map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            handleSelectVariant('lecturas', idx, item.id, item.variant, item.unitPrice)
                          }
                          className={`p-3 rounded-xl text-left flex justify-between items-center text-xs border transition ${
                            variants.lecturas.index === idx
                              ? 'border-[#D4AF37] bg-amber-500/15'
                              : 'border-amber-500/20 bg-white/5 hover:border-amber-500/60'
                          }`}
                        >
                          <span className="font-medium text-gray-200">{item.variant}</span>
                          <span className="font-bold text-amber-300">${item.unitPrice.toLocaleString('es-AR')}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-4 text-sm font-light leading-relaxed text-purple-100/80">
                      Elegí la cantidad de preguntas que querés realizar. Nuestro equipo realizará una lectura de tarot y videncia y te enviará las respuestas por correo electrónico.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-purple-900/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <span className="text-xs text-gray-400 block">Monto total a abonar:</span>
                    <span className="font-serif text-2xl font-bold text-amber-400">
                      ${variants.lecturas.price.toLocaleString('es-AR')} ARS
                    </span>
                  </div>
                  <button
                    onClick={() => setLecturasOpen(true)}
                    className="w-full sm:w-auto bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#0B0813] hover:from-[#F5D77F] hover:to-[#D4AF37] px-6 py-3 rounded-xl text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-2"
                  >
                    <span>Continuar con mi lectura</span>
                    <ArrowRightIcon />
                  </button>
                </div>
              </div>

              {/* CARD B: LIMPIEZAS ENERGÉTICAS */}
              <div className="bg-[#1A112B]/80 backdrop-blur-sm border border-amber-500/25 rounded-2xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-purple-400">Purificación & Armonía</span>
                      <h4 className="font-serif text-2xl font-bold text-white mt-1">Limpiezas Energéticas</h4>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-purple-900/40 border border-amber-500/30 flex items-center justify-center text-amber-400 text-2xl shrink-0">
                      <FireIcon />
                    </div>
                  </div>

                  <p className="text-sm text-gray-300 mb-6 font-light leading-relaxed">
                    Remueve larvas astrales, envidias, mal de ojo y bloqueos estancados. Restaura la vibración lumínica personal, en tu hogar o negocio.
                  </p>

                  <div className="mb-6">
                    <label className="block text-xs uppercase tracking-wider text-amber-200/80 mb-3 font-semibold">
                      Modalidad de Limpieza:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {LIMPIEZA_SERVICES.map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            handleSelectVariant('limpiezas', idx, item.id, item.variant, item.unitPrice)
                          }
                          className={`p-3 rounded-xl text-left flex justify-between items-center text-xs border transition ${
                            variants.limpiezas.index === idx
                              ? 'border-[#D4AF37] bg-amber-500/15'
                              : 'border-amber-500/20 bg-white/5 hover:border-amber-500/60'
                          }`}
                        >
                          <span className="font-medium text-gray-200">{item.variant}</span>
                          <span className="font-bold text-amber-300">${item.unitPrice.toLocaleString('es-AR')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-purple-900/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <span className="text-xs text-gray-400 block">Monto total a abonar:</span>
                    <span className="font-serif text-2xl font-bold text-amber-400">
                      ${variants.limpiezas.price.toLocaleString('es-AR')} ARS
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      openCheckoutModal(
                        variants.limpiezas.id,
                        'Limpiezas Energéticas',
                        variants.limpiezas.name,
                        variants.limpiezas.price
                      )
                    }
                    className="w-full sm:w-auto bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#0B0813] hover:from-[#F5D77F] hover:to-[#D4AF37] px-6 py-3 rounded-xl text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-2"
                  >
                    <span>Reservar Turno / Comprar</span>
                    <ArrowRightIcon />
                  </button>
                </div>
              </div>

              {/* CARD C: AMARRES DE AMOR */}
              <div className="bg-[#1A112B]/80 backdrop-blur-sm border border-amber-500/25 rounded-2xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-purple-400">Unión & Vinculación Sagrada</span>
                      <h4 className="font-serif text-2xl font-bold text-white mt-1">Amarres de Amor</h4>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-purple-900/40 border border-amber-500/30 flex items-center justify-center text-amber-400 text-2xl shrink-0">
                      <HeartPulseIcon />
                    </div>
                  </div>

                  <p className="text-sm text-gray-300 mb-6 font-light leading-relaxed">
                    Trabajos de alta dominación, retorno de pareja y endulzamientos. Requiere strictly evaluación previa obligatoria antes de iniciar el ritual.
                  </p>

                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 text-xs text-amber-200 flex gap-3 items-center">
                    <CircleInfoIcon className="text-amber-400 text-lg shrink-0" />
                    <span>Incluye análisis de fotos, compatibilidad astral y dictamen de viabilidad del trabajo.</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-purple-900/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <span className="text-xs text-gray-400 block">Consulta de Evaluación Previa:</span>
                    <span className="font-serif text-2xl font-bold text-amber-400">$60.000 ARS</span>
                  </div>
                  <button
                    onClick={() =>
                      openCheckoutModal(
                        'amarres-consulta-previa',
                        'Amarres de Amor',
                        'Consulta Previa de Evaluación',
                        60000
                      )
                    }
                    className="w-full sm:w-auto bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#0B0813] hover:from-[#F5D77F] hover:to-[#D4AF37] px-6 py-3 rounded-xl text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-2"
                  >
                    <span>Agendar Consulta Previa</span>
                    <CalendarCheckIcon />
                  </button>
                </div>
              </div>

              {/* CARD D: EXORCISMOS */}
              <div className="bg-[#1A112B]/80 backdrop-blur-sm border border-amber-500/25 rounded-2xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-purple-400">Intervención de Alta Magia</span>
                      <h4 className="font-serif text-2xl font-bold text-white mt-1">Exorcismos y Liberación</h4>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-purple-900/40 border border-amber-500/30 flex items-center justify-center text-amber-400 text-2xl shrink-0">
                      <ShieldHalvedIcon />
                    </div>
                  </div>

                  <p className="text-sm text-gray-300 mb-6 font-light leading-relaxed">
                    Ruptura de pactos, expulsión de entes oscuros, sombras u opresiones severas. Protocolo privado y seguro. Requiere llamada de urgencia/diagnóstico previo.
                  </p>

                  <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-4 mb-6 text-xs text-purple-200 flex gap-3 items-center">
                    <LockIcon className="text-amber-400 text-lg shrink-0" />
                    <span>Máxima privacidad garantizada bajo juramento de confidencialidad eclesial/mística.</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-purple-900/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <span className="text-xs text-gray-400 block">Llamada Previa de Evaluación:</span>
                    <span className="font-serif text-2xl font-bold text-amber-400">$80.000 ARS</span>
                  </div>
                  <button
                    onClick={() =>
                      openCheckoutModal(
                        'exorcismos-llamada-evaluacion',
                        'Exorcismos y Liberación Espiritual',
                        'Llamada Previa para Evaluación',
                        80000
                      )
                    }
                    className="w-full sm:w-auto bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#0B0813] hover:from-[#F5D77F] hover:to-[#D4AF37] px-6 py-3 rounded-xl text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-2"
                  >
                    <span>Solicitar Evaluación</span>
                    <PhoneVolumeIcon />
                  </button>
                </div>
              </div>
            </div>
          </section>

{/* SECCIÓN TESTIMONIOS */}
<Testimonials />
          {/* ABOUT US SECTION */}
          <section id="nosotros" className="py-16 md:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full my-4 md:my-8">
            <div className="bg-[#1A112B]/80 backdrop-blur-sm rounded-3xl p-6 sm:p-12 border border-amber-500/30 relative overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">Linaje Místico</span>
                  <h2 className="font-serif text-3xl sm:text-4xl font-bold text-white mt-2 mb-6">
                    Guardianes del Conocimiento Arcana & Sanación
                  </h2>
                  <p className="text-gray-300 text-sm sm:text-base leading-relaxed mb-6 font-light">
                    En <strong>Grupo Diter</strong> combinamos las tradiciones esotéricas más ancestrales con enfoques energéticos contemporáneos. Cada sesión es ejecutada por maestros capacitados en el manejo de vibraciones de alta luz y protección.
                  </p>

                  <div className="flex flex-wrap gap-6">
                    <div className="border-l-2 border-amber-400 pl-4">
                      <span className="font-serif text-2xl font-bold text-amber-300 block">100%</span>
                      <span className="text-xs text-gray-400 uppercase tracking-wider">Discreción</span>
                    </div>
                    <div className="border-l-2 border-purple-400 pl-4">
                      <span className="font-serif text-2xl font-bold text-purple-300 block">+5.000</span>
                      <span className="text-xs text-gray-400 uppercase tracking-wider">Consultas Realizadas</span>
                    </div>
                  </div>
                </div>

                <div className="relative flex justify-center items-center">
                  <div className="w-56 h-56 sm:w-80 sm:h-80 rounded-full border-2 border-dashed border-amber-500/40 flex items-center justify-center p-4">
                    <div className="w-full h-full rounded-full border border-purple-500/40 flex items-center justify-center bg-purple-950/30 md:backdrop-blur-md">
                      <div className="text-center p-6">
                        <MoonIcon className="text-4xl sm:text-5xl text-amber-300 mb-4 block" />
                        <span className="font-serif text-base sm:text-lg font-bold text-white uppercase block">Grupo Diter</span>
                        <span className="text-xs text-amber-200/80 italic">{'"Luz donde reina la sombra"'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {lecturasOpen && isLecturaServiceId(variants.lecturas.id) && (
            <LecturasCheckout
              serviceId={variants.lecturas.id}
              label={variants.lecturas.name}
              price={variants.lecturas.price}
              onClose={() => setLecturasOpen(false)}
              onToast={triggerToast}
            />
          )}

          {/* MODAL CHECKOUT EXTENDED */}
          {modalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/85 md:backdrop-blur-md">
              <div className="bg-[#140C22] w-full max-w-xl rounded-3xl p-6 sm:p-8 relative border border-amber-500/40 text-left my-8 max-h-[92vh] overflow-y-auto">
                <button
                  onClick={() => setModalOpen(false)}
                  className="absolute top-5 right-5 text-gray-400 hover:text-amber-400 text-xl"
                >
                  <XMarkIcon />
                </button>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
                    <ShieldCatIcon />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-bold text-white">Checkout de Reserva Espiritual</h3>
                    <p className="text-xs text-gray-400">Selecciona tu método de pago preferido</p>
                  </div>
                </div>

                <div className="bg-purple-950/50 border border-amber-500/20 rounded-2xl p-4 mb-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] text-amber-300 uppercase tracking-widest font-semibold block mb-0.5">Servicio a Reservar:</span>
                      <div className="font-serif text-base font-bold text-white">{selectedService.title}</div>
                      <div className="text-xs text-purple-200">{selectedService.variant}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block">Monto Final:</span>
                      <span className="font-serif text-xl font-bold text-amber-400">
                        ${selectedService.price.toLocaleString('es-AR')} ARS
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-gray-300 mb-1 font-semibold">Nombre Completo *</label>
                      <input
                        type="text"
                        required
                        value={custName}
                        onChange={(e) => setCustName(e.target.value)}
                        placeholder="Ej: María Gómez"
                        className="w-full bg-purple-950/40 border border-amber-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-gray-300 mb-1 font-semibold">Teléfono / WhatsApp *</label>
                      <input
                        type="tel"
                        required
                        value={custPhone}
                        onChange={(e) => setCustPhone(e.target.value)}
                        placeholder="5492612738086"
                        className="w-full bg-purple-950/40 border border-amber-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-gray-300 mb-1 font-semibold">Correo Electrónico *</label>
                    <input
                      type="email"
                      required
                      value={custEmail}
                      onChange={(e) => setCustEmail(e.target.value)}
                      placeholder="tuemail@ejemplo.com"
                      className="w-full bg-purple-950/40 border border-amber-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* SELECCIÓN DE MÉTODO DE PAGO (SOLO MERCADO PAGO Y TRANSFERENCIA EN 2 COLUMNAS) */}
                <div className="mb-6">
                  <label className="block text-xs uppercase tracking-wider text-amber-200/90 mb-3 font-semibold">
                    Selecciona el Método de Pago:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrentPaymentMethod('mp')}
                      className={`p-3.5 rounded-xl flex flex-col items-center justify-center text-center gap-1.5 transition border ${
                        currentPaymentMethod === 'mp'
                          ? 'border-sky-400 bg-sky-500/15 shadow-[0_0_15px_rgba(0,158,227,0.25)]'
                          : 'border-amber-500/20 bg-[#120C1F]/60'
                      }`}
                    >
                      <MercadoPagoLogo />
                      <span className="text-xs font-bold text-white leading-tight">Mercado Pago</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCurrentPaymentMethod('cbu')}
                      className={`p-3.5 rounded-xl flex flex-col items-center justify-center text-center gap-1.5 transition border ${
                        currentPaymentMethod === 'cbu'
                          ? 'border-[#D4AF37] bg-amber-500/15 shadow-[0_0_15px_rgba(212,175,55,0.25)]'
                          : 'border-amber-500/20 bg-[#120C1F]/60'
                      }`}
                    >
                      <BuildingColumnsIcon className="text-amber-400 text-lg" />
                      <span className="text-xs font-bold text-white leading-tight">Transferencia</span>
                    </button>
                  </div>
                </div>

                {/* VISTA MERCADO PAGO */}
                {currentPaymentMethod === 'mp' && (
                  <div className="bg-sky-950/30 border border-sky-500/30 rounded-2xl p-4 text-xs text-sky-100">
                    <div className="flex items-center gap-2 mb-2 text-sky-400 font-bold">
                      <ShieldHalvedIcon />
                      <span>Pago procesado por Mercado Pago</span>
                    </div>
                    <p className="text-gray-300 font-light text-[11px] leading-relaxed mb-4">
                      Serás redirigido de forma segura a Mercado Pago para abonar con Tarjeta de Crédito, Débito o dinero en tu cuenta.
                    </p>

                    <button
                      type="button"
                      disabled={loadingMp}
                      onClick={handleMercadoPagoPayment}
                      className="w-full bg-gradient-to-r from-[#009EE3] to-[#007EA7] hover:from-[#20B3F7] hover:to-[#009EE3] text-white py-3.5 rounded-xl text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(0,158,227,0.3)] transition"
                    >
                      {loadingMp ? (
                        <>
                          <SpinnerIcon />
                          <span>Generando preferencia de pago...</span>
                        </>
                      ) : (
                        <>
                          <LockIcon className="text-sm" />
                          <span>Pagar ahora con Mercado Pago</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* VISTA TRANSFERENCIA */}
                {currentPaymentMethod === 'cbu' && (
                  <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-100">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold uppercase tracking-wider text-amber-300 text-[11px]">Datos Bancarios para Transferir:</span>
                      <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded text-amber-200">Acreditación Inmediata</span>
                    </div>

                    <div className="space-y-2 bg-purple-950/70 p-3.5 rounded-xl border border-amber-500/20 text-[11px]">
                      <div className="flex justify-between items-center gap-3 py-1 border-b border-purple-900/50">
                        <span className="text-gray-400">Titular:</span>
                        <span className="font-semibold text-white text-right">Pablo Antonio Guzman Gomez</span>
                      </div>
                      <div className="flex justify-between items-center gap-3 py-1 border-b border-purple-900/50">
                        <span className="text-gray-400">Banco:</span>
                        <span className="font-semibold text-white text-right">Macro</span>
                      </div>
                      <div className="flex justify-between items-center gap-3 py-1 border-b border-purple-900/50">
                        <span className="text-gray-400">CVU/CBU:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-amber-300 break-all text-right">2850408140096168058568</span>
                          <button type="button" onClick={() => copyToClipboard('2850408140096168058568', 'CVU/CBU')} className="text-amber-400 hover:text-white" aria-label="Copiar CVU/CBU">
                            <CopyIcon />
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center gap-3 py-1">
                        <span className="text-gray-400">ALIAS:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-300 break-all text-right">OBEDEZCO.ROSCA.VOCAL</span>
                          <button type="button" onClick={() => copyToClipboard('OBEDEZCO.ROSCA.VOCAL', 'ALIAS')} className="text-amber-400 hover:text-white" aria-label="Copiar alias">
                            <CopyIcon />
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => confirmBookingViaWhatsApp('Transferencia Bancaria (CBU / ALIAS)')}
                      className="w-full bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#0B0813] py-3.5 rounded-xl text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-2 mt-4"
                    >
                      <WhatsAppIcon className="text-lg" />
                      <span>Enviar Comprobante por WhatsApp</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BOTÓN FLOTANTE WHATSAPP */}
          <a
            href="https://wa.me/5492612738086?text=Hola%20Grupo%20Diter,%20quisiera%20realizar%20una%20consulta%20espiritual."
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 z-40 group flex items-center"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-600 via-green-500 to-emerald-300 flex items-center justify-center text-white text-2xl shadow-[0_0_25px_rgba(212,175,55,0.35)] transition-transform duration-300 group-hover:scale-110 relative">
              <WhatsAppIcon />
            </div>
          </a>

          {/* FOOTER */}
          <footer id="contacto" className="mt-auto bg-[#08050E] border-t border-amber-500/20 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
              <div className="md:col-span-2">
                <div className="flex items-center gap-3 mb-4">
                  <EyeIcon className="text-amber-400 text-xl" />
                  <span className="font-serif text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#FFF099] via-[#D4AF37] to-[#AA7C11] uppercase">
                    Grupo Diter
                  </span>
                </div>
                <p className="text-xs text-gray-400 max-w-sm leading-relaxed mb-4">
                  Centro Holístico y Templo Místico dedicado a la Clarividencia, Purificación Áurica y Trabajos Espirituales de Alta Magia. Atención reservada e individualizada.
                </p>
              </div>

              <div>
                <h4 className="font-serif font-bold text-amber-300 text-sm mb-4 uppercase tracking-wider">Enlaces Rápidos</h4>
                <ul className="space-y-2 text-xs text-gray-400">
                  <li><a href="#hero" className="hover:text-amber-400">Inicio</a></li>
                  <li><a href="#servicios" className="hover:text-amber-400">Lecturas & Oráculo</a></li>
                  <li><a href="#servicios" className="hover:text-amber-400">Limpiezas Energéticas</a></li>
                  <li><a href="#servicios" className="hover:text-amber-400">Amarres de Amor</a></li>
                  <li><a href="#servicios" className="hover:text-amber-400">Exorcismos</a></li>
                </ul>
              </div>

              <div>
                <h4 className="font-serif font-bold text-amber-300 text-sm mb-4 uppercase tracking-wider">Medios de Pago</h4>
                <ul className="space-y-2 text-xs text-gray-400">
                  <li className="flex items-center gap-2"><BoltIcon className="text-sky-400" /> Mercado Pago</li>
                  <li className="flex items-center gap-2"><BuildingColumnsIcon className="text-amber-400" /> Transferencia CBU / Alias</li>
                </ul>
              </div>
            </div>

            <div className="max-w-7xl mx-auto border-t border-purple-950 pt-8 flex flex-col md:flex-row justify-between items-center text-[10px] text-gray-500 gap-4 text-center md:text-left">
              <p>© 2026 Grupo Diter. Todos los derechos reservados. Servicios destinados a mayores de 18 años.</p>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}