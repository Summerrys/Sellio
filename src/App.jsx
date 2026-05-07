import { Toaster as SonnerToaster } from 'sonner';
import { motion } from 'framer-motion';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import SupabaseTest from './pages/SupabaseTest';
import Splash from './pages/Splash';
import DataMigration from './pages/DataMigration';
import AdminRoles from './pages/AdminRoles';
import { useEffect, Suspense } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { AppUserProvider } from '@/lib/AppUserContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
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
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    }>
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
        <Route path="/SupabaseTest" element={<SupabaseTest />} />
        <Route path="/DataMigration" element={<LayoutWrapper currentPageName="DataMigration"><DataMigration /></LayoutWrapper>} />
        <Route path="/AdminRoles" element={<LayoutWrapper currentPageName="AdminRoles"><AdminRoles /></LayoutWrapper>} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (e) => document.documentElement.classList.toggle('dark', e.matches);
    apply(mq);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <AppUserProvider>
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <Routes>
            <Route path="/" element={<Splash />} />
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