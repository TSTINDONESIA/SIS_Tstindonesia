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
  return h.startsWith('#/usher') ? <Usher /> : <Guest />;
}
createRoot(document.getElementById('root')).render(<Root />);
