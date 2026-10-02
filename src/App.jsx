import { Toaster as SonnerToaster } from 'sonner';
import { motion } from 'framer-motion';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Splash from './pages/Splash';
import LandingPage from '@/components/landing/LandingPage';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import AccountDeletion from './pages/AccountDeletion';
import Storefront from './pages/Storefront';
import { useEffect, useState, Suspense } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLoader from '@/components/ui-custom/AppLoader';
import AppRefreshProvider from '@/components/ui-custom/AppRefreshProvider';
import { AppUserProvider, useAppUser } from '@/lib/AppUserContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import UserManagement from './pages/UserManagement';

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
    const isPrivateStoreVariant = isStorefront && (params.get('preview') === 'true' || params.get('staff') === 'true');
    const isPublicPage = path === '/' || path === '/privacy' || path === '/terms';
    const isPublicStorefront = isStorefront && !isPrivateStoreVariant;
    const content = isPublicPage || isPublicStorefront ? PUBLIC_INDEX_ROBOTS : PRIVATE_ROBOTS;

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
// Native launches show Splash, then Auth's Supabase session recovery; ordinary
// browser visits keep the public landing page. Only the root route changes,
// so storefront, password recovery and other deep links keep their routes.
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

  if (isNativeApp) {
    return <Navigate to={{ pathname: '/Splash', search: location.search, hash: location.hash }} replace />;
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
                <motion.div
                  key={path}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  <Page />
                </motion.div>
              </LayoutWrapper>
            }
          />
        ))}
        <Route path="/Splash" element={<Splash />} />
        <Route path="/UserManagement" element={<LayoutWrapper currentPageName="UserManagement"><UserManagement /></LayoutWrapper>} />
        <Route path="/store/:tenantSlug" element={<Storefront />} />
        <Route path="/order/:tenantSlug/:tableId" element={<Storefront />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {
  return (
    <AppUserProvider>
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <AppRefreshProvider>
        <Router>
          <RouteIndexingGuard />
          <NavigationTracker />
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/delete-account" element={<AccountDeletion />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <SonnerToaster />
        </AppRefreshProvider>
      </QueryClientProvider>
    </AuthProvider>
    </AppUserProvider>
  )
}

export default App
