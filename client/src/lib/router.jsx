import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Roteador leve baseado na History API (sem dependências).
 * Oferece Link, NavLink, useNavigate, useSearchParams e matchRoute.
 */
const RouterContext = createContext(null);

const current = () => ({ pathname: window.location.pathname, search: window.location.search });

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(current);

  useEffect(() => {
    const onPop = () => setLoc(current());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false, scroll = true } = {}) => {
    if (typeof to === 'number') return window.history.go(to);
    const url = new URL(to, window.location.origin);
    const href = url.pathname + url.search + url.hash;
    if (replace) window.history.replaceState(null, '', href);
    else window.history.pushState(null, '', href);
    setLoc({ pathname: url.pathname, search: url.search });
    if (scroll) window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useRouter = () => useContext(RouterContext);
export const useNavigate = () => useContext(RouterContext).navigate;

export function useSearchParams() {
  const { search, pathname, navigate } = useRouter();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const setParams = useCallback(
    (next, { replace = false, scroll = false } = {}) => {
      const p = next instanceof URLSearchParams ? next : new URLSearchParams(next);
      const s = p.toString();
      navigate(pathname + (s ? `?${s}` : ''), { replace, scroll });
    },
    [pathname, navigate],
  );
  return [params, setParams];
}

function isModified(e) {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

export function Link({ to, onClick, replace, children, ...rest }) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || isModified(e) || rest.target) return;
        e.preventDefault();
        navigate(to, { replace });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export function NavLink({ to, className, exact = false, children, ...rest }) {
  const { pathname, search } = useRouter();
  const target = new URL(to, window.location.origin);
  const samePath = exact ? pathname === target.pathname : pathname === target.pathname || pathname.startsWith(target.pathname + '/');
  const active = samePath && (!target.search || search === target.search);
  return (
    <Link to={to} aria-current={active ? 'page' : undefined} className={typeof className === 'function' ? className({ active }) : className} {...rest}>
      {children}
    </Link>
  );
}

export function Navigate({ to, replace = true }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [to, replace, navigate]);
  return null;
}

/** Compara um padrão ("/produto/:slug", "/conta/:aba?") com o caminho atual. */
export function matchRoute(pattern, pathname) {
  const keys = [];
  const src = pattern.replace(/\/:(\w+)(\?)?/g, (_, key, optional) => {
    keys.push(key);
    return optional ? '(?:/([^/]+))?' : '/([^/]+)';
  });
  const m = new RegExp(`^${src}/?$`).exec(pathname);
  if (!m) return null;
  return Object.fromEntries(keys.map((k, i) => [k, m[i + 1] ? decodeURIComponent(m[i + 1]) : undefined]));
}
