import React, { useMemo } from 'react';
import { Star, Flame, Award } from 'lucide-react';
import { motion } from 'framer-motion';

const steps = [
  { number: 1, label: 'Business\nSetup', emoji: '🏪' },
  { number: 2, label: 'Branch\nSetup', emoji: '🌳' },
  { number: 3, label: 'Menu/\nServices', emoji: '📋' },
  { number: 4, label: 'Tables\n& QR', emoji: '📱' },
  { number: 5, label: 'Review\n& Go Live', emoji: '🚀' },
];

export default function OnboardingProgress({ currentStep = 1 }) {
  const totalSteps = steps.length;
  const percentage = Math.round((currentStep / totalSteps) * 100);
  const points = currentStep * 20;
  const streak = currentStep > 1 ? currentStep - 1 : 0;

  return (
    <div className="w-full">
      {/* Gamified Header with Stats */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Star className="w-4 h-4 text-orange-400 fill-orange-400 flex-shrink-0" />
          <h3 className="text-sm font-bold text-slate-900">Your Journey</h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-full">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-semibold text-orange-600">{streak}</span>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold">
            {currentStep}/{totalSteps}
          </div>
        </div>
      </div>

      {/* Gamified Steps with Emojis */}
      <div className="flex justify-between items-end gap-1 mb-2 overflow-x-auto pb-1">
        {steps.map((step) => (
          <motion.div
            key={step.number}
            animate={{
              y: currentStep === step.number ? -4 : 0,
            }}
            className="flex flex-col items-center gap-1 flex-shrink-0"
          >
            <div className="text-base mb-0.5">{step.emoji}</div>
            <motion.div
              animate={{
                scale: currentStep === step.number ? 1.1 : 1,
                backgroundColor: currentStep >= step.number ? '#a855f7' : '#f3f4f6',
              }}
              transition={{ duration: 0.3 }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
              style={{
                color: currentStep >= step.number ? 'white' : '#9ca3af',
              }}
            >
              {currentStep > step.number ? <Check size={16} /> : step.number}
            </motion.div>
            <p className="text-xs text-center font-medium text-slate-600 whitespace-pre-line leading-tight min-w-16">
              {step.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Gamified Progress Bar with Milestones */}
      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden mb-2">
        <motion.div
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-orange-500"
        />
      </div>

      {/* Points and Completion */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-600 font-medium">{percentage}% Complete</p>
        <div className="flex items-center gap-1 bg-purple-50 px-2 py-0.5 rounded-full">
          <Award className="w-3.5 h-3.5 text-purple-600" />
          <span className="text-xs font-semibold text-purple-600">{points} pts</span>
        </div>
      </div>
    </div>
  );
}