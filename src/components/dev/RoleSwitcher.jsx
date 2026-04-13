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
      localStorage.removeItem('dev_role_override');
      setActiveRole(null);
    } else {
      localStorage.setItem('dev_role_override', roleId);
      setActiveRole(roleId);
    }
    window.location.reload();
  };

  const activeRoleData = ROLES.find(r => r.id === activeRole);

  return (
    <div className="fixed z-50 bottom-4 right-4">
      {isOpen ? (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-2 min-w-[180px]">
          <div className="flex items-center justify-between mb-1 px-1">
            <div className="flex items-center gap-1.5">
              <Eye className="w-3 h-3 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">View As</span>
            </div>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setIsOpen(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="space-y-0.5">
            {ROLES.map(role => {
              const Icon = role.icon;
              const isActive = activeRole === role.id;
              return (
                <button
                  key={role.id}
                  onClick={() => switchRole(role.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-all',
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <div className={cn('w-5 h-5 rounded flex items-center justify-center', isActive ? 'bg-white/20' : role.color)}>
                    <Icon className="w-3 h-3 text-white" />
                  </div>
                  <span>{role.label}</span>
                  {isActive && <span className="ml-auto opacity-70">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setIsOpen(true)}
          size="icon"
          className={cn(
            'h-8 w-8 rounded-full shadow-md',
            activeRoleData ? 'bg-slate-900 hover:bg-slate-800' : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
          )}
        >
          {activeRoleData ? (
            <activeRoleData.icon className="w-3.5 h-3.5 text-white" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}