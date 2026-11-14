import { appPlatform, isCapacitorApp } from './nativeApp.js';

// Sellio's page in the phone's Settings, for a permission that was refused (UX state 7, 14 Nov
// 2026). Only Sellio's own app can open it: Android opens Sellio's App info (Permissions,
// Notifications), an iPhone opens Sellio's page in Settings. Websites and Base44's old app can't,
// so they keep the written steps.
//
// It's the Bluetooth printer plugin's call (@capacitor-community/bluetooth-le, in both apps since
// their first builds), so it reaches the apps as a live update, with no new store build. The raw
// plugin rather than BleClient: BleClient queues its calls, and this mustn't wait behind a
// printer search.
export function canOpenAppSettings(browser) {
  return isCapacitorApp(browser);
}

// True once Settings is opening; false where it can't (then the steps on screen are the way).
export async function openAppSettings(browser) {
  if (!canOpenAppSettings(browser)) return false;
  try {
    const { BluetoothLe } = await import('@capacitor-community/bluetooth-le');
    await BluetoothLe.openAppSettings();
    return true;
  } catch {
    return false;
  }
}

// 'android' or 'ios' in Sellio's app, '' elsewhere: which steps the sheet shows.
export const settingsPlatform = (browser) => appPlatform(browser);
