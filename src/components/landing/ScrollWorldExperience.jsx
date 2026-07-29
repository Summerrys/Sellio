import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import './scroll-world.css';

const DESKTOP_VIDEO = '/assets/scroll-world/sellio-scroll-world-desktop-480.mp4';
const MOBILE_VIDEO = '/assets/scroll-world/sellio-scroll-world-mobile-480.mp4';
const START_AT = 1.6;

const SCENES = [
  {
    id: 'world',
    nav: 'Sellio World',
    eyebrow: 'A connected commerce world',
    title: 'Commerce has a place to grow.',
    body: 'Enter a living marketplace where F&B, Retail and Services merchants each have a district, a storefront and room to grow.',
    tags: ['F&B district', 'Retail district', 'Services district'],
    poster: '01-world.jpg',
    accent: '#e0449a',
    primary: { label: 'Start your 3-day free trial', href: '#pricing' },
    secondary: { label: 'Explore Cafetelier', href: '/store/cafetelier?preview=true', external: true },
  },
  {
    id: 'storefront',
    nav: 'Storefront',
    eyebrow: 'A merchant-owned place',
    title: 'Every business gets a place of its own.',
    body: 'Move from district discovery into a recognisable storefront where every merchant keeps its own brand, products and customer journey.',
    tags: ['Branded identity', 'Product discovery', 'Direct ordering'],
    poster: '02-storefront.jpg',
    accent: '#fb923c',
  },
  {
    id: 'journey',
    nav: 'Order journey',
    eyebrow: 'From browse to fulfilment',
    title: 'Every order, clearly organised.',
    body: 'Customer ordering, preparation, stock and performance connect as one physical flow—without losing track during a busy service.',
    tags: ['Live orders', 'Kitchen flow', 'Connected inventory'],
    poster: '03-journey.jpg',
    accent: '#a855f7',
  },
  {
    id: 'product',
    nav: 'Workspace',
    eyebrow: 'One connected workspace',
    title: 'Everything your team needs, flowing together.',
    body: 'Storefront, orders, inventory, analytics and Sellio AI work as one environment, giving merchants clarity without a flat dashboard experience.',
    tags: ['Storefront', 'Operations', 'Analytics + AI'],
    poster: '04-workspace.jpg',
    accent: '#14b8a6',
  },
  {
    id: 'vision',
    nav: 'Progression',
    eyebrow: 'Merchant progression',
    title: 'Grow your presence. Make it yours.',
    body: 'Earn Sellio Coins, unlock seasonal décor and customise your storefront while the marketplace keeps commerce simple and intuitive.',
    tags: ['Sellio Coins', 'Seasonal décor', 'Merchant expression'],
    poster: '05-progression.jpg',
    accent: '#f59e0b',
  },
  {
    id: 'ready',
    nav: 'Get started',
    eyebrow: 'Ready when you are',
    title: 'Open your storefront. Take your place in the world.',
    body: 'Launch your Sellio storefront, join the right merchant district and start growing in the connected marketplace from day one.',
    tags: ['Three-day free trial', 'Set up at your pace', 'Sellio World access'],
    poster: '06-ready.jpg',
    accent: '#ec4899',
    primary: { label: 'View plans', href: '#pricing' },
    secondary: { label: 'Merchant login', href: '/Auth' },
  },
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function SceneCta({ cta, secondary = false }) {
  if (!cta) return null;
  const props = cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <a className={secondary ? 'sl-sw-button sl-sw-button--ghost' : 'sl-sw-button'} href={cta.href} {...props}>
      {cta.label} <ArrowRight aria-hidden="true" />
    </a>
  );
}

