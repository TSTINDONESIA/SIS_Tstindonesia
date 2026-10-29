import React, { useEffect, useMemo, useState } from 'react';
import { ref, onValue, set, serverTimestamp } from 'firebase/database';
import { db, ready } from './firebase.js';
import { tr } from './i18n.js';
import { Brand, Modal, Scanner, Spinner } from './ui.jsx';
import { Icon } from './icons.jsx';
import { pinjamUnit } from './pinjam.js';
import { JAMINAN, jaminanAktif, jaminanInfo, unitFromScan, unitNorm, validContact, waLink, jadwalText } from './util.js';

const baca = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? def; } catch { return def; } };
const tulis = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

function Bintang({ v, set: setV }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= v ? 'on' : ''} onClick={() => setV(n)} aria-label={n + ' bintang'}>★</button>
      ))}
    </div>
  );
}

export default function Guest({ eid }) {
  const [lang, setLang] = useState(() => localStorage.getItem('sis.lang') || ((navigator.language || 'id').toLowerCase().startsWith('id') ? 'id' : 'en'));
  const T = (k, v) => tr(lang, k, v);
  const pilihBahasa = (l) => { setLang(l); try { localStorage.setItem('sis.lang', l); } catch {} };

  const [uid, setUid] = useState(null);
  const [meta, setMeta] = useState(undefined);
  const [cfg, setCfg] = useState({});
  const [status, setStatus] = useState(undefined);

  const tersimpan = useMemo(() => baca('sis.tamu', {}), []);
  const [f, setF] = useState({ nama: tersimpan.nama || '', hp: tersimpan.hp || '', institusi: tersimpan.institusi || '', jaminan: '' });
  const [edit, setEdit] = useState(!(tersimpan.nama && tersimpan.hp && tersimpan.institusi));
  const [cart, setCart] = useState([]);
  const [ketik, setKetik] = useState('');
  const [scan, setScan] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [err, setErr] = useState('');
  const [errs, setErrs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [panduan, setPanduan] = useState(false);
  const [loans, setLoans] = useState(() => (eid ? baca('sis.loans.' + eid, []) : []));
  const [ld, setLd] = useState({});
  const [rate, setRate] = useState({ pel: 0, alat: 0, kom: '' });
  const [sudahNilai, setSudahNilai] = useState(() => (eid ? !!localStorage.getItem('sis.nilai.' + eid) : false));

  useEffect(() => {
    let mati = false;
    const offs = [];
    ready.then((u) => {
      if (mati) return;
      setUid(u.uid);
      if (!eid) return;
      const b = `sis/acara/${eid}`;
      offs.push(onValue(ref(db, b + '/meta'), (s) => setMeta(s.val()), () => setMeta(null)));
      offs.push(onValue(ref(db, b + '/config'), (s) => setCfg(s.val() || {}), () => {}));
      offs.push(onValue(ref(db, b + '/status'), (s) => setStatus(s.val()), () => setStatus(null)));
    }).catch(() => {});
    return () => { mati = true; offs.forEach((o) => o()); };
  }, [eid]);

  useEffect(() => {
    if (!uid || !eid) return undefined;
    const offs = loans.map((l) => onValue(ref(db, `sis/acara/${eid}/pinjam/${l.id}`), (s) => setLd((p) => ({ ...p, [l.id]: s.val() || { hilang: true } })), () => {}));
    return () => offs.forEach((o) => o());
  }, [uid, eid, loans.length]);

  const jams = jaminanAktif(cfg);
  useEffect(() => {
    if (jams.length && f.jaminan && !jams.some((j) => j.k === f.jaminan)) setF((p) => ({ ...p, jaminan: '' }));
  }, [cfg]);

  const tambah = (u) => setCart((c) => (c.includes(u) ? c : [...c, u]));
  const tambahKetik = () => {
    const u = unitNorm(ketik);
    if (!u) { setErr(T('eUnitBad')); return; }
    setErr(''); tambah(u); setKetik('');
  };
  const onCode = (txt) => {
    const u = unitFromScan(txt);
    if (!u) { setScanMsg(T('eUnitBad')); return; }
    tambah(u);
    setScanMsg(u + ' ✓');
  };

  async function kirim() {
    setErr(''); setErrs([]);
    const nama = f.nama.trim(), hp = f.hp.trim(), institusi = f.institusi.trim();
    if (!nama) { setEdit(true); return setErr(T('eName')); }
    if (!validContact(hp)) { setEdit(true); return setErr(T('eContact')); }
    if (!institusi) { setEdit(true); return setErr(T('eOrg')); }
    if (jams.length && !f.jaminan) { setEdit(true); return setErr(T('eJam')); }
    if (!cart.length) return setErr(T('eUnits'));
    if (status !== 'aktif') return setErr(T('eClosed'));
    setBusy(true);
    tulis('sis.tamu', { nama, hp, institusi });
    const ok = [], gagal = [];
    for (const u of cart) {
      try {
        const id = await pinjamUnit({ eid, uid, nama, hp, institusi, jaminan: jams.length ? f.jaminan : '', unit: u });
        ok.push({ id, unit: u });
      } catch (e) {
        gagal.push(e.message === 'TAKEN' ? T('eTaken', { u }) : T('eFail', { u }));
      }
    }
    if (ok.length) {
      const baru = [...loans, ...ok];
      setLoans(baru);
      tulis('sis.loans.' + eid, baru);
      setCart((c) => c.filter((u) => !ok.some((o) => o.unit === u)));
      setEdit(false);
      if (!sudahNilai) setPanduan(true);
    }
    setErrs(gagal);
    setBusy(false);
  }

  const semuaKembali = loans.length > 0 && loans.every((l) => ld[l.id] && ld[l.id].status === 'kembali');
  async function kirimNilai() {
    if (!rate.pel || !rate.alat) return;
    try {
      await set(ref(db, `sis/acara/${eid}/nilai/${uid}`), { pelayanan: rate.pel, alat: rate.alat, komentar: rate.kom.trim().slice(0, 300), waktu: serverTimestamp() });
    } catch { /* sudah pernah menilai */ }
    localStorage.setItem('sis.nilai.' + eid, '1');
    setSudahNilai(true);
  }

  const chs = Object.values(cfg.channels || {});
  // Menu drawer tamu: hanya fungsi yang memang ada di halaman ini.
  const menuTamu = [
    { icon: 'book', label: T('guide'), onClick: () => setPanduan(true) },
    ...(cfg.teknisiWa ? [{ icon: 'help', label: T('helpBtn'), href: waLink(cfg.teknisiWa, ''), external: true }] : []),
    { icon: 'globe', label: lang === 'id' ? 'English' : 'Bahasa Indonesia', onClick: () => pilihBahasa(lang === 'id' ? 'en' : 'id') },
  ];
  const header = (
    <>
      <Brand sub={T('sub')} event={meta ? meta.nama + (meta.tanggal ? ' · ' + jadwalText(meta) : '') : ''} items={menuTamu} />
      <div className="langbar">
        <Icon name="globe" size={18} />
        <button className={lang === 'id' ? 'on' : ''} onClick={() => pilihBahasa('id')}>ID</button>
        <button className={lang === 'en' ? 'on' : ''} onClick={() => pilihBahasa('en')}>EN</button>
      </div>
    </>
  );

  if (!eid) return <div className="wrap">{header}<div className="card center"><div className="big"><Icon name="phone" size={44} /></div><p>{T('needEvent')}</p></div></div>;
  if (meta === undefined || status === undefined || !uid) return <div className="wrap">{header}<Spinner /></div>;
  if (meta === null) return <div className="wrap">{header}<div className="card center"><div className="big"><Icon name="search" size={44} /></div><p>{T('evMissing')}</p></div></div>;

  const bantuan = cfg.teknisiWa ? (
    <div className="card help">
      <b>{T('help')}</b>
      <a className="btn wa helpbtn" href={waLink(cfg.teknisiWa, '')} target="_blank" rel="noreferrer"><Icon name="help" size={22} /> {T('helpBtn')}</a>
    </div>
  ) : null;

  return (
    <div className="wrap">
      {header}
      <figure className="devhero">
        <img src="./receiver-taiden.jpg" alt="Receiver interpreter TAIDEN dan koper pengisi daya" width="561" height="462" loading="eager" decoding="async" />
      </figure>
      {status !== 'aktif' ? (
        <div className="card center"><div className="big"><Icon name="flag" size={44} /></div><p>{T('evDone')}</p></div>
      ) : null}

      <button className="btn guidebtn" onClick={() => setPanduan(true)}><Icon name="book" size={22} /> {T('guide')}</button>

      {loans.length > 0 ? (
        <div className="card">
          <h2>{T('mine')}</h2>
          <div className="chips">
            {loans.map((l) => {
              const d = ld[l.id];
              const st = d && d.status;
              return <span key={l.id} className={'chip ' + (st === 'kembali' ? 'ok' : st === 'tidakKembali' ? 'bad' : 'warn')}>{l.unit}<small style={{ fontWeight: 600, letterSpacing: 0 }}>{st ? T('st_' + st) : ''}</small></span>;
            })}
          </div>
          {!semuaKembali ? <div className="muted">{T('returnHint')}</div> : null}
        </div>
      ) : null}

      {semuaKembali && !sudahNilai ? (
        <div className="card rate">
          <h2>{T('rateTitle')}</h2>
          <div className="rategrp"><span>{T('ratePel')}</span><Bintang v={rate.pel} set={(n) => setRate((r) => ({ ...r, pel: n }))} /></div>
          <div className="rategrp"><span>{T('rateAlat')}</span><Bintang v={rate.alat} set={(n) => setRate((r) => ({ ...r, alat: n }))} /></div>
          <label>{T('rateCom')}<textarea rows={2} maxLength={300} value={rate.kom} onChange={(e) => setRate((r) => ({ ...r, kom: e.target.value }))} /></label>
          <button className="btn primary" disabled={!rate.pel || !rate.alat} onClick={kirimNilai}>{T('rateSend')}</button>
        </div>
      ) : null}
      {semuaKembali && sudahNilai ? <div className="card center"><div className="big">🙏</div><p>{T('thanks')}</p></div> : null}

      {status === 'aktif' ? (
        <div className="card">
          <h2>{loans.length ? T('addMore') : T('title')}</h2>

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>{T('units')}</div>
            <div className="muted" style={{ marginBottom: 8 }}>{T('unitHint')}</div>
            {cart.length ? (
              <div className="chips" style={{ marginBottom: 10 }}>
                {cart.map((u) => <span key={u} className="chip">{u}<button type="button" aria-label="hapus" onClick={() => setCart((c) => c.filter((x) => x !== u))}>×</button></span>)}
              </div>
            ) : null}
            <div className="rowbtn">
              <button className="btn primary" type="button" onClick={() => { setScanMsg(''); setScan(true); }}><Icon name="scan" size={24} /> {T('scan')}</button>
            </div>
            <div className="chedit" style={{ marginTop: 8 }}>
              <input value={ketik} placeholder={T('typeNo') + ' (A001)'} maxLength={6} autoCapitalize="characters"
                onChange={(e) => setKetik(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && tambahKetik()} style={{ textTransform: 'uppercase' }} />
              <button className="btn" type="button" onClick={tambahKetik}>{T('add')}</button>
            </div>
          </div>

          <h3 style={{ marginTop: 6 }}>{T('yourData')}</h3>
          {edit ? (
            <>
              <label>{T('name')}<input value={f.nama} maxLength={80} onChange={(e) => setF({ ...f, nama: e.target.value })} autoComplete="name" /></label>
              <label>{T('contact')}<input value={f.hp} maxLength={100} inputMode="email" onChange={(e) => setF({ ...f, hp: e.target.value })} autoComplete="tel" /></label>
              <label>{T('org')}<input value={f.institusi} maxLength={100} onChange={(e) => setF({ ...f, institusi: e.target.value })} autoComplete="organization" /></label>
            </>
          ) : (
            <div className="jamdone">
              <b>{f.nama}</b><br />{f.hp} · {f.institusi}
              <div><button className="link" type="button" onClick={() => setEdit(true)}>{T('change')}</button></div>
            </div>
          )}
          {jams.length ? (
            <div className="jamgrp">
              <b>{T('jam')}</b>
              <span className="muted">{T('jamPick')}</span>
              <div className="jamopts">
                {jams.map((j) => (
                  <button key={j.k} type="button" className={'jamopt' + (f.jaminan === j.k ? ' on' : '')} onClick={() => setF({ ...f, jaminan: j.k })}>
                    <span className="jic">{j.ic}</span>{lang === 'en' ? j.en : j.id}
                  </button>
                ))}
              </div>
              <span className="muted fine">{T('jamNote')}</span>
            </div>
          ) : null}

          {err ? <div className="err">{err}</div> : null}
          {errs.map((e, i) => <div key={i} className="err">{e}</div>)}
          <button className="btn primary big-cta" disabled={busy || !cart.length} onClick={kirim}>{busy ? T('busy') : T('borrow', { n: cart.length })}</button>
        </div>
      ) : null}

      {bantuan}

      {scan ? (
        <Modal onClose={() => setScan(false)}>
          <h2>{T('scan')}</h2>
          <Scanner onCode={onCode} hint={T('scanning')} />
          {scanMsg ? <div className="jamdone" style={{ textAlign: 'center', fontWeight: 800 }}>{scanMsg}</div> : null}
          {cart.length ? <div className="chips">{cart.map((u) => <span key={u} className="chip">{u}</span>)}</div> : null}
          <button className="btn primary" onClick={() => setScan(false)}>{T('scanDone')} ({cart.length})</button>
        </Modal>
      ) : null}

      {panduan ? (
        <Modal onClose={() => setPanduan(false)}>
          <h2>{loans.length ? T('saved') : T('guideTitle')}</h2>
          <ol className="steps">
            <li><b>{T('g1')}</b></li>
            <li><b>{T('g2')}</b></li>
            <li><b>{T('g3')}</b></li>
            <li><b>{T('g4')}</b></li>
          </ol>
          {chs.length ? (
            <div className="chlist">
              <em>{T('channels')}</em>
              {chs.map((c, i) => <div key={i} className="chrow"><b>{c.no}</b><span>{c.nama}</span></div>)}
            </div>
          ) : null}
          <button className="btn primary" onClick={() => setPanduan(false)}>{T('close')}</button>
        </Modal>
      ) : null}
    </div>
  );
}
