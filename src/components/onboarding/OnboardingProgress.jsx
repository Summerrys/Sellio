import React from 'react';
import { CheckCircle2, Rocket } from 'lucide-react';
import { motion } from 'framer-motion';

const PURPLE_PINK = `linear-gradient(to right, #9333ea, #ec4899)`;

export default function OnboardingProgress({ currentStep = 1, completedSteps = [], steps = [] }) {
  const displaySteps = steps.length > 0 ? steps.map((s, i) => ({
    number: i + 1,
    label: s.title.replace(/ /g, '\n'),
  })) : [];
  
  const percentage = displaySteps.length > 0 ? Math.round((currentStep / displaySteps.length) * 100) : 0;
  const isNearComplete = percentage >= 75;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
          <h3 className="text-sm sm:text-base font-bold text-slate-900">Your Progress</h3>
        </div>
        <div className="text-white px-2 sm:px-3 py-1 rounded-full text-xs font-semibold" style={{ background: PURPLE_PINK }}>
          {Math.min(completedSteps.length, displaySteps.length)} / {displaySteps.length} Complete
        </div>
      </div>

      {/* Step Indicators */}
      <div className="flex justify-between mb-4 gap-1">
        {displaySteps.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="flex flex-col items-center flex-1"
            >
              <div
                className={`flex items-center justify-center rounded-full transition-all ${
                  completedSteps.includes(step.number)
                    ? 'w-10 h-10 sm:w-12 sm:h-12 shadow-lg shadow-purple-300 ring-2 ring-purple-300'
                    : currentStep === step.number
                    ? 'w-8 h-8 sm:w-10 sm:h-10 border-2 border-purple-500 shadow-md animate-pulse'
                    : 'w-8 h-8 sm:w-10 sm:h-10 bg-white border-2 border-slate-300'
                }`}
                style={{
                  background: completedSteps.includes(step.number)
                    ? PURPLE_PINK
                    : currentStep === step.number
                    ? PURPLE_PINK
                    : 'transparent'
                }}
              >
                {completedSteps.includes(step.number) ? (
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" strokeWidth={2.5} />
                ) : (
                  <span className={`text-xs sm:text-sm font-bold ${
                    currentStep === step.number ? 'text-white' : 'text-slate-400'
                  }`}>
                    {step.number}
                  </span>
                )}
              </div>
              <span className="text-[10px] sm:text-xs mt-1 sm:mt-2 text-center font-medium max-w-14 leading-tight text-slate-500">
                {step.label}
              </span>
            </motion.div>
            {index < displaySteps.length - 1 && (
              <div
                className="flex-1 h-1 mx-0.5 sm:mx-2 rounded transition-all"
                style={{
                  background: completedSteps.includes(step.number) ? PURPLE_PINK : '#e2e8f0'
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Progress Bar with Sparks */}
      <div className="relative">
        <div className="w-full bg-slate-200 rounded-full h-2 sm:h-3 overflow-visible">
          <motion.div
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: PURPLE_PINK }}
          />
          {isNearComplete && (
            <>
              {/* Glow Effect */}
              <motion.div
                className="absolute w-6 h-6 sm:w-8 sm:h-8 rounded-full blur-xl pointer-events-none"
                style={{
                  left: `${percentage}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'radial-gradient(circle, rgba(249,115,22,0.6) 0%, rgba(234,88,12,0.3) 100%)'
                }}
                animate={{
                  opacity: [0.8, 1, 0.8],
                  scale: [1, 1.2, 1]
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  repeatDelay: 0.5
                }}
              />
              {/* Sparks */}
              {[...Array(12)].map((_, i) => {
                const colors = ['#ff6b35', '#f97316', '#fbbf24', '#fcd34d'];
                const color = colors[i % colors.length];
                const radius = (i % 3) * 8 + 15;
                return (
                  <motion.div
                    key={`spark-${i}`}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: i % 3 === 0 ? '3px' : '2px',
                      height: i % 3 === 0 ? '3px' : '2px',
                      background: color,
                      boxShadow: `0 0 ${i % 3 === 0 ? '8px' : '4px'} ${color}`,
                      left: `${percentage}%`,
                      top: '50%',
                      transform: 'translateY(-50%)'
                    }}
                    animate={{
                      x: Math.cos((i / 12) * Math.PI * 2) * radius,
                      y: Math.sin((i / 12) * Math.PI * 2) * radius,
                      opacity: [1, 0.7, 0],
                      scale: [1, 0.6, 0]
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      repeatDelay: 0.5,
                      ease: 'easeOut'
                    }}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}