export default function ScrollWorldExperience() {
  const videoRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [hasPainted, setHasPainted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px), (hover: none) and (pointer: coarse)').matches);

  const scene = SCENES[active];
  const source = mobile ? MOBILE_VIDEO : DESKTOP_VIDEO;
  const poster = useMemo(
    () => '/assets/scroll-world/posters/' + (mobile ? 'mobile/' : 'desktop/') + scene.poster,
    [mobile, scene.poster],
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 860px), (hover: none) and (pointer: coarse)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const syncTimeline = useCallback((video) => {
    if (!video?.duration) return;
    const span = Math.max(0.1, video.duration - START_AT);
    const nextProgress = clamp((video.currentTime - START_AT) / span);
    const nextActive = Math.min(SCENES.length - 1, Math.floor(nextProgress * SCENES.length));
    setProgress(nextProgress);
    setActive(nextActive);
  }, []);

  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || reduceMotion) return;
    const promise = video.play();
    promise?.catch(() => setPlaying(false));
  }, [reduceMotion]);

  const seekTo = useCallback((index) => {
    const video = videoRef.current;
    if (!video?.duration || reduceMotion) {
      setActive(index);
      return;
    }
    const span = Math.max(0.1, video.duration - START_AT);
    video.currentTime = START_AT + span * (index / SCENES.length) + 0.04;
    syncTimeline(video);
    playVideo();
  }, [playVideo, reduceMotion, syncTimeline]);

  useEffect(() => {
    const handleHash = () => {
      const id = window.location.hash.replace('#', '');
      const index = SCENES.findIndex((item) => item.id === id);
      if (index >= 0) seekTo(index);
    };
    window.addEventListener('hashchange', handleHash);
    handleHash();
    return () => window.removeEventListener('hashchange', handleHash);
  }, [seekTo]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) playVideo();
    else video.pause();
  };

  const restart = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = START_AT;
    setActive(0);
    setProgress(0);
    playVideo();
  };

  return (
    <section
      id="world"
      className={'sl-scrollworld sl-scrollworld--autoplay ' + (reduceMotion ? 'is-reduced' : '')}
      aria-label="Sellio World cinematic journey"
      style={{ '--sl-sw-accent': scene.accent }}
    >
      {SCENES.slice(1).map((item) => <span key={item.id} id={item.id} className="sl-sw-anchor" aria-hidden="true" />)}

      <div className="sl-sw-sticky">
        <div className="sl-sw-media" aria-hidden="true">
          <img key={poster} className="sl-sw-poster" src={poster} alt="" />
          {!reduceMotion && (
            <video
              key={source}
              ref={videoRef}
              src={source}
              className={'sl-sw-video ' + (videoReady ? 'is-ready ' : '') + (hasPainted ? 'has-painted' : '')}
              muted
              autoPlay
              playsInline
              preload="auto"
              poster={poster}
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = START_AT;
                setActive(0);
                setProgress(0);
              }}
              onCanPlay={(event) => {
                setVideoReady(true);
                const promise = event.currentTarget.play();
                promise?.catch(() => setPlaying(false));
              }}
              onPlaying={() => {
                setPlaying(true);
                setHasPainted(true);
              }}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                if (video.duration && video.currentTime >= video.duration - 0.12) {
                  video.currentTime = START_AT;
                  setActive(0);
                  setProgress(0);
                  playVideo();
                  return;
                }
                syncTimeline(video);
              }}
              onEnded={restart}
            />
          )}
          <div className="sl-sw-scrim" />
          <div className="sl-sw-grain" />
        </div>

        <div className="sl-sw-progress" aria-hidden="true"><i style={{ transform: 'scaleX(' + progress + ')' }} /></div>

        <div className="sl-sw-copy-layer">
          {SCENES.map((item, index) => {
            const Heading = index === 0 ? 'h1' : 'h2';
            return (
              <article key={item.id} className={'sl-sw-copy ' + (index === active ? 'is-active' : '')} aria-hidden={index !== active}>
                <span className="sl-sw-count">{String(index + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}</span>
                <span className="sl-sw-eyebrow"><Sparkles aria-hidden="true" /> {item.eyebrow}</span>
                <Heading>{item.title}</Heading>
                <p>{item.body}</p>
                <ul>{item.tags.map((tag) => <li key={tag}><Check aria-hidden="true" /> {tag}</li>)}</ul>
                {(item.primary || item.secondary) && (
                  <div className="sl-sw-actions">
                    <SceneCta cta={item.primary} />
                    <SceneCta cta={item.secondary} secondary />
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <nav className="sl-sw-route" aria-label="Sellio World chapters">
          {SCENES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={index === active ? 'is-active' : ''}
              onClick={() => seekTo(index)}
              aria-label={'Play ' + item.nav}
              aria-current={index === active ? 'step' : undefined}
            >
              <i /><span>{item.nav}</span>
            </button>
          ))}
        </nav>

        {!reduceMotion && (
          <div className="sl-sw-controls" aria-label="Cinematic playback controls">
            <button type="button" onClick={togglePlayback} aria-label={playing ? 'Pause Sellio World' : 'Play Sellio World'}>
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              <span>{playing ? 'Pause' : 'Play'}</span>
            </button>
            <button type="button" onClick={restart} aria-label="Replay Sellio World">
              <RotateCcw aria-hidden="true" /><span>Replay</span>
            </button>
          </div>
        )}

        {!videoReady && !reduceMotion && <div className="sl-sw-loading">Preparing Sellio World…</div>}
      </div>
    </section>
  );
}
