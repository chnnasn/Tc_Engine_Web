import React, { useMemo } from 'react';
import RuntimeCanvas from './RuntimeCanvas';

export default function RuntimeApp() {
  const project = useMemo(() => { const id = new URLSearchParams(location.search).get('project'); return window.TomCatStore?.get?.(id || '') || (id ? { id, name: id } : undefined); }, []);
  return <div style={{ width: '100vw', height: '100vh', margin: 0, overflow: 'hidden', background: '#202020' }}><RuntimeCanvas project={project} /></div>;
}

