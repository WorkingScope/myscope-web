'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, RefreshCw, Loader, LogOut, KeyRound } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// sessionStorage (not localStorage) — a venue scan desk is usually a shared
// PC, so the redeemed session should clear itself when the browser tab or
// window closes rather than linger on the machine between events.
const SESSION_KEY = 'myscope_scanner_desk_session';

type Stage = 'connect' | 'ready' | 'looking-up' | 'picking' | 'confirming' | 'success' | 'error';

interface DeskSession {
  token: string;
  expires_at: string;
  gate_label: string | null;
  event: {
    id: string;
    title: string;
  };
}

interface TicketRow {
  id: string;
  tier_name: string | null;
  seat: { label?: string } | null;
  recipient_name: string | null;
  check_in_status: string;
  checked_in_at: string | null;
  checked_in_by_name: string | null;
}

interface LookupResult {
  booking: {
    id: string;
    booking_reference: string;
    buyer_name: string | null;
  };
  tickets: TicketRow[];
}

interface CheckinBatchResult {
  checked_in_ids: string[];
  already_used_ids: string[];
  checked_in_at: string;
}

function loadSession(): DeskSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeskSession;
    if (new Date(parsed.expires_at) < new Date()) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export default function ScannerDeskPage() {
  const [session, setSession] = useState<DeskSession | null>(null);
  const [checkedSession, setCheckedSession] = useState(false);
  const [stage, setStage] = useState<Stage>('connect');

  const [code, setCode] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const [scanValue, setScanValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [result, setResult] = useState<CheckinBatchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Restore a session already redeemed on this device (e.g. page refresh).
  useEffect(() => {
    const existing = loadSession();
    if (existing) {
      setSession(existing);
      setStage('ready');
    }
    setCheckedSession(true);
  }, []);

  // A keyboard-wedge barcode scanner just "types" into whatever element has
  // focus, then sends Enter — so losing focus silently drops scans. Keep the
  // scan input focused while idle, and refocus on any stray click.
  useEffect(() => {
    if (stage !== 'ready') return;
    inputRef.current?.focus();
    const refocus = () => inputRef.current?.focus();
    window.addEventListener('click', refocus);
    return () => window.removeEventListener('click', refocus);
  }, [stage]);

  const bounceToConnect = (message: string) => {
    window.sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setConnectError(message);
    setStage('connect');
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (!cleaned) return;
    setConnecting(true);
    setConnectError('');
    try {
      const res = await fetch(`${API_URL}/api/scanner/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleaned, device_label: deviceLabel.trim() || 'Scan Desk' }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setConnectError(body?.message || 'Could not connect with that code.');
        return;
      }
      const newSession: DeskSession = {
        token: body.data.token,
        expires_at: body.data.expires_at,
        gate_label: body.data.gate_label,
        event: { id: body.data.event.id, title: body.data.event.title },
      };
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
      setSession(newSession);
      setCode('');
      setStage('ready');
    } catch {
      setConnectError('Network error. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    window.sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setLookup(null);
    setResult(null);
    setStage('connect');
  };

  const resetToReady = () => {
    setLookup(null);
    setResult(null);
    setErrorMsg('');
    setSelected(new Set());
    setStage('ready');
  };

  const handleScanSubmit = useCallback(
    async (raw: string) => {
      const token = raw.trim();
      setScanValue('');
      if (!token || !session) return;

      setStage('looking-up');
      setErrorMsg('');
      try {
        const res = await fetch(`${API_URL}/api/scanner/lookup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ token, event_id: session.event.id }),
        });
        const body = await res.json();

        if (res.status === 401) {
          bounceToConnect('Scanner session expired or was revoked. Enter a new code to continue.');
          return;
        }
        if (!res.ok || !body?.success) {
          setErrorMsg(body?.message || 'Lookup failed.');
          setStage('error');
          return;
        }

        const data = body.data as LookupResult;
        setLookup(data);
        setSelected(new Set(data.tickets.filter((t) => t.check_in_status !== 'used').map((t) => t.id)));
        setStage('picking');
      } catch {
        setErrorMsg('Network error. Please try again.');
        setStage('error');
      }
    },
    [session],
  );

  const handleConfirm = async () => {
    if (!lookup || !session || selected.size === 0) return;
    setStage('confirming');
    try {
      const res = await fetch(`${API_URL}/api/scanner/checkin-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          booking_id: lookup.booking.id,
          ticket_ids: Array.from(selected),
          event_id: session.event.id,
        }),
      });
      const body = await res.json();

      if (res.status === 401) {
        bounceToConnect('Scanner session expired or was revoked. Enter a new code to continue.');
        return;
      }
      if (!res.ok || !body?.success) {
        setErrorMsg(body?.message || 'Check-in failed.');
        setStage('error');
        return;
      }

      setResult(body.data as CheckinBatchResult);
      setStage('success');
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStage('error');
    }
  };

  const toggleTicket = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!checkedSession) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#07060A' }}>
        <Loader className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16 pb-24 px-4" style={{ backgroundColor: '#07060A' }}>
      <div className="max-w-md mx-auto py-10">
        <h1 className="text-2xl font-bold text-white mb-1">Scan Desk</h1>
        <p className="text-gray-400 text-sm mb-8">
          Connect an invite code, then scan tickets with any keyboard-wedge barcode scanner.
        </p>

        {stage === 'connect' && (
          <form onSubmit={handleConnect} className="space-y-4">
            {connectError && (
              <div className="p-3 rounded-xl text-sm text-red-400 border border-red-500/30 bg-red-500/10">
                {connectError}
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Invite code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 7K9PQX"
                maxLength={6}
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-gray-700 text-white tracking-widest uppercase text-center text-lg focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Device label (optional)</label>
              <input
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="Hotel Entrance Desk"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-gray-700 text-white focus:outline-none focus:border-purple-400"
              />
            </div>
            <button
              type="submit"
              disabled={connecting || !code.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 transition-colors"
            >
              {connecting ? <Loader className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Connect
            </button>
          </form>
        )}

        {session && stage !== 'connect' && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-gray-700 px-4 py-3">
            <div>
              <p className="text-white text-sm font-semibold">{session.event.title}</p>
              <p className="text-gray-400 text-xs">{session.gate_label || 'Scan Desk'}</p>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        )}

        {(stage === 'ready' || stage === 'looking-up') && (
          <div className="relative">
            <input
              ref={inputRef}
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleScanSubmit(scanValue);
                }
              }}
              disabled={stage === 'looking-up'}
              placeholder="Ready — scan a ticket"
              autoFocus
              className="w-full px-4 py-6 rounded-2xl bg-white/5 border-2 border-dashed border-purple-500/40 text-white text-center text-lg focus:outline-none focus:border-purple-400"
            />
            {stage === 'looking-up' && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60">
                <Loader className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            )}
          </div>
        )}

        {stage === 'picking' && lookup && (
          <div className="rounded-2xl border border-gray-700 p-5 space-y-4">
            <div>
              <p className="text-white font-semibold">{lookup.booking.buyer_name || 'Guest'}</p>
              <p className="text-gray-400 text-xs">{lookup.booking.booking_reference}</p>
            </div>

            <div className="space-y-2">
              {lookup.tickets.map((t) => {
                const used = t.check_in_status === 'used';
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                      used ? 'border-gray-800 opacity-50' : 'border-gray-700 cursor-pointer hover:border-purple-400/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      disabled={used}
                      onChange={() => toggleTicket(t.id)}
                      className="w-4 h-4"
                    />
                    <div>
                      <p className="text-white text-sm">
                        {t.recipient_name || t.tier_name || 'Ticket'}
                        {t.seat?.label ? ` · Seat ${t.seat.label}` : ''}
                      </p>
                      {used && (
                        <p className="text-gray-500 text-xs">
                          Already checked in{t.checked_in_by_name ? ` by ${t.checked_in_by_name}` : ''}
                          {t.checked_in_at ? ` at ${new Date(t.checked_in_at).toLocaleTimeString()}` : ''}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetToReady}
                className="flex-1 py-3 rounded-xl text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selected.size === 0}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 transition-colors"
              >
                Check in ({selected.size})
              </button>
            </div>
          </div>
        )}

        {stage === 'confirming' && (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        )}

        {stage === 'success' && result && (
          <div
            className="rounded-2xl border p-6 space-y-4"
            style={{ backgroundColor: 'rgba(16,185,129,0.07)', borderColor: 'rgba(16,185,129,0.3)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10b981' }}
              >
                <CheckCircle className="w-7 h-7" />
              </div>
              <div>
                <p className="font-bold text-white text-lg">
                  {result.checked_in_ids.length} ticket{result.checked_in_ids.length === 1 ? '' : 's'} checked in
                </p>
                <p className="text-green-400 text-xs">{new Date(result.checked_in_at).toLocaleTimeString()}</p>
              </div>
            </div>

            {result.already_used_ids.length > 0 && (
              <p className="text-yellow-400 text-xs">
                {result.already_used_ids.length} ticket{result.already_used_ids.length === 1 ? ' was' : 's were'} already
                checked in and skipped.
              </p>
            )}

            <button
              type="button"
              onClick={resetToReady}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Scan next ticket
            </button>
          </div>
        )}

        {stage === 'error' && (
          <div
            className="rounded-2xl border p-6 space-y-4"
            style={{ backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.3)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
              >
                <XCircle className="w-7 h-7" />
              </div>
              <div>
                <p className="font-bold text-white text-lg">Check-in failed</p>
                <p className="text-red-400 text-sm mt-0.5">{errorMsg}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={resetToReady}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
