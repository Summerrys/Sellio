import React from 'react';
import { Star } from 'lucide-react';
import { motion } from 'framer-motion';

const steps = [
  { number: 1, label: 'Business\nSetup' },
  { number: 2, label: 'Branch\nSetup' },
  { number: 3, label: 'Menu/\nServices' },
  { number: 4, label: 'Tables\n& QR' },
  { number: 5, label: 'Review\n& Go Live' },
];

export default function OnboardingProgress({ currentStep = 1 }) {
  const totalSteps = steps.length;
  const percentage = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="w-full">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1">
          <Star className="w-4 h-4 text-orange-400 fill-orange-400 flex-shrink-0" />
          <h3 className="text-sm font-bold text-slate-900">Progress</h3>
        </div>
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0">
          {currentStep}/{totalSteps}
        </div>
      </div>

      {/* Compact Steps */}
      <div className="flex justify-between items-end gap-1 mb-2 overflow-x-auto pb-1">
        {steps.map((step) => (
          <div key={step.number} className="flex flex-col items-center gap-0.5 flex-shrink-0">
            <motion.div
              animate={{
                scale: currentStep === step.number ? 1.05 : 1,
                backgroundColor: currentStep >= step.number ? '#a855f7' : '#f3f4f6',
              }}
              transition={{ duration: 0.3 }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
              style={{
                color: currentStep >= step.number ? 'white' : '#9ca3af',
              }}
            >
              {step.number}
            </motion.div>
            <p className="text-[10px] sm:text-xs text-center font-medium text-slate-600 leading-tight max-w-14 whitespace-pre-line">
              {step.label}
            </p>
          </div>
        ))}
      </div>

      {/* Compact Progress Bar */}
      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
        <motion.div
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-orange-500"
        />
      </div>
    </div>
  );
}