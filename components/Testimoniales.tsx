'use client';

import React from 'react';

export default function Testimonials() {
  const testimonials = [
    {
      name: 'Sofía M.',
      location: 'Mendoza, Argentina',
      service: 'Lectura de Oráculo Exclusiva',
      comment:
        'Sinceramente quedé impresionada con la precisión de la videncia. Me reveló aspectos clave de mi situación emocional que nadie más sabía y me dio mucha claridad para tomar decisiones.',
      rating: 5,
      date: 'Hace 3 días',
    },
    {
      name: 'Carlos R.',
      location: 'Buenos Aires, Argentina',
      service: 'Limpieza Personal Profunda',
      comment:
        'Sentía una pesadez constante y bloqueos repetitivos en mi trabajo. Después de la sesión de purificación, el ambiente en mi entorno cambió radicalmente y recuperé mi energía.',
      rating: 5,
      date: 'Hace 1 semana',
    },
    {
      name: 'Elena & Gustavo',
      location: 'Córdoba, Argentina',
      service: 'Consulta de Evaluación Espiritual',
      comment:
        'Destaco la seriedad, confidencialidad y el respeto con el que abordan temas tan delicados. Nos atendieron con una empatía mística única. Altamente recomendados.',
      rating: 5,
      date: 'Hace 2 semanas',
    },
  ];

  return (
    <section id="testimonios" className="py-16 md:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      <div className="text-center mb-12 md:mb-16">
        <h2 className="text-xs uppercase tracking-[0.3em] text-amber-400 mb-2">Experiencias & Reseñas Reales</h2>
        <h3 className="font-serif text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#FFF099] via-[#D4AF37] to-[#AA7C11]">
          Testimonios de Quienes Confían
        </h3>
        <div className="w-24 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent mx-auto mt-4"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {testimonials.map((item, index) => (
          <div
            key={index}
            className="bg-[#1A112B]/80 backdrop-blur-sm border border-amber-500/25 rounded-2xl p-6 flex flex-col justify-between relative"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1 text-amber-400 text-sm">
                  {[...Array(item.rating)].map((_, i) => (
                    <i key={i} className="fa-solid fa-star"></i>
                  ))}
                </div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">{item.date}</span>
              </div>

              <p className="text-sm text-gray-300 italic mb-6 leading-relaxed font-light">
                "{item.comment}"
              </p>
            </div>

            <div className="pt-4 border-t border-purple-900/40 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-600 to-purple-600 p-[1px] flex items-center justify-center shrink-0">
                <div className="w-full h-full bg-[#120C1F] rounded-full flex items-center justify-center font-bold text-amber-300 text-xs">
                  {item.name.charAt(0)}
                </div>
              </div>
              <div>
                <h4 className="font-serif font-bold text-white text-sm">{item.name}</h4>
                <p className="text-[11px] text-purple-300/80">{item.service}</p>
                <span className="text-[9px] text-gray-400 block">{item.location}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}