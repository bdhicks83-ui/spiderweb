"use client";

// MarketingHome — Human Bloom animated marketing homepage (Phase 4, "It Pays").
// Rendered by src/app/page.tsx when there is no session.
// Uses a full-viewport fixed scroll container so it escapes the 640px
// body constraint in layout.tsx without touching the dashboard's layout.
//
// Design standard (locked):
// - Particle network canvas background (mouse-reactive)
// - Custom glowing cursor (desktop only, >= 900px, fine pointer)
// - Typed headline on load
// - Magnetic CTA buttons
// - 3D tilt department cards with mouse-following glow
// - Scroll-triggered reveals
// - 4-stage pinned scroll narrative: Capture -> Approve -> Connect -> Deliver
// - Dark theme: near-black, mint #00f0a8, violet #8b6ef7, Fraunces + Inter

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Fraunces, Inter } from "next/font/google";
import "@/styles/hb-foundation.css"; // Phase 1: fluid clamp() grid + spacing tokens
import { gsap, ScrollTrigger, SplitText } from "@/lib/gsap"; // Phase 2: hero

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fraunces",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// ─────────────────────────────── content ───────────────────────────────

const DEPARTMENTS = [
  {
    emoji: "🧠",
    name: "Knowledge",
    desc: "Capture, approve, and connect your insights. The core loop — live today.",
    live: true,
  },
  {
    emoji: "🎯",
    name: "Chief of Staff",
    desc: "Your operational right hand. Priorities, follow-ups, decisions that stick.",
    live: false,
  },
  {
    emoji: "🔬",
    name: "Research",
    desc: "Deep dives and synthesis on demand, grounded in your own thinking.",
    live: false,
  },
  {
    emoji: "🚀",
    name: "Project Acceleration",
    desc: "Move initiatives from stuck to shipped with your playbooks applied.",
    live: false,
  },
  {
    emoji: "💼",
    name: "Commercialization",
    desc: "Turn frameworks into products, offers, and revenue.",
    live: false,
  },
  {
    emoji: "🧭",
    name: "Career Intelligence",
    desc: "Positioning, trajectory, and legacy — managed like an asset.",
    live: false,
  },
  {
    emoji: "✉️",
    name: "Communication",
    desc: "Messaging, writing, and outreach in your voice, not a template's.",
    live: false,
  },
];

const STAGES = [
  {
    n: "01",
    emoji: "📥",
    title: "Capture",
    desc: "Drop in screenshots, notes, and documents — anything. Claude-powered extraction turns raw material into structured insights automatically.",
  },
  {
    n: "02",
    emoji: "✅",
    title: "Approve",
    desc: "You stay the final approver. Review pending insights in a fast queue — keep what's right, reject what's not. Nothing enters your web without your sign-off.",
  },
  {
    n: "03",
    emoji: "🕸️",
    title: "Connect",
    desc: "Approved insights embed into your private knowledge web. Related ideas find each other, and emerging patterns surface on their own.",
  },
  {
    n: "04",
    emoji: "🚀",
    title: "Deliver",
    desc: "Clusters become named, written frameworks — your expertise drafted into intellectual capital you can use, teach, and ship.",
  },
];

const HEADLINE_1 = "Your AI Company.";
const HEADLINE_2 = "Built Around You.";

// ─────────────────────────── tiny components ───────────────────────────

function Magnetic({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${dx * 0.22}px, ${dy * 0.22}px)`;
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "translate(0px, 0px)";
  }

  return (
    <Link
      href={href}
      ref={ref}
      className={`hb-magnet ${className ?? ""}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {children}
    </Link>
  );
}

