// sellio.apptelier.sg/google-signin in the browser. index.html has already forwarded
// a valid request to Google before this loads (window.__sellioGoogleRelay is then
// 'forwarding'); anything else stays here with a way back.
export default function GoogleSignInRelay() {
  const forwarding = window.__sellioGoogleRelay === 'forwarding';
  return (
    <main className="min-h-[100dvh] bg-white flex items-center justify-center p-6" data-pull-refresh-block>
      <div className="w-full max-w-sm text-center">
        <img src="https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png"
          alt="Sellio" className="w-24 h-24 object-contain mx-auto mb-8" />
        <h1 className="text-2xl font-semibold text-slate-900">
          {forwarding ? 'Opening Google…' : 'This sign-in link isn’t valid'}
        </h1>
        <p className="mt-3 text-base text-slate-600">
          {forwarding
            ? 'Continue with your Google account. Sellio opens again when you’re done.'
            : 'Go back to the Sellio app and tap “Continue with Google” again.'}
        </p>
      </div>
    </main>
  );
}
