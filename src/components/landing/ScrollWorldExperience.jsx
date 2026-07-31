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
const SCROLL_CUES = [0, 0.18, 0.36, 0.54, 0.72, 0.87];

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
  const targetTimeRef = useRef(START_AT);
  const currentTimeRef = useRef(START_AT);
  const activeRef = useRef(0);
  const autoplayRef = useRef(false);
  const userInterruptedRef = useRef(false);
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
    const video = videoRef.current;
    if (!video || reduceMotion) return undefined;

    const controller = new AbortController();
    let objectUrl;
    setVideoReady(false);
    video.classList.remove('has-painted');

    fetch(source, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load the Sellio World film');
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        video.src = objectUrl;
        video.load();
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.warn(error);
      });

    return () => {
      controller.abort();
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reduceMotion, source]);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root) return undefined;

    let ticking = false;
    const measure = () => {
      const start = root.offsetTop;
      const distance = Math.max(1, root.offsetHeight - window.innerHeight);
      const nextProgress = clamp((window.scrollY - start) / distance);

      let nextActive = 0;
      for (let index = 1; index < SCROLL_CUES.length; index += 1) {
        if (nextProgress >= SCROLL_CUES[index]) nextActive = index;
        else break;
      }

      const scrollStart = SCROLL_CUES[nextActive];
      const scrollEnd = nextActive === SCENES.length - 1 ? 1 : SCROLL_CUES[nextActive + 1];
      const timeStart = SCENE_CUES[nextActive];
      const timeEnd = nextActive === SCENES.length - 1 ? FILM_DURATION : SCENE_CUES[nextActive + 1];
      const localProgress = clamp((nextProgress - scrollStart) / Math.max(0.001, scrollEnd - scrollStart));
      const timelineTime = timeStart + (timeEnd - timeStart) * localProgress;
      const availableDuration = video?.duration ? Math.max(0, video.duration - START_AT - 0.04) : FILM_DURATION;
      targetTimeRef.current = START_AT + (timelineTime / FILM_DURATION) * availableDuration;

      if (nextActive !== activeRef.current) {
        activeRef.current = nextActive;
        setActive(nextActive);
      }
      if (progressBarRef.current) progressBarRef.current.style.transform = 'scaleX(' + nextProgress + ')';
      hintRef.current?.classList.toggle('is-hidden', nextProgress > 0.08);
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(measure);
      }
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, [videoReady]);

  useEffect(() => {
    if (reduceMotion) return undefined;

    const scrollKeys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
    const interrupt = (event) => {
      if (event.type === 'keydown' && !scrollKeys.has(event.key)) return;
      userInterruptedRef.current = true;
      autoplayRef.current = false;
      videoRef.current?.pause();
    };

    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pointerdown', interrupt, { passive: true });
    window.addEventListener('keydown', interrupt);
    return () => {
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('touchstart', interrupt);
      window.removeEventListener('pointerdown', interrupt);
      window.removeEventListener('keydown', interrupt);
    };
  }, [reduceMotion]);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root || !video || !videoReady || reduceMotion || userInterruptedRef.current) return undefined;
    if (window.scrollY > root.offsetTop + 8) return undefined;

    let animationFrame;
    let cancelled = false;

    const timelineToScroll = (timelineTime) => {
      let index = 0;
      for (let cue = 1; cue < SCENE_CUES.length; cue += 1) {
        if (timelineTime >= SCENE_CUES[cue]) index = cue;
        else break;
      }
      const timeStart = SCENE_CUES[index];
      const timeEnd = index === SCENES.length - 1 ? FILM_DURATION : SCENE_CUES[index + 1];
      const scrollStart = SCROLL_CUES[index];
      const scrollEnd = index === SCENES.length - 1 ? 1 : SCROLL_CUES[index + 1];
      const local = clamp((timelineTime - timeStart) / Math.max(0.001, timeEnd - timeStart));
      return scrollStart + (scrollEnd - scrollStart) * local;
    };

    const advancePage = () => {
      if (cancelled || !autoplayRef.current) return;
      const availableDuration = Math.max(0.001, video.duration - START_AT - 0.04);
      const filmTime = clamp((video.currentTime - START_AT) / availableDuration) * FILM_DURATION;
      const scrollProgress = timelineToScroll(filmTime);
      const distance = Math.max(1, root.offsetHeight - window.innerHeight);

      currentTimeRef.current = video.currentTime;
      window.scrollTo(0, root.offsetTop + distance * scrollProgress);

      if (video.ended || video.currentTime >= video.duration - 0.06) {
        autoplayRef.current = false;
        video.pause();
        window.scrollTo(0, root.offsetTop + distance);
        return;
      }
      animationFrame = window.requestAnimationFrame(advancePage);
    };

    autoplayRef.current = true;
    video.currentTime = START_AT;
    video.play()
      .then(() => {
        if (cancelled || userInterruptedRef.current) {
          autoplayRef.current = false;
          video.pause();
          return;
        }
        video.classList.add('has-painted');
        animationFrame = window.requestAnimationFrame(advancePage);
      })
      .catch(() => {
        autoplayRef.current = false;
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [reduceMotion, videoReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduceMotion) return undefined;
    let animationFrame;

    const scrub = () => {
      if (autoplayRef.current) {
        currentTimeRef.current = video.currentTime;
        animationFrame = window.requestAnimationFrame(scrub);
        return;
      }

      const target = targetTimeRef.current;
      currentTimeRef.current += (target - currentTimeRef.current) * (mobile ? 0.28 : 0.2);

      // Let the decoder finish the current frame before requesting the latest one.
      if (videoReady && !video.seeking && Math.abs(video.currentTime - currentTimeRef.current) > (mobile ? 0.025 : 0.01)) {
        try {
          video.currentTime = currentTimeRef.current;
        } catch {
          // Keep the exact poster visible until the browser can seek.
        }
      }
      animationFrame = window.requestAnimationFrame(scrub);
    };

    animationFrame = window.requestAnimationFrame(scrub);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [mobile, reduceMotion, videoReady]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const video = videoRef.current;
    const prime = () => {
      if (!video) return;
      const promise = video.play();
      promise?.then(() => video.pause()).catch(() => {});
    };
    window.addEventListener('pointerdown', prime, { once: true, passive: true });
    window.addEventListener('touchstart', prime, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('touchstart', prime);
    };
  }, [reduceMotion]);

  const jumpTo = (index) => {
    const root = rootRef.current;
    if (!root) return;
    userInterruptedRef.current = true;
    autoplayRef.current = false;
    videoRef.current?.pause();
    const distance = Math.max(1, root.offsetHeight - window.innerHeight);
    const top = root.offsetTop + distance * SCROLL_CUES[index];
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <section
      id="world"
      ref={rootRef}
      className={'sl-scrollworld ' + (reduceMotion ? 'is-reduced' : '')}
      aria-label="Scroll through Sellio World"
      style={{ '--sl-sw-accent': scene.accent }}
    >
      {SCENES.map((item, index) => (
        <span
          key={item.id}
          id={item.id === 'world' ? undefined : item.id}
          className="sl-sw-anchor"
          style={{ top: SCROLL_CUES[index] * 100 + '%' }}
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
          />
          {!reduceMotion && (
            <video
              key={source}
              ref={videoRef}
              className={'sl-sw-video ' + (videoReady ? 'is-ready' : '')}
              muted
              playsInline
              preload="auto"
              poster={videoPoster}
              disablePictureInPicture
              onLoadedMetadata={() => {
                currentTimeRef.current = targetTimeRef.current;
                setVideoReady(true);
              }}
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
          <MousePointer2 aria-hidden="true" /><span>Scroll anytime to explore at your pace</span><ChevronDown aria-hidden="true" />
        </div>

        {!videoReady && !reduceMotion && <div className="sl-sw-loading">Preparing the world…</div>}
      </div>
    </section>
  );
}
