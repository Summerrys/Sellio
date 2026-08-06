import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, MousePointer2, Sparkles } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import './scroll-world.css';

// Public Supabase URLs can replace these fallbacks without changing the player.
const DESKTOP_VIDEO = import.meta.env.VITE_SELLIO_WORLD_DESKTOP_VIDEO || '/assets/scroll-world/sellio-scroll-world-desktop-1080p30.mp4';
const MOBILE_VIDEO = import.meta.env.VITE_SELLIO_WORLD_MOBILE_VIDEO || '/assets/scroll-world/sellio-scroll-world-mobile-1080p30.mp4';
const DESKTOP_POSTER = '/assets/scroll-world/sellio-scroll-world-desktop-1080p30-poster.webp';
const MOBILE_POSTER = '/assets/scroll-world/sellio-scroll-world-mobile-1080p30-poster.webp';
const START_AT = 0;
const FILM_DURATION = 43.266667;
const SCENE_CUES = [0, 8.083334, 16.166668, 24.250002, 32.333336, 40.41667];

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
    eyebrow: 'From first tap to fulfilment',
    title: 'Every order follows one clear path.',
    body: 'Follow the customer journey from storefront discovery through ordering, preparation and merchant insight—all connected inside Sellio.',
    tags: ['Customer ordering', 'Live fulfilment', 'Merchant insight'],
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
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const progressBarRef = useRef(null);
  const hintRef = useRef(null);
  const activeRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px), (hover: none) and (pointer: coarse)').matches);

  const scene = SCENES[active];
  const source = mobile ? MOBILE_VIDEO : DESKTOP_VIDEO;
  const scenePoster = useMemo(
    () => '/assets/scroll-world/' + (mobile ? 'mobile/' : 'desktop/') + scene.poster,
    [mobile, scene.poster],
  );
  const videoPoster = mobile ? MOBILE_POSTER : DESKTOP_POSTER;

  useEffect(() => {
    const query = window.matchMedia('(max-width: 860px), (hover: none) and (pointer: coarse)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    setVideoReady(false);
    videoRef.current?.classList.remove('has-painted');
  }, [source]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady || reduceMotion || video.readyState < 1) return undefined;

    let animationFrame;
    let cancelled = false;

    const syncPlayback = () => {
      if (cancelled) return;
      const availableDuration = Math.max(0.001, video.duration - START_AT - 0.04);
      const progress = clamp((video.currentTime - START_AT) / availableDuration);
      const filmTime = progress * FILM_DURATION;

      let nextActive = 0;
      for (let index = 1; index < SCENE_CUES.length; index += 1) {
        if (filmTime >= SCENE_CUES[index]) nextActive = index;
        else break;
      }
      if (nextActive !== activeRef.current) {
        activeRef.current = nextActive;
        setActive(nextActive);
      }
      if (progressBarRef.current) progressBarRef.current.style.transform = 'scaleX(' + progress + ')';
      hintRef.current?.classList.toggle('is-hidden', progress > 0.08);

      if (!video.ended) animationFrame = window.requestAnimationFrame(syncPlayback);
    };

    video.currentTime = START_AT;
    video.play()
      .then(() => video.classList.add('has-painted'))
      .catch(() => {});
    animationFrame = window.requestAnimationFrame(syncPlayback);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [reduceMotion, videoReady]);

  useEffect(() => {
    if (!videoReady || reduceMotion) return undefined;
    const seekFromHash = () => {
      if (!window.location.hash.startsWith('#film-')) return;
      const sceneId = window.location.hash.replace('#film-', '');
      const index = SCENES.findIndex((item) => item.id === sceneId);
      const video = videoRef.current;
      if (index < 0 || !video) return;
      const availableDuration = Math.max(0.001, video.duration - START_AT - 0.04);
      video.currentTime = START_AT + (SCENE_CUES[index] / FILM_DURATION) * availableDuration;
      video.play().then(() => video.classList.add('has-painted')).catch(() => {});
    };
    seekFromHash();
    window.addEventListener('hashchange', seekFromHash);
    return () => window.removeEventListener('hashchange', seekFromHash);
  }, [reduceMotion, videoReady]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const ensurePlaying = () => {
      const video = videoRef.current;
      if (!video || !video.paused || video.ended) return;
      video.play().then(() => video.classList.add('has-painted')).catch(() => {});
    };
    window.addEventListener('pointerdown', ensurePlaying, { once: true, passive: true });
    window.addEventListener('touchstart', ensurePlaying, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', ensurePlaying);
      window.removeEventListener('touchstart', ensurePlaying);
    };
  }, [reduceMotion]);

  const jumpTo = (index) => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root) return;
    root.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (!video || !videoReady) return;
    const availableDuration = Math.max(0.001, video.duration - START_AT - 0.04);
    video.currentTime = START_AT + (SCENE_CUES[index] / FILM_DURATION) * availableDuration;
    video.play().then(() => video.classList.add('has-painted')).catch(() => {});
  };

  return (
    <section
      id="sellio-film"
      ref={rootRef}
      className={'sl-scrollworld ' + (reduceMotion ? 'is-reduced' : '')}
      aria-label="Sellio World cinematic experience"
      style={{ '--sl-sw-accent': scene.accent }}
    >
      {SCENES.map((item) => (
        <span
          key={item.id}
          id={`film-${item.id}`}
          className="sl-sw-anchor"
          style={{ top: 0 }}
          aria-hidden="true"
        />
      ))}

      <div className="sl-sw-sticky">
        <div className="sl-sw-media" aria-hidden="true">
          <img
            key={scenePoster}
            className="sl-sw-poster"
            src={scenePoster}
            alt=""
            loading="eager"
            decoding="sync"
            fetchPriority="high"
          />
          {!reduceMotion && (
            <video
              key={source}
              ref={videoRef}
              className={'sl-sw-video ' + (videoReady ? 'is-ready' : '')}
              src={source}
              muted
              autoPlay
              playsInline
              preload="auto"
              poster={videoPoster}
              disablePictureInPicture
              onLoadedMetadata={() => setVideoReady(true)}
              onLoadedData={(event) => event.currentTarget.classList.add('has-painted')}
              onSeeked={(event) => event.currentTarget.classList.add('has-painted')}
            />
          )}
          <div className="sl-sw-scrim" />
          <div className="sl-sw-grain" />
        </div>

        <div className="sl-sw-progress" aria-hidden="true"><i ref={progressBarRef} /></div>

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
              onClick={() => jumpTo(index)}
              aria-label={'Go to ' + item.nav}
              aria-current={index === active ? 'step' : undefined}
            >
              <i /><span>{item.nav}</span>
            </button>
          ))}
        </nav>

        <div ref={hintRef} className="sl-sw-hint">
          <MousePointer2 aria-hidden="true" /><span>Scroll down anytime to explore more</span><ChevronDown aria-hidden="true" />
        </div>

      </div>
    </section>
  );
}