function TiltCard({
  emoji,
  name,
  desc,
  live,
  delay,
}: {
  emoji: string;
  name: string;
  desc: string;
  live: boolean;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 10}deg) rotateY(${
      (px - 0.5) * 14
    }deg) translateY(-4px)`;
    el.style.setProperty("--gx", `${e.clientX - r.left}px`);
    el.style.setProperty("--gy", `${e.clientY - r.top}px`);
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform =
      "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)";
  }

  return (
    <div
      ref={ref}
      className="hb-card hb-reveal"
      style={{ transitionDelay: `${delay}ms` }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="hb-card-top">
        <span className="hb-card-emoji">{emoji}</span>
        {live ? (
          <span className="hb-badge hb-badge-live">Live</span>
        ) : (
          <span className="hb-badge">Coming soon</span>
        )}
      </div>
      <p className="hb-card-name">{name}</p>
      <p className="hb-card-desc">{desc}</p>
    </div>
  );
}

// ────────────────────────────── main page ──────────────────────────────

export default function MarketingHome() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const howRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const mouse = useRef({ x: -9999, y: -9999 });

  const [stage, setStage] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [cursorOn, setCursorOn] = useState(false);

  // ─── Hero entrance: SplitText word reveal + brief scroll-pin (Phase 2) ───
  // The page scrolls inside the fixed .hb-root element, so ScrollTrigger must
  // be told that element is the scroller — the window never scrolls here.
  useEffect(() => {
    const hero = heroRef.current;
    const headline = headlineRef.current;
    const root = rootRef.current;
    if (!hero || !headline || !root) return;

    const mm = gsap.matchMedia();

    // Full motion: split the headline into masked lines/words, orchestrate a
    // staggered rise, then hold the hero pinned just long enough for the
    // entrance to land before the user can scroll past it.
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const split = new SplitText(headline, {
        type: "words",
        wordsClass: "hb-word",
      });

      const ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        tl.from(".hb-eyebrow", { y: 18, autoAlpha: 0, duration: 0.6 })
          .from(
            split.words,
            { yPercent: 100, autoAlpha: 0, duration: 0.9, stagger: 0.055 },
            "-=0.15"
          )
          .from(".hb-sub", { y: 20, autoAlpha: 0, duration: 0.7 }, "-=0.45")
          .from(
            ".hb-hero-ctas",
            { y: 20, autoAlpha: 0, duration: 0.6 },
            "-=0.45"
          )
          .from(".hb-scroll-hint", { autoAlpha: 0, duration: 0.6 }, "-=0.2");
      }, hero);

      const pin = ScrollTrigger.create({
        trigger: hero,
        scroller: root,
        start: "top top",
        end: "+=45%",
        pin: true,
        pinSpacing: true,
      });

      return () => {
        pin.kill();
        ctx.revert();
        split.revert();
      };
    });

    // Reduced motion: everything is already visible; no split, no pin.
    return () => mm.revert();
  }, []);

  // Shared mouse position (particles + cursor)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Particle network background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;

    type P = { x: number; y: number; vx: number; vy: number; r: number };
    let pts: P[] = [];

    function resize() {
      if (!canvas || !ctx) return;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const count = Math.min(90, Math.floor((w * h) / 16000));
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1 + Math.random() * 1.6,
      }));
    }

    function frame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const mx = mouse.current.x;
      const my = mouse.current.y;

      // Phase 2: concentrate the web around the headline. Nodes/lines in the
      // upper hero band render brighter, fading toward the lower page, so the
      // field reads as scattered nodes gathered around the hero.
      const band = h * 0.62;
      const vbias = (y: number) => 0.62 + 0.7 * Math.max(0, 1 - y / band);

      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        // Gentle push away from the cursor
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < 160 * 160 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = ((160 - d) / 160) * 0.6;
          p.x += (dx / d) * f;
          p.y += (dy / d) * f;
        }
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        p.x = Math.max(0, Math.min(w, p.x));
        p.y = Math.max(0, Math.min(h, p.y));
      }

      // Connection lines
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 130 * 130) {
            const a =
              (1 - Math.sqrt(d2) / 130) *
              0.18 *
              vbias((pts[i].y + pts[j].y) / 2);
            ctx.strokeStyle =
              (i + j) % 2 === 0
                ? `rgba(0, 240, 168, ${a})`
                : `rgba(139, 110, 247, ${a})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }

      // Dots
      for (const p of pts) {
        ctx.fillStyle = `rgba(190, 200, 215, ${0.55 * vbias(p.y)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduced) raf = requestAnimationFrame(frame);
    }

    resize();
    frame(); // reduced motion → draws one static frame
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Custom glowing cursor — desktop only (>= 900px, fine pointer)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px) and (pointer: fine)");
    if (!mq.matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setCursorOn(true);
    let raf = 0;
    let rx = -9999;
    let ry = -9999;
    let hovering = false;

    function onOver(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      hovering = !!t?.closest("a, button");
    }
    window.addEventListener("mouseover", onOver, { passive: true });

    function loop() {
      const dot = dotRef.current;
      const ring = ringRef.current;
      if (dot && ring) {
        const { x, y } = mouse.current;
        dot.style.transform = `translate(${x}px, ${y}px)`;
        rx += (x - rx) * 0.16;
        ry += (y - ry) * 0.16;
        const s = hovering ? 1.6 : 1;
        ring.style.transform = `translate(${rx}px, ${ry}px) scale(${s})`;
      }
      raf = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mouseover", onOver);
      setCursorOn(false);
    };
  }, []);

  // Scroll: nav state + pinned narrative stage
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;

    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!root) return;
        setScrolled(root.scrollTop > 40);
        const how = howRef.current;
        if (how) {
          const r = how.getBoundingClientRect();
          const total = r.height - window.innerHeight;
          if (total > 0) {
            const p = Math.min(0.999, Math.max(0, -r.top / total));
            setStage(Math.floor(p * STAGES.length));
          }
        }
      });
    }

    root.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Scroll-triggered reveals
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll(".hb-reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("hb-in");
            io.unobserve(e.target);
          }
        }
      },
      { root, threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className={`${fraunces.variable} ${inter.variable} hb-root ${
        cursorOn ? "hb-nocursor" : ""
      }`}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <canvas ref={canvasRef} className="hb-canvas" aria-hidden="true" />

      {cursorOn && (
        <>
          <div ref={ringRef} className="hb-cursor-ring" aria-hidden="true" />
          <div ref={dotRef} className="hb-cursor-dot" aria-hidden="true" />
        </>
      )}

      {/* ─── Nav ─── */}
      <nav className={`hb-nav ${scrolled ? "hb-nav-scrolled" : ""}`}>
        <a href="#top" className="hb-logo">
          <span className="hb-logo-mark">🌸</span> Human&nbsp;Bloom
        </a>
        <div className="hb-nav-links">
          <a href="#how">How it works</a>
          <a href="#departments">Platform</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="hb-nav-cta">
          <Link href="/login" className="hb-signin">
            Sign In
          </Link>
          <Magnetic href="/login?mode=signup" className="hb-btn hb-btn-sm">
            Start Free
          </Magnetic>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <header id="top" ref={heroRef} className="hb-hero">
        <p className="hb-eyebrow">The Operating System for Human Expertise</p>
        <h1 className="hb-h1" ref={headlineRef}>
          <span className="hb-h1-line">{HEADLINE_1}</span>
          <span className="hb-h1-line hb-gradient">{HEADLINE_2}</span>
        </h1>
        <p className="hb-sub">
          Human Bloom turns what you already know into an AI company that works
          for you — seven departments, one source of truth: your expertise. You
          approve everything. It remembers everything.
        </p>
        <div className="hb-hero-ctas">
          <Magnetic href="/login?mode=signup" className="hb-btn hb-btn-lg">
            Start Free Today →
          </Magnetic>
          <a href="#how" className="hb-btn-ghost">
            See how it works ↓
          </a>
        </div>
        <div className="hb-scroll-hint">
          <span />
        </div>
      </header>

      {/* ─── 4-stage pinned scroll narrative ─── */}
      <section id="how" ref={howRef} className="hb-how">
        <div className="hb-how-sticky">
          <p className="hb-kicker">How it works</p>
          <div className="hb-stage-wrap">
            {STAGES.map((s, i) => (
              <div
                key={s.title}
                className={`hb-stage ${i === stage ? "hb-stage-on" : ""}`}
                aria-hidden={i !== stage}
              >
                <p className="hb-stage-n">
                  {s.n} <span className="hb-stage-emoji">{s.emoji}</span>
                </p>
                <h2 className="hb-stage-title">{s.title}</h2>
                <p className="hb-stage-desc">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="hb-stage-dots">
            {STAGES.map((s, i) => (
              <span
                key={s.title}
                className={i <= stage ? "hb-dot hb-dot-on" : "hb-dot"}
              />
            ))}
          </div>
          <p className="hb-stage-loop">
            Capture → Approve → Connect → Deliver — the loop that compounds.
          </p>
        </div>
      </section>

      {/* ─── Departments ─── */}
      <section id="departments" className="hb-section">
        <p className="hb-kicker hb-reveal">The platform</p>
        <h2 className="hb-h2 hb-reveal">
          Seven departments. <span className="hb-gradient">One brain: yours.</span>
        </h2>
        <p className="hb-section-sub hb-reveal">
          Every department runs on the knowledge web you approve — not generic
          AI output. Invisible complexity, visible results.
        </p>
        <div className="hb-grid">
          {DEPARTMENTS.map((d, i) => (
            <TiltCard key={d.name} {...d} delay={(i % 3) * 90} />
          ))}
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" className="hb-section hb-pricing">
        <p className="hb-kicker hb-reveal">Pricing</p>
        <h2 className="hb-h2 hb-reveal">
          Free while in <span className="hb-gradient">early access.</span>
        </h2>
        <p className="hb-section-sub hb-reveal">
          Full access to the Knowledge department — capture, approve, connect,
          and draft frameworks from your own expertise. No credit card. Paid
          tiers arrive when the next departments do.
        </p>
        <div className="hb-reveal" style={{ marginTop: "2.2rem" }}>
          <Magnetic href="/login?mode=signup" className="hb-btn hb-btn-lg">
            Start Free Today →
          </Magnetic>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="hb-footer">
        <p>
          <span className="hb-logo-mark">🌸</span> Human Bloom · The Operating
          System for Human Expertise
        </p>
        <p className="hb-footer-links">
          <Link href="/login">Sign In</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/login?mode=signup">Start Free</Link>
        </p>
      </footer>
    </div>
  );
}

// ─────────────────────────────── styles ────────────────────────────────

const CSS = `
.hb-root {
  --mint: #00f0a8;
  --violet: #8b6ef7;
  --bg: #050508;
  --ink: #e8eaf0;
  --muted: #9aa0b0;
  --card: rgba(255, 255, 255, 0.03);
  --line: rgba(255, 255, 255, 0.08);
  position: fixed;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background:
    radial-gradient(1100px 500px at 80% -10%, rgba(139, 110, 247, 0.12), transparent 60%),
    radial-gradient(900px 500px at 10% 10%, rgba(0, 240, 168, 0.07), transparent 55%),
    var(--bg);
  color: var(--ink);
  font-family: var(--font-inter), system-ui, sans-serif;
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
}
.hb-nocursor, .hb-nocursor a, .hb-nocursor button { cursor: none; }

.hb-canvas { position: fixed; inset: 0; z-index: 0; pointer-events: none; }

/* Custom cursor */
.hb-cursor-dot {
  position: fixed; top: -4px; left: -4px; width: 8px; height: 8px;
  border-radius: 50%; background: var(--mint);
  box-shadow: 0 0 12px var(--mint), 0 0 28px rgba(0, 240, 168, 0.6);
  z-index: 9999; pointer-events: none; will-change: transform;
}
.hb-cursor-ring {
  position: fixed; top: -18px; left: -18px; width: 36px; height: 36px;
  border: 1.5px solid rgba(139, 110, 247, 0.8); border-radius: 50%;
  box-shadow: 0 0 18px rgba(139, 110, 247, 0.35);
  z-index: 9998; pointer-events: none; will-change: transform;
  transition: border-color 0.25s;
}

/* Nav */
.hb-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem clamp(1.2rem, 4vw, 3rem);
  transition: background 0.35s, border-color 0.35s, backdrop-filter 0.35s;
  border-bottom: 1px solid transparent;
}
.hb-nav-scrolled {
  background: rgba(5, 5, 8, 0.72);
  backdrop-filter: blur(14px);
  border-bottom-color: var(--line);
}
.hb-logo {
  font-family: var(--font-fraunces), serif; font-size: 1.15rem; font-weight: 600;
  color: var(--ink); text-decoration: none; letter-spacing: 0.01em;
}
.hb-logo-mark { filter: drop-shadow(0 0 8px rgba(0, 240, 168, 0.5)); }
.hb-nav-links { display: flex; gap: 1.8rem; }
.hb-nav-links a {
  color: var(--muted); text-decoration: none; font-size: 0.92rem;
  transition: color 0.25s;
}
.hb-nav-links a:hover { color: var(--mint); }
.hb-nav-cta { display: flex; align-items: center; gap: 1.1rem; }
.hb-signin {
  color: var(--ink); text-decoration: none; font-size: 0.92rem;
  transition: color 0.25s;
}
.hb-signin:hover { color: var(--mint); }

