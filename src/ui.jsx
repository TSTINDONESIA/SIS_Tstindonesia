import React, { useCallback, useEffect, useRef, useState } from 'react';
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
// Zoom: hardware bila didukung perangkat, kalau tidak zoom digital (crop tengah). Cubit 2 jari, tombol +/−, atau slider.
// Fokus: kontinu otomatis, ketuk layar untuk fokus ulang.
// Bunyi beep (WebAudio, tanpa file audio): dua nada keras, plus getar (Android; iPhone/Safari tidak mendukung getar).
let actx = null;
const getCtx = () => {
  try {
    if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === 'suspended') actx.resume();
  } catch { /* */ }
  return actx;
};
const beep = () => {
  try {
    const c = getCtx();
    if (c) {
      const t0 = c.currentTime;
      const comp = c.createDynamicsCompressor();
      const master = c.createGain();
      master.gain.value = 1;
      comp.connect(master); master.connect(c.destination);
      [[1500, 0], [2200, 0.14]].forEach(([f, d]) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(1, t0 + d + 0.01);
        g.gain.setValueAtTime(1, t0 + d + 0.10);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.13);
        o.connect(g); g.connect(comp);
        o.start(t0 + d); o.stop(t0 + d + 0.14);
      });
    }
  } catch { /* */ }
  try { navigator.vibrate && navigator.vibrate([200, 60, 200]); } catch { /* */ }
};

const ZBTN = { width: 44, height: 44, flex: '0 0 44px', borderRadius: 10, border: '1px solid #2F5FB3', background: '#123A7A', color: '#fff', fontSize: 24, lineHeight: 1, cursor: 'pointer' };

