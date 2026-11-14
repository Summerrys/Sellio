import React, { useCallback, useEffect, useState } from 'react';
import { BluetoothOff, CameraOff } from 'lucide-react';
import NoticeSheet from './NoticeSheet';
import { useAppText } from '@/lib/appText';
import { PERMISSION_HELP_EVENT, PERMISSION_KINDS } from '@/lib/permissionHelp';
import { canOpenAppSettings, openAppSettings, settingsPlatform } from '@/lib/appSettings';

const B = ({ children }) => <b className="font-semibold text-slate-900">{children}</b>;

// What the sheet says for a permission: the title, why Sellio needs it, and the steps in this
// phone's Settings ('android' or 'ios' in Sellio's app; '' elsewhere, without a Settings button).
export function permissionWords(kind, platform, action, t) {
  const tap = action ? <B>{action}</B> : null;
  if (kind === 'camera') {
    const again = tap || <B>{t('Take photo')}</B>;
    return {
      title: t('Camera is off for Sellio'),
      why: t('Sellio uses the camera to photograph your menu, your items and your profile picture. It only opens when you tap {scan} or {photo}.', {
        scan: t('Scan Menu'),
        photo: t('Take photo'),
      }),
      steps: platform === 'android'
        ? t('In Settings, tap {path}. Then come back and tap {action} again.', { path: <B>{t('Permissions → Camera → Allow')}</B>, action: again })
        : platform === 'ios'
          ? t('In Settings, turn on {setting}. Then come back and tap {action} again.', { setting: <B>{t('Camera')}</B>, action: again })
          : t('In your phone’s Settings, open Apps → Sellio → Permissions and allow {setting}. Then tap {action} again.', { setting: <B>{t('Camera')}</B>, action: again }),
    };
  }
  // bluetooth: a printer search (action: Scan for Printers) or a print
  const title = action ? t('Sellio can’t look for your printer') : t('Sellio can’t reach your printer');
  if (platform === 'ios') {
    return {
      title,
      why: t('Sellio needs Bluetooth to find and connect to your printer. It’s only used for printing.'),
      steps: tap
        ? t('In Settings, turn on {setting}. Then tap {action} again.', { setting: <B>Bluetooth</B>, action: tap })
        : t('In Settings, turn on {setting}. Then try printing again.', { setting: <B>Bluetooth</B> }),
    };
  }
  const path = <B>{t('Permissions → Nearby devices → Allow')}</B>;
  const older = <B>{t('Location')}</B>;
  return {
    title,
    why: t('Sellio needs “Nearby devices” to find and connect to your Bluetooth printer. It’s only used for printing.'),
    steps: platform === 'android'
      ? (tap
        ? t('In Settings, tap {path} (older phones: {older}). Then tap {action} again.', { path, older, action: tap })
        : t('In Settings, tap {path} (older phones: {older}). Then try printing again.', { path, older }))
      : t('In your phone’s Settings, open Apps → Sellio → Permissions and allow {setting}. Then try again.', { setting: <B>{t('Nearby devices')}</B> }),
  };
}

// The sheet itself, once on every page (App.jsx). A second request while one shows is ignored.
export default function PermissionHelp() {
  const { t } = useAppText();
  const [help, setHelp] = useState(null); // { kind, action }

  useEffect(() => {
    const show = (event) => {
      const { kind, action } = event.detail || {};
      if (!PERMISSION_KINDS.includes(kind)) return;
      setHelp((now) => now || { kind, action: action || '' });
    };
    window.addEventListener(PERMISSION_HELP_EVENT, show);
    return () => window.removeEventListener(PERMISSION_HELP_EVENT, show);
  }, []);

  const close = useCallback(() => setHelp(null), []);
  if (!help) return null;

  const settings = canOpenAppSettings();
  const words = permissionWords(help.kind, settings ? settingsPlatform() : '', help.action, t);
  const Icon = help.kind === 'camera' ? CameraOff : BluetoothOff;
  return (
    <NoticeSheet
      open
      onClose={close}
      closeButton
      testId="permission-help"
      icon={<Icon className="h-[26px] w-[26px]" strokeWidth={2} />}
      title={words.title}
      primary={settings
        ? { label: t('Open Settings'), testId: 'permission-open-settings', onClick: () => { openAppSettings(); close(); } }
        : { label: t('OK'), testId: 'permission-ok', onClick: close }}
      secondary={settings ? { label: t('Not now'), testId: 'permission-not-now', onClick: close } : null}
    >
      <p className="mb-3">{words.why}</p>
      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[13px] leading-relaxed text-slate-700">
        {words.steps}
      </div>
    </NoticeSheet>
  );
}
