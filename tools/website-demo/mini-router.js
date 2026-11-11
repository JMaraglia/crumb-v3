// tools/website-demo/mini-router.js — a tiny stand-in for react-router-dom, used ONLY to take website
// screenshots of the real app without installing packages. Not part of the app build.
import React, { createContext, useContext, useEffect, useState } from 'react';

const Ctx = createContext({ path: '/', state: null, params: {} });
const listeners = new Set();
let current = { path: window.location.pathname + window.location.search, state: null };
const emit = () => listeners.forEach((f) => f({ ...current }));

export function BrowserRouter({ children }) {
  const [loc, setLoc] = useState(current);
  useEffect(() => {
    listeners.add(setLoc);
    const onPop = () => { current = { path: window.location.pathname + window.location.search, state: null }; emit(); };
    window.addEventListener('popstate', onPop);
    return () => { listeners.delete(setLoc); window.removeEventListener('popstate', onPop); };
  }, []);
  return React.createElement(Ctx.Provider, { value: { ...loc, params: {} } }, children);
}

function match(pattern, path) {
  const p = path.split('?')[0];
  const a = pattern.split('/').filter(Boolean);
  const b = p.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function Routes({ children }) {
  const loc = useContext(Ctx);
  let found = null;
  React.Children.forEach(children, (ch) => {
    if (found || !ch || !ch.props) return;
    const params = ch.props.path === '*' ? {} : match(ch.props.path, loc.path);
    if (params) found = React.createElement(Ctx.Provider, { value: { ...loc, params } }, ch.props.element);
  });
  return found;
}
export function Route() { return null; }

export function useNavigate() {
  return (to, opts = {}) => {
    if (typeof to === 'number') { window.history.go(to); return; }
    current = { path: to, state: opts.state || null };
    if (opts.replace) window.history.replaceState({}, '', to); else window.history.pushState({}, '', to);
    emit();
  };
}
export function useLocation() {
  const loc = useContext(Ctx);
  const [pathname, search = ''] = loc.path.split('?');
  return { pathname, search: search ? '?' + search : '', state: loc.state, hash: '' };
}
export function useParams() { return useContext(Ctx).params; }
export function useSearchParams() {
  const loc = useLocation();
  return [new URLSearchParams(loc.search), () => {}];
}
export function Navigate({ to, replace }) {
  const nav = useNavigate();
  useEffect(() => { nav(to, { replace }); }, [to]); // eslint-disable-line
  return null;
}
export function Link({ to, children, ...rest }) {
  const nav = useNavigate();
  return React.createElement('a', { href: to, onClick: (e) => { e.preventDefault(); nav(to); }, ...rest }, children);
}
