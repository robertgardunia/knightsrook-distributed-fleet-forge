import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { socket } from '../socket';
import type { FleetNode } from '../types/fleet';
import { getAuthConfig, type AuthMethod } from '../config/authPaths';

type Phase = 'idle' | 'waiting' | 'scanning' | 'active';
type SignInMethod = AuthMethod | null;

interface Props {
  node: FleetNode;
}

function generateTempId(): string {
  return 'temp:' + crypto.randomUUID().slice(0, 8).toUpperCase();
}

export default function EmulatePanel({ node }: Props) {
  const authConfig   = getAuthConfig(node.role as Parameters<typeof getAuthConfig>[0]);
  const [signInMethod, setSignInMethod] = useState<SignInMethod>(
    authConfig.methods.length === 1 ? authConfig.methods[0] : null
  );

  const [phase,      setPhase]      = useState<Phase>('idle');
  const [tempId,     setTempId]     = useState(() => generateTempId());
  const [qrDataUrl,  setQrDataUrl]  = useState<string>('');
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [camError,   setCamError]   = useState<string | null>(null);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number>(0);
  const scannedRef  = useRef(false);

  // Start camera when QR method selected after method picker
  useEffect(() => {
    if (signInMethod === 'qr' && phase === 'scanning') startCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signInMethod]);

  // Generate QR code image whenever tempId changes
  useEffect(() => {
    QRCode.toDataURL(tempId, { width: 200, margin: 1, color: { dark: '#4ade80', light: '#020c1b' } })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [tempId]);

  // Tell kiosk to pause and wait for emulated user
  useEffect(() => {
    setPhase('waiting');
    socket.emit('kiosk:emulate:start', { nodeId: node.id });

    const onReady = ({ nodeId }: { nodeId: string }) => {
      if (nodeId !== node.id) return;
      setPhase('scanning');
      // Camera starts only when QR method is active; deferred until method is picked
      // for multi-method nodes.
      if (authConfig.methods.length === 1 && authConfig.methods[0] === 'qr') startCamera();
    };

    socket.on('kiosk:emulate:ready', onReady);
    return () => { socket.off('kiosk:emulate:ready', onReady); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  function startCamera() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        scanLoop();
      })
      .catch(err => {
        setCamError(`Camera unavailable: ${err.message}`);
      });
  }

  function scanLoop() {
    if (scannedRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height);
    if (code?.data) {
      scannedRef.current = true;
      handleScan(code.data);
    } else {
      rafRef.current = requestAnimationFrame(scanLoop);
    }
  }

  function handleScan(data: string) {
    setScanResult(data);
    setPhase('active');
    socket.emit('kiosk:scan', { nodeId: node.id, data });
  }

  // Stop camera on unmount (StatsPanel owns the emulate:stop event)
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  function newUser() {
    const id = generateTempId();
    scannedRef.current = false;
    setScanResult(null);
    setTempId(id);
    setPhase('scanning');
    if (authConfig.methods.length !== 1) setSignInMethod(null);
    if (signInMethod === 'qr') scanLoop();
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', background: '#020c1b',
      color: '#cbd5e1', fontFamily: 'monospace', fontSize: '0.68rem',
    }}>
      {/* Status strip */}
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0,
      }}>
        <span style={{ color: phase === 'active' ? '#4ade80' : '#fb923c', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.6rem' }}>
          {phase === 'waiting' ? '● waiting for kiosk…'
            : phase === 'scanning' ? '● scan to sign in'
            : phase === 'active'   ? '● session active'
            : '● idle'}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Method picker — shown when multiple methods available and none chosen yet */}
        {phase === 'scanning' && signInMethod === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ color: '#475569', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
              sign-in method
            </div>
            {authConfig.methods.map(m => (
              <button
                key={m}
                onClick={() => setSignInMethod(m)}
                style={{
                  background: 'transparent', border: '1px solid #1e3a5f', color: '#93c5fd',
                  padding: '8px 14px', borderRadius: 3, fontSize: '0.65rem',
                  letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {m === 'qr'     ? '⬡  QR Code / Card Scan' : null}
                {m === 'moodle' ? '⬡  Moodle Username + Password' : null}
              </button>
            ))}
          </div>
        )}

        {/* Camera + scan indicator — QR method only */}
        {(phase === 'scanning' || phase === 'active') && signInMethod === 'qr' && (
          <div style={{ position: 'relative', background: '#000', borderRadius: 4, overflow: 'hidden', lineHeight: 0 }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', display: phase === 'scanning' ? 'block' : 'none' }}
            />
            {phase === 'active' && scanResult && (
              <div style={{
                padding: '10px 14px', background: '#052e16', border: '1px solid #14532d', borderRadius: 4,
                color: '#4ade80', letterSpacing: '0.06em',
              }}>
                ✓ signed in as <strong>{scanResult}</strong>
              </div>
            )}
          </div>
        )}

        {camError && (
          <div style={{ color: '#f87171', background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 4, padding: '8px 12px' }}>
            {camError}
          </div>
        )}

        {/* QR code — QR method only */}
        {phase !== 'waiting' && signInMethod === 'qr' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.6rem' }}>
              {phase === 'active' ? 'session id' : 'scan with phone or present card'}
            </div>
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR" style={{ width: 160, height: 160, imageRendering: 'pixelated', borderRadius: 4 }} />
            )}
            <div style={{ color: '#334155', fontSize: '0.6rem', letterSpacing: '0.08em' }}>{tempId}</div>
          </div>
        )}

        {/* Actions */}
        {phase === 'active' && (
          <button
            onClick={newUser}
            style={{
              background: 'transparent', border: '1px solid #1e3a5f', color: '#93c5fd',
              padding: '5px 12px', borderRadius: 3, fontSize: '0.62rem',
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            New User
          </button>
        )}

        {/* Moodle sign-in placeholder */}
        {phase === 'scanning' && signInMethod === 'moodle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px', background: '#061322', border: '1px solid #1e293b', borderRadius: 4 }}>
            <div style={{ color: '#475569', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
              moodle sign-in
            </div>
            <input
              disabled
              placeholder="username"
              style={{ background: '#020c1b', border: '1px solid #1e293b', color: '#64748b', padding: '5px 10px', fontSize: '0.65rem', borderRadius: 2, fontFamily: 'inherit', outline: 'none', cursor: 'not-allowed' }}
            />
            <input
              disabled
              type="password"
              placeholder="password"
              style={{ background: '#020c1b', border: '1px solid #1e293b', color: '#64748b', padding: '5px 10px', fontSize: '0.65rem', borderRadius: 2, fontFamily: 'inherit', outline: 'none', cursor: 'not-allowed' }}
            />
            <div style={{ color: '#334155', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
              moodle auth — not yet implemented
            </div>
            <button
              onClick={() => setSignInMethod(null)}
              style={{ background: 'transparent', border: '1px solid #1e293b', color: '#475569', padding: '4px 10px', borderRadius: 3, fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', marginTop: 4 }}
            >
              ← back
            </button>
          </div>
        )}

        {phase === 'scanning' && signInMethod === 'qr' && (
          <button
            onClick={() => handleScan(tempId)}
            style={{
              background: 'transparent', border: '1px solid #1e3a5f', color: '#64748b',
              padding: '5px 12px', borderRadius: 3, fontSize: '0.62rem',
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Skip — use this ID
          </button>
        )}
      </div>

      {/* Hidden canvas for QR scanning */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
