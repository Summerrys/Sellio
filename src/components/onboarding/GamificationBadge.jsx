import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Star, Zap, Check } from 'lucide-react';

const badges = {
  first_step: { icon: Star, label: 'Getting Started', color: 'from-yellow-400 to-orange-400' },
  halfway: { icon: Zap, label: 'Halfway There', color: 'from-blue-400 to-purple-400' },
  complete: { icon: Trophy, label: 'Setup Master', color: 'from-purple-500 to-pink-500' },
};

export default function GamificationBadge({ badge, show = false }) {
  if (!show || !badges[badge]) return null;

  const badgeConfig = badges[badge];
  const Icon = badgeConfig.icon;

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 10 }}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
    >
      <div className={`bg-gradient-to-br ${badgeConfig.color} rounded-full p-6 shadow-2xl`}>
        <Icon className="w-12 h-12 text-white" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-4 text-center"
      >
        <p className="font-bold text-lg text-slate-900">🎉 {badgeConfig.label}!</p>
      </motion.div>
    </motion.div>
  );
}