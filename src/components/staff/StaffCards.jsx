import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import StatusBadge from '../ui-custom/StatusBadge';
import { Trash2, Crown } from 'lucide-react';
import { format } from 'date-fns';

export default function StaffCards({ staff, onEdit, onDelete }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {staff.map((member) => (
        <div
          key={member.id}
          onClick={() => !member.is_owner && onEdit(member)}
          className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col items-center text-center relative"
          style={{ cursor: member.is_owner ? 'default' : 'pointer' }}
        >
          {/* Owner crown badge */}
          {member.is_owner && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-50 text-amber-600 text-xs font-medium px-1.5 py-0.5 rounded-full">
              <Crown className="w-3 h-3" />
            </div>
          )}

          {/* Avatar */}
          <Avatar className="w-10 h-10 mb-2">
            <AvatarFallback className="bg-[rgb(var(--color-primary-100))] text-[rgb(var(--color-primary))] font-semibold text-sm">
              {(member.user_name || member.user_email)?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>

          {/* Name & email */}
          <p className="text-sm font-semibold text-slate-900 w-full truncate">
            {member.user_name || member.user_email}
          </p>
          <p className="text-xs text-slate-400 w-full truncate mb-2">
            {member.user_email}
          </p>

          {/* Role pill */}
          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full mb-1.5">
            {member.role_name || 'Staff'}
          </span>

          {/* Status badge */}
          <div className="mb-2">
            <StatusBadge status={member.status} />
          </div>

          {/* Joined date */}
          <p className="text-xs text-slate-400 mt-auto">
            Joined {format(new Date(member.created_date), 'MMM yyyy')}
          </p>

          {/* Trash icon — bottom right, only for non-owners */}
          {!member.is_owner && onDelete && (
            <button
              className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              onClick={(e) => { e.stopPropagation(); onDelete(member); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}