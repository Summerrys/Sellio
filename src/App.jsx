import { Toaster as SonnerToaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import Splash from './pages/Splash';
import Storefront from './pages/Storefront';
import { useEffect, useLayoutEffect, useState, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLoader from '@/components/ui-custom/AppLoader';
import AppRefreshProvider from '@/components/ui-custom/AppRefreshProvider';
import { AppUserProvider, useAppUser } from '@/lib/AppUserContext';
import { homeFor } from '@/lib/staffAccess';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import LaunchSplash from '@/components/ui-custom/LaunchSplash';
import SignInWelcome from '@/components/auth/SignInWelcome';
import { AppLanguagePreviewBadge } from '@/components/ui-custom/AppLanguageSwitch';
import { startLaunch } from '@/lib/appLaunch';
import { appPlatform, isNativeApp as inSellioApp } from '@/lib/nativeApp';
import { alertsKind } from '@/lib/pushAlerts';
import PushPrompt from '@/components/notifications/PushPrompt';
import OfflineKeeper from '@/components/ui-custom/OfflineKeeper';
import PresencePing from '@/components/chat/PresencePing';
import ConnectionStatus from '@/components/ui-custom/ConnectionStatus';
import PermissionHelp from '@/components/ui-custom/PermissionHelp';
import SignedOutNotice from '@/components/ui-custom/SignedOutNotice';
import { captureReferral } from '@/lib/referral';
import { dropEdgeHead, hasEdgeHead } from '@/lib/pageMeta';

// Pages the app never starts on load on demand, so its first download stays small.
const LandingPage = lazy(() => import('@/components/landing/LandingPage'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const AccountDeletion = lazy(() => import('./pages/AccountDeletion'));
// A courier's one-time delivery page (sellio.sg/courier/…): public, no account.
const CourierHandover = lazy(() => import('./pages/CourierHandover'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const PageNotFound = lazy(() => import('./lib/PageNotFound'));
const ListingPage = lazy(() => import('@/components/explore/ListingPage'));
const ExploreListings = lazy(() => import('@/components/explore/ExploreListings'));
const ExploreMe = lazy(() => import('@/components/explore/ExploreMe'));
const ExploreChats = lazy(() => import('@/components/explore/ExploreChats'));
const ExploreChatThread = lazy(() => import('@/components/explore/ExploreChats').then((m) => ({ default: m.ExploreChatThread })));
const ExploreArchivedChats = lazy(() => import('@/components/explore/ExploreChats').then((m) => ({ default: m.ExploreArchivedChats })));
const ExplorePurchases = lazy(() => import('@/components/explore/ExplorePurchases'));
const PurchaseDetail = lazy(() => import('@/components/explore/ExplorePurchases').then((m) => ({ default: m.PurchaseDetail })));
const ExploreModeration = lazy(() => import('@/components/explore/ExploreModeration'));
const ExploreCart = lazy(() => import('@/components/explore/ExploreCart'));
const ExploreLikes = lazy(() => import('@/components/explore/ExploreLikes'));
const ShopRatings = lazy(() => import('@/components/ratings/ShopRatingsPage'));
const AppFeedbackInbox = lazy(() => import('@/components/feedback/AppFeedbackInbox'));
const CoinsAdmin = lazy(() => import('@/components/admin/CoinsAdmin'));
const AppRatingPrompt = lazy(() => import('@/components/feedback/AppRatingPrompt'));
const Refer = lazy(() => import('./pages/Refer'));
const Wallet = lazy(() => import('./pages/Wallet'));
const ReferralInvite = lazy(() => import('./pages/ReferralInvite'));
const DistributorTerms = lazy(() => import('./pages/DistributorTerms'));

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const PUBLIC_INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const PRIVATE_ROBOTS = 'noindex, nofollow';
// The address this visit opened at. The website may have written that page's head (a storefront,
// an item, Explore: lib/pageMeta.js); it stays only while the visitor is on that page.
const OPENED_AT = typeof window === 'undefined' ? '' : window.location.pathname;

function RouteIndexingGuard() {
  const location = useLocation();

  useEffect(() => {
    // Moved on in the app: the head the website wrote for the first page goes, so this page's own
    // title, canonical, robots and structured data stand alone.
    if (location.pathname !== OPENED_AT) dropEdgeHead();
    // Still on that page: its robots rule stands (the website knows the page: a shop that's gone
    // or has no items yet, a preview).
    else if (hasEdgeHead()) return;
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

// Refer & earn: a link with ?ref=CODE, on any page, keeps that code for the owner's sign-up
// (lib/referral.js). The invite page, /r/CODE, keeps its own.
function ReferralCapture() {
  const { search } = useLocation();
  useEffect(() => {
    if (/[?&]ref=/i.test(search)) captureReferral(search);
  }, [search]);
  return null;
}

// Sellio's apps (Android and iPhone) open the root URL.
// The app opens on Explore under the Sellio launch splash (LaunchSplash,
// lib/appLaunch.js), signed in or not; an opening link with a query or hash
// (invites, recovery) still goes to Auth. Ordinary browser visits keep the public
// landing page. Only the root route changes, so storefront, password recovery and
// other deep links keep their routes.
const RootRoute = () => {
  const { appUser } = useAppUser();
  const location = useLocation();
  const [isNativeApp] = useState(() => inSellioApp());

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

  // Signed in: Explore (a staff login: its shop's Dashboard).
  return appUser ? <Navigate to={homeFor(appUser)} replace /> : <LandingPage />;
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
        <Route path="/Ratings" element={<LayoutWrapper currentPageName="Ratings"><ShopRatings /></LayoutWrapper>} />
        <Route path="/listing/:productId" element={<LayoutWrapper currentPageName="Explore"><ListingPage /></LayoutWrapper>} />
        <Route path="/explore/listings" element={<LayoutWrapper currentPageName="Explore"><ExploreListings /></LayoutWrapper>} />
        <Route path="/explore/me" element={<LayoutWrapper currentPageName="Explore"><ExploreMe /></LayoutWrapper>} />
        <Route path="/explore/chats" element={<LayoutWrapper currentPageName="Explore"><ExploreChats /></LayoutWrapper>} />
        <Route path="/explore/chats/archived" element={<LayoutWrapper currentPageName="Explore"><ExploreArchivedChats /></LayoutWrapper>} />
        <Route path="/explore/chats/:conversationId" element={<LayoutWrapper currentPageName="Explore"><ExploreChatThread /></LayoutWrapper>} />
        <Route path="/explore/purchases" element={<LayoutWrapper currentPageName="Explore"><ExplorePurchases /></LayoutWrapper>} />
        <Route path="/explore/purchases/:orderId" element={<LayoutWrapper currentPageName="Explore"><PurchaseDetail /></LayoutWrapper>} />
        <Route path="/explore/cart" element={<LayoutWrapper currentPageName="Explore"><ExploreCart /></LayoutWrapper>} />
        <Route path="/explore/likes" element={<LayoutWrapper currentPageName="Explore"><ExploreLikes /></LayoutWrapper>} />
        <Route path="/moderation" element={<LayoutWrapper currentPageName="Explore"><ExploreModeration /></LayoutWrapper>} />
        <Route path="/admin/feedback" element={<LayoutWrapper currentPageName="Explore"><AppFeedbackInbox /></LayoutWrapper>} />
        {/* Admin → Coins: Sellio Coins' rules and the stall items' prices (components/admin/CoinsAdmin.jsx). */}
        <Route path="/admin/coins" element={<LayoutWrapper currentPageName="Explore"><CoinsAdmin /></LayoutWrapper>} />
        <Route path="/refer" element={<LayoutWrapper currentPageName="Explore"><Refer /></LayoutWrapper>} />
        {/* My coins: the signed-in person's Sellio Coins wallet (pages/Wallet.jsx; admins until Sellio World opens). */}
        <Route path="/wallet" element={<LayoutWrapper currentPageName="Explore"><Wallet /></LayoutWrapper>} />
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
        {/* The app's records on the phone for no connection (before the pages, which use them). */}
        <OfflineKeeper />
        <AppRefreshProvider>
        <Router>
          <RouteIndexingGuard />
          <ReferralCapture />
          {/* "You've been signed out" when Sellio's sign-in ended by itself (src/lib/signOutWatch.js). */}
          <SignedOutNotice />
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<RootRoute />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/delete-account" element={<AccountDeletion />} />
              <Route path="/r/:code" element={<ReferralInvite />} />
              <Route path="/courier/:link" element={<CourierHandover />} />
              <Route path="/distributor-terms" element={<DistributorTerms />} />
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </Suspense>
        </Router>
        <SonnerToaster />
        {/* "You're offline. Reconnecting…" above the bottom bar, on every page. */}
        <ConnectionStatus />
        {/* "Camera is off for Sellio" and the like: why, and Open Settings (src/lib/permissionHelp.js). */}
        <PermissionHelp />
        {/* "Welcome back!" on the page a sign-in opens (the sign-in page itself is gone by then). */}
        <SignInWelcome />
        {/* A reviewer's preview of the app in Bahasa Indonesia, and how to end it. */}
        <AppLanguagePreviewBadge />
        {/* Online and last seen in Chats, while Sellio is on screen. */}
        <PresencePing />
        {/* Sellio's question before the phone's or browser's about alerts (the Android app, and
            browsers that can show them: src/lib/pushAlerts.js). */}
        {alertsKind() && <PushPrompt />}
        {/* "How's Sellio working for you?": once, on the third day someone opens the Android app
            (src/lib/appFeedback.js). Admin → Feedback (/admin/feedback) reads the answers. */}
        {appPlatform() === 'android' && <Suspense fallback={null}><AppRatingPrompt /></Suspense>}
        <LaunchSplash />
        </AppRefreshProvider>
      </QueryClientProvider>
    </AuthProvider>
    </AppUserProvider>
  )
}

export default App
