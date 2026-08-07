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