/* Buttons */
.hb-magnet { display: inline-block; transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1); will-change: transform; }
.hb-btn {
  background: linear-gradient(120deg, var(--mint), #37d9b8 55%, var(--violet) 140%);
  color: #04110c; font-weight: 700; text-decoration: none; border-radius: 999px;
  box-shadow: 0 0 24px rgba(0, 240, 168, 0.35), 0 4px 18px rgba(0, 0, 0, 0.45);
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s;
}
.hb-btn:hover { box-shadow: 0 0 42px rgba(0, 240, 168, 0.55), 0 6px 22px rgba(0, 0, 0, 0.5); }
.hb-btn-sm { padding: 0.55rem 1.15rem; font-size: 0.88rem; }
.hb-btn-lg { padding: 0.95rem 1.9rem; font-size: 1.05rem; }
.hb-btn-ghost {
  color: var(--ink); text-decoration: none; padding: 0.95rem 1.4rem;
  border: 1px solid var(--line); border-radius: 999px; font-size: 1rem;
  transition: border-color 0.3s, color 0.3s, background 0.3s;
}
.hb-btn-ghost:hover { border-color: var(--violet); color: #cfc4ff; background: rgba(139, 110, 247, 0.08); }

/* Hero */
.hb-hero {
  position: relative; z-index: 1; min-height: 100vh;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  text-align: center; padding: 7rem clamp(1.2rem, 5vw, 3rem) 4rem;
}
.hb-eyebrow {
  color: var(--mint); font-size: 0.85rem; letter-spacing: 0.22em;
  text-transform: uppercase; margin: 0 0 1.4rem; font-weight: 600;
}
.hb-h1 {
  font-family: var(--font-fraunces), serif; font-weight: 600;
  font-size: var(--hb-fs-h1); line-height: 1.08; margin: 0;
  letter-spacing: -0.01em;
}
.hb-h1-line { display: block; }
/* SplitText word wrappers — each word rises + fades in on load */
.hb-word { display: inline-block; will-change: transform, opacity; }
.hb-gradient {
  background: linear-gradient(100deg, var(--mint), var(--violet));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
/* Keep the gradient per-word once SplitText wraps them (background-clip:text
   doesn't survive across split child spans otherwise). */
.hb-gradient .hb-word {
  background: linear-gradient(100deg, var(--mint), var(--violet));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hb-sub {
  max-width: 620px; color: var(--muted); font-size: clamp(1rem, 2vw, 1.15rem);
  line-height: 1.65; margin: 1.6rem 0 0;
}
.hb-hero-ctas { display: flex; gap: 1rem; margin-top: 2.4rem; flex-wrap: wrap; justify-content: center; align-items: center; }
.hb-fade { opacity: 0; animation: hb-fadeup 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
@keyframes hb-fadeup { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
.hb-scroll-hint { margin-top: 4rem; }
.hb-scroll-hint span {
  display: block; width: 1px; height: 56px;
  background: linear-gradient(var(--mint), transparent);
  animation: hb-drip 1.8s ease-in-out infinite;
}
@keyframes hb-drip { 0% { transform: scaleY(0); transform-origin: top; } 55% { transform: scaleY(1); transform-origin: top; } 100% { transform: scaleY(0); transform-origin: bottom; } }

/* Pinned narrative */
.hb-how { position: relative; z-index: 1; height: 200vh; }
.hb-how-sticky {
  position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  text-align: center; padding: 0 clamp(1.2rem, 5vw, 3rem);
}
.hb-kicker {
  color: var(--violet); font-size: 0.82rem; letter-spacing: 0.22em;
  text-transform: uppercase; font-weight: 600; margin: 0 0 1rem;
}
.hb-stage-wrap { position: relative; width: min(680px, 100%); height: 300px; }
.hb-stage {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  opacity: 0; transform: translateY(26px) scale(0.98);
  transition: opacity 0.55s, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
.hb-stage-on { opacity: 1; transform: translateY(0) scale(1); }
.hb-stage-n {
  font-size: 0.95rem; color: var(--mint); letter-spacing: 0.3em; margin: 0 0 0.6rem;
  font-weight: 600;
}
.hb-stage-emoji { letter-spacing: 0; margin-left: 0.4rem; }
.hb-stage-title {
  font-family: var(--font-fraunces), serif; font-weight: 600;
  font-size: clamp(2.2rem, 5.5vw, 3.6rem); margin: 0 0 1rem;
}
.hb-stage-desc { color: var(--muted); font-size: clamp(0.98rem, 2vw, 1.1rem); line-height: 1.65; max-width: 560px; margin: 0; }
.hb-stage-dots { display: flex; gap: 0.6rem; margin-top: 2.2rem; }
.hb-dot {
  width: 34px; height: 4px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.12); transition: background 0.4s;
}
.hb-dot-on { background: linear-gradient(90deg, var(--mint), var(--violet)); }
.hb-stage-loop { color: var(--muted); font-size: 0.85rem; margin-top: 1.6rem; letter-spacing: 0.04em; }

/* Sections */
.hb-section {
  position: relative; z-index: 1; padding: 7rem clamp(1.2rem, 5vw, 3rem);
  max-width: 1180px; margin: 0 auto; text-align: center;
}
.hb-h2 {
  font-family: var(--font-fraunces), serif; font-weight: 600;
  font-size: clamp(1.9rem, 4.5vw, 3rem); margin: 0; letter-spacing: -0.01em;
}
.hb-section-sub { color: var(--muted); max-width: 640px; margin: 1.2rem auto 0; line-height: 1.65; }

/* Department cards */
.hb-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.2rem; margin-top: 3rem; text-align: left;
}
.hb-card {
  position: relative; overflow: hidden;
  border: 1px solid var(--line); border-radius: 16px;
  background: var(--card); padding: 1.5rem;
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.35s,
    opacity 0.7s, box-shadow 0.35s;
  will-change: transform; transform-style: preserve-3d;
  --gx: 50%; --gy: 50%;
}
.hb-card::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  background: radial-gradient(320px circle at var(--gx) var(--gy),
    rgba(0, 240, 168, 0.14), rgba(139, 110, 247, 0.10) 45%, transparent 70%);
  opacity: 0; transition: opacity 0.35s; pointer-events: none;
}
.hb-card:hover { border-color: rgba(0, 240, 168, 0.35); box-shadow: 0 18px 44px rgba(0, 0, 0, 0.45); }
.hb-card:hover::before { opacity: 1; }
.hb-card-top { display: flex; justify-content: space-between; align-items: center; }
.hb-card-emoji { font-size: 1.7rem; filter: drop-shadow(0 0 10px rgba(0, 240, 168, 0.35)); }
.hb-badge {
  font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--muted); border: 1px solid var(--line); border-radius: 999px;
  padding: 0.2rem 0.6rem;
}
.hb-badge-live { color: #04110c; background: var(--mint); border-color: var(--mint); font-weight: 700; }
.hb-card-name { font-family: var(--font-fraunces), serif; font-size: 1.25rem; font-weight: 600; margin: 0.9rem 0 0.4rem; }
.hb-card-desc { color: var(--muted); font-size: 0.92rem; line-height: 1.6; margin: 0; }

/* Reveals */
.hb-reveal { opacity: 0; transform: translateY(28px); transition: opacity 0.7s, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1); }
.hb-in { opacity: 1; transform: translateY(0); }

/* Pricing + footer */
.hb-pricing { padding-bottom: 8rem; }
.hb-footer {
  position: relative; z-index: 1; border-top: 1px solid var(--line);
  padding: 2.2rem clamp(1.2rem, 5vw, 3rem); text-align: center;
  color: var(--muted); font-size: 0.88rem;
}
.hb-footer p { margin: 0.3rem 0; }
.hb-footer-links a { color: var(--muted); text-decoration: none; transition: color 0.25s; }
.hb-footer-links a:hover { color: var(--mint); }

/* Anchor offset for fixed nav */
#departments, #pricing, #how { scroll-margin-top: 70px; }

/* Mobile */
@media (max-width: 899px) {
  .hb-nav-links { display: none; }
  .hb-stage-wrap { height: 340px; }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .hb-root { scroll-behavior: auto; }
  .hb-fade, .hb-reveal, .hb-stage { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; }
  .hb-stage { position: relative; }
  .hb-caret { animation: none; }
}
`;
