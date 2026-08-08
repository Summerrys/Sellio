import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const EASE = [0.2, 0.8, 0.2, 1];

export default function ChapterTransition({ children, className = '', label }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={`sl-chapter-transition ${className}`}>{children}</div>;
  }

  return (
    <motion.div
      className={`sl-chapter-transition ${className}`}
      initial={{ opacity: 0.2, y: 104, rotateX: 11, scale: 0.958, clipPath: 'inset(15% 2.5% 0% 2.5% round 38px)' }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0, scale: 1, clipPath: 'inset(0% 0% 0% 0% round 0px)' }}
      viewport={{ once: true, amount: 0.035 }}
      transition={{ duration: 0.92, ease: EASE }}
      style={{ transformOrigin: '50% 0%' }}
      aria-label={label}
    >
      <motion.span
        className="sl-chapter-transition__seam"
        initial={{ opacity: 0, scaleX: 0.22 }}
        whileInView={{ opacity: [0, 0.95, 0], scaleX: [0.22, 1, 1] }}
        viewport={{ once: true, amount: 0.08 }}
        transition={{ duration: 0.96, times: [0, 0.48, 1], ease: EASE }}
        aria-hidden="true"
      />
      {children}
    </motion.div>
  );
}
