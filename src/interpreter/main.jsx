import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Guest from './Guest.jsx';
import Usher from './Usher.jsx';
import './interpreter.css';

function Root() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  if (h.startsWith('#/usher') || h.startsWith('#/admin')) return <Usher hash={h} />;
  const m = h.match(/^#\/r\/([a-z0-9-]{1,30})/);
  const rid = m ? m[1] : '';          // kosong = acara utama (alamat lama)
  return <Guest key={rid || '_'} rid={rid} />;
}
createRoot(document.getElementById('root')).render(<Root />);
