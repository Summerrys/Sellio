import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import ScrollWorldExperience from './ScrollWorldExperience';
import SellioWorld from './SellioWorld';

export default function HeroWorldTransition() {
  const sequenceRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const [heroInteractive, setHeroInteractive] = useState(true);
  const { scrollYProgress } = useScroll({
    target: sequenceRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 105,
    damping: 28,
    mass: .22,
    restDelta: .0008,
  });

  const heroRotateX = useTransform(smoothProgress, [0, .1, .5, .68], [0, 0, -7, -14]);
  const heroY = useTransform(smoothProgress, [0, .1, .58, .72], ['0%', '0%', '-14%', '-39%']);
  const heroScale = useTransform(smoothProgress, [0, .1, .58, .72], [1, 1, .982, .935]);
  const heroOpacity = useTransform(smoothProgress, [0, .47, .66, .74], [1, 1, .78, 0]);
  const heroRadius = useTransform(smoothProgress, [0, .12, .58], ['0px', '0px', '34px']);

  const worldScale = useTransform(smoothProgress, [0, .1, .58, .72], [.945, .945, .99, 1]);
  const worldY = useTransform(smoothProgress, [0, .1, .58, .72], ['7%', '7%', '1%', '0%']);
  const worldBrightness = useTransform(smoothProgress, [0, .2, .62], [.94, .96, 1]);
  const worldFilter = useTransform(worldBrightness, (value) => `brightness(${value})`);
  const worldClip = useTransform(
    smoothProgress,
    [0, .1, .58, .72],
    ['inset(14% 6% 6% 6% round 38px)', 'inset(14% 6% 6% 6% round 38px)', 'inset(1.5% .8% .8% .8% round 20px)', 'inset(0% 0% 0% 0% round 0px)'],
  );
  const seamOpacity = useTransform(smoothProgress, [.16, .46, .68], [0, .9, 0]);

  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (value) => {
      setHeroInteractive(value < .5);
    });
    return unsubscribe;
  }, [scrollYProgress]);

  useEffect(() => {
    const sequence = sequenceRef.current;
    const landing = sequence?.closest('.sellio-landing');
    if (!sequence) return undefined;

    const measureSettlePoint = () => {
      const range = Math.max(0, sequence.offsetHeight - window.innerHeight);
      sequence.style.setProperty('--sl-page-turn-settle-y', `${Math.round(range * .72)}px`);
      landing?.style.setProperty('--sl-world-proof-lift', `-${Math.round(range * .28 + 168)}px`);
    };

    measureSettlePoint();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureSettlePoint);
    observer?.observe(sequence);
    window.addEventListener('resize', measureSettlePoint);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureSettlePoint);
      sequence.style.removeProperty('--sl-page-turn-settle-y');
      landing?.style.removeProperty('--sl-world-proof-lift');
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return undefined;

    const coarsePointer = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760;
    if (!coarsePointer) return undefined;

    let scrollTimer;
    let animationFrame;
    let snapping = false;
    let lastScrollY = window.scrollY;
    let direction = 1;
    let gestureStartScrollY = null;
    let gestureStartTouchY = null;

    const cancelSnap = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
      snapping = false;
    };

    const animateTo = (targetY) => {
      cancelSnap();
      const startY = window.scrollY;
      const distance = targetY - startY;
      if (Math.abs(distance) < 2) return;

      snapping = true;
      const startedAt = performance.now();
      const duration = Math.min(520, Math.max(320, Math.abs(distance) * .45));

      const step = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 4);
        window.scrollTo(0, startY + distance * eased);

        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(step);
        } else {
          animationFrame = undefined;
          snapping = false;
          lastScrollY = window.scrollY;
        }
      };

      animationFrame = window.requestAnimationFrame(step);
    };

    const settlePageTurn = () => {
      if (snapping || !sequenceRef.current) return;

      const sequence = sequenceRef.current;
      const range = sequence.offsetHeight - window.innerHeight;
      if (range <= 0) return;

      const progress = (window.scrollY - sequence.offsetTop) / range;
      if (progress <= .025 || progress >= .69) {
        gestureStartScrollY = null;
        return;
      }

      const gestureDirection = gestureStartScrollY === null
        ? direction
        : (window.scrollY >= gestureStartScrollY ? 1 : -1);
      gestureStartScrollY = null;

      const targetProgress = gestureDirection < 0 ? 0 : .72;
      animateTo(sequence.offsetTop + range * targetProgress);
    };

    const onScroll = () => {
      if (!snapping) {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY;
        if (Math.abs(delta) > 1) direction = delta > 0 ? 1 : -1;
        lastScrollY = currentY;
      }

      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(settlePageTurn, 90);
    };

    const onTouchStart = (event) => {
      gestureStartScrollY = window.scrollY;
      gestureStartTouchY = event.touches?.[0]?.clientY ?? null;
      window.clearTimeout(scrollTimer);
      cancelSnap();
    };

    const onTouchEnd = (event) => {
      const sequence = sequenceRef.current;
      const journey = document.querySelector('.sl-chapter-transition--journey');
      if (!sequence || !journey || gestureStartScrollY === null || snapping) return;

      const range = Math.max(0, sequence.offsetHeight - window.innerHeight);
      const settledWorldY = sequence.offsetTop + range * .69;
      const journeyY = journey.getBoundingClientRect().top + window.scrollY;
      const scrollTravel = window.scrollY - gestureStartScrollY;
      const touchEndY = event.changedTouches?.[0]?.clientY ?? gestureStartTouchY;
      const swipeTravel = gestureStartTouchY === null || touchEndY === null ? 0 : gestureStartTouchY - touchEndY;
      const travelled = Math.max(scrollTravel, swipeTravel);
      const nearJourneyHandoff = window.scrollY >= settledWorldY - 20
        && window.scrollY < journeyY
        && journeyY - window.scrollY <= window.innerHeight * 1.35;

      if (travelled > 22 && nearJourneyHandoff) {
        window.clearTimeout(scrollTimer);
        gestureStartScrollY = null;
        gestureStartTouchY = null;
        animateTo(journeyY);
      }
    };

    const onWheel = () => {
      window.clearTimeout(scrollTimer);
      cancelSnap();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      window.clearTimeout(scrollTimer);
      cancelSnap();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('wheel', onWheel);
    };
  }, [reduceMotion]);

  if (reduceMotion) {
    return (
      <>
        <ScrollWorldExperience />
        <span id="world" className="sl-page-turn-static-anchor" aria-hidden="true" />
        <SellioWorld />
      </>
    );
  }

  return (
    <section
      id="sellio-entry-sequence"
      ref={sequenceRef}
      className="sl-page-turn-sequence"
      aria-label="Transition from the Sellio film into the interactive Sellio World"
    >
      <span id="world" className="sl-page-turn-world-anchor" aria-hidden="true" />
      <div className="sl-page-turn-stage">
        <motion.div
          className="sl-page-turn-world"
          style={{
            scale: worldScale,
            y: worldY,
            clipPath: worldClip,
            filter: worldFilter,
          }}
        >
          <SellioWorld />
        </motion.div>

        <motion.div
          className="sl-page-turn-hero"
          style={{
            rotateX: heroRotateX,
            y: heroY,
            scale: heroScale,
            opacity: heroOpacity,
            borderRadius: heroRadius,
            pointerEvents: heroInteractive ? 'auto' : 'none',
          }}
        >
          <ScrollWorldExperience />
        </motion.div>

        <motion.div className="sl-page-turn-seam" style={{ opacity: seamOpacity }} aria-hidden="true" />
      </div>
    </section>
  );
}
