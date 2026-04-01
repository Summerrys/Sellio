import React from 'react';
import { CheckCircle2, Rocket } from 'lucide-react';
import { motion } from 'framer-motion';

const steps = [
  { number: 1, label: 'Business\nSetup' },
  { number: 2, label: 'Branch\nSetup' },
  { number: 3, label: 'Menu/\nServices' },
  { number: 4, label: 'Tables\n& QR' },
  { number: 5, label: 'Review\n& Go Live' },
];

export default function OnboardingProgress({ currentStep = 1, completedSteps = [] }) {
  const totalSteps = steps.length;
  const percentage = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
          <h3 className="text-sm sm:text-base font-bold text-slate-900">Your Progress</h3>
        </div>
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-2 sm:px-3 py-1 rounded-full text-xs font-semibold">
          {completedSteps.length} / {totalSteps} Complete
        </div>
      </div>

      {/* Step Indicators */}
      <div className="flex justify-between mb-4 gap-1">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="flex flex-col items-center flex-1"
            >
              <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 sm:border-3 shadow-md transition-all ${
                completedSteps.includes(step.number)
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500 border-green-500 scale-110'
                  : currentStep === step.number
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 border-purple-500 animate-pulse'
                  : 'bg-white border-slate-300'
              }`}>
                {completedSteps.includes(step.number) ? (
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                ) : (
                  <span className={`text-xs sm:text-sm font-bold ${
                    currentStep === step.number ? 'text-white' : 'text-slate-400'
                  }`}>
                    {step.number}
                  </span>
                )}
              </div>
              <span className={`text-[10px] sm:text-xs mt-1 sm:mt-2 text-center font-medium max-w-14 leading-tight ${
                currentStep === step.number ? 'text-purple-600' : 'text-slate-500'
              }`}>
                {step.label}
              </span>
            </motion.div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-1 mx-0.5 sm:mx-2 rounded transition-all ${
                completedSteps.includes(step.number)
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                  : 'bg-slate-200'
              }`} />
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
            className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"
          />
        </div>
      </div>
    </div>
  );
}