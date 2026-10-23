import { useCallback, useEffect, useRef, useState } from 'react';
import { rcvNorm, RCV_OK } from './util.js';

// Ambil nomor receiver dari isi QR.
// Format stiker: <alamat>#/?no=A001  (atau #/r/<ruangan>?no=A001). Teks pendek "A001" juga diterima.
export const parseNo = (text) => {
  const s = String(text || '').trim();
  const m = s.match(/[?&]no=([^&#\s]+)/i);
  if (m) {
    try { const n = rcvNorm(decodeURIComponent(m[1])); return RCV_OK.test(n) ? n : ''; } catch { return ''; }
  }
  const n = rcvNorm(s);
  return s.length <= 12 && /\d/.test(n) && RCV_OK.test(n) ? n : '';
};

const ID = {
  title: 'Scan QR di alat',
  hint: 'Arahkan kamera ke QR pada stiker alat. Gunakan tombol +/− atau cubit layar untuk zoom, ketuk layar untuk fokus.',
  close: 'Tutup',
  wait: 'Menyalakan kamera…',
  denied: 'Kamera tidak diizinkan. Izinkan akses kamera di browser, atau ketik nomornya secara manual.',
  nocam: 'Kamera tidak tersedia di perangkat ini. Ketik nomornya secara manual.',
  notqr: 'QR ini bukan label receiver. Coba lagi.',
};

/* ---------- Bunyi beep (WebAudio, tanpa file audio) ---------- */
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
      // Kompresor + gain maksimum supaya bunyi sekeras mungkin tanpa pecah
      const comp = c.createDynamicsCompressor();
      const master = c.createGain();
      master.gain.value = 1;
      comp.connect(master); master.connect(c.destination);
      // Dua nada pendek (naik) = "bip-biip" yang jelas terdengar
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
  // Getar: pola panjang-pendek (Android; iPhone/Safari tidak mendukung vibrate)
  try { navigator.vibrate && navigator.vibrate([200, 60, 200]); } catch { /* */ }
};

const S = {
  zoomBar: { display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' },
  zbtn: { width: 44, height: 44, flex: '0 0 44px', borderRadius: 10, border: '1px solid #2F5FB3', background: '#123A7A', color: '#fff', fontSize: 24, lineHeight: 1, cursor: 'pointer' },
  range: { flex: 1, minWidth: 0, height: 32 },
  zval: { minWidth: 44, textAlign: 'right', fontSize: 13, color: '#BFD6FF', fontVariantNumeric: 'tabular-nums' },
};

// Modal kamera. onScan(no) dipanggil tiap QR receiver terbaca (kode yang sama diabaikan 3 detik).
// Modal tidak menutup sendiri: tamu menutupnya di onScan, Usher dibiarkan terbuka untuk scan berturut-turut.
// Fitur: zoom (hardware bila didukung, kalau tidak zoom digital), tap-untuk-fokus, beep saat QR valid terbaca.
export default function Scanner({ onScan, onClose, labels, status }) {
  const L = { ...ID, ...(labels || {}) };
  const vid = useRef(null);
  const box = useRef(null);
  const trk = useRef(null);
  const cb = useRef(onScan);
  cb.current = onScan;
  const zoomRef = useRef({ v: 1, hw: false });
  const [state, setState] = useState('wait');   // wait | on | denied | nocam
  const [bad, setBad] = useState(false);
  const [zr, setZr] = useState({ min: 1, max: 4, step: 0.1, hw: false });
  const [zoom, setZoomState] = useState(1);

  const setZoom = useCallback((val) => {
    const { min, max, hw } = zoomRef.current.r || { min: 1, max: 4, hw: false };
    const v = Math.max(min, Math.min(max, val));
    zoomRef.current.v = v;
    setZoomState(v);
    if (hw && trk.current) {
      trk.current.applyConstraints({ advanced: [{ zoom: v }] }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  // Aktifkan audio saat modal dibuka (dipicu klik user) agar beep tidak diblokir browser.
  useEffect(() => { getCtx(); }, []);

  useEffect(() => {
    let stop = false, stream = null, timer = 0;
    const last = { no: '', t: 0, bad: 0 };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState('nocam'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (e) {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
        catch (e2) { setState((e2 && e2.name) === 'NotAllowedError' || (e && e.name) === 'NotAllowedError' ? 'denied' : 'nocam'); return; }
      }
      if (stop) { stream.getTracks().forEach((x) => x.stop()); return; }
      const v = vid.current;
      v.srcObject = stream;
      v.setAttribute('playsinline', 'true');
      v.muted = true;
      try { await v.play(); } catch { /* */ }

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
      } catch { /* */ }
      zoomRef.current = { v: range.min, hw: range.hw, r: range };
      setZr(range);
      setZoomState(range.min);
      setState('on');

      let det = null;
      try { if ('BarcodeDetector' in window) det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { det = null; }
      const jsQR = det ? null : (await import('jsqr')).default;
      const cv = document.createElement('canvas');
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const tick = async () => {
        if (stop) return;
        if (v.readyState >= 2 && v.videoWidth) {
          let text = '';
          try {
            const zz = zoomRef.current;
            const digital = !zz.hw && zz.v > 1.01;
            if (det && !digital) {
              const r = await det.detect(v);
              text = (r[0] && r[0].rawValue) || '';
            } else {
              // Crop tengah frame sesuai zoom digital, lalu decode
              const vw = v.videoWidth, vh = v.videoHeight;
              const z = digital ? zz.v : 1;
              const side = digital ? Math.min(vw, vh) / z : 0;
              const sw = digital ? side : vw, sh = digital ? side : vh;
              const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
              const sc = Math.min(1, 800 / sw);
              cv.width = Math.round(sw * sc); cv.height = Math.round(sh * sc);
              cx.drawImage(v, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
              if (det) {
                const r = await det.detect(cv);
                text = (r[0] && r[0].rawValue) || '';
              } else {
                const d = cx.getImageData(0, 0, cv.width, cv.height);
                const r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
                text = (r && r.data) || '';
              }
            }
          } catch { /* frame gagal dibaca, lanjut */ }
          if (text && !stop) {
            const no = parseNo(text);
            const now = Date.now();
            if (no) {
              if (!(last.no === no && now - last.t < 3000)) {
                last.no = no; last.t = now;
                setBad(false);
                beep();
                await cb.current(no);
                last.t = Date.now();
              }
            } else if (now - last.bad > 2500) { last.bad = now; setBad(true); }
          }
        }
        if (!stop) timer = setTimeout(tick, 120);
      };
      tick();
    })();
    return () => { stop = true; clearTimeout(timer); trk.current = null; if (stream) stream.getTracks().forEach((x) => x.stop()); };
  }, []);

  // Cubit 2 jari = zoom, ketuk = fokus ulang, scroll mouse = zoom
  useEffect(() => {
    const el = box.current;
    if (!el || state !== 'on') return;
    const pts = new Map();
    let d0 = 0, z0 = 1, moved = false, downT = 0;
    const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
    const down = (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved = false; downT = Date.now(); }
      if (pts.size === 2) { d0 = dist(); z0 = zoomRef.current.v; moved = true; }
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
    const refocus = async () => {
      const t = trk.current;
      if (!t) return;
      try {
        const cap = t.getCapabilities ? t.getCapabilities() : {};
        const modes = cap.focusMode || [];
        if (modes.includes('single-shot')) {
          await t.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
          setTimeout(() => { trk.current && modes.includes('continuous') && trk.current.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}); }, 1200);
        } else if (modes.includes('continuous')) {
          await t.applyConstraints({ advanced: [{ focusMode: 'manual' }] }).catch(() => {});
          await t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
      } catch { /* */ }
    };
    const wheel = (e) => { e.preventDefault(); setZoom(zoomRef.current.v * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); };
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
  }, [state, setZoom]);

  const digital = !zr.hw;
  const bump = (dir) => setZoom(zoom + dir * (zr.hw ? Math.max(zr.step, (zr.max - zr.min) / 10) : 0.5));

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal scanmodal" role="dialog" aria-modal="true" aria-label={L.title} onClick={(e) => e.stopPropagation()}>
        <h2>📷 {L.title}</h2>
        <p className="muted">{L.hint}</p>
        {state === 'denied' || state === 'nocam' ? (
          <div className="err">{state === 'denied' ? L.denied : L.nocam}</div>
        ) : (
          <>
            <div className="scanbox" ref={box} style={{ touchAction: 'none' }}>
              <video
                ref={vid} className="scanvid" playsInline muted
                style={digital ? { transform: `scale(${zoom})`, transformOrigin: 'center center' } : undefined}
              />
              <div className="reticle" aria-hidden="true" />
              {state === 'wait' && <div className="scanwait">{L.wait}</div>}
            </div>
            {state === 'on' && (
              <div style={S.zoomBar}>
                <button type="button" style={S.zbtn} aria-label="Zoom out" onClick={() => bump(-1)}>−</button>
                <input
                  type="range" style={S.range} aria-label="Zoom"
                  min={zr.min} max={zr.max} step={zr.step} value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                />
                <button type="button" style={S.zbtn} aria-label="Zoom in" onClick={() => bump(1)}>+</button>
                <span style={S.zval}>{zoom.toFixed(1)}×</span>
              </div>
            )}
          </>
        )}
        {bad && <div className="err">{L.notqr}</div>}
        {status && <div className="scaninfo">{status}</div>}
        <button type="button" className="btn primary" onClick={onClose}>{L.close}</button>
      </div>
    </div>
  );
}
