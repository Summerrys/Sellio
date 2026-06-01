import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import StatusBadge from '../ui-custom/StatusBadge';
import { Edit2, Crown } from 'lucide-react';
import { format } from 'date-fns';

export default function StaffTable({ staff, onEdit }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Desktop table — hidden on mobile */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Staff Member</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Role</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Joined</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map((member) => (
              <tr key={member.id} className="hover:bg-slate-25 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-[rgb(var(--color-primary-100))] text-[rgb(var(--color-primary))] font-medium">
                        {member.user_email?.charAt(0)?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-slate-900 flex items-center gap-2">
                        {member.user_name || member.user_email}
                        {member.is_owner && <Crown className="w-4 h-4 text-amber-500" />}
                      </p>
                      <p className="text-sm text-slate-500">{member.user_email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-slate-700 font-medium">{member.role_name || 'Staff'}</span>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={member.status} />
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-slate-500">
                    {format(new Date(member.created_date), 'MMM dd, yyyy')}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(member)} disabled={member.is_owner}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list — shown only on mobile */}
      <div className="md:hidden divide-y divide-slate-100">
        {staff.map((member) => (
          <div key={member.id} className="flex items-center gap-3 px-4 py-3">
            {/* Avatar */}
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="text-xs bg-[rgb(var(--color-primary-100))] text-[rgb(var(--color-primary))] font-medium">
                {member.user_email?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate flex items-center gap-1">
                {member.user_name || member.user_email}
                {member.is_owner && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
              </p>
              <p className="text-xs text-slate-400 truncate">{member.user_email}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                  {member.role_name || 'Staff'}
                </span>
                <StatusBadge status={member.status} />
              </div>
            </div>

            {/* Edit */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0 text-slate-400"
              onClick={() => onEdit(member)}
              disabled={member.is_owner}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}