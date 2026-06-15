import React, { useEffect, useState } from 'react';
import { getQboStatus, getQboConnectUrl, disconnectQbo, QboStatus } from '../../api/qbo';
import { useAppDialog } from '../../context/AppDialogContext';

export default function QboSettings() {
  const { showAlert, showConfirm } = useAppDialog();
  const [status, setStatus] = useState<QboStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Show toast if redirected back from Intuit OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qbo = params.get('qbo');
    if (qbo === 'connected') {
      showAlert('QuickBooks connected successfully.', 'Connected');
      // Clean up the URL param without a full reload
      const url = new URL(window.location.href);
      url.searchParams.delete('qbo');
      window.history.replaceState({}, '', url.toString());
    } else if (qbo === 'error') {
      const reason = params.get('reason') || 'Unknown error';
      showAlert(`QuickBooks connection failed: ${reason}`, 'Error');
      const url = new URL(window.location.href);
      url.searchParams.delete('qbo');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        setStatus(await getQboStatus());
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const { url } = await getQboConnectUrl();
      window.location.href = url; // hand off to Intuit OAuth
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    const ok = await showConfirm(
      'Disconnect QuickBooks? Future invoice pushes will fail until you reconnect.',
    );
    if (!ok) return;
    try {
      await disconnectQbo();
      setStatus({ connected: false });
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    }
  }

  if (loading) return <p style={{ color: '#6b7280', fontSize: 14 }}>Checking QuickBooks status…</p>;

  return (
    <div style={{
      padding: 16,
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      background: status?.connected ? '#f0fdf4' : '#fafafa',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>QuickBooks Online</span>
            <span style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              background: status?.connected ? '#059669' : '#6b7280',
            }}>
              {status?.connected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
          {status?.connected && status.connectedAt && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              Connected since {new Date(status.connectedAt).toLocaleDateString()}
              {status.realmId && ` · Realm ${status.realmId}`}
            </p>
          )}
          {!status?.connected && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              Connect to push approved invoices directly to your QuickBooks company.
            </p>
          )}
        </div>
        {status?.connected ? (
          <button
            onClick={handleDisconnect}
            style={{
              background: 'none',
              border: '1px solid #fca5a5',
              color: '#dc2626',
              borderRadius: 6,
              padding: '7px 16px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            style={{
              background: '#2CA01C',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 18px',
              cursor: connecting ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
              opacity: connecting ? 0.7 : 1,
            }}
          >
            {connecting ? 'Redirecting…' : 'Connect QuickBooks'}
          </button>
        )}
      </div>
    </div>
  );
}
