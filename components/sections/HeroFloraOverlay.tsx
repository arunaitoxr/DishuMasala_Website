import Image, { type StaticImageData } from "next/image";
import type { CSSProperties } from "react";
import blueVine from "@/data/CategoryBanners/BlueTeaVine/vine.png";
import bluePetal1 from "@/data/CategoryBanners/BlueTeaVine/petal-1.png";
import bluePetal2 from "@/data/CategoryBanners/BlueTeaVine/petal-2.png";
import bluePetal3 from "@/data/CategoryBanners/BlueTeaVine/petal-3.png";
import bluePetal4 from "@/data/CategoryBanners/BlueTeaVine/petal-4.png";
import bluePetal5 from "@/data/CategoryBanners/BlueTeaVine/petal-5.png";
import bluePetal6 from "@/data/CategoryBanners/BlueTeaVine/petal-6.png";
import bluePetal7 from "@/data/CategoryBanners/BlueTeaVine/petal-7.png";
import redVine from "@/data/CategoryBanners/RedTeaVine/vine.png";
import redPetal1 from "@/data/CategoryBanners/RedTeaVine/petal-1.png";
import redPetal2 from "@/data/CategoryBanners/RedTeaVine/petal-2.png";
import redPetal3 from "@/data/CategoryBanners/RedTeaVine/petal-3.png";
import redPetal4 from "@/data/CategoryBanners/RedTeaVine/petal-4.png";
import redPetal5 from "@/data/CategoryBanners/RedTeaVine/petal-5.png";

/**
 * Real flower photography over a tea collection banner (client brief, 2026-09-20): a flowering vine
 * hanging from the top edge, flush under the nav, and single petals — cut from the same supplied
 * photo — drifting down in front of the banner. Blue Tea uses butterfly pea, Red Tea hibiscus.
 *
 * Static markup plus CSS keyframes (`petal-fall` in globals.css); each petal's position, size, fall
 * time, sideways drift and spin are fixed values, not Math.random, so server and client agree.
 * Decorative only: aria-hidden, no pointer events, and the falling petals are hidden under
 * prefers-reduced-motion (the vine stays — it is a still photo).
 */
const FLORA = {
  "blue-tea": {
    vine: blueVine,
    petals: [bluePetal1, bluePetal2, bluePetal3, bluePetal4, bluePetal5, bluePetal6, bluePetal7],
  },
  "red-tea": {
    vine: redVine,
    petals: [redPetal1, redPetal2, redPetal3, redPetal4, redPetal5],
  },
} satisfies Record<string, { vine: StaticImageData; petals: StaticImageData[] }>;

export type HeroFloraKind = keyof typeof FLORA;

export function hasHeroFlora(slug: string): slug is HeroFloraKind {
  return slug in FLORA;
}

interface Petal {
  left: number; // % from the left edge
  size: number; // px wide, never above the photo's native width so it stays sharp
  duration: number; // s for one fall
  delay: number; // s; negative so petals are already in flight on load
  drift: number; // px of sideways travel over the fall
  spin: number; // deg of rotation over the fall
}

const PETALS: readonly Petal[] = [
  { left: 5, size: 20, duration: 14, delay: -2, drift: 40, spin: 220 },
  { left: 12, size: 16, duration: 18, delay: -9, drift: -30, spin: -260 },
  { left: 20, size: 22, duration: 16, delay: -5, drift: 60, spin: 300 },
  { left: 28, size: 16, duration: 20, delay: -13, drift: -50, spin: -180 },
  { left: 36, size: 20, duration: 15, delay: -7, drift: 35, spin: 240 },
  { left: 44, size: 15, duration: 19, delay: -1, drift: -40, spin: -300 },
  { left: 52, size: 21, duration: 17, delay: -11, drift: 55, spin: 200 },
  { left: 60, size: 18, duration: 14, delay: -4, drift: -35, spin: -240 },
  { left: 67, size: 22, duration: 21, delay: -15, drift: 45, spin: 280 },
  { left: 74, size: 16, duration: 16, delay: -8, drift: -55, spin: -200 },
  { left: 81, size: 20, duration: 18, delay: -3, drift: 30, spin: 260 },
  { left: 88, size: 22, duration: 15, delay: -12, drift: -45, spin: -320 },
  { left: 94, size: 16, duration: 19, delay: -6, drift: 50, spin: 210 },
];

export function HeroFloraOverlay({ kind }: { kind: HeroFloraKind }) {
  const { vine, petals } = FLORA[kind];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Capped height, bottom edge faded, so the vine frames the top without covering the pack. */}
      <div
        className="absolute inset-x-0 top-0 h-[clamp(110px,10.5vw,160px)]"
        style={{ maskImage: "linear-gradient(to bottom, #000 70%, transparent)" }}
      >
        <Image src={vine} alt="" fill priority sizes="100vw" className="object-cover object-top" />
      </div>
      <div className="petal-field absolute inset-0">
        {PETALS.map((p, i) => {
          const img = petals[i % petals.length];
          return (
            <Image
              key={p.left}
              src={img}
              alt=""
              sizes="32px"
              className="petal"
              style={
                {
                  left: `${p.left}%`,
                  width: p.size,
                  height: "auto",
                  "--petal-duration": `${p.duration}s`,
                  "--petal-delay": `${p.delay}s`,
                  "--petal-drift": `${p.drift}px`,
                  "--petal-spin": `${p.spin}deg`,
                } as CSSProperties
              }
            />
          );
        })}
      </div>
    </div>
  );
}
