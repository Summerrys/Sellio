import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import React, { useRef, useState, useEffect, useMemo } from "react";
import { renderToString } from "react-dom/server";
import { Sparkles, Check, MousePointer2, ChevronDown, ArrowRight, ShoppingBag, Utensils, BriefcaseBusiness, Compass, X, MapPin, MousePointerClick, ArrowLeft, Palette, Store, QrCode, Bell, Package, BarChart3, Users, ShieldCheck, BellRing, ChefHat, PackageCheck, HeartHandshake, Warehouse, Bot, ArrowUpRight, Map, Coins, MoveHorizontal, ArrowDown, Menu, ChevronRight, CircleDollarSign, Cookie } from "lucide-react";
import { useReducedMotion, AnimatePresence, motion } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
const SELLIO_ASSET_ROOT = "https://assets.apptelier.sg/sellio/landing".replace(/\/$/, "");
const desktopImageRoot = "/assets/immersive-16x9";
const mobileImageRoot = `${SELLIO_ASSET_ROOT}/images/mobile`;
const posterRoot = `${SELLIO_ASSET_ROOT}/images/posters`;
const videoRoot = `${SELLIO_ASSET_ROOT}/video/masters`;
const SELLIO_IMMERSIVE_ASSETS = {
  world: `${desktopImageRoot}/01-sellio-world.jpg`,
  storefront: `${desktopImageRoot}/02-merchant-storefront.jpg`,
  journey: `${desktopImageRoot}/03-commerce-journey.jpg`,
  workspace: `${desktopImageRoot}/04-connected-workspace.jpg`,
  connected: `${desktopImageRoot}/05-connected-commerce.webp`,
  progression: `${desktopImageRoot}/06-coins-progression.jpg`
};
const SELLIO_IMMERSIVE_MOBILE_ASSETS = {
  world: `${mobileImageRoot}/01-sellio-world.jpg`,
  storefront: `${mobileImageRoot}/02-merchant-storefront.jpg`,
  journey: `${mobileImageRoot}/03-commerce-journey.jpg`,
  workspace: `${mobileImageRoot}/04-connected-workspace.jpg`,
  connected: `${mobileImageRoot}/05-connected-commerce.jpg`
};
const SELLIO_WORLD_MEDIA = {
  video: {
    desktop: `${videoRoot}/1080p-30fps/desktop/sellio-world.mp4`,
    mobile: `${videoRoot}/1080p-30fps/mobile/sellio-world.mp4`
  },
  poster: {
    desktop: `${posterRoot}/desktop/sellio-world.webp`,
    mobile: `${posterRoot}/mobile/sellio-world.webp`
  }
};
const DESKTOP_VIDEO = SELLIO_WORLD_MEDIA.video.desktop;
const MOBILE_VIDEO = SELLIO_WORLD_MEDIA.video.mobile;
const START_AT = 0;
const FILM_DURATION = 43.266667;
const SCENE_CUES = [0, 8.083334, 16.166668, 24.250002, 32.333336, 40.41667];
const SCENES = [
  {
    id: "world",
    nav: "Sellio World",
    eyebrow: "A connected commerce world",
    title: "Commerce has a place to grow.",
    body: "Enter a living marketplace where F&B, Retail and Services merchants each have a district, a storefront and room to grow.",
    tags: ["F&B district", "Retail district", "Services district"],
    poster: "01-world.jpg",
    accent: "#e0449a",
    primary: { label: "Start your 7-day free trial", href: "#pricing" },
    secondary: { label: "Explore Cafetelier", href: "/store/cafetelier?preview=true", external: true }
  },
  {
    id: "storefront",
    nav: "Storefront",
    eyebrow: "A merchant-owned place",
    title: "Every business gets a place of its own.",
    body: "Move from district discovery into a recognisable storefront where every merchant keeps its own brand, products and customer journey.",
    tags: ["Branded identity", "Product discovery", "Direct ordering"],
    poster: "02-storefront.jpg",
    accent: "#fb923c"
  },
  {
    id: "journey",
    nav: "Order journey",
    eyebrow: "From first tap to fulfilment",
    title: "Every order follows one clear path.",
    body: "Follow the customer journey from storefront discovery through ordering, preparation and merchant insight—all connected inside Sellio.",
    tags: ["Customer ordering", "Live fulfilment", "Merchant insight"],
    poster: "03-journey.jpg",
    accent: "#a855f7"
  },
  {
    id: "product",
    nav: "Workspace",
    eyebrow: "One connected workspace",
    title: "Everything your team needs, flowing together.",
    body: "Storefront, orders, inventory, analytics and Sellio AI work as one environment, giving merchants clarity without a flat dashboard experience.",
    tags: ["Storefront", "Operations", "Analytics + AI"],
    poster: "04-workspace.jpg",
    accent: "#14b8a6"
  },
  {
    id: "vision",
    nav: "Progression",
    eyebrow: "Merchant progression",
    title: "Grow your presence. Make it yours.",
    body: "Earn Sellio Coins, unlock seasonal décor and customise your storefront while the marketplace keeps commerce simple and intuitive.",
    tags: ["Sellio Coins", "Seasonal décor", "Merchant expression"],
    poster: "05-progression.jpg",
    accent: "#f59e0b"
  },
  {
    id: "ready",
    nav: "Get started",
    eyebrow: "Ready when you are",
    title: "Open your storefront. Take your place in the world.",
    body: "Launch your Sellio storefront, join the right merchant district and start growing in the connected marketplace from day one.",
    tags: ["Seven-day free trial", "Set up at your pace", "Sellio World access"],
    poster: "06-ready.jpg",
    accent: "#ec4899",
    primary: { label: "View plans", href: "#pricing" },
    secondary: { label: "Merchant login", href: "/auth" }
  }
];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
function SceneCta({ cta, secondary = false }) {
  if (!cta) return null;
  const props = cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return /* @__PURE__ */ jsxs("a", { className: secondary ? "sl-sw-button sl-sw-button--ghost" : "sl-sw-button", href: cta.href, ...props, children: [
    cta.label,
    " ",
    /* @__PURE__ */ jsx(ArrowRight, { "aria-hidden": "true" })
  ] });
}
function ScrollWorldExperience() {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const progressBarRef = useRef(null);
  const hintRef = useRef(null);
  const activeRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [readySource, setReadySource] = useState(null);
  const [mobile, setMobile] = useState(false);
  const scene = SCENES[active];
  const source = mobile ? MOBILE_VIDEO : DESKTOP_VIDEO;
  const scenePoster = mobile ? SELLIO_WORLD_MEDIA.poster.mobile : SELLIO_WORLD_MEDIA.poster.desktop;
  const videoReady = readySource === source;
  useEffect(() => {
    var _a;
    const query = window.matchMedia("(max-width: 860px), (hover: none) and (pointer: coarse)");
    const update = () => setMobile(query.matches);
    update();
    (_a = query.addEventListener) == null ? void 0 : _a.call(query, "change", update);
    return () => {
      var _a2;
      return (_a2 = query.removeEventListener) == null ? void 0 : _a2.call(query, "change", update);
    };
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady || reduceMotion || video.readyState < 1) return void 0;
    let animationFrame;
    let cancelled = false;
    const syncPlayback = () => {
      var _a;
      if (cancelled) return;
      const availableDuration = Math.max(1e-3, video.duration - START_AT - 0.04);
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
      if (progressBarRef.current) progressBarRef.current.style.transform = "scaleX(" + progress + ")";
      (_a = hintRef.current) == null ? void 0 : _a.classList.toggle("is-hidden", progress > 0.08);
    };
    const tick = () => {
      syncPlayback();
      if (!cancelled && !video.paused && !video.ended) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };
    const startSync = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(tick);
    };
    video.addEventListener("play", startSync);
    video.addEventListener("seeked", syncPlayback);
    video.addEventListener("timeupdate", syncPlayback);
    video.addEventListener("ended", syncPlayback);
    video.currentTime = START_AT;
    syncPlayback();
    video.play().then(() => video.classList.add("has-painted")).catch(() => {
    });
    startSync();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      video.removeEventListener("play", startSync);
      video.removeEventListener("seeked", syncPlayback);
      video.removeEventListener("timeupdate", syncPlayback);
      video.removeEventListener("ended", syncPlayback);
    };
  }, [reduceMotion, videoReady]);
  useEffect(() => {
    if (!videoReady || reduceMotion) return void 0;
    const seekFromHash = () => {
      var _a;
      if (!window.location.hash.startsWith("#film-")) return;
      const sceneId = window.location.hash.replace("#film-", "");
      const index = SCENES.findIndex((item) => item.id === sceneId);
      const video = videoRef.current;
      if (index < 0 || !video) return;
      activeRef.current = index;
      setActive(index);
      const availableDuration = Math.max(1e-3, video.duration - START_AT - 0.04);
      const progress = SCENE_CUES[index] / FILM_DURATION;
      if (progressBarRef.current) progressBarRef.current.style.transform = "scaleX(" + progress + ")";
      (_a = hintRef.current) == null ? void 0 : _a.classList.toggle("is-hidden", progress > 0.08);
      video.currentTime = START_AT + progress * availableDuration;
      video.play().then(() => video.classList.add("has-painted")).catch(() => {
      });
    };
    seekFromHash();
    window.addEventListener("hashchange", seekFromHash);
    return () => window.removeEventListener("hashchange", seekFromHash);
  }, [reduceMotion, videoReady]);
  useEffect(() => {
    if (reduceMotion) return void 0;
    const ensurePlaying = () => {
      const video = videoRef.current;
      if (!video || !video.paused || video.ended) return;
      video.play().then(() => video.classList.add("has-painted")).catch(() => {
      });
    };
    window.addEventListener("pointerdown", ensurePlaying, { once: true, passive: true });
    window.addEventListener("touchstart", ensurePlaying, { once: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", ensurePlaying);
      window.removeEventListener("touchstart", ensurePlaying);
    };
  }, [reduceMotion]);
  const jumpTo = (index) => {
    var _a;
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root) return;
    root.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    activeRef.current = index;
    setActive(index);
    const progress = SCENE_CUES[index] / FILM_DURATION;
    if (progressBarRef.current) progressBarRef.current.style.transform = "scaleX(" + progress + ")";
    (_a = hintRef.current) == null ? void 0 : _a.classList.toggle("is-hidden", progress > 0.08);
    if (!video || !videoReady) return;
    const availableDuration = Math.max(1e-3, video.duration - START_AT - 0.04);
    video.currentTime = START_AT + progress * availableDuration;
    video.play().then(() => video.classList.add("has-painted")).catch(() => {
    });
  };
  return /* @__PURE__ */ jsxs(
    "section",
    {
      id: "sellio-film",
      ref: rootRef,
      className: "sl-scrollworld " + (reduceMotion ? "is-reduced" : ""),
      "aria-label": "Sellio World cinematic experience",
      style: { "--sl-sw-accent": scene.accent },
      children: [
        SCENES.map((item) => /* @__PURE__ */ jsx(
          "span",
          {
            id: `film-${item.id}`,
            className: "sl-sw-anchor",
            style: { top: 0 },
            "aria-hidden": "true"
          },
          item.id
        )),
        /* @__PURE__ */ jsxs("div", { className: "sl-sw-sticky", children: [
          /* @__PURE__ */ jsxs("div", { className: "sl-sw-media", "aria-hidden": "true", children: [
            /* @__PURE__ */ jsx(
              "img",
              {
                className: "sl-sw-poster",
                src: scenePoster,
                alt: "",
                loading: "eager",
                decoding: "sync",
                fetchPriority: "high"
              },
              scenePoster
            ),
            !reduceMotion && /* @__PURE__ */ jsx(
              "video",
              {
                ref: videoRef,
                className: "sl-sw-video " + (videoReady ? "is-ready" : ""),
                src: source,
                muted: true,
                autoPlay: true,
                playsInline: true,
                preload: "auto",
                disablePictureInPicture: true,
                onLoadedMetadata: () => setReadySource(source),
                onLoadedData: (event) => event.currentTarget.classList.add("has-painted"),
                onSeeked: (event) => event.currentTarget.classList.add("has-painted")
              },
              source
            ),
            /* @__PURE__ */ jsx("div", { className: "sl-sw-scrim" }),
            /* @__PURE__ */ jsx("div", { className: "sl-sw-grain" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "sl-sw-progress", "aria-hidden": "true", children: /* @__PURE__ */ jsx("i", { ref: progressBarRef }) }),
          /* @__PURE__ */ jsx("div", { className: "sl-sw-copy-layer", children: SCENES.map((item, index) => {
            const Heading = index === 0 ? "h1" : "h2";
            return /* @__PURE__ */ jsxs("article", { className: "sl-sw-copy " + (index === active ? "is-active" : ""), "aria-hidden": index !== active, children: [
              /* @__PURE__ */ jsxs("span", { className: "sl-sw-count", children: [
                String(index + 1).padStart(2, "0"),
                " / ",
                String(SCENES.length).padStart(2, "0")
              ] }),
              /* @__PURE__ */ jsxs("span", { className: "sl-sw-eyebrow", children: [
                /* @__PURE__ */ jsx(Sparkles, { "aria-hidden": "true" }),
                " ",
                item.eyebrow
              ] }),
              /* @__PURE__ */ jsx(Heading, { children: item.title }),
              /* @__PURE__ */ jsx("p", { children: item.body }),
              /* @__PURE__ */ jsx("ul", { children: item.tags.map((tag) => /* @__PURE__ */ jsxs("li", { children: [
                /* @__PURE__ */ jsx(Check, { "aria-hidden": "true" }),
                " ",
                tag
              ] }, tag)) }),
              (item.primary || item.secondary) && /* @__PURE__ */ jsxs("div", { className: "sl-sw-actions", children: [
                /* @__PURE__ */ jsx(SceneCta, { cta: item.primary }),
                /* @__PURE__ */ jsx(SceneCta, { cta: item.secondary, secondary: true })
              ] })
            ] }, item.id);
          }) }),
          /* @__PURE__ */ jsx("nav", { className: "sl-sw-route", "aria-label": "Sellio World chapters", children: SCENES.map((item, index) => /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              className: index === active ? "is-active" : "",
              onClick: () => jumpTo(index),
              "aria-label": "Go to " + item.nav,
              "aria-current": index === active ? "step" : void 0,
              children: [
                /* @__PURE__ */ jsx("i", {}),
                /* @__PURE__ */ jsx("span", { children: item.nav })
              ]
            },
            item.id
          )) }),
          /* @__PURE__ */ jsxs("div", { ref: hintRef, className: "sl-sw-hint", children: [
            /* @__PURE__ */ jsx(MousePointer2, { "aria-hidden": "true" }),
            /* @__PURE__ */ jsx("span", { children: "Scroll down anytime to explore more" }),
            /* @__PURE__ */ jsx(ChevronDown, { "aria-hidden": "true" })
          ] })
        ] })
      ]
    }
  );
}
const SECTORS = [
  {
    key: "retail",
    name: "Retail Avenue",
    status: "Open for onboarding",
    Icon: ShoppingBag,
    detailX: "27%",
    detailY: "58%",
    summary: "Boutiques and product-led merchants receive a recognisable storefront along a dedicated retail route."
  },
  {
    key: "fnb",
    name: "F&B District",
    status: "Live district",
    Icon: Utensils,
    summary: "Restaurants, cafés, bakeries and beverage concepts live around shared discovery and ordering routes."
  },
  {
    key: "services",
    name: "Services Garden",
    status: "Open for onboarding",
    Icon: BriefcaseBusiness,
    detailX: "70%",
    detailY: "52%",
    summary: "Wellness, studios and professional services occupy a calmer appointment-led neighbourhood."
  }
];
function SellioWorld() {
  const [activeSector, setActiveSector] = useState(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const sector = useMemo(
    () => SECTORS.find((item) => item.key === activeSector) || null,
    [activeSector]
  );
  const selectSector = (key) => {
    if (key === "fnb") {
      enterStorefront();
      return;
    }
    setActiveSector(key);
    setStoreOpen(false);
  };
  const enterStorefront = () => {
    setActiveSector("fnb");
    setStoreOpen(true);
  };
  const returnToWorld = () => {
    setStoreOpen(false);
    setActiveSector(null);
  };
  return /* @__PURE__ */ jsx("section", { id: "world-experience", className: "sellio-section sl-imm-world sl-cinematic-world", "aria-labelledby": "sellio-world-heading", children: /* @__PURE__ */ jsx("div", { className: "sl-cinematic-world__stage", children: /* @__PURE__ */ jsx(AnimatePresence, { mode: "wait", children: !storeOpen ? /* @__PURE__ */ jsxs(
    motion.div,
    {
      className: "sl-world-stage sl-world-stage--map",
      initial: reduceMotion ? false : { opacity: 0 },
      animate: { opacity: 1 },
      exit: reduceMotion ? void 0 : { opacity: 0 },
      transition: { duration: 0.35 },
      children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "sl-pan-scroll sl-pan-scroll--world",
            tabIndex: "0",
            "aria-label": "Interactive Sellio World map. Select a destination.",
            children: /* @__PURE__ */ jsxs(
              "div",
              {
                className: `sl-imm-world-map sl-pan-canvas sl-pan-canvas--world ${sector ? "has-focus" : ""}`,
                children: [
                  /* @__PURE__ */ jsxs("picture", { className: "sl-responsive-art", children: [
                    /* @__PURE__ */ jsx("source", { media: "(max-width: 600px)", srcSet: SELLIO_IMMERSIVE_MOBILE_ASSETS.world }),
                    /* @__PURE__ */ jsx(
                      "img",
                      {
                        src: SELLIO_IMMERSIVE_ASSETS.world,
                        alt: "Sellio World, a bright connected marketplace with food and beverage, retail and services destinations",
                        loading: "lazy",
                        decoding: "async"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsx("div", { className: "sl-imm-world-vignette", "aria-hidden": "true" }),
                  /* @__PURE__ */ jsxs("header", { className: "sl-world-intro-overlay", children: [
                    /* @__PURE__ */ jsxs("span", { className: "sellio-eyebrow sellio-eyebrow--dark", children: [
                      /* @__PURE__ */ jsx(Compass, {}),
                      " Sellio World"
                    ] }),
                    /* @__PURE__ */ jsxs("h2", { id: "sellio-world-heading", children: [
                      "A world to explore.",
                      /* @__PURE__ */ jsx("br", {}),
                      "A storefront to enter."
                    ] }),
                    /* @__PURE__ */ jsx("p", { children: "Choose a destination, move through its district and enter a merchant-owned storefront." })
                  ] }),
                  SECTORS.map(({ key, name, Icon }) => /* @__PURE__ */ jsxs(
                    "button",
                    {
                      type: "button",
                      className: `sl-map-pin sl-map-pin--${key} ${key === "fnb" ? "sl-map-pin--featured" : ""} ${activeSector === key ? "is-active" : ""}`,
                      onClick: () => selectSector(key),
                      "aria-label": key === "fnb" ? "Enter Cafetelier, the featured storefront in F&B District" : `Explore ${name}`,
                      "aria-pressed": activeSector === key,
                      children: [
                        /* @__PURE__ */ jsx("i", { children: /* @__PURE__ */ jsx(Icon, { "aria-hidden": "true" }) }),
                        key === "fnb" ? /* @__PURE__ */ jsxs("span", { children: [
                          /* @__PURE__ */ jsx("strong", { children: "F&B District" }),
                          /* @__PURE__ */ jsx("small", { children: "Featured · Cafetelier" })
                        ] }) : /* @__PURE__ */ jsx("span", { children: name })
                      ]
                    },
                    key
                  ))
                ]
              }
            )
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "sl-map-instruction", children: [
          /* @__PURE__ */ jsx(MousePointer2, { "aria-hidden": "true" }),
          " Tap a destination"
        ] }),
        /* @__PURE__ */ jsx(AnimatePresence, { children: sector && /* @__PURE__ */ jsx(
          "div",
          {
            className: `sl-map-detail-anchor sl-map-detail-anchor--${sector.key}`,
            style: { "--detail-x": sector.detailX, "--detail-y": sector.detailY },
            children: /* @__PURE__ */ jsxs(
              motion.aside,
              {
                className: "sl-map-detail-overlay",
                initial: reduceMotion ? false : { opacity: 0, y: 12 },
                animate: { opacity: 1, y: 0 },
                exit: reduceMotion ? void 0 : { opacity: 0, y: 8 },
                transition: { duration: 0.24 },
                "aria-live": "polite",
                children: [
                  /* @__PURE__ */ jsx("button", { type: "button", className: "sl-map-detail-overlay__close", onClick: () => setActiveSector(null), "aria-label": "Close district details", children: /* @__PURE__ */ jsx(X, {}) }),
                  /* @__PURE__ */ jsxs("span", { children: [
                    /* @__PURE__ */ jsx(MapPin, {}),
                    " ",
                    sector.status
                  ] }),
                  /* @__PURE__ */ jsx("h3", { children: sector.name }),
                  /* @__PURE__ */ jsx("p", { children: sector.summary })
                ]
              }
            )
          },
          sector.key
        ) })
      ]
    },
    "world"
  ) : /* @__PURE__ */ jsxs(
    motion.div,
    {
      className: "sl-world-stage sl-world-stage--storefront",
      initial: reduceMotion ? false : { opacity: 0, scale: 1.035 },
      animate: { opacity: 1, scale: 1 },
      exit: reduceMotion ? void 0 : { opacity: 0, scale: 0.99 },
      transition: { duration: 0.55, ease: [0.2, 0.8, 0.2, 1] },
      children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "sl-pan-scroll sl-pan-scroll--storefront",
            tabIndex: "0",
            "aria-label": "Cafetelier storefront scene.",
            children: /* @__PURE__ */ jsxs("div", { className: "sl-imm-storefront sl-pan-canvas sl-pan-canvas--storefront", children: [
              /* @__PURE__ */ jsxs("picture", { className: "sl-responsive-art", children: [
                /* @__PURE__ */ jsx("source", { media: "(max-width: 600px)", srcSet: SELLIO_IMMERSIVE_MOBILE_ASSETS.storefront }),
                /* @__PURE__ */ jsx(
                  "img",
                  {
                    src: SELLIO_IMMERSIVE_ASSETS.storefront,
                    alt: "Cafetelier storefront inside Sellio World",
                    loading: "lazy",
                    decoding: "async"
                  }
                )
              ] }),
              /* @__PURE__ */ jsx("div", { className: "sl-imm-storefront__shade", "aria-hidden": "true" }),
              /* @__PURE__ */ jsxs("div", { className: "sl-storefront-door-cue", "aria-label": "Cafetelier entrance", children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    className: "sl-storefront-door-cue__trigger",
                    "aria-label": "Enter Cafetelier counter experience",
                    title: "Counter scene will be connected after the final counter artwork is approved",
                    children: /* @__PURE__ */ jsx(MousePointerClick, { "aria-hidden": "true" })
                  }
                ),
                /* @__PURE__ */ jsxs("div", { className: "sl-storefront-door-cue__card", children: [
                  /* @__PURE__ */ jsx("strong", { children: "Step inside Cafetelier" }),
                  /* @__PURE__ */ jsx("span", { children: "Meet Sellio AI at the counter." })
                ] })
              ] })
            ] })
          }
        ),
        /* @__PURE__ */ jsxs("button", { type: "button", className: "sl-storefront-back-fixed", onClick: returnToWorld, children: [
          /* @__PURE__ */ jsx(ArrowLeft, {}),
          " Back to Sellio World"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sl-storefront-feature-dock", children: [
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx(Check, {}),
            " Recognisable merchant identity"
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx(Check, {}),
            " Direct browsing and ordering"
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx(Palette, {}),
            " Seasonal decoration anchors"
          ] })
        ] })
      ]
    },
    "storefront"
  ) }) }) });
}
function WorldCapabilities() {
  return /* @__PURE__ */ jsx("div", { className: "sellio-proof-strip sl-world-proof-strip", "aria-label": "Sellio capabilities", children: /* @__PURE__ */ jsxs("div", { className: "sellio-container", children: [
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx(Store, {}),
      " Online storefront"
    ] }),
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx(QrCode, {}),
      " QR ordering"
    ] }),
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx(Bell, {}),
      " Live orders"
    ] }),
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx(Package, {}),
      " Inventory"
    ] }),
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx(BarChart3, {}),
      " Reports"
    ] }),
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx(Users, {}),
      " Staff roles"
    ] })
  ] }) });
}
function HeroWorldTransition() {
  return /* @__PURE__ */ jsxs("section", { id: "sellio-entry-sequence", className: "sl-entry-pages", "aria-label": "Sellio introduction and Sellio World", children: [
    /* @__PURE__ */ jsx("div", { className: "sl-snap-page sl-snap-page--hero", children: /* @__PURE__ */ jsx(ScrollWorldExperience, {}) }),
    /* @__PURE__ */ jsxs("div", { className: "sl-snap-page sl-snap-page--world sl-page-turn-world", children: [
      /* @__PURE__ */ jsx("span", { id: "world", className: "sl-snap-world-anchor", "aria-hidden": "true" }),
      /* @__PURE__ */ jsx(SellioWorld, {}),
      /* @__PURE__ */ jsx(WorldCapabilities, {})
    ] })
  ] });
}
const CONSENT_COOKIE = "sellio_cookie_consent";
const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE = 180 * 24 * 60 * 60;
const CONSENT_EVENT = "sellio:cookie-consent-change";
let sessionFallback = null;
function validConsent(value) {
  return (value == null ? void 0 : value.version) === CONSENT_VERSION && typeof value.analytics === "boolean" && Number.isFinite(value.updatedAt) && Number.isFinite(value.expiresAt) && value.updatedAt <= Date.now() && value.expiresAt > Date.now() && value.expiresAt <= value.updatedAt + CONSENT_MAX_AGE * 1e3;
}
function getCookieConsent() {
  if (typeof document === "undefined") return null;
  if (validConsent(sessionFallback)) return sessionFallback;
  try {
    const value = document.cookie.split("; ").find((item) => item.startsWith(CONSENT_COOKIE + "="));
    if (value) {
      const parsed = JSON.parse(decodeURIComponent(value.slice(CONSENT_COOKIE.length + 1)));
      return validConsent(parsed) ? parsed : null;
    }
  } catch {
  }
  return validConsent(sessionFallback) ? sessionFallback : null;
}
function saveCookieConsent(analytics) {
  var _a, _b;
  if (typeof analytics !== "boolean") throw new TypeError("Analytics consent must be a boolean");
  const updatedAt = Date.now();
  const consent = { version: CONSENT_VERSION, analytics, updatedAt, expiresAt: updatedAt + CONSENT_MAX_AGE * 1e3 };
  sessionFallback = null;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = CONSENT_COOKIE + "=" + encodeURIComponent(JSON.stringify(consent)) + "; Path=/; Max-Age=" + CONSENT_MAX_AGE + "; SameSite=Lax" + secure;
    if (((_a = getCookieConsent()) == null ? void 0 : _a.updatedAt) !== updatedAt || ((_b = getCookieConsent()) == null ? void 0 : _b.analytics) !== analytics) sessionFallback = consent;
  } catch {
    sessionFallback = consent;
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }));
  return consent;
}
function CookieConsent({ open, onOpenChange, returnFocusRef }) {
  const titleRef = useRef(null);
  const [consent, setConsent] = useState(getCookieConsent);
  useEffect(() => {
    const sync = () => setConsent(getCookieConsent());
    window.addEventListener(CONSENT_EVENT, sync);
    window.addEventListener("focus", sync);
    if (open) sync();
    return () => {
      window.removeEventListener(CONSENT_EVENT, sync);
      window.removeEventListener("focus", sync);
    };
  }, [open]);
  const choose = (allowed) => {
    setConsent(saveCookieConsent(allowed));
    onOpenChange(false);
  };
  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && !getCookieConsent()) choose(false);
    else onOpenChange(nextOpen);
  };
  return /* @__PURE__ */ jsx(Dialog.Root, { open, onOpenChange: handleOpenChange, children: /* @__PURE__ */ jsxs(Dialog.Portal, { children: [
    /* @__PURE__ */ jsx(Dialog.Overlay, { className: "sellio-cookie-overlay" }),
    /* @__PURE__ */ jsxs(
      Dialog.Content,
      {
        className: "sellio-cookie-card",
        onPointerDownOutside: (event) => event.preventDefault(),
        onOpenAutoFocus: (event) => {
          var _a;
          event.preventDefault();
          (_a = titleRef.current) == null ? void 0 : _a.focus();
        },
        onCloseAutoFocus: (event) => {
          event.preventDefault();
          const target = (returnFocusRef == null ? void 0 : returnFocusRef.current) || document.getElementById("sellio-main");
          target == null ? void 0 : target.focus({ preventScroll: true });
        },
        children: [
          /* @__PURE__ */ jsxs("div", { className: "sellio-cookie-brand", children: [
            /* @__PURE__ */ jsx("span", { className: "sellio-cookie-brand__dot" }),
            "SELLIO · YOUR PRIVACY"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sellio-cookie-illustration", "aria-hidden": "true", children: [
            /* @__PURE__ */ jsx("svg", { viewBox: "0 0 122.88 122.25", focusable: "false", children: /* @__PURE__ */ jsx("path", { d: "M101.77,49.38c2.09,3.1,4.37,5.11,6.86,5.78c2.45,0.66,5.32-0.06,8.7-2.01c1.36-0.84,3.14-0.41,3.97,0.95 c0.28,0.46,0.42,0.96,0.43,1.47c0.13,1.4,0.21,2.82,0.24,4.26c0.03,1.46,0.02,2.91-0.05,4.35h0v0c0,0.13-0.01,0.26-0.03,0.38 c-0.91,16.72-8.47,31.51-20,41.93c-11.55,10.44-27.06,16.49-43.82,15.69v0.01h0c-0.13,0-0.26-0.01-0.38-0.03 c-16.72-0.91-31.51-8.47-41.93-20C5.31,90.61-0.73,75.1,0.07,58.34H0.07v0c0-0.13,0.01-0.26,0.03-0.38 C1,41.22,8.81,26.35,20.57,15.87C32.34,5.37,48.09-0.73,64.85,0.07V0.07h0c1.6,0,2.89,1.29,2.89,2.89c0,0.4-0.08,0.78-0.23,1.12 c-1.17,3.81-1.25,7.34-0.27,10.14c0.89,2.54,2.7,4.51,5.41,5.52c1.44,0.54,2.2,2.1,1.74,3.55l0.01,0 c-1.83,5.89-1.87,11.08-0.52,15.26c0.82,2.53,2.14,4.69,3.88,6.4c1.74,1.72,3.9,3,6.39,3.78c4.04,1.26,8.94,1.18,14.31-0.55 C99.73,47.78,101.08,48.3,101.77,49.38L101.77,49.38z M59.28,57.86c2.77,0,5.01,2.24,5.01,5.01c0,2.77-2.24,5.01-5.01,5.01 c-2.77,0-5.01-2.24-5.01-5.01C54.27,60.1,56.52,57.86,59.28,57.86L59.28,57.86z M37.56,78.49c3.37,0,6.11,2.73,6.11,6.11 s-2.73,6.11-6.11,6.11s-6.11-2.73-6.11-6.11S34.18,78.49,37.56,78.49L37.56,78.49z M50.72,31.75c2.65,0,4.79,2.14,4.79,4.79 c0,2.65-2.14,4.79-4.79,4.79c-2.65,0-4.79-2.14-4.79-4.79C45.93,33.89,48.08,31.75,50.72,31.75L50.72,31.75z M119.3,32.4 c1.98,0,3.58,1.6,3.58,3.58c0,1.98-1.6,3.58-3.58,3.58s-3.58-1.6-3.58-3.58C115.71,34.01,117.32,32.4,119.3,32.4L119.3,32.4z M93.62,22.91c2.98,0,5.39,2.41,5.39,5.39c0,2.98-2.41,5.39-5.39,5.39c-2.98,0-5.39-2.41-5.39-5.39 C88.23,25.33,90.64,22.91,93.62,22.91L93.62,22.91z M97.79,0.59c3.19,0,5.78,2.59,5.78,5.78c0,3.19-2.59,5.78-5.78,5.78 c-3.19,0-5.78-2.59-5.78-5.78C92.02,3.17,94.6,0.59,97.79,0.59L97.79,0.59z M76.73,80.63c4.43,0,8.03,3.59,8.03,8.03 c0,4.43-3.59,8.03-8.03,8.03s-8.03-3.59-8.03-8.03C68.7,84.22,72.29,80.63,76.73,80.63L76.73,80.63z M31.91,46.78 c4.8,0,8.69,3.89,8.69,8.69c0,4.8-3.89,8.69-8.69,8.69s-8.69-3.89-8.69-8.69C23.22,50.68,27.11,46.78,31.91,46.78L31.91,46.78z M107.13,60.74c-3.39-0.91-6.35-3.14-8.95-6.48c-5.78,1.52-11.16,1.41-15.76-0.02c-3.37-1.05-6.32-2.81-8.71-5.18 c-2.39-2.37-4.21-5.32-5.32-8.75c-1.51-4.66-1.69-10.2-0.18-16.32c-3.1-1.8-5.25-4.53-6.42-7.88c-1.06-3.05-1.28-6.59-0.61-10.35 C47.27,5.95,34.3,11.36,24.41,20.18C13.74,29.69,6.66,43.15,5.84,58.29l0,0.05v0h0l-0.01,0.13v0C5.07,73.72,10.55,87.82,20.02,98.3 c9.44,10.44,22.84,17.29,38,18.1l0.05,0h0v0l0.13,0.01h0c15.24,0.77,29.35-4.71,39.83-14.19c10.44-9.44,17.29-22.84,18.1-38l0-0.05 v0h0l0.01-0.13v0c0.07-1.34,0.09-2.64,0.06-3.91C112.98,61.34,109.96,61.51,107.13,60.74L107.13,60.74z" }) }),
            /* @__PURE__ */ jsx("span", { className: "sellio-cookie-spark sellio-cookie-spark--one" }),
            /* @__PURE__ */ jsx("span", { className: "sellio-cookie-spark sellio-cookie-spark--two" })
          ] }),
          /* @__PURE__ */ jsxs(Dialog.Title, { ref: titleRef, tabIndex: -1, className: "sellio-cookie-title", children: [
            "A little cookie.",
            /* @__PURE__ */ jsx("br", {}),
            "Your choice."
          ] }),
          /* @__PURE__ */ jsx(Dialog.Description, { className: "sellio-cookie-description", children: "Essential cookies keep Sellio working. Choose whether to allow optional analytics to help us understand site usage and improve your experience." }),
          /* @__PURE__ */ jsxs("div", { className: "sellio-cookie-essential", children: [
            /* @__PURE__ */ jsx(ShieldCheck, { "aria-hidden": "true" }),
            /* @__PURE__ */ jsx("span", { children: "Essential cookies stay on" })
          ] }),
          consent && /* @__PURE__ */ jsxs("p", { className: "sellio-cookie-current", role: "status", children: [
            "Your current choice: ",
            consent.analytics ? "optional analytics allowed" : "essential cookies only",
            "."
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sellio-cookie-actions", children: [
            /* @__PURE__ */ jsx("button", { type: "button", className: "sellio-cookie-button sellio-cookie-button--allow", onClick: () => choose(true), children: "Allow" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "sellio-cookie-button sellio-cookie-button--decline", onClick: () => choose(false), children: "Decline" })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "sellio-cookie-note", children: "You can change your choice anytime in Cookie settings." }),
          /* @__PURE__ */ jsxs("details", { className: "sellio-cookie-details", children: [
            /* @__PURE__ */ jsx("summary", { children: "What does this mean?" }),
            /* @__PURE__ */ jsx("p", { children: "Allow saves your permission for optional site-usage analytics. Decline keeps optional analytics off. Neither choice changes the cookies needed for sign-in, security or essential site features." }),
            /* @__PURE__ */ jsx("p", { children: "We remember your choice in this browser for up to 180 days. Clearing cookies or a change to these preferences may prompt you again." })
          ] })
        ]
      }
    )
  ] }) });
}
const STEPS = [
  {
    key: "discover",
    number: "01",
    label: "Discover",
    title: "A storefront that feels like your own.",
    description: "Customers enter through your link or table QR and browse a polished, mobile-first storefront.",
    Icon: QrCode,
    point: { x: "22%", y: "48%", mobileX: "38%", mobileY: "76%" }
  },
  {
    key: "order",
    number: "02",
    label: "Order",
    title: "Every order arrives in one clear queue.",
    description: "Products, variants, notes and table details move into operations without manual re-entry.",
    Icon: BellRing,
    point: { x: "35%", y: "51%", mobileX: "57%", mobileY: "66%" }
  },
  {
    key: "prepare",
    number: "03",
    label: "Prepare",
    title: "Service teams see what comes next.",
    description: "Kitchen and service teams move each order from new to preparing and ready with confidence.",
    Icon: ChefHat,
    point: { x: "49%", y: "48%", mobileX: "39%", mobileY: "54%" }
  },
  {
    key: "update",
    number: "04",
    label: "Update",
    title: "Inventory follows the rhythm of service.",
    description: "Stock activity stays connected to the products being sold, so the operational picture stays current.",
    Icon: PackageCheck,
    point: { x: "61%", y: "50%", mobileX: "58%", mobileY: "43%" }
  },
  {
    key: "learn",
    number: "05",
    label: "Learn",
    title: "The day becomes useful business insight.",
    description: "Sales, popular products and operational patterns are ready to review without rebuilding the story.",
    Icon: BarChart3,
    point: { x: "72%", y: "45%", mobileX: "46%", mobileY: "34%" }
  }
];
function CommerceJourney() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const active = STEPS[activeIndex];
  const ActiveIcon = active.Icon;
  return /* @__PURE__ */ jsx("section", { id: "journey", className: "sellio-section sl-imm-section sl-imm-journey sl-cinematic-section sl-cinematic-journey", "aria-labelledby": "sellio-journey-heading", children: /* @__PURE__ */ jsx("div", { className: "sellio-container", children: /* @__PURE__ */ jsx("div", { className: "sl-imm-scene sl-imm-scene--journey", children: /* @__PURE__ */ jsx(
    "div",
    {
      className: "sl-pan-scroll sl-pan-scroll--journey",
      tabIndex: "0",
      "aria-label": "Interactive commerce journey with five selectable stages",
      children: /* @__PURE__ */ jsxs("div", { className: "sl-pan-canvas sl-pan-canvas--journey", children: [
        /* @__PURE__ */ jsxs("picture", { className: "sl-responsive-art", children: [
          /* @__PURE__ */ jsx("source", { media: "(max-width: 600px)", srcSet: SELLIO_IMMERSIVE_MOBILE_ASSETS.journey }),
          /* @__PURE__ */ jsx(
            "img",
            {
              src: SELLIO_IMMERSIVE_ASSETS.journey,
              alt: "A dimensional commerce journey connecting a mobile storefront, order, preparation, inventory and analytics",
              loading: "lazy",
              decoding: "async"
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "sl-imm-scene__shade", "aria-hidden": "true" }),
        /* @__PURE__ */ jsxs("header", { className: "sl-panorama-intro sl-panorama-intro--journey", children: [
          /* @__PURE__ */ jsxs("span", { className: "sellio-eyebrow", children: [
            /* @__PURE__ */ jsx(Sparkles, {}),
            " Order journey"
          ] }),
          /* @__PURE__ */ jsxs("h2", { id: "sellio-journey-heading", children: [
            "From first tap to",
            /* @__PURE__ */ jsx("br", {}),
            "a smarter next move."
          ] }),
          /* @__PURE__ */ jsx("p", { children: "Select a waypoint to follow the same order from discovery to insight." })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "sl-imm-hotspots", "aria-label": "Commerce journey waypoints", children: STEPS.map((step, index) => /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: index === activeIndex ? "is-active" : "",
            onClick: () => setActiveIndex(index),
            "aria-pressed": index === activeIndex,
            "aria-label": `${step.number}. ${step.label}: show this stage`,
            children: /* @__PURE__ */ jsx("span", { children: step.number })
          },
          step.key
        )) }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: `sl-waypoint-callout-anchor ${activeIndex % 2 === 0 ? "is-right" : "is-left"}`,
            style: {
              "--callout-x": active.point.x,
              "--callout-y": active.point.y,
              "--callout-mobile-x": active.point.mobileX,
              "--callout-mobile-y": active.point.mobileY
            },
            children: /* @__PURE__ */ jsx(AnimatePresence, { mode: "wait", children: /* @__PURE__ */ jsxs(
              motion.article,
              {
                className: "sl-waypoint-callout sl-waypoint-callout--journey",
                initial: reduceMotion ? false : { opacity: 0, rotateY: activeIndex % 2 === 0 ? -8 : 8, scale: 0.96 },
                animate: { opacity: 1, rotateY: 0, scale: 1 },
                exit: reduceMotion ? void 0 : { opacity: 0, rotateY: activeIndex % 2 === 0 ? 8 : -8, scale: 0.97 },
                transition: { duration: reduceMotion ? 0 : 0.28, ease: [0.2, 0.8, 0.2, 1] },
                "aria-live": "polite",
                children: [
                  /* @__PURE__ */ jsxs("div", { className: "sl-waypoint-callout__meta", children: [
                    /* @__PURE__ */ jsxs("span", { children: [
                      /* @__PURE__ */ jsx(ActiveIcon, { "aria-hidden": "true" }),
                      " Stage ",
                      active.number
                    ] }),
                    /* @__PURE__ */ jsx("strong", { children: active.label })
                  ] }),
                  /* @__PURE__ */ jsx("h3", { children: active.title }),
                  /* @__PURE__ */ jsx("p", { children: active.description })
                ]
              },
              active.key
            ) })
          }
        )
      ] })
    }
  ) }) }) });
}
const CUSTOMER_POINTS = [
  { Icon: Store, title: "Branded discovery", copy: "The merchant’s identity stays visible from the first browse." },
  { Icon: QrCode, title: "Simple ordering", copy: "Links and table QR codes take customers straight to what matters." },
  { Icon: ShoppingBag, title: "Confident checkout", copy: "A clear path from product choice to completed order." }
];
const MERCHANT_POINTS = [
  { Icon: BellRing, title: "Live order flow", copy: "New, preparing and ready states stay in one operational view." },
  { Icon: PackageCheck, title: "Connected stock", copy: "Product and inventory activity remain part of the same story." },
  { Icon: BarChart3, title: "Useful visibility", copy: "Performance is translated into an understandable daily pulse." }
];
const CONNECTED_STAGES = [
  {
    key: "customer",
    number: "01",
    label: "Customer intent",
    title: "A customer enters through the merchant’s own brand.",
    description: "Discovery, product choice and checkout stay simple while the storefront keeps its identity.",
    Icon: Store,
    point: { x: "24%", y: "56%", mobileX: "24%", mobileY: "42%" },
    callout: { mobileX: "30%", mobileY: "37%" }
  },
  {
    key: "sellio",
    number: "02",
    label: "Sellio sync",
    title: "Sellio carries the order into one connected flow.",
    description: "Order details, product context and operational status move together without manual re-entry.",
    Icon: Sparkles,
    point: { x: "50%", y: "49%", mobileX: "55%", mobileY: "57%" },
    callout: { mobileX: "55%", mobileY: "51%" }
  },
  {
    key: "merchant",
    number: "03",
    label: "Merchant action",
    title: "The merchant sees what happened and what comes next.",
    description: "Teams act on live orders, connected stock and useful performance signals from one side of Sellio.",
    Icon: BellRing,
    point: { x: "76%", y: "57%", mobileX: "72%", mobileY: "72%" },
    callout: { mobileX: "72%", mobileY: "58%" }
  }
];
function PointList({ title, eyebrow, points, tone, reduceMotion }) {
  const entranceX = tone === "customer" ? -28 : 28;
  return /* @__PURE__ */ jsxs(
    motion.article,
    {
      className: `sl-connection-panel sl-connection-panel--${tone}`,
      initial: reduceMotion ? false : { opacity: 0, x: entranceX },
      whileInView: reduceMotion ? void 0 : { opacity: 1, x: 0 },
      viewport: { once: true, amount: 0.25 },
      transition: { duration: 0.62, ease: [0.2, 0.8, 0.2, 1] },
      children: [
        /* @__PURE__ */ jsxs("header", { children: [
          /* @__PURE__ */ jsx("span", { children: eyebrow }),
          /* @__PURE__ */ jsx("h3", { children: title })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "sl-connection-panel__points", children: points.map(({ Icon, title: itemTitle, copy }) => /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("i", { children: /* @__PURE__ */ jsx(Icon, { "aria-hidden": "true" }) }),
          /* @__PURE__ */ jsxs("p", { children: [
            /* @__PURE__ */ jsx("strong", { children: itemTitle }),
            /* @__PURE__ */ jsx("small", { children: copy })
          ] })
        ] }, itemTitle)) })
      ]
    }
  );
}
function ConnectedCommerce() {
  var _a, _b;
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStage = CONNECTED_STAGES[activeIndex];
  const ActiveStageIcon = activeStage.Icon;
  return /* @__PURE__ */ jsx("section", { id: "connected", className: "sellio-section sl-imm-section sl-imm-connected sl-cinematic-section sl-cinematic-connected", "aria-labelledby": "sellio-connected-heading", children: /* @__PURE__ */ jsx("div", { className: "sellio-container", children: /* @__PURE__ */ jsxs("div", { className: "sl-imm-connection-stage", children: [
    /* @__PURE__ */ jsx("div", { className: "sl-pan-scroll sl-pan-scroll--connection", tabIndex: "0", "aria-label": "Connected customer and merchant experience", children: /* @__PURE__ */ jsxs(
      motion.div,
      {
        className: "sl-imm-connection-art sl-pan-canvas sl-pan-canvas--connection",
        initial: false,
        children: [
          /* @__PURE__ */ jsxs("picture", { className: "sl-responsive-art", children: [
            /* @__PURE__ */ jsx("source", { media: "(max-width: 600px)", srcSet: SELLIO_IMMERSIVE_MOBILE_ASSETS.connected }),
            /* @__PURE__ */ jsx(
              "img",
              {
                src: SELLIO_IMMERSIVE_ASSETS.connected,
                alt: "A premium connected commerce environment linking a customer storefront to merchant operations",
                loading: "lazy",
                decoding: "async"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("header", { className: "sl-panorama-intro sl-panorama-intro--connected", children: [
            /* @__PURE__ */ jsxs("span", { className: "sellio-eyebrow", children: [
              /* @__PURE__ */ jsx(HeartHandshake, {}),
              " Connected commerce"
            ] }),
            /* @__PURE__ */ jsxs("h2", { id: "sellio-connected-heading", children: [
              "Delight in front.",
              /* @__PURE__ */ jsx("br", {}),
              "Clarity behind the counter."
            ] }),
            /* @__PURE__ */ jsx("p", { children: "Customers feel the brand while merchants stay in control. Both sides stay connected without becoming the same experience." })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "sl-imm-hotspots sl-connection-waypoints", "aria-label": "Connected commerce stages", children: CONNECTED_STAGES.map((stage, index) => /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: index === activeIndex ? "is-active" : "",
              style: { "--point-x": stage.point.x, "--point-y": stage.point.y, "--point-mobile-x": stage.point.mobileX, "--point-mobile-y": stage.point.mobileY },
              onClick: () => setActiveIndex(index),
              "aria-pressed": index === activeIndex,
              "aria-label": `${stage.number}. ${stage.label}: show this connection stage`,
              children: /* @__PURE__ */ jsx("span", { children: stage.number })
            },
            stage.key
          )) }),
          /* @__PURE__ */ jsx(
            "div",
            {
              className: `sl-waypoint-callout-anchor sl-connected-callout-anchor ${activeIndex === 0 ? "is-right" : "is-left"}`,
              style: {
                "--callout-x": activeStage.point.x,
                "--callout-y": activeStage.point.y,
                "--callout-mobile-x": ((_a = activeStage.callout) == null ? void 0 : _a.mobileX) || activeStage.point.mobileX,
                "--callout-mobile-y": ((_b = activeStage.callout) == null ? void 0 : _b.mobileY) || activeStage.point.mobileY
              },
              children: /* @__PURE__ */ jsx(AnimatePresence, { mode: "wait", children: /* @__PURE__ */ jsxs(
                motion.article,
                {
                  className: "sl-waypoint-callout sl-waypoint-callout--connected",
                  initial: reduceMotion ? false : { opacity: 0, rotateY: activeIndex === 0 ? -8 : 8, scale: 0.96 },
                  animate: { opacity: 1, rotateY: 0, scale: 1 },
                  exit: reduceMotion ? void 0 : { opacity: 0, rotateY: activeIndex === 0 ? 8 : -8, scale: 0.97 },
                  transition: { duration: reduceMotion ? 0 : 0.3, ease: [0.2, 0.8, 0.2, 1] },
                  "aria-live": "polite",
                  children: [
                    /* @__PURE__ */ jsxs("div", { className: "sl-waypoint-callout__meta", children: [
                      /* @__PURE__ */ jsxs("span", { children: [
                        /* @__PURE__ */ jsx(ActiveStageIcon, { "aria-hidden": "true" }),
                        " Connection ",
                        activeStage.number
                      ] }),
                      /* @__PURE__ */ jsx("strong", { children: activeStage.label })
                    ] }),
                    /* @__PURE__ */ jsx("h3", { children: activeStage.title }),
                    /* @__PURE__ */ jsx("p", { children: activeStage.description })
                  ]
                },
                activeStage.key
              ) })
            }
          )
        ]
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { className: "sl-connection-comparison", children: [
      /* @__PURE__ */ jsx(PointList, { eyebrow: "Customer side", title: "Easy to enter. Easy to trust.", points: CUSTOMER_POINTS, tone: "customer", reduceMotion }),
      /* @__PURE__ */ jsxs("div", { className: "sl-connection-bridge", "aria-hidden": "true", children: [
        /* @__PURE__ */ jsx(Sparkles, {}),
        /* @__PURE__ */ jsx("span", { children: "One connected flow" })
      ] }),
      /* @__PURE__ */ jsx(PointList, { eyebrow: "Merchant side", title: "Easy to see. Easy to act.", points: MERCHANT_POINTS, tone: "merchant", reduceMotion })
    ] })
  ] }) }) });
}
const PRODUCT_VIEWS = [
  {
    key: "storefront",
    label: "Storefront",
    title: "A storefront that feels like your brand",
    description: "Customers can browse categories, choose variants and place orders from any device.",
    Icon: Store
  },
  {
    key: "orders",
    label: "Orders",
    title: "Every order, clearly organised",
    description: "See what is new, preparing and ready without losing track during a busy service.",
    Icon: BellRing
  },
  {
    key: "inventory",
    label: "Inventory",
    title: "Know what is running low",
    description: "Track stock, make adjustments and review inventory activity from one workspace.",
    Icon: Warehouse
  },
  {
    key: "insights",
    label: "Insights",
    title: "Make decisions with useful data",
    description: "Review revenue, products and customer activity without building spreadsheets.",
    Icon: BarChart3
  },
  {
    key: "assistant",
    label: "Sellio AI",
    title: "A helpful assistant inside your business",
    description: "Ask questions about sales and inventory or get help preparing product content.",
    Icon: Bot
  }
];
const PLANS = [
  {
    key: "starter",
    name: "Starter",
    monthly: 79,
    yearly: 790,
    description: "For small businesses getting online.",
    badge: null,
    accent: "#3b82f6",
    features: [
      "10 products",
      "Up to 100 orders/month",
      "3 staff accounts",
      "5 tables and QR codes",
      "1 branch",
      "Basic reports",
      "Custom theme"
    ],
    links: {
      monthly: "https://buy.stripe.com/00wdRbdyV1kn8qfebK7bW02",
      annual: "https://buy.stripe.com/fZu5kF1Qd8MP0XN3x67bW03"
    }
  },
  {
    key: "growth",
    name: "Growth",
    monthly: 139,
    yearly: 1390,
    description: "For growing teams and busier operations.",
    badge: "Most popular",
    accent: "#8b2fc9",
    features: [
      "50 products",
      "Up to 1,000 orders/month",
      "5 staff accounts",
      "Up to 3 branches",
      "Advanced reports",
      "Custom editable roles",
      "Email and chat support"
    ],
    links: {
      monthly: "https://buy.stripe.com/6oUaEZ52pbZ135V7Nm7bW04",
      annual: "https://buy.stripe.com/8x23cxcuR9QTgWL7Nm7bW05"
    }
  },
  {
    key: "pro",
    name: "Professional",
    monthly: 199,
    yearly: 1990,
    description: "For businesses that need maximum scale.",
    badge: null,
    accent: "#e0449a",
    features: [
      "Unlimited products and orders",
      "Unlimited staff accounts",
      "Unlimited tables and QR codes",
      "Up to 10 branches",
      "Custom real-time reports",
      "Unlimited custom roles",
      "Priority support"
    ],
    links: {
      monthly: "https://buy.stripe.com/5kQ5kFcuR8MP6i76Ji7bW06",
      annual: "https://buy.stripe.com/eVq7sNcuR2or21R2t27bW07"
    }
  }
];
const CALLOUT_POSITIONS = [
  { x: "5%", y: "62%", mobileX: "48%", mobileY: "63%" },
  { x: "23%", y: "58%", mobileX: "48%", mobileY: "57%" },
  { x: "43%", y: "59%", mobileX: "48%", mobileY: "52%" },
  // Use the open left-side floor for the upper-right stages so their markers stay unobstructed.
  { x: "59%", y: "57%", mobileX: "4%", mobileY: "54%" },
  { x: "70%", y: "52%", mobileX: "4%", mobileY: "45%" }
];
function ProductShowcase() {
  const [activeKey, setActiveKey] = useState("storefront");
  const reduceMotion = useReducedMotion();
  const activeIndex = Math.max(0, PRODUCT_VIEWS.findIndex((view) => view.key === activeKey));
  const active = PRODUCT_VIEWS[activeIndex] || PRODUCT_VIEWS[0];
  const position = CALLOUT_POSITIONS[activeIndex] || CALLOUT_POSITIONS[0];
  const ActiveIcon = active.Icon;
  return /* @__PURE__ */ jsx("section", { id: "product", className: "sellio-section sellio-product-section sl-workspace-section sl-cinematic-section sl-cinematic-workspace", "aria-labelledby": "sellio-product-heading", children: /* @__PURE__ */ jsx("div", { className: "sellio-container", children: /* @__PURE__ */ jsx("div", { className: "sl-workspace-shell", children: /* @__PURE__ */ jsx(
    "div",
    {
      id: "sellio-product-preview",
      className: "sl-pan-scroll sl-pan-scroll--workspace",
      role: "tabpanel",
      tabIndex: "0",
      "aria-label": "Interactive connected Sellio workspace",
      children: /* @__PURE__ */ jsxs("div", { className: "sl-pan-canvas sl-pan-canvas--workspace", children: [
        /* @__PURE__ */ jsxs("picture", { className: "sl-responsive-art", children: [
          /* @__PURE__ */ jsx("source", { media: "(max-width: 600px)", srcSet: SELLIO_IMMERSIVE_MOBILE_ASSETS.workspace }),
          /* @__PURE__ */ jsx(
            "img",
            {
              src: SELLIO_IMMERSIVE_ASSETS.workspace,
              alt: "A bright dimensional Sellio workspace connecting storefront, orders, inventory, analytics and AI",
              loading: "lazy",
              decoding: "async"
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "sl-workspace-vignette", "aria-hidden": "true" }),
        /* @__PURE__ */ jsxs("header", { className: "sl-panorama-intro sl-panorama-intro--workspace", children: [
          /* @__PURE__ */ jsxs("span", { className: "sellio-eyebrow", children: [
            /* @__PURE__ */ jsx(Sparkles, { "aria-hidden": "true" }),
            " Merchant workspace"
          ] }),
          /* @__PURE__ */ jsx("h2", { id: "sellio-product-heading", children: "See every part of Sellio working together." }),
          /* @__PURE__ */ jsx("p", { children: "Select a waypoint to see how storefront, operations, inventory, insights and AI connect." })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "sl-workspace-waypoints", "aria-label": "Workspace waypoints", children: PRODUCT_VIEWS.map(({ key, label }, index) => /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            className: activeKey === key ? "is-active" : "",
            onClick: () => setActiveKey(key),
            "aria-pressed": activeKey === key,
            "aria-label": `Show ${label}`,
            children: [
              /* @__PURE__ */ jsx("span", { children: String(index + 1).padStart(2, "0") }),
              /* @__PURE__ */ jsx("strong", { children: label })
            ]
          },
          key
        )) }),
        /* @__PURE__ */ jsx(AnimatePresence, { mode: "wait", children: /* @__PURE__ */ jsxs(
          motion.article,
          {
            className: "sl-waypoint-callout sl-waypoint-callout--workspace",
            style: {
              "--callout-x": position.x,
              "--callout-y": position.y,
              "--callout-mobile-x": position.mobileX,
              "--callout-mobile-y": position.mobileY
            },
            initial: reduceMotion ? false : { opacity: 0, rotateY: -8, scale: 0.96 },
            animate: { opacity: 1, rotateY: 0, scale: 1 },
            exit: reduceMotion ? void 0 : { opacity: 0, rotateY: 8, scale: 0.97 },
            transition: { duration: reduceMotion ? 0 : 0.26, ease: [0.2, 0.8, 0.2, 1] },
            "aria-live": "polite",
            children: [
              /* @__PURE__ */ jsxs("div", { className: "sl-waypoint-callout__meta", children: [
                /* @__PURE__ */ jsxs("span", { children: [
                  /* @__PURE__ */ jsx(ActiveIcon, { "aria-hidden": "true" }),
                  " ",
                  String(activeIndex + 1).padStart(2, "0")
                ] }),
                /* @__PURE__ */ jsx("strong", { children: active.label })
              ] }),
              /* @__PURE__ */ jsx("h3", { children: active.title }),
              /* @__PURE__ */ jsx("p", { children: active.description }),
              /* @__PURE__ */ jsxs("a", { href: "#pricing", children: [
                "Start free trial ",
                /* @__PURE__ */ jsx(ArrowUpRight, { "aria-hidden": "true" })
              ] })
            ]
          },
          active.key
        ) })
      ] })
    }
  ) }) }) });
}
const LAYERS = [
  {
    number: "01",
    eyebrow: "Marketplace layer",
    title: "Discover the right district.",
    description: "Customers enter a coherent sector world rather than a directory grid. F&B starts the network, while Retail and Services already have room to expand.",
    tags: ["Sector discovery", "Merchant allocation", "Connected districts"],
    image: SELLIO_IMMERSIVE_ASSETS.world,
    alt: "A premium dimensional marketplace composed of connected commerce districts",
    Icon: Map
  },
  {
    number: "02",
    eyebrow: "Storefront layer",
    title: "Zoom into a merchant-owned place.",
    description: "Selecting a merchant brings its neighbourhood forward, then opens a storefront that retains the merchant’s own brand, products and customer journey.",
    tags: ["Branded identity", "Product browsing", "Direct ordering"],
    image: SELLIO_IMMERSIVE_ASSETS.storefront,
    alt: "A dimensional close-up of a merchant-owned storefront in Sellio World",
    Icon: Store
  },
  {
    number: "03",
    eyebrow: "Progression layer",
    title: "Earn ways to make the space yours.",
    description: "Sellio Coins and cosmetic rewards can evolve alongside the marketplace—supporting seasonal decoration and merchant expression without turning core commerce into a game.",
    tags: ["Sellio Coins", "Seasonal décor", "Merchant progression"],
    image: SELLIO_IMMERSIVE_ASSETS.progression,
    alt: "Premium merchant progression objects leading to an upgraded seasonal storefront",
    Icon: Coins
  }
];
function WorldLayers() {
  return /* @__PURE__ */ jsx("section", { id: "vision", className: "sellio-section sl-imm-layers", "aria-labelledby": "sellio-layers-heading", children: /* @__PURE__ */ jsxs("div", { className: "sellio-container", children: [
    /* @__PURE__ */ jsxs("div", { className: "sl-imm-heading sl-imm-heading--light", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("span", { className: "sellio-eyebrow sellio-eyebrow--dark", children: [
          /* @__PURE__ */ jsx(Sparkles, {}),
          " Marketplace progression"
        ] }),
        /* @__PURE__ */ jsxs("h2", { id: "sellio-layers-heading", children: [
          "One world.",
          /* @__PURE__ */ jsx("br", {}),
          "Three meaningful layers."
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { children: "The experience remains useful at every depth: discover a district, enter a real storefront, then personalise that place through progression." })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "sl-imm-layer-list", children: LAYERS.map(({ number, eyebrow, title, description, tags, image, alt, Icon }, index) => /* @__PURE__ */ jsxs(React.Fragment, { children: [
      /* @__PURE__ */ jsxs("article", { className: `sl-imm-layer ${index % 2 ? "is-reversed" : ""}`, children: [
        /* @__PURE__ */ jsxs("div", { className: `sl-imm-layer__art sl-imm-layer__art--${index + 1}`, children: [
          /* @__PURE__ */ jsx("div", { className: "sl-pan-scroll sl-pan-scroll--layer", tabIndex: "0", "aria-label": `Explore ${eyebrow}`, children: /* @__PURE__ */ jsx("div", { className: "sl-pan-canvas sl-pan-canvas--layer", children: /* @__PURE__ */ jsx("picture", { className: "sl-responsive-art", children: /* @__PURE__ */ jsx("img", { src: image, alt, loading: "lazy", decoding: "async" }) }) }) }),
          /* @__PURE__ */ jsx("span", { children: number }),
          /* @__PURE__ */ jsxs("div", { className: "sl-pan-hint sl-pan-hint--layer", children: [
            /* @__PURE__ */ jsx(MoveHorizontal, {}),
            " Drag image"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sl-imm-layer__copy", children: [
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx(Icon, {}),
            " ",
            eyebrow
          ] }),
          /* @__PURE__ */ jsx("h3", { children: title }),
          /* @__PURE__ */ jsx("p", { children: description }),
          /* @__PURE__ */ jsx("div", { children: tags.map((tag) => /* @__PURE__ */ jsx("small", { children: tag }, tag)) })
        ] })
      ] }),
      index < LAYERS.length - 1 && /* @__PURE__ */ jsx("div", { className: "sl-imm-layer-link", "aria-hidden": "true", children: /* @__PURE__ */ jsx(ArrowDown, {}) })
    ] }, number)) })
  ] }) });
}
const EASE = [0.2, 0.8, 0.2, 1];
function ChapterTransition({ children, className = "", label }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return /* @__PURE__ */ jsx("div", { className: `sl-chapter-transition ${className}`, children });
  }
  return /* @__PURE__ */ jsxs(
    motion.div,
    {
      className: `sl-chapter-transition ${className}`,
      initial: { opacity: 0.2, y: 104, rotateX: 11, scale: 0.958, clipPath: "inset(15% 2.5% 0% 2.5% round 38px)" },
      whileInView: { opacity: 1, y: 0, rotateX: 0, scale: 1, clipPath: "inset(0% 0% 0% 0% round 0px)" },
      viewport: { once: true, amount: 0.035 },
      transition: { duration: 0.92, ease: EASE },
      style: { transformOrigin: "50% 0%" },
      "aria-label": label,
      children: [
        /* @__PURE__ */ jsx(
          motion.span,
          {
            className: "sl-chapter-transition__seam",
            initial: { opacity: 0, scaleX: 0.22 },
            whileInView: { opacity: [0, 0.95, 0], scaleX: [0.22, 1, 1] },
            viewport: { once: true, amount: 0.08 },
            transition: { duration: 0.96, times: [0, 0.48, 1], ease: EASE },
            "aria-hidden": "true"
          }
        ),
        children
      ]
    }
  );
}
const SITE_URL$1 = "https://sellio.apptelier.sg/";
const LOGO_URL$1 = "https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png";
const DEMO_STORE_URL = "/store/cafetelier?preview=true";
const LANDING_TITLE = "Sellio — Storefronts, Operations & Marketplace for Modern Commerce";
const LANDING_DESCRIPTION = "Sellio connects branded storefronts, F&B ordering and merchant operations with an evolving sector-based marketplace world.";
const NAV_ITEMS = [
  { label: "Sellio World", href: "#world" },
  { label: "How it flows", href: "#journey" },
  { label: "Product", href: "#product" },
  { label: "Vision", href: "#vision" },
  { label: "Pricing", href: "#pricing" }
];
const FAQ_ITEMS = [
  { question: "How does my business join Sellio World?", answer: "Start a Sellio merchant plan and complete your storefront setup. Your business is then placed in the most relevant F&B, Retail or Services district so customers can discover it naturally." },
  { question: "What happens when a customer selects my storefront?", answer: "Sellio moves the customer from the district view into your branded storefront, where they can browse products or services and complete the relevant ordering journey." },
  { question: "Can my storefront keep its own branding?", answer: "Yes. Sellio supplies the connected world and commerce structure while your storefront keeps its own colours, products, imagery, content and decorative style." },
  { question: "How do Sellio Coins work?", answer: "Merchants earn Sellio Coins through eligible marketplace activity and milestones. Coins can be used for cosmetic storefront upgrades, seasonal decorations and selected world customisations." },
  { question: "Are seasonal decorations available?", answer: "Yes. Merchants can personalise their storefront for occasions such as Chinese New Year and Christmas while keeping the core shopping and ordering experience consistent." },
  { question: "Which merchant districts are available?", answer: "Sellio World supports dedicated F&B, Retail and Services districts. Merchants are allocated according to their primary business category, with room for new districts as the marketplace grows." },
  { question: "Do customers need an account to browse?", answer: "No. Customers can explore participating storefronts and browse available products or services without creating a marketplace account. Account features can be introduced only when they add useful continuity or rewards." }
];
const SNAP_PAGE_SELECTORS = ["#sellio-film", "#world-experience", "#journey", "#connected", "#product", "#vision"];
function useImmersiveReleaseSnap() {
  useEffect(() => {
    const touchLayout = window.matchMedia("(max-width: 900px), (hover: none) and (pointer: coarse)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!touchLayout.matches || reducedMotion.matches) return void 0;
    let points = [];
    let snapFrame;
    let settleTimer;
    let wheelTimer;
    let snapping = false;
    let pending = null;
    let wheelOrigin = null;
    let wheelDelta = 0;
    let touchStart = null;
    const absoluteTop = (node) => window.scrollY + node.getBoundingClientRect().top;
    const measure = () => {
      points = SNAP_PAGE_SELECTORS.map((selector) => document.querySelector(selector)).filter(Boolean).map((node) => absoluteTop(node));
    };
    const nearestIndex = (y) => {
      if (!points.length) return -1;
      let best = 0;
      let bestDistance = Math.abs(y - points[0]);
      for (let index = 1; index < points.length; index += 1) {
        const distance = Math.abs(y - points[index]);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      }
      return best;
    };
    const cancelSnap = () => {
      if (snapFrame) window.cancelAnimationFrame(snapFrame);
      snapFrame = void 0;
      snapping = false;
    };
    const animateTo = (targetY) => {
      cancelSnap();
      const startY = window.scrollY;
      const distance = targetY - startY;
      if (Math.abs(distance) < 2) return;
      snapping = true;
      const startedAt = performance.now();
      const duration = Math.min(650, Math.max(430, Math.abs(distance) * 0.52));
      const step = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        window.scrollTo(0, startY + distance * eased);
        if (progress < 1) {
          snapFrame = window.requestAnimationFrame(step);
        } else {
          snapFrame = void 0;
          snapping = false;
        }
      };
      snapFrame = window.requestAnimationFrame(step);
    };
    const settle = () => {
      window.clearTimeout(settleTimer);
      if (!pending || snapping) return;
      measure();
      if (points.length !== SNAP_PAGE_SELECTORS.length) {
        pending = null;
        return;
      }
      const { direction, originIndex, originY } = pending;
      pending = null;
      if (originIndex < 0 || Math.abs(originY - points[originIndex]) > window.innerHeight * 0.92) return;
      let targetIndex = originIndex;
      if (direction > 0 && originIndex < points.length - 1) {
        targetIndex = originIndex + 1;
      } else if (direction < 0 && originIndex > 0) {
        if (originIndex === points.length - 1 && originY > points[originIndex] + window.innerHeight * 0.15) {
          targetIndex = originIndex;
        } else {
          targetIndex = originIndex - 1;
        }
      } else {
        return;
      }
      animateTo(points[targetIndex]);
    };
    const scheduleSettle = (delay = 115) => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, delay);
    };
    const onScroll = () => {
      if (pending && !snapping) scheduleSettle(115);
    };
    const onTouchStart = (event) => {
      var _a;
      if (event.target instanceof Element && event.target.closest(".sellio-cookie-card, .sellio-cookie-overlay")) return;
      if (!((_a = event.touches) == null ? void 0 : _a.length)) return;
      cancelSnap();
      window.clearTimeout(settleTimer);
      measure();
      touchStart = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        scrollY: window.scrollY,
        originIndex: nearestIndex(window.scrollY)
      };
      pending = null;
    };
    const onTouchEnd = (event) => {
      var _a;
      if (!touchStart) return;
      const touch = (_a = event.changedTouches) == null ? void 0 : _a[0];
      const deltaX = touch ? touchStart.x - touch.clientX : 0;
      const deltaY = touch ? touchStart.y - touch.clientY : window.scrollY - touchStart.scrollY;
      const scrollDelta = window.scrollY - touchStart.scrollY;
      const verticalTravel = Math.abs(deltaY) > Math.abs(scrollDelta) ? deltaY : scrollDelta;
      if (Math.abs(verticalTravel) > 12 && Math.abs(verticalTravel) > Math.abs(deltaX) * 0.8) {
        pending = {
          direction: verticalTravel > 0 ? 1 : -1,
          originIndex: touchStart.originIndex,
          originY: touchStart.scrollY
        };
        scheduleSettle(125);
      }
      touchStart = null;
    };
    const finishWheelGesture = () => {
      if (!wheelOrigin || Math.abs(wheelDelta) < 4) {
        wheelOrigin = null;
        wheelDelta = 0;
        return;
      }
      pending = {
        direction: wheelDelta > 0 ? 1 : -1,
        originIndex: wheelOrigin.originIndex,
        originY: wheelOrigin.scrollY
      };
      wheelOrigin = null;
      wheelDelta = 0;
      scheduleSettle(115);
    };
    const onWheel = (event) => {
      if (event.target instanceof Element && event.target.closest(".sellio-cookie-card, .sellio-cookie-overlay")) return;
      cancelSnap();
      measure();
      if (!wheelOrigin) {
        wheelOrigin = { scrollY: window.scrollY, originIndex: nearestIndex(window.scrollY) };
        wheelDelta = 0;
      }
      wheelDelta += event.deltaY;
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(finishWheelGesture, 95);
    };
    const onResize = () => measure();
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(wheelTimer);
      cancelSnap();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
    };
  }, []);
}
function LandingHeader() {
  const headerRef = useRef(null);
  const lastScrollYRef = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [immersive, setImmersive] = useState(false);
  useEffect(() => {
    let frame;
    lastScrollYRef.current = window.scrollY;
    const update = () => {
      const world = document.getElementById("world-experience");
      const product = document.getElementById("product");
      const film = document.getElementById("sellio-film");
      const currentY = window.scrollY;
      const previousY = lastScrollYRef.current;
      const delta = currentY - previousY;
      lastScrollYRef.current = currentY;
      const worldTop = world ? currentY + world.getBoundingClientRect().top : null;
      const productBottom = product ? currentY + product.getBoundingClientRect().bottom : null;
      const filmBottom = film ? currentY + film.getBoundingClientRect().bottom : null;
      const immersiveStart = worldTop ?? filmBottom ?? Number.POSITIVE_INFINITY;
      const immersiveEnd = productBottom ?? Number.NEGATIVE_INFINITY;
      const insideImmersive = currentY >= immersiveStart - 2 && currentY < immersiveEnd - 2;
      const afterImmersive = currentY >= immersiveEnd - 2;
      setImmersive(insideImmersive);
      if (insideImmersive) {
        if (delta < -2) setVisible(true);
        else if (delta > 2) setVisible(false);
      } else {
        setVisible(afterImmersive);
      }
    };
    const requestUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);
  useEffect(() => {
    if (!visible) setMenuOpen(false);
  }, [visible]);
  useEffect(() => {
    const header = headerRef.current;
    const landing = header == null ? void 0 : header.closest(".sellio-landing");
    if (!header || !landing) return void 0;
    const measure = () => {
      landing.style.setProperty("--sellio-header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer == null ? void 0 : observer.observe(header);
    window.addEventListener("resize", measure);
    return () => {
      observer == null ? void 0 : observer.disconnect();
      window.removeEventListener("resize", measure);
      landing.style.removeProperty("--sellio-header-height");
    };
  }, []);
  return /* @__PURE__ */ jsxs(
    "header",
    {
      ref: headerRef,
      className: "sellio-landing-header " + (visible ? "is-visible " : "") + (immersive ? "is-immersive is-overlay-only" : ""),
      "aria-hidden": !visible && !menuOpen,
      children: [
        immersive ? /* @__PURE__ */ jsx("div", { className: "sellio-landing-header__overlay", children: /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "sellio-menu-button sellio-menu-button--overlay",
            onClick: () => setMenuOpen((open) => !open),
            "aria-label": menuOpen ? "Close navigation menu" : "Open navigation menu",
            "aria-expanded": menuOpen,
            "aria-controls": "sellio-mobile-nav",
            children: menuOpen ? /* @__PURE__ */ jsx(X, {}) : /* @__PURE__ */ jsx(Menu, {})
          }
        ) }) : /* @__PURE__ */ jsxs("div", { className: "sellio-container sellio-landing-header__inner", children: [
          /* @__PURE__ */ jsx("a", { href: "/", className: "sellio-landing-logo", "aria-label": "Sellio home", children: /* @__PURE__ */ jsx("img", { src: LOGO_URL$1, alt: "Sellio" }) }),
          /* @__PURE__ */ jsx("nav", { className: "sellio-landing-nav", "aria-label": "Main navigation", children: NAV_ITEMS.map((item) => /* @__PURE__ */ jsx("a", { href: item.href, children: item.label }, item.label)) }),
          /* @__PURE__ */ jsxs("div", { className: "sellio-landing-header__actions", children: [
            /* @__PURE__ */ jsx("a", { href: "/Join", className: "sellio-login-link", children: "Sign up free" }),
            /* @__PURE__ */ jsx("a", { href: "/auth", className: "sellio-login-link", children: "Merchant Login" }),
            /* @__PURE__ */ jsxs("a", { href: "#pricing", className: "sellio-button sellio-button--small sellio-button--gradient", children: [
              "Start Free Trial ",
              /* @__PURE__ */ jsx(ArrowRight, {})
            ] }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "sellio-menu-button", onClick: () => setMenuOpen((open) => !open), "aria-label": menuOpen ? "Close navigation menu" : "Open navigation menu", "aria-expanded": menuOpen, "aria-controls": "sellio-mobile-nav", children: menuOpen ? /* @__PURE__ */ jsx(X, {}) : /* @__PURE__ */ jsx(Menu, {}) })
          ] })
        ] }),
        menuOpen && /* @__PURE__ */ jsxs("nav", { id: "sellio-mobile-nav", className: "sellio-mobile-nav " + (immersive ? "sellio-mobile-nav--immersive" : ""), "aria-label": "Mobile navigation", children: [
          immersive && /* @__PURE__ */ jsxs("a", { href: "/", className: "sellio-mobile-nav__brand", onClick: () => setMenuOpen(false), children: [
            /* @__PURE__ */ jsx("img", { src: LOGO_URL$1, alt: "Sellio" }),
            /* @__PURE__ */ jsx("span", { children: "Sellio" })
          ] }),
          NAV_ITEMS.map((item) => /* @__PURE__ */ jsxs("a", { href: item.href, onClick: () => setMenuOpen(false), children: [
            item.label,
            /* @__PURE__ */ jsx(ChevronRight, {})
          ] }, item.label)),
          /* @__PURE__ */ jsxs("a", { href: "/Join", onClick: () => setMenuOpen(false), children: [
            "Create a free account",
            /* @__PURE__ */ jsx(ChevronRight, {})
          ] }),
          /* @__PURE__ */ jsxs("a", { href: "/auth", onClick: () => setMenuOpen(false), children: [
            "Merchant Login",
            /* @__PURE__ */ jsx(ChevronRight, {})
          ] }),
          /* @__PURE__ */ jsx("a", { href: "#pricing", className: "sellio-button sellio-button--gradient", onClick: () => setMenuOpen(false), children: "Start Free Trial" })
        ] })
      ]
    }
  );
}
function PricingSection() {
  const [annual, setAnnual] = useState(false);
  return /* @__PURE__ */ jsx("section", { id: "pricing", className: "sellio-section sellio-pricing-section sellio-pricing-section--phase1b", "aria-labelledby": "sellio-pricing-heading", children: /* @__PURE__ */ jsxs("div", { className: "sellio-container", children: [
    /* @__PURE__ */ jsxs("div", { className: "sellio-section-heading sellio-section-heading--center", children: [
      /* @__PURE__ */ jsxs("span", { className: "sellio-eyebrow", children: [
        /* @__PURE__ */ jsx(CircleDollarSign, {}),
        " Start your next chapter"
      ] }),
      /* @__PURE__ */ jsxs("h2", { id: "sellio-pricing-heading", children: [
        "Launch your storefront.",
        /* @__PURE__ */ jsx("br", {}),
        "Claim your place in Sellio World."
      ] }),
      /* @__PURE__ */ jsx("p", { children: "Choose the operations plan that fits your business, enter the right merchant district and start building your presence in the connected marketplace." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "sellio-billing-toggle", role: "group", "aria-label": "Billing period", children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: !annual ? "is-active" : "", onClick: () => setAnnual(false), children: "Monthly" }),
      /* @__PURE__ */ jsxs("button", { type: "button", className: annual ? "is-active" : "", onClick: () => setAnnual(true), children: [
        "Annual ",
        /* @__PURE__ */ jsx("span", { children: "2 months free" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "sellio-pricing-grid", children: PLANS.map((plan) => {
      const amount = annual ? plan.yearly : plan.monthly;
      const href = annual ? plan.links.annual : plan.links.monthly;
      return /* @__PURE__ */ jsxs("article", { className: "sellio-pricing-card " + (plan.badge ? "is-featured" : ""), style: { "--plan-accent": plan.accent }, children: [
        plan.badge && /* @__PURE__ */ jsx("span", { className: "sellio-plan-badge", children: plan.badge }),
        /* @__PURE__ */ jsxs("div", { className: "sellio-pricing-card__top", children: [
          /* @__PURE__ */ jsx("h3", { children: plan.name }),
          /* @__PURE__ */ jsx("p", { children: plan.description })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sellio-plan-price", children: [
          /* @__PURE__ */ jsx("small", { children: "SGD" }),
          /* @__PURE__ */ jsx("strong", { children: amount }),
          /* @__PURE__ */ jsxs("span", { children: [
            "/",
            annual ? "year" : "month"
          ] })
        ] }),
        annual && /* @__PURE__ */ jsxs("p", { className: "sellio-plan-saving", children: [
          "Save SGD ",
          plan.monthly * 12 - plan.yearly,
          " annually"
        ] }),
        /* @__PURE__ */ jsx("ul", { children: plan.features.map((feature) => /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx(Check, {}),
          " ",
          feature
        ] }, feature)) }),
        /* @__PURE__ */ jsxs("a", { href, target: "_blank", rel: "noopener noreferrer", className: "sellio-button sellio-button--plan", children: [
          /* @__PURE__ */ jsx("span", { className: "sellio-plan-cta-long", children: "Start Free Trial" }),
          /* @__PURE__ */ jsx("span", { className: "sellio-plan-cta-short", "aria-hidden": "true", children: "Start" }),
          /* @__PURE__ */ jsx(ArrowUpRight, {})
        ] })
      ] }, plan.key);
    }) }),
    /* @__PURE__ */ jsx("p", { className: "sellio-pricing-note", children: "Eligible new merchants receive a seven-day trial. Prices exclude applicable taxes. Every active merchant can establish a presence in Sellio World." }),
    /* @__PURE__ */ jsxs("p", { className: "sellio-pricing-note", children: [
      "Selling from home? ",
      /* @__PURE__ */ jsx("a", { href: "/Join", style: { fontWeight: 700, textDecoration: "underline" }, children: "Open a free personal shop" }),
      ": up to 10 listings and 100 orders a month."
    ] })
  ] }) });
}
function FAQSection() {
  return /* @__PURE__ */ jsx("section", { className: "sellio-section sellio-faq-section", "aria-labelledby": "sellio-faq-heading", children: /* @__PURE__ */ jsxs("div", { className: "sellio-container sellio-faq-layout", children: [
    /* @__PURE__ */ jsxs("div", { className: "sellio-section-heading", children: [
      /* @__PURE__ */ jsxs("span", { className: "sellio-eyebrow", children: [
        /* @__PURE__ */ jsx(ShieldCheck, {}),
        " Join with confidence"
      ] }),
      /* @__PURE__ */ jsx("h2", { id: "sellio-faq-heading", children: "Your business in Sellio World." }),
      /* @__PURE__ */ jsx("p", { children: "How merchant placement, storefront identity, Sellio Coins and customer discovery work together." })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "sellio-faq-list", children: FAQ_ITEMS.map((item) => /* @__PURE__ */ jsxs("details", { children: [
      /* @__PURE__ */ jsxs("summary", { children: [
        item.question,
        /* @__PURE__ */ jsx("span", { children: "+" })
      ] }),
      /* @__PURE__ */ jsx("p", { children: item.answer })
    ] }, item.question)) })
  ] }) });
}
function Footer({ onCookieSettings }) {
  return /* @__PURE__ */ jsx("footer", { className: "sellio-landing-footer", children: /* @__PURE__ */ jsxs("div", { className: "sellio-container", children: [
    /* @__PURE__ */ jsxs("section", { className: "sellio-footer-launch", "aria-labelledby": "sellio-footer-launch-heading", children: [
      /* @__PURE__ */ jsxs("div", { className: "sellio-footer-launch__copy", children: [
        /* @__PURE__ */ jsxs("span", { className: "sellio-eyebrow", children: [
          /* @__PURE__ */ jsx(Sparkles, {}),
          " Now onboarding merchants"
        ] }),
        /* @__PURE__ */ jsxs("h2", { id: "sellio-footer-launch-heading", children: [
          "Build your storefront.",
          /* @__PURE__ */ jsx("br", {}),
          "Enter Sellio World."
        ] }),
        /* @__PURE__ */ jsx("p", { children: "Bring your business online, join the right merchant district and create a storefront customers can discover, remember and return to." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "sellio-footer-launch__actions", children: [
        /* @__PURE__ */ jsxs("a", { href: "#pricing", className: "sellio-button sellio-button--gradient", children: [
          "View Plans ",
          /* @__PURE__ */ jsx(ArrowRight, {})
        ] }),
        /* @__PURE__ */ jsx("a", { href: "/Join", className: "sellio-button sellio-button--footer-ghost", children: "Start free" }),
        /* @__PURE__ */ jsx("a", { href: "/auth", className: "sellio-button sellio-button--footer-ghost", children: "Merchant Login" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "sellio-footer-main", children: [
      /* @__PURE__ */ jsxs("div", { className: "sellio-footer-brand", children: [
        /* @__PURE__ */ jsxs("div", { className: "sellio-footer-brand__top", children: [
          /* @__PURE__ */ jsx("img", { src: LOGO_URL$1, alt: "Sellio" }),
          /* @__PURE__ */ jsx("span", { children: "Commerce, connected." })
        ] }),
        /* @__PURE__ */ jsxs("h3", { children: [
          "Your storefront today.",
          /* @__PURE__ */ jsx("br", {}),
          "Your place in Sellio World."
        ] }),
        /* @__PURE__ */ jsx("p", { children: "Bring storefronts, orders, operations and merchant progression together in one bright, connected commerce platform." }),
        /* @__PURE__ */ jsxs("a", { className: "sellio-footer-brand__credit", href: "https://apptelier.sg", target: "_blank", rel: "noopener noreferrer", children: [
          "Crafted in Singapore by Apptélier ",
          /* @__PURE__ */ jsx(ArrowUpRight, {})
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sellio-footer-live", "aria-label": "Sellio World availability", children: [
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx("i", {}),
            " Sellio World live"
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx("i", {}),
            " Onboarding open"
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx("i", {}),
            " Sellio Coins active"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "sellio-footer-navigation", children: [
        /* @__PURE__ */ jsx("span", { className: "sellio-footer-navigation__label", children: "Explore the platform" }),
        /* @__PURE__ */ jsxs("div", { className: "sellio-footer-links", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Explore" }),
            /* @__PURE__ */ jsx("a", { href: "#journey", children: "Order journey" }),
            /* @__PURE__ */ jsx("a", { href: "#product", children: "Merchant workspace" }),
            /* @__PURE__ */ jsx("a", { href: "#world", children: "Sellio World" }),
            /* @__PURE__ */ jsx("a", { href: "#vision", children: "Coins & progression" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Merchants" }),
            /* @__PURE__ */ jsx("a", { href: "#pricing", children: "Plans & pricing" }),
            /* @__PURE__ */ jsx("a", { href: "/auth", children: "Merchant Login" }),
            /* @__PURE__ */ jsx("a", { href: DEMO_STORE_URL, target: "_blank", rel: "noopener noreferrer", children: "Explore Demo Store" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Support" }),
            /* @__PURE__ */ jsx("a", { href: "/privacy", children: "Privacy Policy" }),
            /* @__PURE__ */ jsx("a", { href: "/terms", children: "Terms & Conditions" }),
            /* @__PURE__ */ jsx("a", { href: "https://apptelier.sg", target: "_blank", rel: "noopener noreferrer", children: "Apptélier Helpdesk" }),
            /* @__PURE__ */ jsx("a", { href: "mailto:sellio@apptelier.sg", children: "Contact Sellio" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "sellio-footer-bottom", children: [
      /* @__PURE__ */ jsx("span", { children: "© 2026 Sellio by Apptélier." }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "sellio-cookie-settings", onClick: onCookieSettings, children: "Cookie settings" }),
      /* @__PURE__ */ jsx("span", { children: "Built in Singapore · Ready for the world" })
    ] })
  ] }) });
}
function LandingPage() {
  useImmersiveReleaseSnap();
  const [cookieOpen, setCookieOpen] = useState(false);
  const cookieReturnFocus = useRef(null);
  useEffect(() => {
    setCookieOpen(!getCookieConsent());
  }, []);
  useEffect(() => {
    const previousTitle = document.title;
    const selectors = [
      ['meta[name="description"]', "content", LANDING_DESCRIPTION],
      ['meta[name="robots"]', "content", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"],
      ['meta[property="og:title"]', "content", LANDING_TITLE],
      ['meta[property="og:description"]', "content", LANDING_DESCRIPTION],
      ['meta[property="og:url"]', "content", SITE_URL$1],
      ['meta[name="twitter:title"]', "content", LANDING_TITLE],
      ['meta[name="twitter:description"]', "content", LANDING_DESCRIPTION],
      ['meta[name="twitter:url"]', "content", SITE_URL$1]
    ];
    const restored = [];
    const ensureMeta = (selector, attribute, value) => {
      let node = document.querySelector(selector);
      const created = !node;
      if (!node) {
        node = document.createElement("meta");
        const nameMatch = selector.match(/meta\[name="([^"]+)"\]/);
        const propertyMatch = selector.match(/meta\[property="([^"]+)"\]/);
        if (nameMatch) node.setAttribute("name", nameMatch[1]);
        if (propertyMatch) node.setAttribute("property", propertyMatch[1]);
        document.head.appendChild(node);
      }
      restored.push({ node, attribute, previous: node.getAttribute(attribute), created });
      node.setAttribute(attribute, value);
    };
    selectors.forEach(([selector, attribute, value]) => ensureMeta(selector, attribute, value));
    let canonical = document.querySelector('link[rel="canonical"]');
    const createdCanonical = !canonical;
    const previousCanonical = canonical == null ? void 0 : canonical.getAttribute("href");
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", SITE_URL$1);
    document.title = LANDING_TITLE;
    const schemas = [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Sellio",
        url: SITE_URL$1,
        description: LANDING_DESCRIPTION,
        inLanguage: "en-SG",
        publisher: {
          "@type": "Organization",
          name: "Apptelier",
          url: "https://apptelier.sg/"
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Sellio",
        url: SITE_URL$1,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: LANDING_DESCRIPTION,
        offers: PLANS.map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: String(plan.monthly),
          priceCurrency: "SGD",
          url: plan.links.monthly
        })),
        creator: {
          "@type": "Organization",
          name: "Apptelier",
          url: "https://apptelier.sg/"
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer
          }
        }))
      }
    ].map((schema, index) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.sellioLandingSchema = String(index);
      script.text = JSON.stringify(schema);
      document.head.appendChild(script);
      return script;
    });
    return () => {
      document.title = previousTitle;
      restored.forEach(({ node, attribute, previous, created }) => {
        if (created) node.remove();
        else if (previous !== null) node.setAttribute(attribute, previous);
        else node.removeAttribute(attribute);
      });
      if (createdCanonical) canonical.remove();
      else if (previousCanonical) canonical.setAttribute("href", previousCanonical);
      schemas.forEach((script) => script.remove());
    };
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "sellio-landing sellio-landing--phase1b sellio-landing--scrollworld", children: [
    /* @__PURE__ */ jsx("a", { className: "sellio-skip-link", href: "#sellio-main", children: "Skip to content" }),
    /* @__PURE__ */ jsx(LandingHeader, {}),
    /* @__PURE__ */ jsxs("main", { id: "sellio-main", tabIndex: -1, children: [
      /* @__PURE__ */ jsx(HeroWorldTransition, {}),
      /* @__PURE__ */ jsx("section", { className: "sellio-proof-strip sellio-proof-strip--after-world", "aria-label": "Sellio capabilities", children: /* @__PURE__ */ jsxs("div", { className: "sellio-container", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx(Store, {}),
          " Online storefront"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx(QrCode, {}),
          " QR ordering"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx(Bell, {}),
          " Live orders"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx(Package, {}),
          " Inventory"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx(BarChart3, {}),
          " Reports"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx(Users, {}),
          " Staff roles"
        ] })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "sl-chapter-transition sl-chapter-transition--journey sl-snap-chapter", children: /* @__PURE__ */ jsx(CommerceJourney, {}) }),
      /* @__PURE__ */ jsx("div", { className: "sl-chapter-transition sl-chapter-transition--connected sl-snap-chapter", children: /* @__PURE__ */ jsx(ConnectedCommerce, {}) }),
      /* @__PURE__ */ jsx("div", { className: "sl-chapter-transition sl-chapter-transition--workspace sl-snap-chapter", children: /* @__PURE__ */ jsx(ProductShowcase, {}) }),
      /* @__PURE__ */ jsx("div", { className: "sl-chapter-transition sl-chapter-transition--progression sl-release-snap-final", children: /* @__PURE__ */ jsx(WorldLayers, {}) }),
      /* @__PURE__ */ jsx(ChapterTransition, { className: "sl-chapter-transition--pricing", label: "Pricing chapter", children: /* @__PURE__ */ jsx(PricingSection, {}) }),
      /* @__PURE__ */ jsx(ChapterTransition, { className: "sl-chapter-transition--faq", label: "Frequently asked questions", children: /* @__PURE__ */ jsx(FAQSection, {}) })
    ] }),
    /* @__PURE__ */ jsx(ChapterTransition, { className: "sl-chapter-transition--footer", label: "Sellio footer", children: /* @__PURE__ */ jsx(Footer, { onCookieSettings: (event) => {
      cookieReturnFocus.current = event.currentTarget;
      setCookieOpen(true);
    } }) }),
    /* @__PURE__ */ jsx(CookieConsent, { open: cookieOpen, onOpenChange: setCookieOpen, returnFocusRef: cookieReturnFocus })
  ] });
}
const LOGO_URL = "https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png";
const SITE_URL = "https://sellio.apptelier.sg";
function useLegalMetadata({ title, description, path, dateModified }) {
  useEffect(() => {
    const previousTitle = document.title;
    const descriptionNode = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionNode == null ? void 0 : descriptionNode.getAttribute("content");
    const canonicalUrl = SITE_URL + path;
    let canonical = document.querySelector('link[rel="canonical"]');
    const createdCanonical = !canonical;
    const previousCanonical = canonical == null ? void 0 : canonical.getAttribute("href");
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const previousOgTitle = ogTitle == null ? void 0 : ogTitle.getAttribute("content");
    const previousOgDescription = ogDescription == null ? void 0 : ogDescription.getAttribute("content");
    const previousOgUrl = ogUrl == null ? void 0 : ogUrl.getAttribute("content");
    const previousTwitterTitle = twitterTitle == null ? void 0 : twitterTitle.getAttribute("content");
    const previousTwitterDescription = twitterDescription == null ? void 0 : twitterDescription.getAttribute("content");
    let robots = document.querySelector('meta[name="robots"]');
    const createdRobots = !robots;
    const previousRobots = robots == null ? void 0 : robots.getAttribute("content");
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    document.title = title + " | Sellio";
    descriptionNode == null ? void 0 : descriptionNode.setAttribute("content", description);
    canonical.setAttribute("href", canonicalUrl);
    robots.setAttribute("content", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
    ogTitle == null ? void 0 : ogTitle.setAttribute("content", title + " | Sellio");
    ogDescription == null ? void 0 : ogDescription.setAttribute("content", description);
    ogUrl == null ? void 0 : ogUrl.setAttribute("content", canonicalUrl);
    twitterTitle == null ? void 0 : twitterTitle.setAttribute("content", title + " | Sellio");
    twitterDescription == null ? void 0 : twitterDescription.setAttribute("content", description);
    const schema = document.createElement("script");
    schema.type = "application/ld+json";
    schema.dataset.sellioLegalSchema = path;
    schema.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      url: canonicalUrl,
      dateModified,
      isPartOf: {
        "@type": "WebSite",
        name: "Sellio",
        url: SITE_URL
      },
      inLanguage: "en-SG",
      publisher: {
        "@type": "Organization",
        name: "Apptelier",
        url: "https://apptelier.sg"
      }
    });
    document.head.appendChild(schema);
    return () => {
      document.title = previousTitle;
      if (descriptionNode && previousDescription) descriptionNode.setAttribute("content", previousDescription);
      if (createdCanonical) canonical.remove();
      else if (previousCanonical) canonical.setAttribute("href", previousCanonical);
      if (createdRobots) robots.remove();
      else if (previousRobots) robots.setAttribute("content", previousRobots);
      if (ogTitle && previousOgTitle) ogTitle.setAttribute("content", previousOgTitle);
      if (ogDescription && previousOgDescription) ogDescription.setAttribute("content", previousOgDescription);
      if (ogUrl && previousOgUrl) ogUrl.setAttribute("content", previousOgUrl);
      if (twitterTitle && previousTwitterTitle) twitterTitle.setAttribute("content", previousTwitterTitle);
      if (twitterDescription && previousTwitterDescription) twitterDescription.setAttribute("content", previousTwitterDescription);
      schema.remove();
    };
  }, [dateModified, description, path, title]);
}
function LegalPage({
  title,
  eyebrow,
  intro,
  description,
  path,
  lastUpdated,
  sections: sections2
}) {
  useLegalMetadata({
    title,
    description,
    path,
    dateModified: "2026-09-22"
  });
  const [cookieOpen, setCookieOpen] = useState(false);
  const cookieReturnFocus = useRef(null);
  useEffect(() => {
    setCookieOpen(!getCookieConsent());
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "sellio-legal-page", children: [
    /* @__PURE__ */ jsx("a", { className: "sellio-legal-skip", href: "#legal-content", children: "Skip to content" }),
    /* @__PURE__ */ jsx("header", { className: "sellio-legal-header", children: /* @__PURE__ */ jsxs("div", { className: "sellio-legal-container sellio-legal-header__inner", children: [
      /* @__PURE__ */ jsxs("a", { className: "sellio-legal-logo", href: "/", "aria-label": "Sellio home", children: [
        /* @__PURE__ */ jsx("img", { src: LOGO_URL, alt: "Sellio" }),
        /* @__PURE__ */ jsx("span", { children: "Sellio" })
      ] }),
      /* @__PURE__ */ jsxs("nav", { className: "sellio-legal-header__actions", "aria-label": "Policy navigation", children: [
        /* @__PURE__ */ jsxs("a", { href: "/", className: "sellio-legal-back", children: [
          /* @__PURE__ */ jsx(ArrowLeft, { "aria-hidden": "true" }),
          " Back to Sellio"
        ] }),
        /* @__PURE__ */ jsxs("a", { href: "/auth", className: "sellio-legal-login", children: [
          "Merchant Login ",
          /* @__PURE__ */ jsx(ArrowRight, { "aria-hidden": "true" })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("main", { id: "legal-content", tabIndex: -1, children: [
      /* @__PURE__ */ jsx("section", { className: "sellio-legal-hero", "aria-labelledby": "legal-page-title", children: /* @__PURE__ */ jsxs("div", { className: "sellio-legal-container", children: [
        /* @__PURE__ */ jsxs("span", { className: "sellio-legal-eyebrow", children: [
          /* @__PURE__ */ jsx(ShieldCheck, { "aria-hidden": "true" }),
          " ",
          eyebrow
        ] }),
        /* @__PURE__ */ jsx("h1", { id: "legal-page-title", children: title }),
        /* @__PURE__ */ jsx("p", { className: "sellio-legal-intro", children: intro }),
        /* @__PURE__ */ jsxs("div", { className: "sellio-legal-meta", children: [
          /* @__PURE__ */ jsxs("span", { children: [
            "Last updated ",
            lastUpdated
          ] }),
          /* @__PURE__ */ jsx("span", { children: "Apptélier · Singapore" })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "sellio-legal-container sellio-legal-layout", children: [
        /* @__PURE__ */ jsxs("aside", { className: "sellio-legal-toc", "aria-label": "Table of contents", children: [
          /* @__PURE__ */ jsx("p", { children: "On this page" }),
          /* @__PURE__ */ jsx("nav", { children: sections2.map((section, index) => /* @__PURE__ */ jsxs("a", { href: "#" + section.id, children: [
            /* @__PURE__ */ jsx("span", { children: String(index + 1).padStart(2, "0") }),
            section.title
          ] }, section.id)) })
        ] }),
        /* @__PURE__ */ jsxs("article", { className: "sellio-legal-article", children: [
          /* @__PURE__ */ jsxs("div", { className: "sellio-legal-notice", children: [
            /* @__PURE__ */ jsx("strong", { children: "Plain-language notice" }),
            /* @__PURE__ */ jsx("p", { children: "We have written this page to explain Sellio clearly. It should be read together with any plan, checkout, merchant agreement or service notice that applies to you." })
          ] }),
          sections2.map((section, index) => /* @__PURE__ */ jsxs("section", { id: section.id, className: "sellio-legal-section", "aria-labelledby": section.id + "-title", children: [
            /* @__PURE__ */ jsx("div", { className: "sellio-legal-section__number", children: String(index + 1).padStart(2, "0") }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h2", { id: section.id + "-title", children: section.title }),
              section.content
            ] })
          ] }, section.id))
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("footer", { className: "sellio-legal-footer", children: [
      /* @__PURE__ */ jsxs("div", { className: "sellio-legal-container sellio-legal-footer__top", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("a", { className: "sellio-legal-logo sellio-legal-logo--footer", href: "/", "aria-label": "Sellio home", children: [
            /* @__PURE__ */ jsx("img", { src: LOGO_URL, alt: "" }),
            /* @__PURE__ */ jsx("span", { children: "Sellio" })
          ] }),
          /* @__PURE__ */ jsx("p", { children: "Storefronts, orders and merchant operations—connected." })
        ] }),
        /* @__PURE__ */ jsxs("nav", { "aria-label": "Legal links", children: [
          /* @__PURE__ */ jsx("a", { href: "/privacy", "aria-current": path === "/privacy" ? "page" : void 0, children: "Privacy Policy" }),
          /* @__PURE__ */ jsx("a", { href: "/terms", "aria-current": path === "/terms" ? "page" : void 0, children: "Terms & Conditions" }),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: (event) => {
                cookieReturnFocus.current = event.currentTarget;
                setCookieOpen(true);
              },
              children: [
                /* @__PURE__ */ jsx(Cookie, { "aria-hidden": "true" }),
                " Cookie settings"
              ]
            }
          ),
          /* @__PURE__ */ jsx("a", { href: "mailto:sellio@apptelier.sg", children: "Contact" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "sellio-legal-container sellio-legal-footer__bottom", children: [
        /* @__PURE__ */ jsx("span", { children: "© 2026 Sellio by Apptélier." }),
        /* @__PURE__ */ jsx("span", { children: "Built in Singapore · Ready for the world" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(CookieConsent, { open: cookieOpen, onOpenChange: setCookieOpen, returnFocusRef: cookieReturnFocus })
  ] });
}
const sections$1 = [
  {
    id: "who-we-are",
    title: "Who we are and what this policy covers",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Sellio is a commerce platform operated by Apptélier in Singapore. It helps merchants create public storefronts, manage products, inventory, tables, staff and orders, review reports, and participate in Sellio World." }),
      /* @__PURE__ */ jsxs("p", { children: [
        "This policy applies when you visit ",
        /* @__PURE__ */ jsx("a", { href: "https://sellio.apptelier.sg", children: "sellio.apptelier.sg" }),
        ", create or use a Sellio account, use a merchant workspace, browse or order from a Sellio-powered storefront, contact us, or otherwise interact with Sellio."
      ] }),
      /* @__PURE__ */ jsx("p", { children: "A merchant may have its own privacy notice for its customers and staff. Where a merchant decides what customer or staff information to collect through its storefront or operations, that merchant is responsible for its own privacy obligations and Sellio processes the relevant information to provide the platform." })
    ] })
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("h3", { children: "Account and profile information" }),
      /* @__PURE__ */ jsx("p", { children: "We may collect your name, email address, phone number, sign-in details, profile preferences, account role, merchant membership and onboarding information. Authentication credentials are handled through our authentication services; we do not display your password to merchants or other users." }),
      /* @__PURE__ */ jsx("h3", { children: "Merchant and storefront information" }),
      /* @__PURE__ */ jsx("p", { children: "Merchants may provide business names, contact details, branch information, logos, banners, themes, product or service listings, descriptions, prices, categories, stock information, table details, operating settings and other material used to run or display a storefront." }),
      /* @__PURE__ */ jsx("h3", { children: "Orders and customer information" }),
      /* @__PURE__ */ jsx("p", { children: "When an order is placed or managed, Sellio may process order items, quantities, prices, fulfilment status, table or takeaway details, payment method or payment status, customer name and any contact or order information submitted for that transaction." }),
      /* @__PURE__ */ jsx("h3", { children: "Billing information" }),
      /* @__PURE__ */ jsx("p", { children: "Merchant plan purchases and subscription management are processed through Stripe. We receive billing records such as the plan, subscription status, billing period, currency, transaction identifiers and limited payment status information. Stripe, rather than Sellio, handles full card details." }),
      /* @__PURE__ */ jsx("h3", { children: "Device, usage and support information" }),
      /* @__PURE__ */ jsx("p", { children: "We may receive IP address, browser and device type, operating system, referring page, app activity, error and security logs, cookie identifiers, language and interface preferences, and information you provide when asking for support." }),
      /* @__PURE__ */ jsx("h3", { children: "AI feature inputs" }),
      /* @__PURE__ */ jsx("p", { children: "If you use Sellio AI features, we process the prompts, product images, business questions and related context you submit so the requested result can be generated. Please do not submit confidential, sensitive or unnecessary personal information to an AI feature." })
    ] })
  },
  {
    id: "how-we-collect",
    title: "How we collect information",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "We collect information directly from you, from merchants and their authorised staff, automatically through the website and app, and from services you choose to connect or use." }),
      /* @__PURE__ */ jsx("p", { children: "If you sign in with Google, Google provides the account information needed to authenticate you, such as your name, email address and profile identifier, according to the permissions shown during sign-in. You can manage the connection through your Google account." }),
      /* @__PURE__ */ jsx("p", { children: "Merchants may enter information about staff, customers, products or orders. Merchants are responsible for having an appropriate reason and, where required, permission to provide that information to Sellio." })
    ] })
  },
  {
    id: "how-we-use",
    title: "How we use information",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "We use information where reasonably necessary to:" }),
      /* @__PURE__ */ jsxs("ul", { children: [
        /* @__PURE__ */ jsx("li", { children: "create, authenticate, secure and administer accounts;" }),
        /* @__PURE__ */ jsx("li", { children: "provide storefronts, QR ordering, order management, inventory, reporting, staff permissions and merchant tools;" }),
        /* @__PURE__ */ jsx("li", { children: "process merchant subscriptions and maintain billing status;" }),
        /* @__PURE__ */ jsx("li", { children: "display merchant-provided content to customers and route order information to the relevant merchant;" }),
        /* @__PURE__ */ jsx("li", { children: "provide AI-assisted features requested by the user;" }),
        /* @__PURE__ */ jsx("li", { children: "send service, account, security, billing and support communications;" }),
        /* @__PURE__ */ jsx("li", { children: "detect misuse, investigate incidents and protect Sellio, merchants and customers;" }),
        /* @__PURE__ */ jsx("li", { children: "understand performance and improve the platform, where allowed by your cookie choice;" }),
        /* @__PURE__ */ jsx("li", { children: "comply with applicable law, enforce our terms and resolve disputes; and" }),
        /* @__PURE__ */ jsx("li", { children: "carry out another purpose explained at collection or authorised by you." })
      ] }),
      /* @__PURE__ */ jsx("p", { children: "Under Singapore's Personal Data Protection Act 2012 (PDPA), we rely on consent and on other grounds permitted by law, including what is reasonably necessary to provide a service you requested, manage a contractual relationship, protect legitimate interests or comply with legal obligations." })
    ] })
  },
  {
    id: "merchant-customer-data",
    title: "Merchant, staff and customer data",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: "sellio-legal-callout", children: /* @__PURE__ */ jsxs("p", { children: [
        /* @__PURE__ */ jsx("strong", { children: "For storefront customers:" }),
        " the merchant whose storefront you use is responsible for its products, fulfilment and customer relationship. Contact that merchant first about an order or its use of your information. You may also contact us where your request concerns the Sellio platform."
      ] }) }),
      /* @__PURE__ */ jsx("p", { children: "Merchant owners control who is invited to their workspace and what permissions staff receive. Staff should use only their own authorised account and access business or customer information only for legitimate work purposes." }),
      /* @__PURE__ */ jsx("p", { children: "Some merchant storefront details, product information and branding are intentionally public. Merchants should not publish personal information or content they do not have the right to make public." })
    ] })
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Sellio uses essential cookies and similar browser storage for sign-in, session continuity, security, navigation, interface preferences and core app functions. These are required for the service to work and are not disabled by declining optional analytics." }),
      /* @__PURE__ */ jsxs("p", { children: [
        "Our cookie panel lets you allow or decline optional site-usage analytics. We remember that choice in your browser for up to 180 days. Optional analytics operate only after permission is given and when such analytics are enabled. You can reopen ",
        /* @__PURE__ */ jsx("strong", { children: "Cookie settings" }),
        " from the footer at any time."
      ] }),
      /* @__PURE__ */ jsx("p", { children: "Clearing browser data, using a different device or browser, or changing our consent setup may cause Sellio to ask again. Blocking essential browser storage may prevent sign-in or other functions from working properly." })
    ] })
  },
  {
    id: "sharing",
    title: "When we share information",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "We do not sell personal information. We share or make information available only as reasonably needed for the purposes described in this policy, including with:" }),
      /* @__PURE__ */ jsxs("ul", { children: [
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "the relevant merchant and its authorised staff" }),
          ", for storefront, order, customer service and operational purposes;"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Supabase" }),
          ", for database, authentication, storage and related platform services;"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Stripe" }),
          ", for merchant checkout, subscriptions, invoices and billing management;"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Google" }),
          ", when you choose Google sign-in or another Google-enabled function;"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "service providers" }),
          " supporting hosting, content delivery, communications, monitoring, security, support and AI-assisted functions;"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "professional advisers, authorities or other parties" }),
          " where reasonably necessary to comply with law, protect rights and safety, investigate misuse, or establish or defend legal claims; and"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "a successor or transaction party" }),
          " in connection with a genuine restructuring, financing, sale or transfer of all or part of the service, subject to appropriate confidentiality protections."
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { children: "Each third-party service may process information under its own terms and privacy notice. We seek to use providers appropriate to the nature of the service and information involved." })
    ] })
  },
  {
    id: "international-transfers",
    title: "International data transfers",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Sellio is operated from Singapore, but some service providers may process or store information in other countries. Those countries may have privacy laws different from Singapore's." }),
      /* @__PURE__ */ jsx("p", { children: "Where the PDPA requires it, we take reasonable steps to ensure transferred personal data receives a standard of protection comparable to the protection under the PDPA, including through provider terms, contractual protections and security controls appropriate to the service." })
    ] })
  },
  {
    id: "retention",
    title: "How long we keep information",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "We keep information only for as long as it is reasonably needed to provide Sellio, administer an account or merchant relationship, maintain accurate business and transaction records, meet legal or tax obligations, resolve disputes, enforce agreements and protect the service." }),
      /* @__PURE__ */ jsx("p", { children: "Retention periods vary by data type. Account and active merchant data generally remain while the account or relationship is active. Order, billing, audit, fraud-prevention and backup records may be retained longer where reasonably necessary or legally required. When information is no longer required, we delete, anonymise or securely isolate it in accordance with our processes." })
    ] })
  },
  {
    id: "security",
    title: "How we protect information",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "We use reasonable administrative, technical and organisational safeguards designed for the nature of the information and service, including authentication controls, role-based access, encrypted network connections, restricted administrative access, monitoring and service-provider security controls." }),
      /* @__PURE__ */ jsx("p", { children: "No online service can guarantee absolute security. You are responsible for using a strong password, protecting your sign-in method and devices, keeping staff access current, and promptly notifying us if you suspect unauthorised access." })
    ] })
  },
  {
    id: "rights",
    title: "Your rights and choices",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Subject to the PDPA and its exceptions, you may ask to access personal data we hold about you, learn how it has been used or disclosed, correct an error or omission, or withdraw consent for future collection, use or disclosure. You may also ask us to close your account, delete information that is no longer needed, or stop optional processing." }),
      /* @__PURE__ */ jsx("p", { children: "Some requests may be limited where we must retain information, protect another person's rights, preserve security or transaction records, or comply with law. Withdrawing consent may affect our ability to continue providing features that depend on that information." }),
      /* @__PURE__ */ jsxs("p", { children: [
        "To delete your Sellio account, email ",
        /* @__PURE__ */ jsx("a", { href: "mailto:sellio@apptelier.sg", children: "sellio@apptelier.sg" }),
        " from the email address you sign in with, tell us it is a deletion request and why (see ",
        /* @__PURE__ */ jsx("a", { href: "/delete-account", children: "how to request account deletion" }),
        "). We will confirm with you before anything is deleted. If your account owns a store, we will also agree with you what happens to the store and its records so shared business data is protected."
      ] }),
      /* @__PURE__ */ jsxs("p", { children: [
        "To make another privacy request, email ",
        /* @__PURE__ */ jsx("a", { href: "mailto:sellio@apptelier.sg", children: "sellio@apptelier.sg" }),
        " with enough detail for us to identify you and understand the request. We may take reasonable steps to verify your identity. If the information is controlled by a merchant, we may direct the request to that merchant or assist it in responding."
      ] })
    ] })
  },
  {
    id: "children",
    title: "Children",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Sellio merchant accounts and administrative tools are intended for adults and authorised business users. We do not knowingly invite children to open merchant accounts or provide personal information through those tools." }),
      /* @__PURE__ */ jsx("p", { children: "Public storefronts may be browsed by a general audience. Merchants are responsible for ensuring their offerings and any customer information they request are suitable and lawful for their audience. If you believe a child has provided personal data to Sellio inappropriately, contact us so we can review it." })
    ] })
  },
  {
    id: "links-and-services",
    title: "External links and third-party services",
    content: /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx("p", { children: "Sellio may link to merchant websites, payment pages, social platforms, maps or other third-party services. We do not control those services and this policy does not govern their independent privacy practices. Review the relevant third party's notice before providing information." }) })
  },
  {
    id: "changes",
    title: "Changes to this policy",
    content: /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx("p", { children: "We may update this policy when Sellio, our providers or applicable requirements change. We will post the revised policy here and update the date above. If a change is material, we may also provide an in-app, account or email notice where appropriate." }) })
  },
  {
    id: "contact",
    title: "Contact us",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "For privacy questions, requests or complaints concerning Sellio, contact:" }),
      /* @__PURE__ */ jsxs("p", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Apptélier — Sellio Privacy" }),
        /* @__PURE__ */ jsx("br", {}),
        "Singapore",
        /* @__PURE__ */ jsx("br", {}),
        /* @__PURE__ */ jsx("a", { href: "mailto:sellio@apptelier.sg", children: "sellio@apptelier.sg" })
      ] }),
      /* @__PURE__ */ jsx("p", { children: "We will review your message and respond within a reasonable period. If you remain dissatisfied, you may have the right to contact Singapore's Personal Data Protection Commission." })
    ] })
  }
];
function Privacy() {
  return /* @__PURE__ */ jsx(
    LegalPage,
    {
      title: "Privacy Policy",
      eyebrow: "Your data, handled with care",
      intro: "This policy explains what Sellio collects, why we use it, when it may be shared and the choices available to merchants, staff and storefront customers.",
      description: "Read Sellio's Privacy Policy for merchants, staff and customers, including accounts, storefronts, orders, cookies, subscriptions and Singapore PDPA rights.",
      path: "/privacy",
      lastUpdated: "22 September 2026",
      sections: sections$1
    }
  );
}
const sections = [
  {
    id: "agreement",
    title: "Agreement to these terms",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("p", { children: [
        "These Terms and Conditions govern your access to and use of Sellio, including our website, merchant workspace, public storefronts, QR ordering, Sellio World and related features (together, the ",
        /* @__PURE__ */ jsx("strong", { children: "Services" }),
        "). Sellio is operated by Apptélier in Singapore."
      ] }),
      /* @__PURE__ */ jsxs("p", { children: [
        "By accessing or using the Services, creating an account, accepting an invitation, purchasing a plan or placing an order through a Sellio-powered storefront, you agree to these terms and our ",
        /* @__PURE__ */ jsx("a", { href: "/privacy", children: "Privacy Policy" }),
        ". If you do not agree, do not use the Services."
      ] }),
      /* @__PURE__ */ jsx("p", { children: "If you use Sellio for a business or other organisation, you confirm that you have authority to accept these terms for that organisation. “You” then includes both you and that organisation." })
    ] })
  },
  {
    id: "eligibility",
    title: "Eligibility and authority",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "You must be legally capable of entering into these terms. Merchant owners and account administrators must be at least 18 years old and authorised to act for the relevant business." }),
      /* @__PURE__ */ jsx("p", { children: "If a person under 18 browses or orders from a merchant storefront, that person should do so with the involvement of a parent or legal guardian where required. Merchants remain responsible for ensuring their offerings are lawful and age-appropriate." })
    ] })
  },
  {
    id: "services",
    title: "What Sellio provides",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Sellio provides software and digital infrastructure that may include branded storefronts, product and category management, QR and table ordering, order and kitchen workflows, inventory, reports, staff roles, notifications, themes, AI-assisted tools, merchant progression and marketplace discovery." }),
      /* @__PURE__ */ jsx("p", { children: "Features, plan limits and availability may differ by plan, merchant category, device, region or development stage. Illustrations, prototypes, roadmap items and future areas of Sellio World describe intended direction and are not a promise that a feature will launch by a particular date." }),
      /* @__PURE__ */ jsx("p", { children: "Where you have a separate signed proposal, statement of work, service agreement or order form with Apptélier, that document also applies. If it directly conflicts with these terms, the signed document controls for the subject it covers." })
    ] })
  },
  {
    id: "accounts",
    title: "Accounts, roles and security",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "You must provide accurate, current and complete account information and keep it updated. You are responsible for safeguarding your password, Google sign-in, device and session, and for activity carried out through your account unless caused by our breach." }),
      /* @__PURE__ */ jsx("p", { children: "Do not share one login among multiple people. Merchant owners should invite staff individually, assign only the permissions needed for their work, review access regularly and remove access promptly when a role changes or employment ends." }),
      /* @__PURE__ */ jsxs("p", { children: [
        "You must notify ",
        /* @__PURE__ */ jsx("a", { href: "mailto:sellio@apptelier.sg", children: "sellio@apptelier.sg" }),
        " without undue delay if you suspect unauthorised access. We may require identity or authority checks before changing ownership, billing or sensitive account settings."
      ] })
    ] })
  },
  {
    id: "merchant-responsibilities",
    title: "Merchant responsibilities",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Each merchant is responsible for its business, storefront and customer relationship. A merchant must:" }),
      /* @__PURE__ */ jsxs("ul", { children: [
        /* @__PURE__ */ jsx("li", { children: "publish accurate business, product, service, price, tax, availability and fulfilment information;" }),
        /* @__PURE__ */ jsx("li", { children: "honour accepted orders and clearly communicate cancellations, substitutions, refunds and delays;" }),
        /* @__PURE__ */ jsx("li", { children: "comply with laws, licences, permits and industry rules that apply to its goods, services, promotions and operations;" }),
        /* @__PURE__ */ jsx("li", { children: "use customer and staff information lawfully and provide any privacy notice required for its activities;" }),
        /* @__PURE__ */ jsx("li", { children: "maintain appropriate inventory, food-safety, product-safety and consumer-protection practices;" }),
        /* @__PURE__ */ jsx("li", { children: "ensure content and branding do not infringe another person's rights; and" }),
        /* @__PURE__ */ jsx("li", { children: "configure staff roles, payment methods, receipt details, taxes and operational settings correctly." })
      ] }),
      /* @__PURE__ */ jsx("p", { children: "Sellio does not verify every merchant listing, product, service or licence. We may review, restrict or remove material that appears unlawful, misleading, unsafe or inconsistent with these terms." })
    ] })
  },
  {
    id: "customer-orders",
    title: "Customer orders and merchant transactions",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: "sellio-legal-callout", children: /* @__PURE__ */ jsxs("p", { children: [
        /* @__PURE__ */ jsx("strong", { children: "The merchant is the seller." }),
        " When a customer orders from a Sellio-powered storefront, the purchase is between that customer and the merchant. Sellio supplies the technology used to present and manage the order."
      ] }) }),
      /* @__PURE__ */ jsx("p", { children: "The merchant is responsible for accepting, preparing, fulfilling, cancelling and refunding orders, as well as for product quality, safety, availability, pricing, taxes, warranties and customer support. Customers should check the merchant's information and order details before submitting an order." }),
      /* @__PURE__ */ jsx("p", { children: "Sellio may transmit order status and other messages supplied by the merchant. Such status information is operational and may change. If an order, payment, refund or product issue arises, contact the merchant first. We may assist with platform-related issues but do not become the seller or guarantor of the transaction." })
    ] })
  },
  {
    id: "subscriptions",
    title: "Plans, trials and subscriptions",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Merchant features are offered under the plans, prices, billing periods and usage limits shown on the Sellio website or at checkout. Prices are in Singapore dollars unless stated otherwise and may exclude applicable taxes." }),
      /* @__PURE__ */ jsx("p", { children: "Eligible merchants may receive a trial or promotional offer. The checkout or offer states the applicable duration, eligibility and conversion terms. Unless it clearly says otherwise, providing a payment method for a recurring plan authorises the plan to begin billing when the trial or promotional period ends." }),
      /* @__PURE__ */ jsx("p", { children: "Monthly and annual subscriptions renew automatically for successive billing periods until cancelled. You authorise Stripe and Sellio to charge the payment method associated with the subscription for the plan price, applicable taxes and any authorised changes." }),
      /* @__PURE__ */ jsx("p", { children: "Plan limits may include products, orders, staff, branches, tables, reports, roles or other usage. We may restrict a feature, request an upgrade or apply a separately disclosed charge if usage exceeds the purchased plan." })
    ] })
  },
  {
    id: "billing",
    title: "Billing, cancellation and refunds",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "You can manage an eligible subscription through the billing portal made available in Sellio. Cancellation normally takes effect at the end of the current paid billing period, unless the billing portal or a written agreement states otherwise. You remain responsible for charges incurred before cancellation takes effect." }),
      /* @__PURE__ */ jsx("p", { children: "Subscription fees are generally non-refundable once a billing period begins, except where required by law or expressly promised in writing. A plan change, credit or exception shown in Stripe or confirmed by us will apply according to its stated terms." }),
      /* @__PURE__ */ jsx("p", { children: "If a charge fails, becomes overdue or is reversed, we may retry payment, provide a limited grace period, restrict paid functions, suspend merchant access or cancel the subscription. Restoring payment does not guarantee recovery of changes or transactions attempted while access was restricted." }),
      /* @__PURE__ */ jsx("p", { children: "We may change future pricing or plan design. For an existing paid subscription, we will provide reasonable notice before a material price change applies to a later renewal, unless the change is required urgently by law or concerns an optional purchase you initiate." })
    ] })
  },
  {
    id: "payments",
    title: "Payments and third-party payment services",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Stripe processes merchant plan checkout, recurring subscription payments, invoices and billing management. Stripe's own terms and privacy notice also apply to its services." }),
      /* @__PURE__ */ jsx("p", { children: "A merchant may configure customer-facing payment methods such as cash, bank transfer, PayNow, payment QR or a supported online payment option. Unless Sellio expressly states otherwise for a specific payment product, Sellio is not a bank, stored-value facility, escrow agent or money-transfer service and does not hold customer funds." }),
      /* @__PURE__ */ jsx("p", { children: "Merchants are responsible for reconciling payments, issuing refunds, resolving chargebacks and complying with the rules of their chosen payment providers. A status recorded in Sellio does not by itself prove that funds have finally settled." })
    ] })
  },
  {
    id: "content",
    title: "Your content and permissions",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "You retain ownership of content you submit to Sellio, including business information, product data, photographs, logos, themes and written material. You grant Apptélier a worldwide, non-exclusive, royalty-free licence to host, copy, process, adapt for technical display, transmit and show that content only as reasonably needed to operate, secure, improve and promote the Services and your public storefront." }),
      /* @__PURE__ */ jsx("p", { children: "You confirm that you have all rights and permissions needed for the content and for any personal data it contains. Do not upload confidential information, malicious code, misleading material or content that infringes intellectual property, privacy, publicity or other rights." }),
      /* @__PURE__ */ jsx("p", { children: "You may request removal of your content, subject to legitimate retention needs, completed transactions, backups and legal obligations. Public content may remain in search caches or third-party copies outside our control for a period after removal." })
    ] })
  },
  {
    id: "sellio-property",
    title: "Sellio intellectual property",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "The Services, software, interface, Sellio name, logos, visual world, documentation, templates, original designs and other platform materials are owned by Apptélier or its licensors and are protected by intellectual-property laws." }),
      /* @__PURE__ */ jsx("p", { children: "While your account is active and you comply with these terms, we grant you a limited, non-exclusive, non-transferable and revocable right to use the Services for their intended business or customer purpose. You may not copy, sell, sublicense, reverse engineer, scrape, bypass access controls, create a competing service from, or misuse protected parts of Sellio except where applicable law does not allow that restriction." }),
      /* @__PURE__ */ jsx("p", { children: "Feedback and suggestions may be used to improve Sellio without payment or obligation, provided we do not publicly identify you as the source without permission." })
    ] })
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "You must not use Sellio to:" }),
      /* @__PURE__ */ jsxs("ul", { children: [
        /* @__PURE__ */ jsx("li", { children: "break the law, facilitate fraud or sell prohibited, counterfeit, unsafe or unlawfully regulated goods or services;" }),
        /* @__PURE__ */ jsx("li", { children: "mislead customers about identity, price, availability, reviews, fulfilment or promotions;" }),
        /* @__PURE__ */ jsx("li", { children: "harass, exploit, discriminate against or harm another person;" }),
        /* @__PURE__ */ jsx("li", { children: "upload malware, interfere with security, probe vulnerabilities or disrupt the Services;" }),
        /* @__PURE__ */ jsx("li", { children: "access another tenant, account or dataset without authorisation;" }),
        /* @__PURE__ */ jsx("li", { children: "send spam, conduct unauthorised surveillance or misuse personal data;" }),
        /* @__PURE__ */ jsx("li", { children: "automate extraction, excessive requests or other activity that unreasonably burdens the platform; or" }),
        /* @__PURE__ */ jsx("li", { children: "evade plan limits, usage controls, suspension or enforcement." })
      ] }),
      /* @__PURE__ */ jsx("p", { children: "We may investigate suspected misuse and cooperate with merchants, service providers or authorities where reasonably necessary and lawful." })
    ] })
  },
  {
    id: "ai",
    title: "AI-assisted features",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Sellio may offer AI-assisted product content, image analysis, business questions or other generated results. Outputs can be incomplete, inaccurate, outdated or unsuitable. You must review an output before publishing it or relying on it for business decisions." }),
      /* @__PURE__ */ jsx("p", { children: "AI outputs are not legal, accounting, tax, medical, safety or other professional advice. Merchants remain responsible for product claims, allergens, prices, stock, translations, customer communications and decisions made using an output." }),
      /* @__PURE__ */ jsx("p", { children: "Do not submit sensitive personal data, payment credentials, trade secrets or content you are not permitted to process. We may apply reasonable usage and rate limits to protect availability, cost and fair access." })
    ] })
  },
  {
    id: "coins",
    title: "Sellio Coins and digital rewards",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Sellio Coins and similar rewards are in-platform promotional items intended for eligible features such as cosmetic storefront upgrades, decorations or progression. Unless we expressly state otherwise, they are not money, electronic money, stored value, securities or property redeemable for cash." }),
      /* @__PURE__ */ jsx("p", { children: "Coins may be subject to earning, purchase, redemption, expiry, transfer and usage rules shown in the relevant feature. We may correct errors, reverse fraudulent activity and adjust coin rules or availability with reasonable notice where practicable. You may not sell, exchange or trade Coins outside authorised Sellio functions." })
    ] })
  },
  {
    id: "third-parties",
    title: "Third-party services and links",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Sellio relies on or links to third-party services, including Supabase, Stripe, Google and services used for hosting, communications, maps, AI, monitoring or merchant content. Your use of a third-party service may be governed by that provider's own terms." }),
      /* @__PURE__ */ jsx("p", { children: "We are not responsible for third-party websites, products, outages, changes or independent conduct that we do not control. We will use reasonable efforts to maintain our integrations, but a provider change may require us to modify, replace or discontinue a related Sellio feature." })
    ] })
  },
  {
    id: "availability",
    title: "Availability, maintenance and changes",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "We aim to keep Sellio reliable, but the Services are provided on an “as available” basis. Maintenance, updates, internet conditions, service providers, emergencies or events outside reasonable control may cause errors, delay or downtime." }),
      /* @__PURE__ */ jsx("p", { children: "We may improve, replace, limit or discontinue features. Where a material change adversely affects an active paid plan, we will give reasonable notice where practicable and consider an appropriate transition, except where immediate action is needed for security, legal compliance or platform integrity." }),
      /* @__PURE__ */ jsx("p", { children: "You are responsible for maintaining appropriate business continuity procedures and exporting important records where Sellio provides an export function. Sellio should not be your only record of information that your business is legally required to retain." })
    ] })
  },
  {
    id: "suspension",
    title: "Suspension and termination",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "You may stop using Sellio and cancel your subscription. We may suspend or terminate access where payment is overdue, an account materially or repeatedly breaches these terms, use creates security or legal risk, a merchant's activity may harm customers or others, or we are required to act by law or a service provider." }),
      /* @__PURE__ */ jsx("p", { children: "Where reasonably possible, we will provide notice and an opportunity to address the issue. We may act immediately where delay could create harm, liability, fraud, data loss, security risk or unlawful activity." }),
      /* @__PURE__ */ jsxs("p", { children: [
        "On termination, your right to use the Services ends. Before cancellation takes effect, you should export records you need where an export is available. We handle remaining data according to the ",
        /* @__PURE__ */ jsx("a", { href: "/privacy", children: "Privacy Policy" }),
        ", legitimate retention needs and any separate written agreement."
      ] })
    ] })
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "To the fullest extent permitted by law, Sellio is provided without implied warranties of uninterrupted availability, merchantability, fitness for a particular purpose, non-infringement or that every error will be corrected. We do not guarantee business results, marketplace traffic, revenue, customer demand or a particular AI output." }),
      /* @__PURE__ */ jsx("p", { children: "We do not endorse or warrant a merchant, customer, listing, product, service or transaction merely because it appears on Sellio. Nothing in these terms excludes a warranty, guarantee or consumer right that applicable law does not allow to be excluded." })
    ] })
  },
  {
    id: "liability",
    title: "Limitation of liability",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Nothing in these terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for fraud or fraudulent misrepresentation, wilful misconduct, or death or personal injury caused by negligence where the law prohibits exclusion." }),
      /* @__PURE__ */ jsx("p", { children: "To the fullest extent permitted by law, Apptélier is not liable for indirect, incidental, special, punitive or consequential loss, or for loss of profits, revenue, goodwill, anticipated savings, business opportunity or data, arising from use of or inability to use Sellio." }),
      /* @__PURE__ */ jsx("p", { children: "To the fullest extent permitted by law, Apptélier's total aggregate liability arising from or relating to the Services and these terms will not exceed the greater of SGD 200 or the fees you paid for the affected Sellio service during the 12 months before the event giving rise to the claim." }),
      /* @__PURE__ */ jsx("p", { children: "The limitations in this section reflect the allocation of risk in the subscription price and apply regardless of the legal theory, but remain subject to any non-excludable rights under applicable law." })
    ] })
  },
  {
    id: "indemnity",
    title: "Business-user indemnity",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "If you use Sellio for a business or organisation, you will indemnify Apptélier and its personnel against reasonable third-party claims, losses, penalties and costs arising from your unlawful merchant activity, your products or services, your content, your misuse of personal data, or your material breach of these terms, except to the extent caused by Apptélier's own breach, negligence or wilful misconduct." }),
      /* @__PURE__ */ jsx("p", { children: "We will notify you of a covered claim where reasonably practicable and allow reasonable participation in its defence. You must not settle a claim in a way that admits fault for or imposes an obligation on Apptélier without our written consent." })
    ] })
  },
  {
    id: "general",
    title: "General legal terms",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("p", { children: [
        "These terms, the ",
        /* @__PURE__ */ jsx("a", { href: "/privacy", children: "Privacy Policy" }),
        " and any applicable signed agreement form the agreement concerning your use of Sellio. If any provision is held invalid or unenforceable, the remaining provisions continue in effect. A failure to enforce a provision is not a waiver."
      ] }),
      /* @__PURE__ */ jsx("p", { children: "You may not transfer your account or these terms without our written consent. We may transfer these terms as part of a genuine restructuring, financing or transfer of the Sellio business, provided this does not reduce non-excludable rights." }),
      /* @__PURE__ */ jsx("p", { children: "Neither party is liable for delay caused by events beyond its reasonable control, except that this does not excuse payment obligations already due. These terms do not create a partnership, employment, agency or joint venture relationship." })
    ] })
  },
  {
    id: "law-and-disputes",
    title: "Governing law and disputes",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "These terms are governed by the laws of Singapore, without regard to conflict-of-law rules. The courts of Singapore have exclusive jurisdiction over disputes arising from or relating to these terms or the Services, unless applicable law requires otherwise." }),
      /* @__PURE__ */ jsx("p", { children: "Before starting formal proceedings, you and Apptélier agree to make a good-faith effort to resolve the dispute by written notice and discussion for at least 30 days. This does not prevent either party from seeking urgent injunctive relief or using a statutory complaint process." })
    ] })
  },
  {
    id: "changes",
    title: "Changes to these terms",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "We may update these terms to reflect changes to Sellio, pricing, providers, security, law or business operations. We will post the revised terms here and update the date above. For a material change affecting an active paid service, we will provide reasonable advance notice where practicable." }),
      /* @__PURE__ */ jsx("p", { children: "If you do not agree to revised terms, you must stop using the affected Services and cancel before the change takes effect. Continued use after the effective date means you accept the revised terms." })
    ] })
  },
  {
    id: "contact",
    title: "Contact us",
    content: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Questions, notices and complaints about these terms may be sent to:" }),
      /* @__PURE__ */ jsxs("p", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Apptélier — Sellio" }),
        /* @__PURE__ */ jsx("br", {}),
        "Singapore",
        /* @__PURE__ */ jsx("br", {}),
        /* @__PURE__ */ jsx("a", { href: "mailto:sellio@apptelier.sg", children: "sellio@apptelier.sg" })
      ] })
    ] })
  }
];
function Terms() {
  return /* @__PURE__ */ jsx(
    LegalPage,
    {
      title: "Terms and Conditions",
      eyebrow: "Clear terms for connected commerce",
      intro: "These terms explain the rules for using Sellio as a merchant, staff member or storefront customer, including accounts, orders, subscriptions, content and Sellio Coins.",
      description: "Read Sellio's Terms and Conditions for merchant accounts, storefront orders, Stripe subscriptions, AI features, Sellio Coins and platform use.",
      path: "/terms",
      lastUpdated: "22 September 2026",
      sections
    }
  );
}
const PRERENDER_ROUTES = ["/", "/privacy", "/terms"];
const IMAGE = "https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png";
const ROBOTS = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const ROUTES = {
  "/": {
    Component: LandingPage,
    title: "Sellio — Storefronts, Operations & Marketplace for Modern Commerce",
    description: "Sellio connects branded storefronts, F&B ordering and merchant operations with an evolving sector-based marketplace world.",
    socialDescription: "Open your storefront, run daily operations and grow into a sector-based marketplace world with Sellio.",
    canonical: "https://sellio.apptelier.sg/"
  },
  "/privacy": {
    Component: Privacy,
    title: "Privacy Policy | Sellio",
    description: "Read Sellio's Privacy Policy for merchants, staff and customers, including accounts, storefronts, orders, cookies, subscriptions and Singapore PDPA rights.",
    socialDescription: "Read Sellio's Privacy Policy for merchants, staff and customers, including accounts, storefronts, orders, cookies, subscriptions and Singapore PDPA rights.",
    canonical: "https://sellio.apptelier.sg/privacy"
  },
  "/terms": {
    Component: Terms,
    title: "Terms and Conditions | Sellio",
    description: "Read Sellio's Terms and Conditions for merchant accounts, storefront orders, Stripe subscriptions, AI features, Sellio Coins and platform use.",
    socialDescription: "Read Sellio's Terms and Conditions for merchant accounts, storefront orders, Stripe subscriptions, AI features, Sellio Coins and platform use.",
    canonical: "https://sellio.apptelier.sg/terms"
  }
};
function escapeAttr(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function headFor(route) {
  const title = escapeAttr(route.title);
  const description = escapeAttr(route.description);
  const socialDescription = escapeAttr(route.socialDescription);
  const canonical = escapeAttr(route.canonical);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${ROBOTS}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${canonical}" />`,
    '<meta property="og:site_name" content="Sellio" />',
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${socialDescription}" />`,
    `<meta property="og:image" content="${IMAGE}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${socialDescription}" />`,
    `<meta name="twitter:image" content="${IMAGE}" />`
  ].join("\n");
}
function renderRoute(path) {
  const route = ROUTES[path];
  if (!route) throw new Error(`Unsupported prerender route: ${path}`);
  const html = renderToString(/* @__PURE__ */ jsx(route.Component, {}));
  return { html, head: headFor(route) };
}
export {
  PRERENDER_ROUTES,
  renderRoute
};
