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
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-orange-400 fill-orange-400" />
          <h3 className="text-lg font-bold text-slate-900">Your Progress</h3>
        </div>
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
          {currentStep}/{totalSteps} Complete
        </div>
      </div>

      {/* Steps */}
      <div className="flex justify-between items-end gap-2 mb-6 overflow-x-auto pb-2">
        {steps.map((step) => (
          <div key={step.number} className="flex flex-col items-center gap-2 flex-shrink-0">
            <motion.div
              animate={{
                scale: currentStep === step.number ? 1.1 : 1,
                backgroundColor: currentStep >= step.number ? '#a855f7' : '#f3f4f6',
              }}
              transition={{ duration: 0.3 }}
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shadow-sm"
              style={{
                color: currentStep >= step.number ? 'white' : '#9ca3af',
              }}
            >
              {step.number}
            </motion.div>
            <p className="text-xs text-center font-medium text-slate-600 whitespace-pre-line leading-tight min-w-12">
              {step.label}
            </p>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 rounded-full h-2 mb-4 overflow-hidden">
        <motion.div
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-orange-500"
        />
      </div>

      {/* Percentage Text */}
      <p className="text-center font-bold text-lg bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
        {percentage}% Complete - You're doing great! 🎉
      </p>
    </div>
  );
}