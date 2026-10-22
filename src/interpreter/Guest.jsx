import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { ref, onValue, push, update, set, serverTimestamp } from 'firebase/database';
import { auth, db } from '../firebase.js';
import { waLink, validContact } from './util.js';
import { T, initLang, saveLang } from './i18n.js';

const KEY = 'tst-interpreter-last';
const logo = import.meta.env.BASE_URL + 'logo.png';

function Bantuan({ t, teknisi, ushers, no }) {
  if (teknisi && teknisi.hp) {
    return (
      <div className="card help">
        <b>🛟 {t.helpTitle}</b>
        <p className="muted">{t.helpSub}</p>
        <a className="btn wa helpbtn" href={waLink(teknisi.hp, t.helpMsg(no))} target="_blank" rel="noreferrer">
          💬 {t.helpBtn(teknisi.nama)}
        </a>
      </div>
    );
  }
  if (!ushers.length) return null;
  return (
    <div className="card help">
      <b>🛟 {t.helpTitle}</b>
      <p className="muted">{t.usherTitle}</p>
      {ushers.map((u) => (
        <a key={u.id} className="btn wa" href={waLink(u.hp, t.usherMsg)} target="_blank" rel="noreferrer">
          💬 {u.nama} · {u.hp}
        </a>
      ))}
    </div>
  );
}

