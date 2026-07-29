import { Toaster as SonnerToaster } from 'sonner';
import { motion } from 'framer-motion';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Splash from './pages/Splash';
import LandingPage from '@/components/landing/LandingPage';
import Storefront from './pages/Storefront';
import { useEffect, Suspense } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLoader from '@/components/ui-custom/AppLoader';
import { AppUserProvider, useAppUser } from '@/lib/AppUserContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import UserManagement from './pages/UserManagement';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// The bare root URL is where a merchant lands if they type just the
// domain, or have an old/manual bookmark to it (the PWA install itself is
// unaffected — its start_url is /Splash, which already runs the real
// session-recovery check in Auth.jsx before ever reaching Dashboard). That
// left one real gap: LandingPage is a static marketing page with no
// session awareness at all, and React Router ranks the exact "/" match
// above the "/*" wildcard that AuthenticatedApp lives on — so a logged-in
// merchant hitting bare "/" always saw the marketing page instead of their
// dashboard, even on a simple refresh. appUser is a synchronous,
// cookie-backed read (see AppUserContext) — the same signal already used
// everywhere else in the app — so this check is instant, no loading flash
// before the redirect.
const RootRoute = () => {
  const { appUser } = useAppUser();
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
        <Router>
          <NavigationTracker />
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <SonnerToaster />
      </QueryClientProvider>
    </AuthProvider>
    </AppUserProvider>
  )
}

export default App
