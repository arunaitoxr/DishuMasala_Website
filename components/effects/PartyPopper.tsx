"use client";

import { useEffect, useRef } from "react";

/**
 * A party-popper burst: two cannons at the bottom corners shoot confetti up and inward, which then
 * tumbles down under gravity and fades out — about three seconds, then the canvas goes idle. Drawn on
 * a full-screen canvas that ignores pointer events. Colours are read from the brand tokens (never hex
 * literals here). Renders nothing under prefers-reduced-motion.
 *
 * It paints on layer z-50 — above a dialog's overlay (also z-50, earlier in the page) and below a panel on
 * z-[51] — to get the "confetti behind the popup" look regardless of DOM order.
 */
const TOKENS = ["--color-brew-2", "--color-brew-3", "--color-brew-5", "--color-citrus", "--color-hibiscus", "--color-leaf", "--color-turmeric", "--color-gold"];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  shape: "rect" | "circle" | "streamer";
  born: number;
  life: number;
}

const GRAVITY = 900; // px/s²
const DRAG = 0.6; // per second, horizontal
const PER_CANNON = 46;

export function PartyPopper() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const styles = getComputedStyle(document.documentElement);
    const colors = TOKENS.map((t) => styles.getPropertyValue(t).trim()).filter(Boolean);
    if (colors.length === 0) return;

    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const pieces: Piece[] = [];
    const fire = (fromLeft: boolean, delayMs: number) => {
      for (let i = 0; i < PER_CANNON; i++) {
        // Aim up and towards the middle, in a fan of about ±20°.
        const angle = ((fromLeft ? -60 : -120) + rand(-20, 20)) * (Math.PI / 180);
        const speed = rand(650, 1250) * Math.min(1, Math.max(0.6, h / 800));
        pieces.push({
          x: fromLeft ? 0 : w,
          y: h + 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: rand(6, 12),
          rot: rand(0, Math.PI * 2),
          vr: rand(-9, 9),
          color: colors[Math.floor(Math.random() * colors.length)],
          shape: (["rect", "rect", "circle", "streamer"] as const)[Math.floor(Math.random() * 4)],
          born: delayMs + rand(0, 120),
          life: rand(2200, 3200),
        });
      }
    };
    fire(true, 0);
    fire(false, 0);
    fire(true, 260);
    fire(false, 260);

    let raf = 0;
    let last = performance.now();
    const start = last;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = now - start;
      ctx.clearRect(0, 0, w, h);
      let alive = 0;

      for (const p of pieces) {
        const age = elapsed - p.born;
        if (age < 0) {
          alive++;
          continue;
        }
        if (age > p.life) continue;
        alive++;
        p.vy += GRAVITY * dt;
        p.vx *= Math.exp(-DRAG * dt);
        // Air resistance on the way down so pieces flutter instead of dropping like stones.
        if (p.vy > 240) p.vy = 240 + (p.vy - 240) * Math.exp(-3 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;

        const fade = Math.min(1, (p.life - age) / 600);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === "streamer") {
          ctx.fillRect(-p.size * 0.15, -p.size * 1.1, p.size * 0.3, p.size * 2.2);
        } else {
          // Flip the width over time so the piece looks like it is turning in the air.
          ctx.fillRect(-p.size / 2, (-p.size * 0.6) / 2, p.size * Math.abs(Math.cos(p.rot * 1.3)) + 1, p.size * 0.6);
        }
        ctx.restore();
      }

      if (alive > 0) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 h-dvh w-screen" />;
}
