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
      initial={{ opacity: 0.45, y: 72, rotateX: 7, scale: 0.975, clipPath: 'inset(8% 1.5% 0% 1.5% round 34px)' }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0, scale: 1, clipPath: 'inset(0% 0% 0% 0% round 0px)' }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: 0.76, ease: EASE }}
      style={{ transformOrigin: '50% 0%' }}
      aria-label={label}
    >
      <motion.span
        className="sl-chapter-transition__seam"
        initial={{ opacity: 0, scaleX: 0.22 }}
        whileInView={{ opacity: [0, 0.95, 0], scaleX: [0.22, 1, 1] }}
        viewport={{ once: true, amount: 0.08 }}
        transition={{ duration: 0.82, times: [0, 0.52, 1], ease: EASE }}
        aria-hidden="true"
      />
      {children}
    </motion.div>
  );
}
