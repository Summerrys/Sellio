import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { TenantProvider, useTenant } from './components/tenant/TenantContext';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { NotificationProvider } from './components/notifications/NotificationProvider';
import NotificationBell from './components/notifications/NotificationBell';
import RoleSwitcher from './components/dev/RoleSwitcher';
import {
  LayoutDashboard,
  ShoppingBag,
  ClipboardList,
  Grid3X3,
  Package,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Building2,
  BarChart3,
  LogOut,
  Menu,
  X,
  QrCode,
  ArrowLeft,
  Plus,
  AlertCircle,
  Clock
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import ProductFormDialog from './components/products/ProductFormDialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { base44 } from '@/api/base44Client';
import { useAppUser } from '@/lib/AppUserContext';
import { cn } from '@/lib/utils';
import UpgradeWall from './components/subscription/UpgradeWall';
import PricingModal from './components/subscription/PricingModal';

const publicPages = ['CustomerMenu', 'CustomerOrder', 'Auth'];

function SidebarContent({ collapsed, currentPageName, tenant, user, isSuperAdmin, isRealSuperAdmin, hasPermission, clearAppUser, onNavigate, subscription }) {
  const superAdminItems = [];

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  // Tenant menu with permission requirements
  const allTenantItems = [
    { label: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', permission: null },
    { label: 'Products', icon: ShoppingBag, page: 'Products', permission: 'products.view' },
    { label: 'Categories', icon: Grid3X3, page: 'Categories', permission: 'categories.view' },
    { label: 'Orders', icon: ClipboardList, page: 'Orders', permission: 'orders.view' },
    { label: 'Inventory', icon: Package, page: 'Inventory', permission: 'inventory.view' },
    ...(/f&b|cafe|restaurant|food/i.test(tenant?.industry) ? [{ label: 'Tables & QR', icon: QrCode, page: 'Tables', permission: 'tables.view' }] : []),
    { label: 'User Management', icon: Users, page: 'UserManagement', permission: 'staff.view' },
    { label: 'Settings', icon: Settings, page: 'TenantSettings', permission: 'settings.view' },
  ];

  // Filter tenant items based on permissions
  const tenantItems = allTenantItems.filter(item => 
    item.permission === null || hasPermission?.(item.permission)
  );

  const navItems = [...superAdminItems, ...tenantItems];

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn("flex items-center h-16 px-4 border-b border-slate-100", collapsed && "justify-center")}>
        <div className="flex items-center gap-2.5">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className={collapsed ? 'h-7 w-7 object-contain rounded' : 'h-8 object-contain'} />
          ) : (
            <>
              <img src="https://assets.apptelier.sg/sellio/Logo_Sellio.png" alt="Sellio" className={collapsed ? 'h-8 w-auto object-contain' : 'h-10 w-auto object-contain'} />
              {!collapsed && tenant?.name && (
                <div>
                  <span className="font-bold text-sm text-slate-900 tracking-tight">{tenant.name}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tenant Badge */}
      {tenant && !collapsed && (
        <div className="mx-3 mt-4 mb-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
          <p className="text-xs font-medium text-slate-900 truncate">{tenant.name}</p>
          {(() => {
            const trialEnd = subscription?.current_period_end;
            const hoursLeft = trialEnd ? Math.max(0, Math.floor((new Date(trialEnd) - new Date()) / (1000 * 60 * 60))) : null;
            const daysLeft = hoursLeft !== null ? Math.floor(hoursLeft / 24) : null;
            if (subscription?.status === 'trial' && hoursLeft !== null) {
              return (
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{
                      background: hoursLeft <= 24
                        ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                        : 'var(--color-primary-gradient)',
                      color: '#fff',
                    }}
                  >
                    <Clock className="w-3 h-3" />
                    {hoursLeft <= 24 ? `${hoursLeft}h left` : `Trial: ${daysLeft}d left`}
                  </span>
                </div>
              );
            }
            return <span className="text-xs text-slate-400 capitalize">{subscription?.tier || tenant.plan || 'Free'} Plan</span>;
          })()}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item, idx) => {
          if (item.type === 'divider') {
            return <div key={idx} className="h-px bg-slate-100 my-3" />;
          }
          const Icon = item.icon;
          const isActive = currentPageName === item.page;
          return (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 hover:bg-[rgb(var(--color-primary-100))]",
                collapsed && "justify-center px-2"
              )}
              style={isActive ? { background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' } : {}}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" style={{ width: 18, height: 18 }} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className={cn("p-3 border-t border-slate-100", collapsed && "flex justify-center")}>
        {!collapsed ? (
          <div className="flex items-center gap-3 p-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-slate-100 text-slate-600 text-xs font-medium">
                {user?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.full_name || 'User'}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-slate-400 hover:text-slate-600"
              onClick={() => {
                clearAppUser();
                window.location.href = createPageUrl('Auth');
              }}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-slate-400 hover:text-slate-600"
            onClick={() => {
              clearAppUser();
              window.location.href = createPageUrl('Auth');
            }}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function AppLayout({ children, currentPageName }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [showTrialBanner, setShowTrialBanner] = useState(true);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const { appUser: customUser, clearAppUser } = useAppUser();
  const { user, tenant, isSuperAdmin, isLoading, hasPermission } = useTenant();

  const tenantId = tenant?.id;
  useEffect(() => {
    if (!tenantId) return;
    getSupabase().then(supabase =>
      supabase.from('subscriptions').select('*').eq('tenant_id', tenantId).order('created_date', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => setSubscription(data))
    );
  }, [tenantId]);

  const isLocked = subscription && (
    subscription.status === 'cancelled' ||
    subscription.status === 'past_due' ||
    (subscription.status === 'trial' && new Date(subscription.current_period_end) < new Date())
  );

  // Persist scroll position per bottom-tab page
  const scrollPositions = useRef({});
  const handleTabNavigate = useCallback((page, isActive) => {
    if (isActive) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Save current scroll position for the current page
    scrollPositions.current[currentPageName] = window.scrollY;
  }, [currentPageName]);

  // Restore scroll position when page changes (bottom-tab pages only)
  useEffect(() => {
    const tabPages = ['Dashboard', 'Orders', 'Products', 'TenantSettings'];
    if (tabPages.includes(currentPageName)) {
      const saved = scrollPositions.current[currentPageName] ?? 0;
      // Use rAF to wait for render before restoring
      requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: 'instant' }));
    }
  }, [currentPageName]);
  
  // Check if this is a REAL SuperAdmin OR dev role is set to superadmin
  const devRoleOverride = localStorage.getItem('dev_role_override');
  const isRealSuperAdmin = (!devRoleOverride && user?.role === 'admin') || devRoleOverride === 'superadmin';

  const displayUser = customUser || user;

  if (publicPages.includes(currentPageName)) {
    return <>{children}</>;
  }

  if (isLocked) {
    return <UpgradeWall />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <style>{`
          @keyframes colorCycle {
            0% { background: linear-gradient(135deg, #3b82f6, #06b6d4); }
            50% { background: linear-gradient(135deg, #7c3aed, #3b82f6); }
            100% { background: linear-gradient(135deg, #3b82f6, #06b6d4); }
          }
          .color-cycle-bg {
            animation: colorCycle 3s ease-in-out infinite;
          }
        `}</style>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl color-cycle-bg flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <style>{`
        :root {
          --sidebar-width: ${collapsed ? '72px' : '260px'};
        }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
      `}</style>

      {/* Desktop Sidebar */}
      {currentPageName !== 'Onboarding' && (
      <aside
        className={cn(
          "hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-white border-r border-slate-100 z-30 transition-all duration-300",
          collapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        <SidebarContent collapsed={collapsed} currentPageName={currentPageName} tenant={tenant} user={displayUser} isSuperAdmin={isSuperAdmin} isRealSuperAdmin={isRealSuperAdmin} hasPermission={hasPermission} clearAppUser={clearAppUser} onNavigate={() => {}} subscription={subscription} />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-3 h-3 text-slate-600" /> : <ChevronLeft className="w-3 h-3 text-slate-600" />}
        </button>
      </aside>
      )}

      {/* Mobile Header */}
      {currentPageName !== 'Onboarding' && (
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-100 z-30 flex items-center px-4 justify-between"
        style={{ height: 'calc(56px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center gap-2">
          {window.history.length > 1 && !['Dashboard','Orders','Products','TenantSettings'].includes(currentPageName) ? (
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => window.history.back()}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          ) : tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="h-8 w-auto object-contain rounded" />
          ) : (
            <img src="https://assets.apptelier.sg/sellio/Logo_Sellio.png" alt="Sellio" className="h-10 w-auto object-contain" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {displayUser && <NotificationBell />}
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[280px] bg-white shadow-xl">
            <div className="absolute top-4 right-4">
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setMobileOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <SidebarContent collapsed={false} currentPageName={currentPageName} tenant={tenant} user={displayUser} isSuperAdmin={isSuperAdmin} isRealSuperAdmin={isRealSuperAdmin} hasPermission={hasPermission} clearAppUser={clearAppUser} onNavigate={() => setMobileOpen(false)} subscription={subscription} />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300 min-h-screen overflow-x-hidden",
          currentPageName === 'Onboarding' ? "pt-0" : "pt-[calc(56px+env(safe-area-inset-top,0px))] lg:pt-0",
          currentPageName !== 'Onboarding' && (collapsed ? "lg:ml-[72px]" : "lg:ml-[260px]")
        )}
        style={{ paddingBottom: currentPageName !== 'Onboarding' ? 'calc(env(safe-area-inset-bottom, 0px) + 72px)' : undefined }}
      >
        {(() => {
          const trialEnd = subscription?.current_period_end;
          const hoursLeft = trialEnd ? Math.max(0, Math.floor((new Date(trialEnd) - new Date()) / (1000 * 60 * 60))) : null;
          const daysLeft = hoursLeft !== null ? Math.floor(hoursLeft / 24) : null;
          if (!showTrialBanner || subscription?.status !== 'trial' || hoursLeft === null) return null;
          const isUrgent = hoursLeft <= 24;
          return (
            <div className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium text-white"
              style={{ background: isUrgent ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #f59e0b, #d97706)' }}>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {isUrgent
                  ? `Your free trial ends in ${hoursLeft} hours — upgrade to keep your data`
                  : `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPricingModal(true)}
                  className="text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors"
                >
                  Upgrade Now
                </button>
                <button onClick={() => setShowTrialBanner(false)} className="text-white/70 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })()}
        <div className="p-2 sm:p-6 lg:p-8 max-w-[1280px] mx-auto overflow-x-hidden">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      {currentPageName !== 'Onboarding' && (
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-30 flex items-stretch"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* Left: Dashboard, Products */}
          {[
            { label: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
            { label: 'Products', icon: ShoppingBag, page: 'Products' },
          ].map(({ label, icon: Icon, page }) => {
            const isActive = currentPageName === page;
            return (
              <Link
                key={page}
                to={createPageUrl(page)}
                onClick={() => handleTabNavigate(page, isActive)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors min-h-[60px]",
                  isActive ? "text-[rgb(var(--color-primary))]" : "text-slate-400"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            );
          })}

          {/* Center: Sell FAB */}
          <div className="flex-1 flex flex-col items-center justify-end pb-1" style={{ minHeight: 60 }}>
            <button
              onClick={() => setIsNewProductOpen(true)}
              className="flex flex-col items-center gap-0.5 -mt-5"
              style={{ outline: 'none' }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg"
                style={{ background: 'var(--color-primary-gradient)' }}
              >
                <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xs font-semibold" style={{ color: 'rgb(var(--color-primary))' }}>Sell</span>
            </button>
          </div>

          {/* Right: Orders, Settings */}
          {[
            { label: 'Orders', icon: ClipboardList, page: 'Orders' },
            { label: 'Settings', icon: Settings, page: 'TenantSettings' },
          ].map(({ label, icon: Icon, page }) => {
            const isActive = currentPageName === page;
            return (
              <Link
                key={page}
                to={createPageUrl(page)}
                onClick={() => handleTabNavigate(page, isActive)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors min-h-[60px]",
                  isActive ? "text-[rgb(var(--color-primary))]" : "text-slate-400"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Global New Product Modal */}
      <ProductFormDialog
        open={isNewProductOpen}
        onOpenChange={setIsNewProductOpen}
        product={null}
        tenantId={tenant?.id}
      />

      <RoleSwitcher />
      <PricingModal open={showPricingModal} onOpenChange={setShowPricingModal} tenantId={tenantId} />
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <TenantProvider>
      {(tenantContext) => {
        // Check if dev role override is set to superadmin, or if user is real superadmin
        const devRoleOverride = localStorage.getItem('dev_role_override');
        const isDevSuperAdmin = devRoleOverride === 'superadmin';
        const isRealSuperAdmin = !devRoleOverride && tenantContext.user?.role === 'admin';
        const themeScope = (isRealSuperAdmin || isDevSuperAdmin) ? 'superadmin' : tenantContext.tenantId;

        return (
          <ThemeProvider tenantId={themeScope}>
            <NotificationProvider>
              <AppLayout currentPageName={currentPageName}>{children}</AppLayout>
            </NotificationProvider>
          </ThemeProvider>
        );
      }}
    </TenantProvider>
  );
}