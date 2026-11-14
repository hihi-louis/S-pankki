import { useEffect, useRef, useState } from "react";
import type { Recommendation } from "@sbank/shared";
import { IconArrowLeft, IconArrowRight, IconBars } from "./Icons";

const GAP = 16;
/** Distance between two slides: the real slide width plus the gap. */
const step = (el: HTMLElement) => ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth) + GAP;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Props {
  items: Recommendation[];
  onOpen: (item: Recommendation) => void;
}

/** One big card at a time, swipe or use the arrows. Native scroll-snap keeps it smooth on phones. */
export function RecommendationCarousel({ items, onOpen }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // Keep the dots in step with the swipe
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setIndex(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / step(el))))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [items.length]);

  // Auto-play: each card rests for 5 seconds, then slides quickly (eased) to the next one,
  // going right and then back left. Pauses while the person touches or hovers.
  const paused = useRef(false);
  const resumeAt = useRef(0);
  const idx = useRef(0);
  idx.current = index;

  useEffect(() => {
    if (items.length < 2 || reduced()) return;
    const el = track.current;
    if (!el) return;
    const DWELL = 5000;
    const SLIDE = 650;
    let dir = 1;
    let frame = 0;
    let timer = 0;

    const slideTo = (to: number) => {
      const from = el.scrollLeft;
      const start = performance.now();
      el.style.scrollSnapType = "none";
      const tick = (now: number) => {
        if (paused.current) { el.style.scrollSnapType = ""; return; }
        const t = Math.min(1, (now - start) / SLIDE);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease in-out
        el.scrollLeft = from + (to - from) * e;
        if (t < 1) frame = requestAnimationFrame(tick);
        else el.style.scrollSnapType = "";
      };
      frame = requestAnimationFrame(tick);
    };

    const next = () => {
      timer = window.setTimeout(next, DWELL);
      if (paused.current || document.hidden || Date.now() < resumeAt.current) return;
      let n = idx.current + dir;
      if (n >= items.length - 1) dir = -1;
      if (n <= 0) dir = 1;
      n = Math.max(0, Math.min(items.length - 1, n));
      slideTo(n * step(el));
    };
    timer = window.setTimeout(next, DWELL);

    const hold = () => { paused.current = true; cancelAnimationFrame(frame); el.style.scrollSnapType = ""; };
    const release = () => { paused.current = false; resumeAt.current = Date.now() + 2000; };
    el.addEventListener("pointerdown", hold);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("mouseenter", hold);
    el.addEventListener("mouseleave", release);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      el.style.scrollSnapType = "";
      el.removeEventListener("pointerdown", hold);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("pointercancel", release);
      el.removeEventListener("mouseenter", hold);
      el.removeEventListener("mouseleave", release);
    };
  }, [items.length]);

  function goTo(i: number) {
    resumeAt.current = Date.now() + 4000;
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(items.length - 1, i));
    el.scrollTo({ left: next * step(el), behavior: reduced() ? "auto" : "smooth" });
  }

  return (
    <div className="carousel" role="region" aria-roledescription="carousel" aria-label="Recommendations">
      <div className="carousel-count" aria-live="polite">{index + 1} / {items.length}</div>
      <div className="carousel-track" ref={track}>
        {items.map((r, i) => (
          <article key={r.id} className={`rec rec-${r.tone}${i === index ? " is-active" : ""}`} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}>
            <div className="rec-eyebrow"><IconBars />{r.eyebrow}</div>
            <h3 className="rec-headline">{r.headline}</h3>
            <p className="rec-body">{r.body}</p>
            <button className="rec-cta" onClick={() => onOpen(r)}>
              {r.cta} <IconArrowRight />
            </button>
          </article>
        ))}
      </div>
      <div className="carousel-controls">
        <div className="dots" role="tablist" aria-label="Choose a recommendation">
          {items.map((r, i) => (
            <button key={r.id} role="tab" aria-selected={i === index} aria-label={`Recommendation ${i + 1}`} className={`dot-nav${i === index ? " active" : ""}`} onClick={() => goTo(i)} />
          ))}
        </div>
        <div className="arrows">
          <button className="arrow" aria-label="Previous recommendation" disabled={index === 0} onClick={() => goTo(index - 1)}><IconArrowLeft /></button>
          <button className="arrow" aria-label="Next recommendation" disabled={index === items.length - 1} onClick={() => goTo(index + 1)}><IconArrowRight /></button>
        </div>
      </div>
    </div>
  );
}
