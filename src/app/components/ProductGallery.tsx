/**
 * ProductGallery — Production UX edition
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable, prop-driven, full-screen image gallery modal.
 *
 * Props
 *   images        – array of image URLs
 *   initialIndex  – slide to open on  (default 0)
 *   isOpen        – controlled open state
 *   onClose       – close callback
 *
 * Enhancements over v1
 *   • Smooth 300 ms ease-in-out CSS slide transition
 *   • Momentum / velocity-aware swipe detection
 *   • Scroll-snap thumbnail strip with scrollIntoView auto-centre
 *   • loading="eager" on active slide, "lazy" on others
 *   • Aspect-ratio wrapper prevents layout shift
 *   • isTransitioning lock — prevents rapid-click animation glitches
 *   • Cyclic infinite navigation (modulo) with instant wrap to avoid
 *     long-way-round strip animation at boundaries
 *   • Full focus trap (Tab cycling inside modal)
 *   • Arrows + counter hidden when only 1 image
 *   • Placeholder shown when image array is empty
 *
 * Future-ready extension points  (search "FUTURE:" to find hooks)
 *   FUTURE: VIDEO  – render <video> when src matches .mp4 / .webm
 *   FUTURE: ZOOM   – add `onZoom?: (i: number) => void`; wrap image with
 *                    pinch / double-tap gesture handler
 *   FUTURE: ADMIN  – add `captions?: string[]`; slot reserved in top-bar
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductGalleryProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  // FUTURE: ZOOM   – onZoom?: (index: number) => void;
  // FUTURE: VIDEO  – videos?: Array<{ index: number; url: string }>;
  // FUTURE: ADMIN  – captions?: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSITION_MS      = 300;   // slide animation duration — keep in sync with CSS
const SWIPE_THRESHOLD    = 50;    // px   — minimum distance to commit a swipe
const VELOCITY_THRESHOLD = 0.3;   // px/ms — fast-flick threshold
const FLICK_MIN_DIST     = 20;    // px   — minimum distance to count as a flick
const THUMB_W            = 56;    // px   — thumbnail width / height

// Inline SVG placeholder shown when no images are supplied
const PLACEHOLDER_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E" +
  "%3Crect width='400' height='400' fill='%23374151'/%3E" +
  "%3Ctext x='50%25' y='50%25' font-size='15' fill='%236B7280' " +
  "text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'%3E" +
  "Зураг байхгүй%3C/text%3E%3C/svg%3E";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap index cyclically within [0, total). */
function wrapIndex(index: number, total: number): number {
  return ((index % total) + total) % total;
}

