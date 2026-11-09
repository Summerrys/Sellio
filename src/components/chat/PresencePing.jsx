import { usePresencePing } from '@/lib/chat';

// Online and last seen in Chats: while Sellio is on screen for a signed-in person, it tells
// the database every minute (and once when it goes to the background). Renders nothing.
export default function PresencePing() {
  usePresencePing();
  return null;
}
