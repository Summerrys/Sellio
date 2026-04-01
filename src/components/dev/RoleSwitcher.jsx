import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Shield, User, Settings, ChefHat, Users, Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLES = [
  { id: 'superadmin', label: 'SuperAdmin', icon: Shield, color: 'bg-purple-500' },
  { id: 'owner', label: 'Owner', icon: Settings, color: 'bg-blue-500' },
  { id: 'admin', label: 'Admin', icon: User, color: 'bg-green-500' },
  { id: 'manager', label: 'Manager', icon: Users, color: 'bg-amber-500' },
  { id: 'cashier', label: 'Cashier', icon: User, color: 'bg-teal-500' },
  { id: 'waiter', label: 'Waiter', icon: User, color: 'bg-pink-500' },
  { id: 'chef', label: 'Chef', icon: ChefHat, color: 'bg-red-500' },
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

  const isOnboarding = window.location.pathname.includes('Onboarding');

  return (
    <div className={cn("fixed z-50", isOnboarding ? "bottom-4 right-4" : "bottom-6 right-6")}>
      {isOpen ? (
        <div className={cn("bg-white rounded-xl shadow-lg border border-slate-200", isOnboarding ? "p-2 min-w-[220px]" : "p-3 min-w-[280px]")}>
          <div className={cn("flex items-center justify-between mb-2 px-2", isOnboarding && "mb-1")}>
           <div className="flex items-center gap-2">
             <Eye className={cn("text-slate-500", isOnboarding ? "w-3 h-3" : "w-4 h-4")} />
             <span className={cn("font-semibold text-slate-700", isOnboarding ? "text-xs" : "text-xs")}>{isOnboarding ? "As" : "View As"}</span>
            </div>
            <Button size="icon" variant="ghost" className={cn(isOnboarding ? "h-5 w-5" : "h-6 w-6")} onClick={() => setIsOpen(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className={cn("space-y-1", isOnboarding && "space-y-0.5")}>
            {ROLES.map(role => {
              const Icon = role.icon;
              const isActive = activeRole === role.id;
              return (
                <button
                  key={role.id}
                  onClick={() => switchRole(role.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 rounded-md font-medium transition-all",
                    isOnboarding ? "py-1.5 text-xs" : "gap-3 px-3 py-2 rounded-lg text-sm",
                    isActive 
                      ? "bg-slate-900 text-white shadow-sm" 
                      : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <div className={cn("rounded-lg flex items-center justify-center", isOnboarding ? "w-5 h-5" : "w-7 h-7", isActive ? "bg-white/20" : role.color)}>
                    <Icon className={cn(isOnboarding ? "w-3 h-3" : "w-4 h-4", isActive ? "text-white" : "text-white")} />
                  </div>
                  <span>{role.label}</span>
                  {isActive && !isOnboarding && (
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
            isOnboarding ? "h-10 px-3 rounded-lg gap-1" : "h-12 px-4 rounded-full gap-2",
            "shadow-lg",
            activeRoleData ? "bg-slate-900 hover:bg-slate-800" : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200"
          )}
        >
          {activeRoleData ? (
           <>
             <div className={cn("rounded-lg flex items-center justify-center", isOnboarding ? "w-5 h-5" : "w-7 h-7 rounded-full", activeRoleData.color)}>
               <activeRoleData.icon className={cn(isOnboarding ? "w-3 h-3" : "w-4 h-4", "text-white")} />
             </div>
             {!isOnboarding && <span className="text-sm font-medium">{activeRoleData.label}</span>}
           </>
          ) : (
           <>
             <Eye className={cn(isOnboarding ? "w-3 h-3" : "w-4 h-4")} />
             {!isOnboarding && <span className="text-sm font-medium">View As...</span>}
            </>
          )}
        </Button>
      )}
    </div>
  );
}