export function Scanner({ onCode, hint, error }) {
  const vref = useRef(null);
  const cref = useRef(null);
  const box = useRef(null);
  const trk = useRef(null);
  const zref = useRef({ v: 1, r: { min: 1, max: 4, step: 0.1, hw: false } });
  const cb = useRef(onCode);
  cb.current = onCode;
  const [err, setErr] = useState('');
  useEffect(() => { getCtx(); }, []);
  const [on, setOn] = useState(false);
  const [zr, setZr] = useState({ min: 1, max: 4, step: 0.1, hw: false });
  const [zoom, setZoomState] = useState(1);

  const setZoom = useCallback((val) => {
    const { min, max, hw } = zref.current.r;
    const v = Math.max(min, Math.min(max, val));
    zref.current.v = v;
    setZoomState(v);
    if (hw && trk.current) trk.current.applyConstraints({ advanced: [{ zoom: v }] }).catch(() => {});
  }, []);

  useEffect(() => {
    let stop = false, stream = null, timer = null, det = null;
    const last = { t: '', at: 0 };
    (async () => {
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        }
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = vref.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute('playsinline', 'true');
        v.muted = true;
        await v.play();

        // Fokus kontinu + zoom hardware (jika perangkat mendukung)
        const track = stream.getVideoTracks()[0];
        trk.current = track;
        let range = { min: 1, max: 4, step: 0.1, hw: false };
        try {
          const cap = (track.getCapabilities && track.getCapabilities()) || {};
          if (cap.focusMode && cap.focusMode.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
          }
          if (cap.zoom && cap.zoom.max > cap.zoom.min) {
            range = { min: cap.zoom.min, max: Math.min(cap.zoom.max, 10), step: cap.zoom.step || 0.1, hw: true };
          }
        } catch { /* perangkat tidak mendukung */ }
        zref.current = { v: range.min, r: range };
        setZr(range);
        setZoomState(range.min);
        setOn(true);

        if ('BarcodeDetector' in window) {
          try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { det = null; }
        }
        const cv = document.createElement('canvas');
        const cx = cv.getContext('2d', { willReadFrequently: true });
        const tick = async () => {
          if (stop) return;
          let text = null;
          if (v.readyState >= 2 && v.videoWidth) {
            try {
              const z = zref.current;
              const digital = !z.r.hw && z.v > 1.01;
              if (det && !digital) {
                const r = await det.detect(v);
                if (r && r[0]) text = r[0].rawValue;
              } else {
                // Crop tengah frame sesuai zoom digital, lalu decode
                const vw = v.videoWidth, vh = v.videoHeight;
                const side = digital ? Math.min(vw, vh) / z.v : 0;
                const sw = digital ? side : vw, sh = digital ? side : vh;
                const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
                const sc = Math.min(1, 800 / sw);
                cv.width = Math.round(sw * sc);
                cv.height = Math.round(sh * sc);
                cx.drawImage(v, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
                if (det) {
                  const r = await det.detect(cv);
                  if (r && r[0]) text = r[0].rawValue;
                } else {
                  const d = cx.getImageData(0, 0, cv.width, cv.height);
                  const q = jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
                  if (q) text = q.data;
                }
              }
            } catch { /* abaikan frame yang gagal */ }
          }
          if (text) {
            const now = Date.now();
            if (!(last.t === text && now - last.at < 2500)) {
              last.t = text;
              beep();
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
      trk.current = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Cubit 2 jari = zoom, ketuk = fokus ulang, scroll mouse = zoom
  useEffect(() => {
    const el = box.current;
    if (!el || !on) return;
    const pts = new Map();
    let d0 = 0, z0 = 1, moved = false, downT = 0;
    const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
    const refocus = async () => {
      const t = trk.current;
      if (!t) return;
      try {
        const modes = (t.getCapabilities ? t.getCapabilities() : {}).focusMode || [];
        if (modes.includes('single-shot')) {
          await t.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
          setTimeout(() => { trk.current && modes.includes('continuous') && trk.current.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}); }, 1200);
        } else if (modes.includes('continuous')) {
          await t.applyConstraints({ advanced: [{ focusMode: 'manual' }] }).catch(() => {});
          await t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
      } catch { /* perangkat tidak mendukung */ }
    };
    const down = (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved = false; downT = Date.now(); }
      if (pts.size === 2) { d0 = dist(); z0 = zref.current.v; moved = true; }
    };
    const move = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && d0) setZoom(z0 * (dist() / d0));
    };
    const up = (e) => {
      const was = pts.has(e.pointerId);
      pts.delete(e.pointerId);
      if (was && pts.size === 0 && !moved && Date.now() - downT < 350) refocus();
    };
    const wheel = (e) => { e.preventDefault(); setZoom(zref.current.v * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [on, setZoom]);

  const bump = (dir) => setZoom(zoom + dir * (zr.hw ? Math.max(zr.step, (zr.max - zr.min) / 10) : 0.5));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="scanbox" ref={box} style={{ touchAction: 'none' }}>
        <video ref={vref} muted playsInline style={!zr.hw ? { transform: `scale(${zoom})`, transformOrigin: 'center center' } : undefined} />
        <div className="frame" />
        <canvas ref={cref} style={{ display: 'none' }} />
      </div>
      {on ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" style={ZBTN} aria-label="Zoom out" onClick={() => bump(-1)}>−</button>
          <input type="range" style={{ flex: 1, minWidth: 0, height: 32 }} aria-label="Zoom" min={zr.min} max={zr.max} step={zr.step} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} />
          <button type="button" style={ZBTN} aria-label="Zoom in" onClick={() => bump(1)}>+</button>
          <span style={{ minWidth: 44, textAlign: 'right', fontSize: 13, color: '#BFD6FF', fontVariantNumeric: 'tabular-nums' }}>{zoom.toFixed(1)}×</span>
        </div>
      ) : null}
      {hint ? <div className="muted" style={{ textAlign: 'center' }}>{hint}. Cubit layar atau pakai +/− untuk zoom, ketuk layar untuk fokus.</div> : null}
      {err || error ? <div className="err">{err || error}</div> : null}
    </div>
  );
}
