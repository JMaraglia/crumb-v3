// file: src/useCloudRefresh.js
// Sync (test copies for now): when changes from your other device arrive, a screen re-reads its saved
// data in place: no redraw from scratch, so an open panel or what you're typing stays put.
// (Screens that keep their own copy of saved data MUST use this, or their next save would use the old copy.)
import { useEffect, useRef } from 'react';

export function useCloudRefresh(onArrived) {
  const fn = useRef(onArrived);
  fn.current = onArrived;
  useEffect(() => {
    const handle = (e) => fn.current((e && e.detail && e.detail.keys) || []);
    window.addEventListener('crumb-pulled', handle);
    return () => window.removeEventListener('crumb-pulled', handle);
  }, []);
}
