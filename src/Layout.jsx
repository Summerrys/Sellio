import React, { useState } from 'react';
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
  Shield,
  LogOut,
  Menu,
  X,
  QrCode
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

const publicPages = ['CustomerMenu', 'CustomerOrder'];

function SidebarContent({ collapsed, currentPageName, tenant, user, isSuperAdmin, isRealSuperAdmin }) {
  // SuperAdmin menu - show god view pages ONLY for real SuperAdmins
  const superAdminItems = isRealSuperAdmin ? [
    { label: 'God View', icon: Shield, page: 'SuperAdminDashboard' },
    { label: 'All Tenants', icon: Building2, page: 'SuperAdminTenants' },
    { label: 'Analytics', icon: BarChart3, page: 'SuperAdminAnalytics' },
    { type: 'divider' },
  ] : [];

  // Tenant menu - shown to SuperAdmin viewing tenant + Owner/Admin/Staff
  const tenantItems = [
    { label: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
    { label: 'Orders', icon: ClipboardList, page: 'Orders' },
    { label: 'Products', icon: ShoppingBag, page: 'Products' },
    { label: 'Categories', icon: Grid3X3, page: 'Categories' },
    { label: 'Tables & QR', icon: QrCode, page: 'Tables' },
    { label: 'Inventory', icon: Package, page: 'Inventory' },
    { label: 'Staff', icon: Users, page: 'Staff' },
    { label: 'Roles', icon: Shield, page: 'RoleManagement' },
    { label: 'Settings', icon: Settings, page: 'TenantSettings' },
  ];

  const navItems = [...superAdminItems, ...tenantItems];

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn("flex items-center h-16 px-4 border-b border-slate-100", collapsed && "justify-center")}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[rgb(var(--color-primary))] flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          {!collapsed && (
            <div>
              <span className="font-bold text-sm text-slate-900 tracking-tight">Apptelier</span>
              <span className="text-xs text-slate-400 block -mt-0.5">Suite</span>
            </div>
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
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
              onClick={() => base44.auth.logout()}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-slate-600"
            onClick={() => base44.auth.logout()}
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
  const { user, tenant, isSuperAdmin, isLoading } = useTenant();
  
  // Check if this is a REAL SuperAdmin (not dev override)
  const devRoleOverride = localStorage.getItem('dev_role_override');
  const isRealSuperAdmin = !devRoleOverride && user?.role === 'admin';

  if (publicPages.includes(currentPageName)) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[rgb(var(--color-primary))] flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-sm">A</span>
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
      <aside
        className={cn(
          "hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-white border-r border-slate-100 z-30 transition-all duration-300",
          collapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        <SidebarContent collapsed={collapsed} currentPageName={currentPageName} tenant={tenant} user={user} isSuperAdmin={isSuperAdmin} isRealSuperAdmin={isRealSuperAdmin} />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-3 h-3 text-slate-600" /> : <ChevronLeft className="w-3 h-3 text-slate-600" />}
        </button>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-100 z-30 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[rgb(var(--color-primary))] flex items-center justify-center">
            <span className="text-white font-bold text-xs">A</span>
          </div>
          <span className="font-bold text-sm text-slate-900">Apptelier</span>
        </div>
        <div className="flex items-center gap-2">
          {user && <NotificationBell />}
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[280px] bg-white shadow-xl">
            <div className="absolute top-4 right-4">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <SidebarContent collapsed={false} currentPageName={currentPageName} tenant={tenant} user={user} isSuperAdmin={isSuperAdmin} isRealSuperAdmin={isRealSuperAdmin} />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300 min-h-screen",
          "pt-14 lg:pt-0",
          collapsed ? "lg:ml-[72px]" : "lg:ml-[260px]"
        )}
      >
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
          {children}
        </div>
      </main>
      <RoleSwitcher />
      </div>
      );
      }

      export default function Layout({ children, currentPageName }) {
      return (
      <TenantProvider>
      {(tenantContext) => (
        <ThemeProvider tenantId={tenantContext.tenantId}>
          <NotificationProvider>
            <AppLayout currentPageName={currentPageName}>{children}</AppLayout>
          </NotificationProvider>
        </ThemeProvider>
      )}
      </TenantProvider>
      );
      }