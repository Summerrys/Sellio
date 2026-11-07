import { useEffect } from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { readLaunch } from '@/lib/appLaunch';
import { hasSignInWelcome, takeSignInWelcome } from '@/lib/signInWelcome';

const CHECK_MS = 100;

// The green card the sign-in page used to show before leaving ("Welcome back!").
export function SignInWelcomeCard({ message }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg shadow-lg">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
        <Check className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-green-900">{message}</p>
        <p className="text-xs text-green-700">You&apos;re all set.</p>
      </div>
    </div>
  );
}

// Shows the message a sign-in left for this page (lib/signInWelcome.js) once the page is on
// screen: straight away on a website, after the launch splash in the app. Mounted once, in
// App, so it works whichever page the sign-in opens.
export default function SignInWelcome() {
  useEffect(() => {
    if (!hasSignInWelcome()) return undefined;
    const timer = setInterval(() => {
      if (readLaunch()) return; // the app's splash is still up
      clearInterval(timer);
      const message = takeSignInWelcome();
      if (message) toast.custom(() => <SignInWelcomeCard message={message} />);
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, []);
  return null;
}
