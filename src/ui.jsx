import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

export function Spinner() { return <div className="spin" />; }

export function Modal({ children, onClose, wide }) {
  return (
    <div className="modal-bg" onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}>
      <div className="modal" style={wide ? { maxWidth: 640 } : undefined}>{children}</div>
    </div>
  );
}

export function Brand({ sub, event }) {
  return (
    <div className="brand">
      <img src="./logo.png" alt="TST Indonesia" />
      <div>
        <div className="brand-name">TST Indonesia</div>
        {sub ? <div className="brand-sub">{sub}</div> : null}
        {event ? <div className="brand-event">{event}</div> : null}
      </div>
    </div>
  );
}

export function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

// Pemindai QR dari kamera. BarcodeDetector bila ada, jsQR sebagai cadangan.
// Kode yang sama dalam 2,5 detik diabaikan supaya tidak terhitung dobel.
export function Scanner({ onCode, hint, error }) {
  const vref = useRef(null);
  const cref = useRef(null);
  const cb = useRef(onCode);
  cb.current = onCode;
  const [err, setErr] = useState('');
  useEffect(() => {
    let stop = false, stream = null, timer = null, det = null;
    const last = { t: '', at: 0 };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        const v = vref.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute('playsinline', 'true');
        v.muted = true;
        await v.play();
        if ('BarcodeDetector' in window) {
          try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { det = null; }
        }
        const tick = async () => {
          if (stop) return;
          let text = null;
          if (v.readyState >= 2 && v.videoWidth) {
            try {
              if (det) {
                const r = await det.detect(v);
                if (r && r[0]) text = r[0].rawValue;
              } else {
                const c = cref.current;
                const sc = Math.min(1, 640 / v.videoWidth);
                c.width = Math.round(v.videoWidth * sc);
                c.height = Math.round(v.videoHeight * sc);
                const ctx = c.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(v, 0, 0, c.width, c.height);
                const d = ctx.getImageData(0, 0, c.width, c.height);
                const q = jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
                if (q) text = q.data;
              }
            } catch { /* abaikan frame yang gagal */ }
          }
          if (text) {
            const now = Date.now();
            if (!(last.t === text && now - last.at < 2500)) {
              last.t = text;
              if (navigator.vibrate) navigator.vibrate(60);
              cb.current(text);
            }
            last.at = now;
          }
          timer = setTimeout(tick, 140);
        };
        tick();
      } catch (e) {
        setErr('Kamera tidak bisa dibuka (' + (e && (e.message || e.name) || 'error') + '). Izinkan akses kamera, atau ketik nomornya.');
      }
    })();
    return () => {
      stop = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="scanbox">
        <video ref={vref} muted playsInline />
        <div className="frame" />
        <canvas ref={cref} style={{ display: 'none' }} />
      </div>
      {hint ? <div className="muted" style={{ textAlign: 'center' }}>{hint}</div> : null}
      {err || error ? <div className="err">{err || error}</div> : null}
    </div>
  );
}
