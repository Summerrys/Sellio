// "Camera is off for Sellio", "Sellio can't reach your printer": the sheet that says why Sellio
// needs a permission that was refused and opens Sellio's page in the phone's Settings
// (PermissionHelp.jsx, on every page; UX state 7, 14 Nov 2026). Any screen or module asks for it
// here, without React.
//   kind:   'camera' or 'bluetooth'
//   action: the button to tap again afterwards ("Take photo", "Scan for Printers"); without one,
//           a printer's steps end "try printing again".
export const PERMISSION_HELP_EVENT = 'sellio:permission-help';
export const PERMISSION_KINDS = ['camera', 'bluetooth'];

// The error nativePrinter.js gives when the phone refused Sellio the printer's permission.
export const BLUETOOTH_PERMISSION = 'BLUETOOTH_PERMISSION';

export function showPermissionHelp(kind, { action = '' } = {}) {
  if (!PERMISSION_KINDS.includes(kind)) return;
  try {
    window.dispatchEvent(new CustomEvent(PERMISSION_HELP_EVENT, { detail: { kind, action: String(action || '') } }));
  } catch {
    // no window (a test or the prerender): nothing to show
  }
}

// A printer error the sheet explains: shows the sheet and says so, so the screen can leave out
// its own message.
export function helpWithPrinterError(error, options) {
  if (error?.code !== BLUETOOTH_PERMISSION) return false;
  showPermissionHelp('bluetooth', options);
  return true;
}