/** True when moving from last→first or first→last (strip would animate the long way). */
function isWrapJump(from: number, to: number, total: number): boolean {
  return (from === total - 1 && to === 0) || (from === 0 && to === total - 1);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductGallery({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}: ProductGalleryProps) {

  // ── Mount / visibility ─────────────────────────────────────────────────
  const [mounted,        setMounted]        = useState(false);
  const [visible,        setVisible]        = useState(false);

  // ── Slide state ────────────────────────────────────────────────────────
  const [activeIndex,    setActiveIndex]    = useState(initialIndex);
  const [isTransitioning, setIsTransitioning] = useState(false);
  // When wrapping at boundaries we skip the CSS transition for one frame
  const [skipTransition, setSkipTransition] = useState(false);

  // ── Swipe / drag ───────────────────────────────────────────────────────
  const [dragOffset,  setDragOffset]  = useState(0);
  const [isDragging,  setIsDragging]  = useState(false);
  const touchStartX   = useRef(0);
  const touchStartMs  = useRef(0);     // for velocity calculation

  // ── Refs ───────────────────────────────────────────────────────────────
  const galleryRef   = useRef<HTMLDivElement>(null);
  const closeRef     = useRef<HTMLButtonElement>(null);
  const thumbRefs    = useRef<(HTMLButtonElement | null)[]>([]);

  // ── Normalise image list ────────────────────────────────────────────────
  const safeImages = images.length > 0 ? images : [PLACEHOLDER_SRC];
  const total      = safeImages.length;
  const canNav     = total > 1;   // arrows, counter, thumbnails only when multiple

  // ─────────────────────────────────────────────────────────────────────────
  // goTo — cyclic with transition lock + instant wrap at strip boundaries
  // ─────────────────────────────────────────────────────────────────────────
  const goTo = useCallback((rawIndex: number) => {
    if (isTransitioning) return;

    const next = wrapIndex(rawIndex, total);
    const wrap  = isWrapJump(activeIndex, next, total);

    if (wrap) {
      // Instant jump (no slide animation) to avoid the strip sliding the
      // long way across all images when cycling from last→first or vice-versa.
      setSkipTransition(true);
      setActiveIndex(next);
      setDragOffset(0);
      // Re-enable transition after the browser has painted the jump
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setSkipTransition(false))
      );
    } else {
      setActiveIndex(next);
      setDragOffset(0);
      setIsTransitioning(true);
      setTimeout(() => setIsTransitioning(false), TRANSITION_MS + 20);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, total, isTransitioning]);

  // ─────────────────────────────────────────────────────────────────────────
  // Mount / unmount + reset on each open
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      const clamped = Math.min(Math.max(initialIndex, 0), total - 1);
      setActiveIndex(clamped);
      setDragOffset(0);
      setIsTransitioning(false);
      setSkipTransition(false);
      setMounted(true);
      // Double-rAF so CSS opacity transition fires after DOM paint
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setVisible(true);
          closeRef.current?.focus();   // move focus into the modal
        })
      );
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), TRANSITION_MS + 80);
      return () => clearTimeout(t);
    }
  }, [isOpen, initialIndex, total]);

  // ─────────────────────────────────────────────────────────────────────────
  // Body scroll lock
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard navigation (ArrowLeft / ArrowRight / Escape)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')       { onClose(); }
      else if (e.key === 'ArrowLeft')  { goTo(activeIndex - 1); }
      else if (e.key === 'ArrowRight') { goTo(activeIndex + 1); }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, activeIndex, goTo, onClose]);

  // ─────────────────────────────────────────────────────────────────────────
  // Focus trap — cycles Tab / Shift+Tab within the modal
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !mounted) return;

    const el = galleryRef.current;
    if (!el) return;

    function onTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        el!.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(node => node.offsetParent !== null);  // visible only

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    el.addEventListener('keydown', onTab);
    return () => el.removeEventListener('keydown', onTab);
  }, [isOpen, mounted]);

  // ─────────────────────────────────────────────────────────────────────────
  // Thumbnail auto-scroll — keeps active thumb centred in the strip
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = thumbRefs.current[activeIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeIndex]);

  // ─────────────────────────────────────────────────────────────────────────
  // Touch handlers — live drag offset + momentum / velocity detection
  // ─────────────────────────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current  = e.touches[0].clientX;
    touchStartMs.current = Date.now();
    setIsDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging) return;
    const delta   = e.touches[0].clientX - touchStartX.current;
    // Rubber-band resistance at visual strip edges (still navigates cyclically on commit)
    const atStart = activeIndex === 0         && delta > 0;
    const atEnd   = activeIndex === total - 1 && delta < 0;
    setDragOffset(atStart || atEnd ? delta * 0.25 : delta);
  }

  function onTouchEnd() {
    setIsDragging(false);

    const elapsed  = Math.max(Date.now() - touchStartMs.current, 1);   // avoid /0
    const velocity = Math.abs(dragOffset) / elapsed;                    // px/ms
    const isFlick  = velocity > VELOCITY_THRESHOLD && Math.abs(dragOffset) > FLICK_MIN_DIST;

    if      (dragOffset < -SWIPE_THRESHOLD || (isFlick && dragOffset < 0)) { goTo(activeIndex + 1); }
    else if (dragOffset >  SWIPE_THRESHOLD || (isFlick && dragOffset > 0)) { goTo(activeIndex - 1); }
    else    { setDragOffset(0); }   // snap back
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render guard
  // ─────────────────────────────────────────────────────────────────────────
  if (!mounted) return null;

  const stripTransform = `translateX(calc(${-activeIndex * 100}% + ${dragOffset}px))`;
  const stripTransition =
    isDragging || skipTransition
      ? 'none'
      : `transform ${TRANSITION_MS}ms ease-in-out`;

  const galleryUi = (
    <div
      ref={galleryRef}
      role="dialog"
      aria-modal="true"
      aria-label="ProductGallery — бүтэн дэлгэцийн зургийн галерей"
      tabIndex={-1}
      className="fixed inset-0 z-[220] flex flex-col bg-black outline-none"
      style={{
        opacity:    visible ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}
    >

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-between px-4 pt-4 pb-3 shrink-0">

        {/* Counter pill — hidden when only 1 image */}
        {canNav ? (
          <div
            className="bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full select-none tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {activeIndex + 1} / {total}
          </div>
        ) : (
          <div />  /* keeps close button flush-right when no counter */
        )}

        {/* FUTURE: ADMIN — per-image caption slot goes here */}

        {/* Close button */}
        <button
          ref={closeRef}
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          aria-label="Галерейг хаах (Escape)"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* ── Main swipeable image area ────────────────────────────────────── */}
      <div
        className="flex-1 overflow-hidden relative"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Image strip — all slides in one horizontal row */}
        <div
          className="flex h-full"
          style={{
            transform:  stripTransform,
            transition: stripTransition,
            willChange: 'transform',
          }}
        >
          {safeImages.map((src, i) => {
            const isActive = i === activeIndex;
            return (
              <div
                key={i}
                className="flex-none w-full h-full flex items-center justify-center px-4"
                aria-hidden={!isActive}
              >
                {/*
                 * Aspect-ratio wrapper — prevents layout shift while the image loads.
                 * FUTURE: VIDEO — check src.match(/\.(mp4|webm)$/i) here and
                 *   render <video autoPlay loop playsInline controls /> instead.
                 */}
                <div
                  className="relative w-full"
                  style={{ aspectRatio: '3 / 4', maxHeight: '100%' }}
                >
                  <ImageWithFallback
                    src={src}
                    alt={`Зураг ${i + 1}`}
                    className="absolute inset-0 w-full h-full object-contain select-none"
                    loading={isActive ? 'eager' : 'lazy'}
                    decoding="async"
                    draggable={false}
                    /*
                     * FUTURE: ZOOM — wrap this component with a pinch-gesture
                     * handler and call onZoom?.(i) on double-tap.
                     */
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Side arrow buttons (tablet / desktop) — hidden on mobile ── */}
        {canNav && (
          <>
            <button
              onClick={() => goTo(activeIndex - 1)}
              disabled={isTransitioning}
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors backdrop-blur-sm disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              aria-label="Өмнөх зураг (←)"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>

            <button
              onClick={() => goTo(activeIndex + 1)}
              disabled={isTransitioning}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors backdrop-blur-sm disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              aria-label="Дараах зураг (→)"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </>
        )}

        {/* ── Dot indicators (mobile, ≤ 5 images) ─────────────────────── */}
        {canNav && total <= 5 && (
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none"
            aria-hidden="true"
          >
            {safeImages.map((_, i) => (
              <span
                key={i}
                className={`block rounded-full transition-all duration-300 ${
                  i === activeIndex
                    ? 'w-5 h-1.5 bg-white'
                    : 'w-1.5 h-1.5 bg-white/40'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Thumbnail strip (multi-image only) ──────────────────────────── */}
      {canNav && (
        <div className="shrink-0 pt-3 pb-6">
          {/*
           * scroll-snap-type: x mandatory on the container +
           * scroll-snap-align: center on each thumb ensures the strip
           * snaps cleanly when the user manually scrolls it.
           * scrollIntoView (in useEffect above) auto-centres the active thumb.
           */}
          <div
            className="flex gap-2 px-4 overflow-x-auto"
            style={{
              scrollbarWidth:          'none',          // Firefox
              WebkitOverflowScrolling: 'touch',
              scrollSnapType:          'x mandatory',
            }}
          >
            {safeImages.map((src, i) => (
              <button
                key={i}
                ref={(el) => { thumbRefs.current[i] = el; }}
                onClick={() => goTo(i)}
                disabled={isTransitioning}
                className={`flex-none rounded-xl overflow-hidden transition-all duration-200
                  disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                  i === activeIndex
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-black opacity-100 scale-105'
                    : 'opacity-50 hover:opacity-75 active:opacity-100'
                }`}
                style={{
                  width:           THUMB_W,
                  height:          THUMB_W,
                  scrollSnapAlign: 'center',    // individual snap point
                  flexShrink:      0,
                }}
                aria-label={`${i + 1} дүгээр зураг`}
                aria-current={i === activeIndex ? 'true' : undefined}
                aria-pressed={i === activeIndex}
              >
                <ImageWithFallback
                  src={src}
                  alt={`Дүрс ${i + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Dark backdrop — tap outside content to close ─────────────────── */}
      <div
        className="absolute inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(galleryUi, document.body);
  }
  return null;
}
