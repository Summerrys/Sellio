import React from 'react';
import { Check } from 'lucide-react';
import { useAppText } from '@/lib/appText';

// Where they are in signing up (Alvin, 17 Nov 2026), under the awning: 1 Verify email (Check
// your email), 2 Your details (Set up your account), 3 Get started (the account page, on the
// first visit). Done steps get a green tick; the current one is orange. Styles: index.css
// (.signup-steps).
export default function SignUpSteps({ step }) {
  const { t } = useAppText();
  const labels = [t('Verify email'), t('Your details'), t('Get started')];
  return (
    <ol className="signup-steps" aria-label={t('Step {step} of 3', { step })} data-testid="signup-steps">
      {labels.map((label, index) => {
        const number = index + 1;
        const state = number < step ? 'done' : number === step ? 'on' : undefined;
        return (
          <li key={number} className={state} aria-current={number === step ? 'step' : undefined}>
            <span className="signup-steps-dot">{number < step ? <Check aria-hidden="true" /> : number}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
