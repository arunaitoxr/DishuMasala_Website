"use client";

import { SectionHeading } from "@/components/sections/SectionHeading";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface Frame {
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  gradient: string;
}

/**
 * Blue Tea's colour change is anthocyanin chemistry: butterfly pea flower is rich in anthocyanin
 * pigments that are blue in a neutral/alkaline brew and shift red-violet as the pH drops — which
 * is exactly what a squeeze of lemon (an acid) does to the cup. Same real fact the client's own
 * copy already states ("Brilliant blue that transforms into purple when mixed with lemon" —
 * CLAUDE.md's own quote of it) and the same one Phase 2's hero performs; this block explains it in
 * plain language rather than repeating the animation.
 */
const FRAMES: Frame[] = [
  {
    id: "blue",
    eyebrow: "Step one",
    title: "Steeped, it's deep blue",
    copy: "Butterfly pea flower brews into a clear, deep blue infusion — the anthocyanin pigments in the petals at their natural, neutral colour.",
    gradient: "linear-gradient(135deg, var(--color-brew-1), var(--color-brew-2))",
  },
  {
    id: "lemon",
    eyebrow: "Step two",
    title: "Add a squeeze of lemon",
    copy: "Lemon juice is acidic. The moment it hits the cup, the pH drops — and anthocyanin pigments are famously pH-sensitive.",
    gradient: "linear-gradient(135deg, var(--color-brew-2) 0%, var(--color-brew-3) 55%, var(--color-citrus) 100%)",
  },
  {
    id: "violet",
    eyebrow: "Step three",
    title: "It turns violet, then magenta",
    copy: "The same pigments that read blue at a neutral pH read violet, then magenta, as the brew turns more acidic — no dye, no food colouring, just chemistry you can watch happen.",
    gradient: "linear-gradient(135deg, var(--color-brew-3), var(--color-brew-5))",
  },
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function BrewFrame({ frame, index, revealed }: { frame: Frame; index: number; revealed: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 transition-[opacity,transform] duration-[700ms] ease-[cubic-bezier(.2,.6,.2,1)]",
        revealed ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
      style={{ transitionDelay: revealed ? `${index * 120}ms` : "0ms" }}
    >
      <div
        aria-hidden="true"
        className="w-full overflow-hidden rounded-lg"
        style={{ aspectRatio: "4 / 3", backgroundImage: frame.gradient }}
      />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-2">{frame.eyebrow}</p>
        <h3 className="mt-1 font-display text-lg font-semibold text-ink">{frame.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{frame.copy}</p>
      </div>
    </div>
  );
}

/**
 * Blue Tea PDPs only (caller decides based on collection slug — see app/product/[slug]/page.tsx).
 * Three static frames revealed on scroll via IntersectionObserver (not the hero's continuous
 * scroll-scrub), one real gradient per frame reusing the hero's token system. A
 * `prefers-reduced-motion` visitor gets every frame already revealed — the finished state, never a
 * half-appeared one (CLAUDE.md §5.5).
 */
export function BrewStory() {
  const reducedMotion = useReducedMotion();
  const [revealed, setRevealed] = useState<boolean[]>(() => FRAMES.map(() => reducedMotion));
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setRevealed((prev) => {
          const next = [...prev];
          for (const entry of entries) {
            const idx = refs.current.findIndex((el) => el === entry.target);
            if (idx !== -1 && entry.isIntersecting) next[idx] = true;
          }
          return next;
        });
      },
      { threshold: 0.35 },
    );

    for (const el of refs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <section aria-labelledby="brew-story-heading" className="w-full">
      <SectionHeading
        id="brew-story-heading"
        heading="The Lemon Shift, explained"
        body="Naturally caffeine-free, made from Butterfly Pea Flower, Spearmint, Ginger, Dandelion, Cinnamon & Lemongrass — and the one tea in the range that changes colour in the cup."
      />
      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
        {FRAMES.map((frame, i) => (
          <div
            key={frame.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
          >
            <BrewFrame frame={frame} index={i} revealed={revealed[i]} />
          </div>
        ))}
      </div>
    </section>
  );
}
