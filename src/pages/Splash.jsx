import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Splash() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Fade in
    setTimeout(() => setVisible(true), 100);

    // After 4s, fade out then navigate
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => navigate('/Auth'), 600);
    }, 4000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #fff5ee 0%, #ffffff 50%, #fef0eb 100%)',
        transition: 'opacity 0.6s ease',
        opacity: fadeOut ? 0 : visible ? 1 : 0,
      }}
    >
      <div
        style={{
          transform: visible && !fadeOut ? 'translateY(0)' : 'translateY(16px)',
          transition: 'transform 0.7s ease, opacity 0.7s ease',
          opacity: visible && !fadeOut ? 1 : 0,
        }}
        className="flex flex-col items-center gap-6"
      >
        <img
          src="https://cart.apptelier.sg/wp-content/uploads/2026/04/Logo_Sellio.png"
          alt="Sellio"
          className="h-36 w-auto object-contain"
        />
        <div className="text-center space-y-1">
          <p className="text-2xl font-semibold text-slate-800 tracking-tight">Your business,</p>
          <p
            className="text-2xl font-semibold tracking-tight bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(90deg, #e86a1a, #fe7824, #ffaa6e)' }}
          >
            beautifully online.
          </p>
        </div>
      </div>
    </div>
  );
}