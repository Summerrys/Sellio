import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Splash() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 100);
    const t2 = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => navigate('/Auth'), 600);
    }, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: '#ffffff',
        transition: 'opacity 0.6s ease',
        opacity: leaving ? 0 : 1,
      }}
    >
      {/* Ambient glow blobs */}
      <div
        className="absolute rounded-full blur-3xl pointer-events-none"
        style={{ width: 480, height: 480, top: '-80px', left: '-100px', background: 'radial-gradient(circle, rgba(254,120,36,0.08) 0%, transparent 70%)' }}
      />
      <div
        className="absolute rounded-full blur-3xl pointer-events-none"
        style={{ width: 400, height: 400, bottom: '-60px', right: '-80px', background: 'radial-gradient(circle, rgba(254,120,36,0.06) 0%, transparent 70%)' }}
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
          src="https://assets.apptelier.sg/sellio/Logo_Sellio.png"
          alt="Sellio"
          className="object-contain mb-10"
          style={{ height: 200 }}
        />

        {/* Tagline */}
        <div className="mb-12">
          <p className="text-3xl font-light text-slate-700 tracking-wide leading-snug mb-1">
            Your business,
          </p>
          <p
            className="text-3xl font-semibold tracking-wide leading-snug bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(90deg, #fb923c, #e0449a, #8b2fc9)' }}
          >
            beautifully online.
          </p>
        </div>

        {/* Branded bouncing dots */}
        <style>{`
          @keyframes sellio-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-8px)} }
          .splash-dot-1{animation:sellio-bounce 1.2s ease-in-out infinite 0ms;background:#fb923c}
          .splash-dot-2{animation:sellio-bounce 1.2s ease-in-out infinite 200ms;background:#e0449a}
          .splash-dot-3{animation:sellio-bounce 1.2s ease-in-out infinite 400ms;background:#8b2fc9}
        `}</style>
        <div className="flex gap-2">
          <span className="splash-dot-1" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
          <span className="splash-dot-2" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
          <span className="splash-dot-3" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
        </div>
      </div>
    </div>
  );
}