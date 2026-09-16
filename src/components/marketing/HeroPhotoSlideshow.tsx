"use client";

import { useEffect, useState } from "react";

// Fotos de stock de Unsplash (licencia Unsplash: uso comercial libre, sin
// atribución obligatoria) — de relleno hasta tener fotos reales del negocio.
// Cada una está pensada para acompañar uno de los "errores" del hero.
const FOTOS = [
  {
    url: "https://images.unsplash.com/photo-1753351055117-f24d8baa682e?auto=format&fit=crop&w=1920&q=65",
    alt: "Mesero tomando una orden en un restaurante",
  },
  {
    url: "https://images.unsplash.com/photo-1564939558297-fc396f18e5c7?auto=format&fit=crop&w=1920&q=65",
    alt: "Caja registradora y calculadora",
  },
  {
    url: "https://images.unsplash.com/photo-1613946069412-38f7f1ff0b65?auto=format&fit=crop&w=1920&q=65",
    alt: "Restaurante lleno en hora pico",
  },
  {
    url: "https://images.unsplash.com/photo-1760169799369-2b8574466735?auto=format&fit=crop&w=1920&q=65",
    alt: "Cocina de restaurante a toda velocidad",
  },
] as const;

const INTERVALO_MS = 4500;

/** Slideshow de fotos de fondo del hero, con velo oscuro para que el texto siga siendo legible. */
export function HeroPhotoSlideshow() {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndice((i) => (i + 1) % FOTOS.length);
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {FOTOS.map((foto, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={foto.url}
          src={foto.url}
          alt={foto.alt}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-in-out ${
            i === indice ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-ink-950/80" />
    </div>
  );
}
