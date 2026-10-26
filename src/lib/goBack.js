// Back within the app when there's somewhere to go back to (react-router's history index,
// which counts only this app's pages), otherwise a sensible page. Used by in-app back
// arrows, so they never do nothing and never leave the app.
export function goBack(navigate, fallback = '/explore') {
  if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
  else navigate(fallback, { replace: true });
}
