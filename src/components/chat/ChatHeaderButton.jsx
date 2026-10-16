import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatUnread } from '@/lib/chat';

// Workspace header, next to the bell: the shop's chats with buyers, and how many are waiting.
export default function ChatHeaderButton({ tenantId }) {
  const unread = useChatUnread(!!tenantId);
  const count = Number(unread.by_tenant?.[tenantId]) || 0;
  return (
    <Button asChild variant="ghost" size="icon" className="relative min-h-[44px] min-w-[44px]">
      <Link to="/Chats" aria-label={`Chats${count ? `, ${count} waiting` : ''}`} title="Chats">
        <MessageCircle className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-xs rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
