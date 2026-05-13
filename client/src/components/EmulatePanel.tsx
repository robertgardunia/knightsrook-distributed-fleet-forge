import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { socket } from '../socket';
import type { FleetNode } from '../types/fleet';

type Phase = 'idle' | 'waiting' | 'scanning' | 'active';

interface Props {
  node: FleetNode;
}

function generateDemoCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export default function EmulatePanel({ node }: Props) {
  const [phase,      setPhase]      = useState<Phase>('idle');
  const [demoCode,   setDemoCode]   = useState(() => generateDemoCode());
  const [codeInput,  setCodeInput]  = useState('');
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [camError,   setCamError]   = useState<string | null>(null);

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number>(0);
  const scannedRef = useRef(false);

  useEffect(() => {
    setPhase('waiting');
    socket.emit('kiosk:emulate:start', { nodeId: node.id });

    const onReady = ({ nodeId }: { nodeId: string }) => {
      if (nodeId !== node.id) return;
      setPhase('scanning');
      startCamera();
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
      .catch(err => setCamError(`Camera unavailable: ${err.message}`));
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
      handleCapture(code.data);
    } else {
      rafRef.current = requestAnimationFrame(scanLoop);
    }
  }

  function handleCapture(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScanResult(trimmed);
    setPhase('active');
    socket.emit('kiosk:scan', { nodeId: node.id, data: trimmed });
  }

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  function newUser() {
    scannedRef.current = false;
    setScanResult(null);
    setCodeInput('');
    setDemoCode(generateDemoCode());
    setPhase('scanning');
    startCamera();
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', background: '#020c1b',
      color: '#cbd5e1', fontFamily: 'monospace', fontSize: '0.68rem',
    }}>
      {/* Status strip */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{
          color: phase === 'active' ? '#4ade80' : '#fb923c',
          letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.6rem',
        }}>
          {phase === 'waiting'  ? '● waiting for kiosk…'
          : phase === 'scanning' ? '● get started'
          : phase === 'active'   ? '● session active'
          : '● idle'}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Camera — scanning for QR on card */}
        {phase === 'scanning' && !camError && (
          <div style={{ background: '#000', borderRadius: 4, overflow: 'hidden', lineHeight: 0 }}>
            <video ref={videoRef} muted playsInline style={{ width: '100%' }} />
          </div>
        )}

        {camError && (
          <div style={{ color: '#f87171', background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 4, padding: '8px 12px' }}>
            {camError}
          </div>
        )}

        {/* Active — code captured */}
        {phase === 'active' && scanResult && (
          <div style={{ padding: '10px 14px', background: '#052e16', border: '1px solid #14532d', borderRadius: 4, color: '#4ade80', letterSpacing: '0.06em' }}>
            ✓ code captured: <strong>{scanResult}</strong>
          </div>
        )}

        {/* Manual code entry */}
        {phase === 'scanning' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ color: '#475569', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              or enter code
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && codeInput.trim()) handleCapture(codeInput); }}
                placeholder="code from card"
                style={{
                  flex: 1, background: '#020c1b', border: '1px solid #1e3a5f',
                  color: '#93c5fd', padding: '5px 10px', fontSize: '0.65rem',
                  borderRadius: 2, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button
                onClick={() => { if (codeInput.trim()) handleCapture(codeInput); }}
                disabled={!codeInput.trim()}
                style={{
                  background: 'transparent', border: '1px solid #1e3a5f', color: '#93c5fd',
                  padding: '5px 12px', borderRadius: 3, fontSize: '0.62rem',
                  letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                sign in
              </button>
            </div>
          </div>
        )}

        {/* Demo skip — use generated code, no real card needed */}
        {phase === 'scanning' && (
          <button
            onClick={() => handleCapture(demoCode)}
            style={{
              background: 'transparent', border: '1px solid #1e293b', color: '#475569',
              padding: '5px 12px', borderRadius: 3, fontSize: '0.62rem',
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            skip — use demo id: {demoCode}
          </button>
        )}

        {/* New User */}
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

      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
