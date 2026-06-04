import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Bluetooth, Wifi, CheckCircle, Loader2, AlertCircle, Printer } from 'lucide-react';
import {
  loadPrinterConfig, savePrinterConfig, clearPrinterConfig,
  testNetworkPrinter, buildTestReceipt, sendViaBluetooth, sendViaEpsonEPos
} from '@/lib/printerUtils';

const BT_SUPPORTED = typeof navigator !== 'undefined' && !!navigator.bluetooth;

export default function PrinterSettings({ tenantId, merchantName }) {
  const [mode, setMode] = useState('bluetooth'); // 'bluetooth' | 'network'
  const [btDevice, setBtDevice] = useState(null); // { name }
  const [btScanning, setBtScanning] = useState(false);

  const [ip, setIp] = useState('');
  const [port, setPort] = useState('9100');
  const [brand, setBrand] = useState('epson');
  const [netSaved, setNetSaved] = useState(false);
  const [netTesting, setNetTesting] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);

  // Load saved config on mount
  useEffect(() => {
    if (!tenantId) return;
    const cfg = loadPrinterConfig(tenantId);
    if (!cfg) return;
    setMode(cfg.mode || 'bluetooth');
    if (cfg.mode === 'bluetooth' && cfg.deviceName) {
      setBtDevice({ name: cfg.deviceName });
    }
    if (cfg.mode === 'network') {
      setIp(cfg.ip || '');
      setPort(String(cfg.port || 9100));
      setBrand(cfg.brand || 'epson');
      setNetSaved(!!cfg.tested);
    }
  }, [tenantId]);

  const handleScanBluetooth = async () => {
    if (!BT_SUPPORTED) return;
    setBtScanning(true);
    try {
      let device;
      try {
        device = await navigator.bluetooth.requestDevice({
          filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
          optionalServices: ['battery_service'],
        });
      } catch {
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
        });
      }
      setBtDevice({ name: device.name });
      savePrinterConfig(tenantId, { mode: 'bluetooth', deviceName: device.name });
      toast.success(`Connected: ${device.name}`);
    } catch (err) {
      if (err.name !== 'NotFoundError') toast.error('Bluetooth scan failed');
    } finally {
      setBtScanning(false);
    }
  };

  const handleDisconnectBt = () => {
    setBtDevice(null);
    clearPrinterConfig(tenantId);
    toast.success('Printer disconnected');
  };

  const handleSaveNetwork = async () => {
    if (!ip.trim()) { toast.error('Please enter an IP address'); return; }
    setNetTesting(true);
    try {
      const ok = await testNetworkPrinter(ip.trim(), parseInt(port) || 9100, brand);
      if (ok) {
        savePrinterConfig(tenantId, { mode: 'network', ip: ip.trim(), port: parseInt(port) || 9100, brand, tested: true });
        setNetSaved(true);
        toast.success('Connection successful ✓');
      } else {
        toast.error('Could not reach printer — check IP and network');
        setNetSaved(false);
      }
    } catch {
      toast.error('Could not reach printer — check IP and network');
      setNetSaved(false);
    } finally {
      setNetTesting(false);
    }
  };

  const handleTestPrint = async () => {
    setTestPrinting(true);
    const bytes = buildTestReceipt(merchantName);
    const cfg = loadPrinterConfig(tenantId);
    try {
      if (cfg?.mode === 'bluetooth' && cfg.deviceName) {
        await sendViaBluetooth(cfg.deviceName, bytes);
      } else if (cfg?.mode === 'network') {
        await sendViaEpsonEPos(cfg.ip, bytes, merchantName);
      }
      toast.success('Test print sent ✓');
    } catch (err) {
      toast.error(`Print failed: ${err.message}`);
    } finally {
      setTestPrinting(false);
    }
  };

  const isConnected = (mode === 'bluetooth' && btDevice) || (mode === 'network' && netSaved);

  return (
    <div className="space-y-4 pt-4 border-t border-slate-100">
      <div className="flex items-center gap-2">
        <Printer className="w-4 h-4 text-slate-500" />
        <p className="text-sm font-semibold text-slate-700">Receipt Printer</p>
        <span className="text-xs text-slate-400">(device-specific, saved locally)</span>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {[
          { value: 'bluetooth', label: 'Bluetooth', icon: Bluetooth },
          { value: 'network', label: 'Network / IP', icon: Wifi },
        ].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={mode === value
              ? { background: 'var(--color-primary-gradient, #6366f1)', color: '#fff' }
              : { color: '#64748b' }
            }
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* BLUETOOTH */}
      {mode === 'bluetooth' && (
        <div className="space-y-3">
          {!BT_SUPPORTED ? (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Bluetooth printing is not supported on this browser. Please use Network/IP mode or Chrome on Android.
              </p>
            </div>
          ) : btDevice ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800">{btDevice.name}</p>
                  <p className="text-xs text-green-600">Connected</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDisconnectBt}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleScanBluetooth}
              disabled={btScanning}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-70"
              style={{ background: 'var(--color-primary-gradient, #6366f1)' }}
            >
              {btScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
              {btScanning ? 'Scanning...' : 'Scan for Printers'}
            </button>
          )}
          <p className="text-xs text-slate-400">
            Note: Bluetooth device pairing resets per browser session — you'll need to re-scan each time.
          </p>
        </div>
      )}

      {/* NETWORK / IP */}
      {mode === 'network' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">IP Address</Label>
              <Input
                className="h-9 text-sm"
                value={ip}
                onChange={e => { setIp(e.target.value); setNetSaved(false); }}
                placeholder="e.g. 192.168.1.100"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Port</Label>
              <Input
                className="h-9 text-sm"
                value={port}
                onChange={e => { setPort(e.target.value); setNetSaved(false); }}
                placeholder="9100"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Printer Brand</Label>
            <Select value={brand} onValueChange={v => { setBrand(v); setNetSaved(false); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="epson">Epson ePOS</SelectItem>
                <SelectItem value="star">Star WebPRNT</SelectItem>
                <SelectItem value="generic">Generic ESC/POS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              The printer must be on the same WiFi network as this device. For WiFi Direct printers,
              connect your device to the printer's hotspot first, then enter the printer's gateway IP
              (typically <span className="font-mono">192.168.123.100</span>).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveNetwork}
              disabled={netTesting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-70"
              style={{ background: 'var(--color-primary-gradient, #6366f1)' }}
            >
              {netTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
              {netTesting ? 'Testing...' : 'Save & Test Connection'}
            </button>
            {netSaved && (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <CheckCircle className="w-3.5 h-3.5" /> {ip}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Test Print button — shown when connected */}
      {isConnected && (
        <button
          type="button"
          onClick={handleTestPrint}
          disabled={testPrinting}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-70"
        >
          {testPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
          {testPrinting ? 'Sending...' : 'Test Print'}
        </button>
      )}
    </div>
  );
}