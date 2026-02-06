import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import StatusBadge from '../ui-custom/StatusBadge';
import { Edit2, Crown } from 'lucide-react';
import { format } from 'date-fns';

export default function StaffTable({ staff, onEdit }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                Staff Member
              </th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                Role
              </th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                Status
              </th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                Joined
              </th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                Actions
              </th>
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
                        {member.user_email}
                        {member.is_owner && (
                          <Crown className="w-4 h-4 text-amber-500" />
                        )}
                      </p>
                      <p className="text-sm text-slate-500">{member.user_email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-slate-700 font-medium">
                    {member.role_name || 'Staff'}
                  </span>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(member)}
                    disabled={member.is_owner}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}