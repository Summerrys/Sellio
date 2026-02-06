import React from 'react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import StatusBadge from '../ui-custom/StatusBadge';
import { Edit2, Crown, Mail } from 'lucide-react';
import { format } from 'date-fns';

export default function StaffCards({ staff, onEdit }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {staff.map((member) => (
        <Card key={member.id} className="p-6 border-0 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <Avatar className="w-14 h-14">
              <AvatarFallback className="bg-[rgb(var(--color-primary-100))] text-[rgb(var(--color-primary))] font-semibold text-lg">
                {member.user_email?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            {member.is_owner && (
              <div className="flex items-center gap-1 bg-amber-50 text-amber-600 text-xs font-medium px-2 py-1 rounded-full">
                <Crown className="w-3 h-3" />
                Owner
              </div>
            )}
          </div>

          <div className="mb-4">
            <h3 className="font-semibold text-slate-900 mb-1">
              {member.user_email}
            </h3>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Mail className="w-4 h-4" />
              {member.user_email}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-slate-600 font-medium">
              {member.role_name || 'Staff'}
            </span>
            <span className="text-slate-300">•</span>
            <StatusBadge status={member.status} />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              Joined {format(new Date(member.created_date), 'MMM yyyy')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(member)}
              disabled={member.is_owner}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}