function Stars({ value, onChange, labels }) {
  return (
    <div className="stars" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} - ${labels[n - 1]}`}
          className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>★</button>
      ))}
      <span className="muted starlabel">{value ? labels[value - 1] : ''}</span>
    </div>
  );
}

function Penilaian({ t, id }) {
  const [pel, setPel] = useState(0);
  const [alat, setAlat] = useState(0);
  const [kom, setKom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const kirim = async (e) => {
    e.preventDefault();
    setErr('');
    if (!pel || !alat) return setErr(t.rateBoth);
    setBusy(true);
    try {
      const d = { pelayanan: pel, alat, uid: auth.currentUser.uid, waktu: serverTimestamp() };
      if (kom.trim()) d.komentar = kom.trim().slice(0, 300);
      await set(ref(db, 'interpreter/nilai/' + id), d);
    } catch (e2) { setErr(t.rateErr(e2.code || '?')); }
    setBusy(false);
  };

  return (
    <form className="card rate" onSubmit={kirim}>
      <h2>⭐ {t.rateTitle}</h2>
      <p className="muted">{t.rateSub}</p>
      <div className="rategrp"><b>{t.rateService}</b><Stars value={pel} onChange={setPel} labels={t.stars} /></div>
      <div className="rategrp"><b>{t.rateDevice}</b><Stars value={alat} onChange={setAlat} labels={t.stars} /></div>
      <label>{t.rateComment}
        <textarea rows={3} maxLength={300} value={kom} onChange={(e) => setKom(e.target.value)} />
      </label>
      {err && <div className="err">{err}</div>}
      <button className="btn primary" disabled={busy}>{busy ? t.rateSending : t.rateSend}</button>
    </form>
  );
}

export default function Guest() {
  const [lang, setLang] = useState(initLang);
  const t = T[lang];
  const [ready, setReady] = useState(false);
  const [cfg, setCfg] = useState({});
  const [f, setF] = useState({ nama: '', hp: '', institusi: '', receiver: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState(null); // status pinjaman saya: dipinjam | kembali
  const [rated, setRated] = useState(false);
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  });

  const pilihBahasa = (l) => { setLang(l); saveLang(l); document.documentElement.lang = l; };
  useEffect(() => { document.documentElement.lang = lang; }, []); // eslint-disable-line

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (u) setReady(true);
    else signInAnonymously(auth).catch((e) => setErr(t.errConn(e.code || '?')));
  }), []); // eslint-disable-line

  useEffect(() => {
    if (!ready) return;
    return onValue(ref(db, 'interpreter/config'), (s) => setCfg(s.val() || {}), (e) => setErr(t.errCfg(e.code || '?')));
  }, [ready]); // eslint-disable-line

  // admin mereset data -> hapus catatan lama di perangkat tamu
  useEffect(() => {
    if (done && cfg.resetAt && cfg.resetAt > (done.t || 0)) {
      try { localStorage.removeItem(KEY); } catch { /* */ }
      setDone(null); setStatus(null); setRated(false);
    }
  }, [cfg.resetAt, done]);

  // pantau status pinjaman saya (untuk memunculkan penilaian setelah alat kembali)
  useEffect(() => {
    if (!ready || !done?.id) { setStatus(null); setRated(false); return; }
    const a = onValue(ref(db, 'interpreter/pinjam/' + done.id), (s) => setStatus(s.val()?.status || null), () => {});
    const b = onValue(ref(db, 'interpreter/nilai/' + done.id), (s) => setRated(s.exists()), () => {});
    return () => { a(); b(); };
  }, [ready, done?.id]);

  const ushers = Object.entries(cfg.bantuan || {}).map(([id, v]) => ({ id, ...v }));
  const set_ = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const kirim = async (e) => {
    e.preventDefault();
    setErr('');
    const d = {
      nama: f.nama.trim(),
      hp: f.hp.trim(),
      institusi: f.institusi.trim(),
      receiver: f.receiver.trim().toUpperCase(),
    };
    if (!d.nama || !d.institusi) return setErr(t.errReq);
    if (!validContact(d.hp)) return setErr(t.errContact);
    if (!/^[A-Z0-9-]{1,6}$/.test(d.receiver)) return setErr(t.errRcv);
    setBusy(true);
    try {
      const id = push(ref(db, 'interpreter/pinjam')).key;
      // satu penulisan atomik: catatan peminjam + kunci nomor receiver
      // (gagal otomatis bila nomor receiver itu masih tercatat dipinjam orang lain)
      await update(ref(db, 'interpreter'), {
        ['pinjam/' + id]: { ...d, uid: auth.currentUser.uid, waktu: serverTimestamp(), status: 'dipinjam' },
        ['aktif/' + d.receiver]: id,
      });
      const rec = { id, nama: d.nama, receiver: d.receiver, t: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* abaikan */ }
      setDone(rec);
    } catch (e2) {
      setErr(t.errSave(d.receiver, e2.code || '?'));
    }
    setBusy(false);
  };

  const head = (
    <>
      <div className="langbar" role="group" aria-label={t.langLabel}>
        <span>🌐 {t.langLabel}</span>
        {[['id', 'Indonesia'], ['en', 'English']].map(([k, n]) => (
          <button key={k} className={lang === k ? 'on' : ''} onClick={() => pilihBahasa(k)}>{n}</button>
        ))}
      </div>
      <div className="brand">
        <img src={logo} alt="TST Indonesia" />
        <div>
          <div className="brand-name">TST Indonesia</div>
          <div className="brand-sub">{t.brandSub}</div>
          {cfg.acara && <div className="brand-event">{cfg.acara}</div>}
        </div>
      </div>
    </>
  );

  if (done) {
    const sudahKembali = status === 'kembali';
    return (
      <div className="wrap">
        {head}
        {sudahKembali ? (
          rated ? (
            <div className="card center"><div className="big">🙏</div><h2>{t.rateThanks}</h2></div>
          ) : <Penilaian t={t} id={done.id} />
        ) : (
          <div className="card center">
            <div className="big">🙏</div>
            <h2>{t.thanks(done.nama)}</h2>
            <p>{t.doneText(done.receiver)}</p>
            <p className="muted">{t.doneHint}</p>
          </div>
        )}
        {!sudahKembali && <Bantuan t={t} teknisi={cfg.teknisi} ushers={ushers} no={done.receiver} />}
        <button className="link" onClick={() => { try { localStorage.removeItem(KEY); } catch { /* */ } setDone(null); setStatus(null); setRated(false); setF({ nama: '', hp: '', institusi: '', receiver: '' }); }}>
          {t.another}
        </button>
      </div>
    );
  }

  return (
    <div className="wrap">
      {head}
      <form className="card" onSubmit={kirim}>
        <h2>{t.formTitle}</h2>
        <p className="muted">{t.formHint}</p>
        <label>{t.name}
          <input value={f.nama} onChange={set_('nama')} autoComplete="name" maxLength={80} required />
        </label>
        <label>{t.contact}
          <input value={f.hp} onChange={set_('hp')} type="text" inputMode="email" placeholder={t.contactPh} autoComplete="email" autoCapitalize="none" maxLength={100} required />
          <span className="muted fine">{t.contactHint}</span>
        </label>
        <label>{t.inst}
          <input value={f.institusi} onChange={set_('institusi')} maxLength={100} required />
        </label>
        <label>{t.rcv}
          <input value={f.receiver} onChange={set_('receiver')} inputMode="numeric" maxLength={6} className="rcv" required />
        </label>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy || !ready}>{busy ? t.saving : t.submit}</button>
      </form>
    </div>
  );
}
