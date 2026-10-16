import { Toaster as SonnerToaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import Splash from './pages/Splash';
import Storefront from './pages/Storefront';
import { useEffect, useLayoutEffect, useState, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLoader from '@/components/ui-custom/AppLoader';
import AppRefreshProvider from '@/components/ui-custom/AppRefreshProvider';
import { AppUserProvider, useAppUser } from '@/lib/AppUserContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import MobileOAuthReturn from '@/components/auth/MobileOAuthReturn';
import { isMobileOAuthCallback } from '@/lib/mobileOAuth';
import LaunchSplash from '@/components/ui-custom/LaunchSplash';
import GoogleSignInRelay from '@/components/auth/GoogleSignInRelay';
import { startLaunch } from '@/lib/appLaunch';
import { GOOGLE_RELAY_PATH } from '@/lib/googleRelay';

// Pages the app never starts on load on demand, so its first download stays small.
const LandingPage = lazy(() => import('@/components/landing/LandingPage'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const AccountDeletion = lazy(() => import('./pages/AccountDeletion'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const PageNotFound = lazy(() => import('./lib/PageNotFound'));
const ListingPage = lazy(() => import('@/components/explore/ListingPage'));
const ExploreListings = lazy(() => import('@/components/explore/ExploreListings'));
const ExploreMe = lazy(() => import('@/components/explore/ExploreMe'));
const ExploreChats = lazy(() => import('@/components/explore/ExploreChats'));
const ExploreChatThread = lazy(() => import('@/components/explore/ExploreChats').then((m) => ({ default: m.ExploreChatThread })));

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const PUBLIC_INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const PRIVATE_ROBOTS = 'noindex, nofollow';

function RouteIndexingGuard() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(location.search);
    const isStorefront = /^\/store\/[^/]+$/.test(path);
    const isListing = /^\/listing\/[^/]+$/.test(path);
    const isPrivateStoreVariant = isStorefront && (params.get('preview') === 'true' || params.get('staff') === 'true');
    const isPublicPage = path === '/' || path === '/privacy' || path === '/terms' || path === '/explore';
    const isPublicStorefront = isStorefront && !isPrivateStoreVariant;
    const content = isPublicPage || isPublicStorefront || isListing ? PUBLIC_INDEX_ROBOTS : PRIVATE_ROBOTS;

    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }
    robots.setAttribute('content', content);
  }, [location.pathname, location.search]);

  return null;
}

// Base44's native wrapper opens the root URL and exposes these bridges.
// The app opens on Explore under the Sellio launch splash (LaunchSplash,
// lib/appLaunch.js), signed in or not; an opening link with a query or hash
// (invites, recovery) still goes to Auth. Ordinary browser visits keep the public
// landing page. Only the root route changes, so storefront, password recovery and
// other deep links keep their routes.
const hasNativeBridge = () => typeof window !== 'undefined' && (
  typeof window.ReactNativeWebView?.postMessage === 'function' ||
  typeof window.__hybrid_bridge?.sendMessage === 'function'
);

const RootRoute = () => {
  const { appUser } = useAppUser();
  const location = useLocation();
  const [isNativeApp, setIsNativeApp] = useState(hasNativeBridge);

  useEffect(() => {
    if (isNativeApp) return;

    // Also handle wrappers that inject their bridge after React mounts.
    const timer = window.setInterval(() => {
      if (hasNativeBridge()) setIsNativeApp(true);
    }, 100);
    const timeout = window.setTimeout(() => window.clearInterval(timer), 5000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [isNativeApp]);

  // The app's start: one Sellio splash until the first screen is ready.
  useLayoutEffect(() => {
    if (isNativeApp) startLaunch();
  }, [isNativeApp]);

  // Leaving the start page for the app or the Dashboard: drop the landing prerender
  // (LandingPage removes it itself once loaded).
  useLayoutEffect(() => {
    if (isNativeApp || appUser) document.getElementById('sellio-prerender')?.remove();
  }, [isNativeApp, appUser]);

  if (isNativeApp) {
    if (location.search || location.hash) {
      return <Navigate to={{ pathname: '/Auth', search: location.search, hash: location.hash }} replace />;
    }
    return <Navigate to="/explore" replace />;
  }

  return appUser ? <Navigate to="/Dashboard" replace /> : <LandingPage />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading screen while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppLoader />;
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Suspense fallback={<AppLoader />}>
      <Routes>
        {Object.entries(Pages).map(([path, Page]) => (
          <Route
            key={path}
            path={`/${path}`}
            element={
              <LayoutWrapper currentPageName={path}>
                <div key={path} className="sellio-page-enter">
                  <Page />
                </div>
              </LayoutWrapper>
            }
          />
        ))}
        <Route path="/Splash" element={<Splash />} />
        <Route path="/UserManagement" element={<LayoutWrapper currentPageName="UserManagement"><UserManagement /></LayoutWrapper>} />
        <Route path="/listing/:productId" element={<LayoutWrapper currentPageName="Explore"><ListingPage /></LayoutWrapper>} />
        <Route path="/explore/listings" element={<LayoutWrapper currentPageName="Explore"><ExploreListings /></LayoutWrapper>} />
        <Route path="/explore/me" element={<LayoutWrapper currentPageName="Explore"><ExploreMe /></LayoutWrapper>} />
        <Route path="/explore/chats" element={<LayoutWrapper currentPageName="Explore"><ExploreChats /></LayoutWrapper>} />
        <Route path="/explore/chats/:conversationId" element={<LayoutWrapper currentPageName="Explore"><ExploreChatThread /></LayoutWrapper>} />
        <Route path="/store/:tenantSlug" element={<Storefront />} />
        <Route path="/order/:tenantSlug/:tableId" element={<Storefront />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {
  // The external-browser callback must not initialize the normal auth/profile
  // providers or consume the code before it reaches the originating WebView.
  if (isMobileOAuthCallback(window.location.href)) return <MobileOAuthReturn />;
  // Google sign-in from the app starts here (index.html forwards before this loads).
  if (window.location.pathname === GOOGLE_RELAY_PATH) return <GoogleSignInRelay />;
  return (
    <AppUserProvider>
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <AppRefreshProvider>
        <Router>
          <RouteIndexingGuard />
          <NavigationTracker />
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<RootRoute />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/delete-account" element={<AccountDeletion />} />
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </Suspense>
        </Router>
        <SonnerToaster />
        <LaunchSplash />
        </AppRefreshProvider>
      </QueryClientProvider>
    </AuthProvider>
    </AppUserProvider>
  )
}

export default App
