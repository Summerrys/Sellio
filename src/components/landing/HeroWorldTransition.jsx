import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
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

  const heroRotateX = useTransform(scrollYProgress, [0, .08, .48, .62], [0, 0, -9, -18]);
  const heroY = useTransform(scrollYProgress, [0, .08, .55, .68], ['0%', '0%', '-18%', '-44%']);
  const heroScale = useTransform(scrollYProgress, [0, .08, .55, .68], [1, 1, .975, .92]);
  const heroOpacity = useTransform(scrollYProgress, [0, .44, .62, .7], [1, 1, .72, 0]);
  const heroRadius = useTransform(scrollYProgress, [0, .1, .55], ['0px', '0px', '38px']);

  const worldScale = useTransform(scrollYProgress, [0, .08, .55, .68], [.92, .92, .985, 1]);
  const worldY = useTransform(scrollYProgress, [0, .08, .55, .68], ['10%', '10%', '1.5%', '0%']);
  const worldBrightness = useTransform(scrollYProgress, [0, .16, .58], [.82, .86, 1]);
  const worldFilter = useTransform(worldBrightness, (value) => `brightness(${value})`);
  const worldClip = useTransform(
    scrollYProgress,
    [0, .08, .56, .68],
    ['inset(18% 8% 8% 8% round 42px)', 'inset(18% 8% 8% 8% round 42px)', 'inset(2% 1% 1% 1% round 24px)', 'inset(0% 0% 0% 0% round 0px)'],
  );
  const seamOpacity = useTransform(scrollYProgress, [.12, .42, .62], [0, 1, 0]);

  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (value) => {
      setHeroInteractive(value < .5);
    });
    return unsubscribe;
  }, [scrollYProgress]);

  useEffect(() => {
    const sequence = sequenceRef.current;
    if (!sequence) return undefined;

    const measureSettlePoint = () => {
      const range = Math.max(0, sequence.offsetHeight - window.innerHeight);
      sequence.style.setProperty('--sl-page-turn-settle-y', `${Math.round(range * .72)}px`);
    };

    measureSettlePoint();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureSettlePoint);
    observer?.observe(sequence);
    window.addEventListener('resize', measureSettlePoint);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureSettlePoint);
      sequence.style.removeProperty('--sl-page-turn-settle-y');
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

    const onTouchStart = () => {
      gestureStartScrollY = window.scrollY;
      window.clearTimeout(scrollTimer);
      cancelSnap();
    };

    const onWheel = () => {
      window.clearTimeout(scrollTimer);
      cancelSnap();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      window.clearTimeout(scrollTimer);
      cancelSnap();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', onTouchStart);
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
