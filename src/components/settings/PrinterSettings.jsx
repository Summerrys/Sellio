import React, { useState, useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Bluetooth, Wifi, CheckCircle, Loader2, AlertCircle, Printer, X, Signal } from 'lucide-react';
import {
  loadPrinterConfig, savePrinterConfig, clearPrinterConfig,
  testNetworkPrinter, buildTestReceipt, buildTSPLTestReceipt,
  sendViaBluetooth, sendViaEpsonEPos,
  ALL_BT_SERVICES, setBtDeviceCache,
} from '@/lib/printerUtils';

const BT_SUPPORTED = typeof navigator !== 'undefined' && !!navigator.bluetooth;
const LE_SCAN_SUPPORTED = BT_SUPPORTED && typeof navigator !== 'undefined' && !!navigator.bluetooth?.requestLEScan;

const getRSSILabel = (rssi) => {
  if (!rssi) return '';
  if (rssi >= -60) return '▮▮▮▮ Excellent';
  if (rssi >= -70) return '▮▮▮░ Good';
  if (rssi >= -80) return '▮▮░░ Fair';
  return '▮░░░ Weak';
};

export default function PrinterSettings({ tenantId, merchantName }) {
  const [mode, setMode] = useState('bluetooth');
  const [btDevice, setBtDevice] = useState(null);

  // Scan state
  const [showScanSheet, setShowScanSheet] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const scanRef = useRef(null);
  const adHandlerRef = useRef(null);
  const seenRef = useRef(new Set());

  const [ip, setIp] = useState('');
  const [port, setPort] = useState('9100');
  const [brand, setBrand] = useState('epson');
  const [netSaved, setNetSaved] = useState(false);
  const [netTesting, setNetTesting] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const [protocol, setProtocol] = useState('escpos'); // 'escpos' | 'tspl'

  useEffect(() => {
    if (!tenantId) return;
    const cfg = loadPrinterConfig(tenantId);
    if (!cfg) return;
    setMode(cfg.mode || 'bluetooth');
    if (cfg.mode === 'bluetooth' && cfg.deviceName) {
      setBtDevice({ name: cfg.deviceName });
      setProtocol(cfg.protocol || 'escpos');
    }
    if (cfg.mode === 'network') {
      setIp(cfg.ip || '');
      setPort(String(cfg.port || 9100));
      setBrand(cfg.brand || 'epson');
      setNetSaved(!!cfg.tested);
    }
  }, [tenantId]);

  // Cleanup scan on unmount
  useEffect(() => {
    return () => stopScan();
  }, []);

  const stopScan = () => {
    try { scanRef.current?.stop(); } catch {}
    if (adHandlerRef.current) {
      try { navigator.bluetooth.removeEventListener('advertisementreceived', adHandlerRef.current); } catch {}
      adHandlerRef.current = null;
    }
    setScanning(false);
  };

  const handleScanBluetooth = async () => {
    if (!BT_SUPPORTED) return;

    setDiscoveredDevices([]);
    seenRef.current = new Set();
    setShowScanSheet(true);
    setScanning(true);

    if (LE_SCAN_SUPPORTED) {
      // Parallel streaming scan — devices appear as discovered
      try {
        const scan = await navigator.bluetooth.requestLEScan({ acceptAllAdvertisements: true });
        scanRef.current = scan;

        const handler = (event) => {
          const name = event.device.name;
          const id = event.device.id;
          if (!name) return; // skip unnamed devices
          if (seenRef.current.has(id)) return;
          seenRef.current.add(id);
          setDiscoveredDevices(prev => [...prev, { name, id, rssi: event.rssi }]);
        };

        adHandlerRef.current = handler;
        navigator.bluetooth.addEventListener('advertisementreceived', handler);

        // Auto-stop after 10 seconds
        setTimeout(() => stopScan(), 10000);
        return;
      } catch (e) {
        // requestLEScan failed (permissions or unsupported) — fall through to native picker
        setShowScanSheet(false);
        setScanning(false);
      }
    }

    // Fallback: browser native picker (blocks until user selects)
    setShowScanSheet(false);
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ALL_BT_SERVICES,
      });
      setBtDevice({ name: device.name });
      savePrinterConfig(tenantId, { mode: 'bluetooth', deviceName: device.name });
      toast.success(`Connected: ${device.name}`);
    } catch (err) {
      if (err.name !== 'NotFoundError') toast.error('Bluetooth scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleSelectDevice = async (deviceName) => {
    stopScan();
    setShowScanSheet(false);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: ALL_BT_SERVICES,
      });
      // Cache the device object — subsequent prints reuse it without pairing dialog
      setBtDeviceCache(device);
      setBtDevice({ name: device.name });
      // Auto-detect protocol: label printers use TSPL, thermal receipt printers use ESC/POS
      const detectedProtocol = /label|tspl|tsc/i.test(device.name) ? 'tspl' : 'escpos';
      setProtocol(detectedProtocol);
      savePrinterConfig(tenantId, { mode: 'bluetooth', deviceName: device.name, protocol: detectedProtocol });
      toast.success(`Connected: ${device.name}`);
    } catch (err) {
      if (err.name !== 'NotFoundError') toast.error(`Failed to connect to ${deviceName}`);
    }
  };

  const handleDisconnectBt = () => {
    setBtDeviceCache(null);
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
    const cfg = loadPrinterConfig(tenantId);
    const paperSize = cfg?.paperSize || 'thermal_80';
    const activeProtocol = cfg?.protocol || protocol;
    const bytes = activeProtocol === 'tspl'
      ? buildTSPLTestReceipt(merchantName)
      : buildTestReceipt(merchantName, paperSize);
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
    <>
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
                  Bluetooth printing is not supported on this browser. Use Network/IP mode or Chrome on Android.
                </p>
              </div>
            ) : btDevice ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-800">{btDevice.name}</p>
                      <p className="text-xs text-green-600">Connected</p>
                    </div>
                  </div>
                  <button type="button" onClick={handleDisconnectBt} className="text-xs text-red-500 hover:text-red-700 font-medium">
                    Disconnect
                  </button>
                </div>
                {/* Print protocol selector */}
                <div>
                  <Label className="text-xs text-slate-600 mb-1 block">Print Protocol</Label>
                  <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                    {[
                      { value: 'escpos', label: 'ESC/POS', sub: 'Thermal receipt' },
                      { value: 'tspl', label: 'TSPL', sub: 'Label printer' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setProtocol(opt.value);
                          const cfg = loadPrinterConfig(tenantId);
                          savePrinterConfig(tenantId, { ...cfg, protocol: opt.value });
                        }}
                        className="flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all flex flex-col items-center gap-0.5"
                        style={protocol === opt.value
                          ? { background: 'var(--color-primary-gradient, #6366f1)', color: '#fff' }
                          : { color: '#64748b' }
                        }
                      >
                        <span className="font-bold">{opt.label}</span>
                        <span style={{ fontSize: 10, opacity: 0.8 }}>{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleScanBluetooth}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all"
                style={{ background: 'var(--color-primary-gradient, #6366f1)' }}
              >
                <Bluetooth className="w-4 h-4" />
                Scan for Printers
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
                <Input className="h-9 text-sm" value={ip} onChange={e => { setIp(e.target.value); setNetSaved(false); }} placeholder="e.g. 192.168.1.100" />
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1 block">Port</Label>
                <Input className="h-9 text-sm" value={port} onChange={e => { setPort(e.target.value); setNetSaved(false); }} placeholder="9100" />
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
                Printer must be on the same WiFi network. For WiFi Direct printers, connect to the printer's hotspot first, then enter its gateway IP (typically <span className="font-mono">192.168.123.100</span>).
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

        {/* Test Print */}
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

      {/* Scan bottom sheet */}
      {showScanSheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(var(--color-primary), 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bluetooth size={18} color="rgb(var(--color-primary))" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  {scanning ? 'Scanning for Printers…' : 'Select a Printer'}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  {scanning
                    ? `${discoveredDevices.length} device${discoveredDevices.length !== 1 ? 's' : ''} found — tap to connect`
                    : `Found ${discoveredDevices.length} device${discoveredDevices.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <button
                onClick={() => { stopScan(); setShowScanSheet(false); }}
                style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} color="#64748b" />
              </button>
            </div>

            {/* Device list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {discoveredDevices.length === 0 && scanning && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(var(--color-primary), 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={24} color="rgb(var(--color-primary))" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                  <p style={{ fontSize: 14, color: '#64748b', margin: 0, textAlign: 'center' }}>
                    Searching for nearby Bluetooth printers…
                  </p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, textAlign: 'center' }}>
                    Make sure your printer is powered on and in pairing mode.
                  </p>
                </div>
              )}

              {discoveredDevices.map(device => (
                <button
                  key={device.id}
                  onClick={() => handleSelectDevice(device.name)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 20px', background: 'none', border: 'none',
                    borderBottom: '1px solid #f8fafc', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(var(--color-primary), 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Printer size={18} color="rgb(var(--color-primary))" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.name}</p>
                    {device.rssi && (
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{getRSSILabel(device.rssi)}</p>
                    )}
                  </div>
                  <Signal size={16} color="#cbd5e1" style={{ flexShrink: 0 }} />
                </button>
              ))}

              {!scanning && discoveredDevices.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: 12 }}>
                  <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>No devices found</p>
                  <button
                    onClick={handleScanBluetooth}
                    style={{ fontSize: 13, fontWeight: 600, color: 'rgb(var(--color-primary))', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Scan again
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            {scanning && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
                <button
                  onClick={() => { stopScan(); }}
                  style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
                >
                  Stop Scanning
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}