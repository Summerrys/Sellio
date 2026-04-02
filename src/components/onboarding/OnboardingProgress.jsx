import React from 'react';
import { CheckCircle2, Rocket } from 'lucide-react';
import { motion } from 'framer-motion';

const FALLBACK_PRIMARY = '#9333ea';
const FALLBACK_SECONDARY = '#ec4899';

const PURPLE_PINK = `linear-gradient(to right, #9333ea, #ec4899)`;

export default function OnboardingProgress({ currentStep = 1, completedSteps = [], steps = [] }) {
  const displaySteps = steps.length > 0 ? steps.map((s, i) => ({
    number: i + 1,
    label: s.title.replace(/ /g, '\n'),
  })) : [];
  
  const percentage = displaySteps.length > 0 ? Math.round((currentStep / displaySteps.length) * 100) : 0;

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
              <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 sm:border-3 shadow-md transition-all ${
                completedSteps.includes(step.number)
                  ? 'border-purple-500'
                  : currentStep === step.number
                  ? 'border-purple-500 animate-pulse'
                  : 'bg-white border-slate-300'
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
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                ) : (
                  <span className={`text-xs sm:text-sm font-bold ${
                    currentStep === step.number ? 'text-white' : 'text-slate-400'
                  }`}>
                    {step.number}
                  </span>
                )}
              </div>
              <span className={`text-[10px] sm:text-xs mt-1 sm:mt-2 text-center font-medium max-w-14 leading-tight ${
                currentStep === step.number ? 'text-slate-500' : 'text-slate-500'
              }`}>
                {step.label}
              </span>
            </motion.div>
            {index < displaySteps.length - 1 && (
              <div className={`flex-1 h-1 mx-0.5 sm:mx-2 rounded transition-all ${
                completedSteps.includes(step.number)
                  ? ''
                  : 'bg-slate-200'
              }`}
              style={{
                background: completedSteps.includes(step.number) ? PURPLE_PINK : 'transparent'
              }} />
            )}
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="relative">
        <div className="w-full bg-slate-200 rounded-full h-2 sm:h-3 overflow-hidden">
          <motion.div
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{
              background: PURPLE_PINK
            }}
          />
        </div>
      </div>
    </div>
  );
}