import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { ref, onValue, push, update, set, serverTimestamp } from 'firebase/database';
import { auth, db } from '../firebase.js';
import { waLink, validContact } from './util.js';
import { T, initLang, saveLang } from './i18n.js';

const KEY = 'tst-interpreter-last';
const logo = import.meta.env.BASE_URL + 'logo.png';

// satu tamu boleh membawa beberapa alat -> disimpan sebagai daftar
const loadLoans = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return !v ? [] : Array.isArray(v) ? v : [v]; } catch { return []; }
};
const saveLoans = (a) => {
  try { if (a.length) localStorage.setItem(KEY, JSON.stringify(a)); else localStorage.removeItem(KEY); } catch { /* */ }
};

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
  const [loans, setLoans] = useState(loadLoans);   // semua alat milik tamu ini
  const [adding, setAdding] = useState(false);     // mode tambah alat (data sama)
  const [st, setSt] = useState({});                // status tiap alat
  const [rated, setRated] = useState(false);

  const base = loans[loans.length - 1];
  const pendek = adding && base?.hp && base?.institusi; // cukup isi nomor receiver

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
    if (!cfg.resetAt) return;
    const sisa = loans.filter((l) => !(cfg.resetAt > (l.t || 0)));
    if (sisa.length !== loans.length) { saveLoans(sisa); setLoans(sisa); setAdding(false); setSt({}); setRated(false); }
  }, [cfg.resetAt, loans]);

  // pantau status setiap alat milik saya + penilaian (disimpan di alat pertama)
  const ids = loans.map((l) => l.id).filter(Boolean).join(',');
  useEffect(() => {
    if (!ready || !ids) { setSt({}); setRated(false); return; }
    const list = ids.split(',');
    const offs = list.map((id) => onValue(ref(db, 'interpreter/pinjam/' + id),
      (s) => setSt((p) => ({ ...p, [id]: s.val()?.status || null })), () => {}));
    offs.push(onValue(ref(db, 'interpreter/nilai/' + list[0]), (s) => setRated(s.exists()), () => {}));
    return () => offs.forEach((o) => o());
  }, [ready, ids]);

  const ushers = Object.entries(cfg.bantuan || {}).map(([id, v]) => ({ id, ...v }));
  const set_ = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const nomorAlat = loans.map((l) => l.receiver).join(', ');

  const kirim = async (e) => {
    e.preventDefault();
    setErr('');
    const src = pendek ? base : f;
    const d = {
      nama: src.nama.trim(),
      hp: src.hp.trim(),
      institusi: src.institusi.trim(),
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
      const next = [...loans, { id, nama: d.nama, hp: d.hp, institusi: d.institusi, receiver: d.receiver, t: Date.now() }];
      saveLoans(next);
      setLoans(next);
      setAdding(false);
      setF({ nama: '', hp: '', institusi: '', receiver: '' });
    } catch (e2) {
      setErr(t.errSave(d.receiver, e2.code || '?'));
    }
    setBusy(false);
  };

  const tamuBaru = () => {
    saveLoans([]); setLoans([]); setAdding(false); setSt({}); setRated(false); setErr('');
    setF({ nama: '', hp: '', institusi: '', receiver: '' });
  };
  const tambahAlat = () => { setErr(''); setF({ nama: base?.nama || '', hp: base?.hp || '', institusi: base?.institusi || '', receiver: '' }); setAdding(true); };

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

  // ====== halaman sesudah terdaftar ======
  if (loans.length && !adding) {
    const semuaKembali = loans.every((l) => l.id && st[l.id] === 'kembali');
    return (
      <div className="wrap">
        {head}
        {semuaKembali ? (
          rated ? (
            <div className="card center"><div className="big">🙏</div><h2>{t.rateThanks}</h2></div>
          ) : <Penilaian t={t} id={loans[0].id} />
        ) : (
          <div className="card center">
            <div className="big">🙏</div>
            <h2>{t.thanks(base.nama)}</h2>
            {loans.length === 1 ? <p>{t.doneText(base.receiver)}</p> : <p className="muted">{t.devicesTitle}</p>}
            {loans.length > 1 && loans.map((l) => (
              <div className="row devrow" key={l.id}>
                <b>Receiver No. {l.receiver}</b>
                <span className={'badge' + (st[l.id] === 'kembali' ? ' ok' : '')}>{st[l.id] === 'kembali' ? '✓ ' + t.stBack : t.stOut}</span>
              </div>
            ))}
            <p className="muted">{t.doneHint}</p>
          </div>
        )}
        {!semuaKembali && <Bantuan t={t} teknisi={cfg.teknisi} ushers={ushers} no={nomorAlat} />}
        <button className="btn" style={{ width: '100%', marginBottom: 6 }} onClick={tambahAlat}>＋ {t.addMore}</button>
        <button className="link" onClick={tamuBaru}>{t.another}</button>
      </div>
    );
  }

  // ====== form pendaftaran (baru / tambah alat) ======
  return (
    <div className="wrap">
      {head}
      <form className="card" onSubmit={kirim}>
        {adding ? (
          <>
            <h2>{t.addingFor(base?.nama || '')}</h2>
            <p className="muted">{pendek ? t.addHint : t.formHint}</p>
          </>
        ) : (
          <>
            <h2>{t.formTitle}</h2>
            <p className="muted">{t.formHint}</p>
          </>
        )}
        {!pendek && (
          <>
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
          </>
        )}
        <label>{t.rcv}
          <input value={f.receiver} onChange={set_('receiver')} inputMode="numeric" maxLength={6} className="rcv" required />
        </label>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy || !ready}>{busy ? t.saving : t.submit}</button>
        {adding && <button type="button" className="link" onClick={() => { setAdding(false); setErr(''); }}>{t.cancel}</button>}
      </form>
    </div>
  );
}
