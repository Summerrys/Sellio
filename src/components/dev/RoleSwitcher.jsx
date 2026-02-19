import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Shield, User, Settings, ChefHat, Users, Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLES = [
  { id: 'superadmin', label: 'SuperAdmin', subtitle: 'God View', icon: Shield, color: 'bg-purple-500' },
  { id: 'admin', label: 'Admin', subtitle: 'Tenant Admin', icon: User, color: 'bg-green-500' },
  { id: 'owner', label: 'Owner', subtitle: 'Tenant Owner', icon: Settings, color: 'bg-blue-500' },
  { id: 'manager', label: 'Manager', subtitle: 'Limited Access', icon: Users, color: 'bg-amber-500' },
  { id: 'cashier', label: 'Cashier', subtitle: 'POS Only', icon: User, color: 'bg-teal-500' },
  { id: 'waiter', label: 'Waiter', subtitle: 'Orders & Tables', icon: User, color: 'bg-pink-500' },
  { id: 'chef', label: 'Chef', subtitle: 'Kitchen View', icon: ChefHat, color: 'bg-red-500' },
];

export default function RoleSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeRole, setActiveRole] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('dev_role_override');
    if (saved) setActiveRole(saved);
  }, []);

  const switchRole = (roleId) => {
    if (activeRole === roleId) {
      // Clear override
      localStorage.removeItem('dev_role_override');
      setActiveRole(null);
      window.location.reload();
    } else {
      localStorage.setItem('dev_role_override', roleId);
      setActiveRole(roleId);
      window.location.reload();
    }
  };

  const activeRoleData = ROLES.find(r => r.id === activeRole);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 min-w-[280px]">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">View As</span>
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsOpen(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="space-y-1">
            {ROLES.map(role => {
              const Icon = role.icon;
              const isActive = activeRole === role.id;
              return (
                <button
                  key={role.id}
                  onClick={() => switchRole(role.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive 
                      ? "bg-slate-900 text-white shadow-sm" 
                      : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", isActive ? "bg-white/20" : role.color)}>
                    <Icon className={cn("w-4 h-4", isActive ? "text-white" : "text-white")} />
                  </div>
                  <div className="flex-1">
                    <div>{role.label}</div>
                    {role.subtitle && <div className="text-xs opacity-70">{role.subtitle}</div>}
                  </div>
                  {isActive && (
                    <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">Active</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setIsOpen(true)}
          className={cn(
            "h-12 px-4 rounded-full shadow-lg gap-2",
            activeRoleData ? "bg-slate-900 hover:bg-slate-800" : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200"
          )}
        >
          {activeRoleData ? (
            <>
              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center", activeRoleData.color)}>
                <activeRoleData.icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium">{activeRoleData.label}</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              <span className="text-sm font-medium">View As...</span>
            </>
          )}
        </Button>
      )}
    </div>
  );
}