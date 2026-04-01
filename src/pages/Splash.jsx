import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Splash() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Fade in
    const t1 = setTimeout(() => setVisible(true), 100);
    // Auto-navigate after 3.5s
    const t2 = setTimeout(() => handleEnter(), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleEnter = () => {
    setLeaving(true);
    setTimeout(() => navigate('/Auth'), 600);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 20% 30%, #1a0a00 0%, #0d0500 40%, #000000 100%)',
        transition: 'opacity 0.6s ease',
        opacity: leaving ? 0 : 1,
      }}
    >
      {/* Ambient glow blobs */}
      <div
        className="absolute rounded-full blur-3xl pointer-events-none"
        style={{
          width: 480,
          height: 480,
          top: '-80px',
          left: '-100px',
          background: 'radial-gradient(circle, rgba(254,120,36,0.18) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute rounded-full blur-3xl pointer-events-none"
        style={{
          width: 400,
          height: 400,
          bottom: '-60px',
          right: '-80px',
          background: 'radial-gradient(circle, rgba(254,120,36,0.12) 0%, transparent 70%)',
        }}
      />

      {/* Fine grain overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />

      {/* Content */}
      <div
        className="flex flex-col items-center text-center px-8 z-10"
        style={{
          transition: 'opacity 0.8s ease, transform 0.8s ease',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(24px)',
        }}
      >
        {/* Logo */}
        <img
          src="https://cart.apptelier.sg/wp-content/uploads/2026/04/Logo_Sellio.png"
          alt="Sellio"
          className="object-contain mb-10"
          style={{ height: 120, filter: 'brightness(1.05)' }}
        />

        {/* Tagline */}
        <div className="mb-12">
          <p className="text-3xl font-light text-white/80 tracking-wide leading-snug mb-1">
            Your business,
          </p>
          <p
            className="text-3xl font-semibold tracking-wide leading-snug bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(90deg, #fb923c, #e0449a, #8b2fc9)' }}
          >
            beautifully online.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={handleEnter}
          className="px-10 py-3.5 rounded-2xl text-white font-semibold text-sm tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg"
          style={{
            background: 'linear-gradient(90deg, #e86a1a, #fe7824, #ffaa6e)',
            boxShadow: '0 8px 32px rgba(254,120,36,0.35)',
          }}
        >
          Get Started
        </button>

        {/* Subtle dots indicator */}
        <div className="flex gap-1.5 mt-10 opacity-30">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '0s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '0.2s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
}