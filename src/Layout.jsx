import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Shield,
  LogOut,
  Menu,
  X,
  QrCode,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { base44 } from '@/api/base44Client';
import { useAppUser } from '@/lib/AppUserContext';
import { cn } from '@/lib/utils';

const publicPages = ['CustomerMenu', 'CustomerOrder', 'Auth'];

function SidebarContent({ collapsed, currentPageName, tenant, user, isSuperAdmin, isRealSuperAdmin, hasPermission, clearAppUser, onNavigate }) {
  const superAdminItems = [];

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  // Tenant menu with permission requirements
  const allTenantItems = [
    { label: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', permission: null }, // Always show
    { label: 'Orders', icon: ClipboardList, page: 'Orders', permission: 'orders.view' },
    { label: 'Products', icon: ShoppingBag, page: 'Products', permission: 'products.view' },
    { label: 'Categories', icon: Grid3X3, page: 'Categories', permission: 'categories.view' },
    { label: 'Tables & QR', icon: QrCode, page: 'Tables', permission: 'tables.view' },
    { label: 'Inventory', icon: Package, page: 'Inventory', permission: 'inventory.view' },
    { label: 'Staff', icon: Users, page: 'Staff', permission: 'staff.view' },
    { label: 'Roles', icon: Shield, page: 'RoleManagement', permission: 'roles.view' },
    { label: 'Settings', icon: Settings, page: 'TenantSettings', permission: 'settings.view' },
    ...(isAdmin ? [{ label: 'User Management', icon: Users, page: 'UserManagement', permission: null }] : []),
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
              <img src="https://cart.apptelier.sg/wp-content/uploads/2026/04/Logo_Sellio.png" alt="Sellio" className={collapsed ? 'h-8 w-auto object-contain' : 'h-10 w-auto object-contain'} />
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
          <p className="text-xs text-slate-400 capitalize">{tenant.plan} plan</p>
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
                  ? "bg-[rgb(var(--color-primary))] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 hover:bg-[rgb(var(--color-primary-100))]",
                collapsed && "justify-center px-2"
              )}
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
  const { appUser: customUser, clearAppUser } = useAppUser();
  const { user, tenant, isSuperAdmin, isLoading, hasPermission } = useTenant();
  const navigate = useNavigate();

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
        <SidebarContent collapsed={collapsed} currentPageName={currentPageName} tenant={tenant} user={displayUser} isSuperAdmin={isSuperAdmin} isRealSuperAdmin={isRealSuperAdmin} hasPermission={hasPermission} clearAppUser={clearAppUser} onNavigate={() => {}} />
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
            <img src="https://cart.apptelier.sg/wp-content/uploads/2026/04/Logo_Sellio.png" alt="Sellio" className="h-10 w-auto object-contain" />
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
            <SidebarContent collapsed={false} currentPageName={currentPageName} tenant={tenant} user={displayUser} isSuperAdmin={isSuperAdmin} isRealSuperAdmin={isRealSuperAdmin} hasPermission={hasPermission} clearAppUser={clearAppUser} onNavigate={() => setMobileOpen(false)} />
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
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] overflow-x-hidden">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      {currentPageName !== 'Onboarding' && (
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-30 flex items-stretch"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {[
            { label: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
            { label: 'Orders', icon: ClipboardList, page: 'Orders' },
            { label: 'Products', icon: ShoppingBag, page: 'Products' },
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

      <RoleSwitcher />
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