"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const CAROUSEL_IMAGES = [
  "/carousel/card1.png",
  "/carousel/card2.png",
  "/carousel/card3.png",
  "/carousel/card4.png",
  "/carousel/card5.png",
];

export function ArenaCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
        setIsTransitioning(false);
      }, 500);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-gradient-to-br from-agora-surface/50 to-agora-background/80 backdrop-blur-sm">
      {/* Decorative border glow */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/20 via-amber-500/20 to-blue-500/20 blur-xl" />

      <div className="relative h-full w-full overflow-hidden rounded-xl border border-agora-border/50">
        {CAROUSEL_IMAGES.map((src, idx) => (
          <div
            key={src}
            className={`absolute inset-0 transition-all duration-700 ease-in-out ${
              idx === currentIndex
                ? "opacity-100 scale-100"
                : "opacity-0 scale-105"
            }`}
            style={{
              transitionDelay: idx === currentIndex ? "0ms" : "300ms",
            }}
          >
            <Image
              src={src}
              alt={`Agora Arena ${idx + 1}`}
              fill
              className="object-cover"
              priority={idx === 0}
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            {/* Gradient overlay for better text contrast */}
            <div className="absolute inset-0 bg-gradient-to-t from-agora-background/60 via-transparent to-transparent" />
          </div>
        ))}

        {/* Carousel indicators */}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          {CAROUSEL_IMAGES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                setIsTransitioning(true);
                setCurrentIndex(idx);
                setTimeout(() => setIsTransitioning(false), 500);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex
                  ? "w-8 bg-agora-gold"
                  : "w-1.5 bg-agora-textMuted/40 hover:bg-agora-textMuted/70"
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        {/* Decorative corner accents */}
        <div className="absolute left-4 top-4 h-12 w-12 border-l-2 border-t-2 border-agora-gold/40" />
        <div className="absolute right-4 top-4 h-12 w-12 border-r-2 border-t-2 border-agora-gold/40" />
        <div className="absolute bottom-16 left-4 h-12 w-12 border-b-2 border-l-2 border-agora-gold/40" />
        <div className="absolute bottom-16 right-4 h-12 w-12 border-b-2 border-r-2 border-agora-gold/40" />
      </div>
    </div>
  );
}
