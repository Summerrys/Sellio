import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, MousePointer2, Sparkles } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import './scroll-world.css';

const DESKTOP_VIDEO = '/assets/scroll-world/sellio-scroll-world-desktop-480.mp4';
const MOBILE_VIDEO = '/assets/scroll-world/sellio-scroll-world-mobile-480.mp4';

const SCENES = [
  {
    id: 'world',
    nav: 'Sellio World',
    eyebrow: 'A connected commerce world',
    title: 'Commerce has a place to grow.',
    body: 'Begin in the active F&B district, with Retail and Services already built into the geography for every merchant who joins next.',
    tags: ['F&B active', 'Retail expansion', 'Services expansion'],
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
    body: 'Move from district discovery into a recognisable storefront where each merchant keeps its own brand, products and customer journey.',
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
    body: 'Earn restrained cosmetic rewards and seasonal decorations that give storefronts personality while keeping commerce intuitive.',
    tags: ['Sellio Coins', 'Seasonal décor', 'Merchant expression'],
    poster: '05-progression.jpg',
    accent: '#f59e0b',
  },
  {
    id: 'ready',
    nav: 'Get started',
    eyebrow: 'Ready when you are',
    title: 'Open your storefront. Take your place in the world.',
    body: 'Start with Sellio’s F&B platform today, then grow into the connected marketplace as the world expands.',
    tags: ['Three-day free trial', 'Set up at your pace', 'Built to grow'],
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
  const targetTimeRef = useRef(0);
  const currentTimeRef = useRef(0);
  const activeRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px), (hover: none) and (pointer: coarse)').matches);

  const scene = SCENES[active];
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduceMotion) return undefined;

    const controller = new AbortController();
    let objectUrl;
    setVideoReady(false);
    const source = mobile ? MOBILE_VIDEO : DESKTOP_VIDEO;

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
  }, [mobile, reduceMotion]);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root) return undefined;

    let ticking = false;
    const measure = () => {
      const stickyTop = window.innerWidth <= 760 ? 72 : 86;
      const start = root.offsetTop - stickyTop;
      const distance = Math.max(1, root.offsetHeight - window.innerHeight + stickyTop);
      const nextProgress = clamp((window.scrollY - start) / distance);
      const nextActive = Math.min(SCENES.length - 1, Math.floor(nextProgress * SCENES.length));

      targetTimeRef.current = video?.duration ? nextProgress * Math.max(0, video.duration - 0.04) : 0;
      if (nextActive !== activeRef.current) {
        activeRef.current = nextActive;
        setActive(nextActive);
      }
      setProgress(nextProgress);
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
    const video = videoRef.current;
    if (!video || reduceMotion) return undefined;
    let frame;

    const scrub = () => {
      const target = targetTimeRef.current;
      currentTimeRef.current += (target - currentTimeRef.current) * (mobile ? 0.28 : 0.2);
      if (videoReady && !video.seeking && Math.abs(video.currentTime - currentTimeRef.current) > (mobile ? 0.025 : 0.01)) {
        try {
          video.currentTime = currentTimeRef.current;
        } catch {
          // The poster remains visible until the browser can seek.
        }
      }
      frame = window.requestAnimationFrame(scrub);
    };
    frame = window.requestAnimationFrame(scrub);
    return () => window.cancelAnimationFrame(frame);
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
    const stickyTop = window.innerWidth <= 760 ? 72 : 86;
    const distance = root.offsetHeight - window.innerHeight + stickyTop;
    const top = root.offsetTop - stickyTop + distance * ((index + 0.15) / SCENES.length);
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
          style={{ top: (index / SCENES.length) * 100 + '%' }}
          aria-hidden="true"
        />
      ))}

      <div className="sl-sw-sticky">
        <div className="sl-sw-media" aria-hidden="true">
          <img key={poster} className="sl-sw-poster" src={poster} alt="" />
          {!reduceMotion && (
            <video
              ref={videoRef}
              className={'sl-sw-video ' + (videoReady ? 'is-ready' : '')}
              muted
              playsInline
              preload="auto"
              poster={poster}
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
              onClick={() => jumpTo(index)}
              aria-label={'Go to ' + item.nav}
              aria-current={index === active ? 'step' : undefined}
            >
              <i /><span>{item.nav}</span>
            </button>
          ))}
        </nav>

        <div className={'sl-sw-hint ' + (progress > 0.04 ? 'is-hidden' : '')}>
          <MousePointer2 aria-hidden="true" /><span>Scroll to enter Sellio World</span><ChevronDown aria-hidden="true" />
        </div>

        {!videoReady && !reduceMotion && <div className="sl-sw-loading">Preparing the world…</div>}
      </div>
    </section>
  );
}
