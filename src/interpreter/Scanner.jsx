import { useEffect, useRef, useState } from 'react';
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
  hint: 'Arahkan kamera ke QR pada stiker alat.',
  close: 'Tutup',
  wait: 'Menyalakan kamera…',
  denied: 'Kamera tidak diizinkan. Izinkan akses kamera di browser, atau ketik nomornya secara manual.',
  nocam: 'Kamera tidak tersedia di perangkat ini. Ketik nomornya secara manual.',
  notqr: 'QR ini bukan label receiver. Coba lagi.',
};

// Modal kamera. onScan(no) dipanggil tiap QR receiver terbaca (kode yang sama diabaikan 3 detik).
// Modal tidak menutup sendiri: tamu menutupnya di onScan, Usher dibiarkan terbuka untuk scan berturut-turut.
export default function Scanner({ onScan, onClose, labels, status }) {
  const L = { ...ID, ...(labels || {}) };
  const vid = useRef(null);
  const cb = useRef(onScan);
  cb.current = onScan;
  const [state, setState] = useState('wait');   // wait | on | denied | nocam
  const [bad, setBad] = useState(false);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  useEffect(() => {
    let stop = false, stream = null, timer = 0;
    const last = { no: '', t: 0, bad: 0 };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState('nocam'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (e) { setState(e && e.name === 'NotAllowedError' ? 'denied' : 'nocam'); return; }
      if (stop) { stream.getTracks().forEach((x) => x.stop()); return; }
      const v = vid.current;
      v.srcObject = stream;
      v.setAttribute('playsinline', 'true');
      v.muted = true;
      try { await v.play(); } catch { /* */ }
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
            if (det) {
              const r = await det.detect(v);
              text = (r[0] && r[0].rawValue) || '';
            } else {
              const sc = Math.min(1, 640 / v.videoWidth);
              cv.width = Math.round(v.videoWidth * sc); cv.height = Math.round(v.videoHeight * sc);
              cx.drawImage(v, 0, 0, cv.width, cv.height);
              const d = cx.getImageData(0, 0, cv.width, cv.height);
              const r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
              text = (r && r.data) || '';
            }
          } catch { /* frame gagal dibaca, lanjut */ }
          if (text && !stop) {
            const no = parseNo(text);
            const now = Date.now();
            if (no) {
              if (!(last.no === no && now - last.t < 3000)) {
                last.no = no; last.t = now;
                setBad(false);
                await cb.current(no);
                last.t = Date.now();
              }
            } else if (now - last.bad > 2500) { last.bad = now; setBad(true); }
          }
        }
        if (!stop) timer = setTimeout(tick, 160);
      };
      tick();
    })();
    return () => { stop = true; clearTimeout(timer); if (stream) stream.getTracks().forEach((x) => x.stop()); };
  }, []);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal scanmodal" role="dialog" aria-modal="true" aria-label={L.title} onClick={(e) => e.stopPropagation()}>
        <h2>📷 {L.title}</h2>
        <p className="muted">{L.hint}</p>
        {state === 'denied' || state === 'nocam' ? (
          <div className="err">{state === 'denied' ? L.denied : L.nocam}</div>
        ) : (
          <div className="scanbox">
            <video ref={vid} className="scanvid" playsInline muted />
            <div className="reticle" aria-hidden="true" />
            {state === 'wait' && <div className="scanwait">{L.wait}</div>}
          </div>
        )}
        {bad && <div className="err">{L.notqr}</div>}
        {status && <div className="scaninfo">{status}</div>}
        <button type="button" className="btn primary" onClick={onClose}>{L.close}</button>
      </div>
    </div>
  );
}
