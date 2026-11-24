import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useRouter } from '../lib/router.jsx';
import { useAuth } from './auth.jsx';
import { useToast } from './toast.jsx';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const { navigate, pathname, search } = useRouter();
  const toast = useToast();
  const [ids, setIds] = useState(() => new Set());

  useEffect(() => {
    if (!user) {
      setIds(new Set());
      return;
    }
    api
      .get('/account/favorites')
      .then((r) => setIds(new Set(r.ids)))
      .catch(() => {});
  }, [user]);

  const toggle = useCallback(
    async (productId) => {
      if (!user) {
        toast('Entre na sua conta para salvar favoritos.');
        navigate(`/entrar?voltar=${encodeURIComponent(pathname + search)}`);
        return;
      }
      const has = ids.has(productId);
      setIds((s) => {
        const n = new Set(s);
        if (has) n.delete(productId);
        else n.add(productId);
        return n;
      });
      try {
        if (has) await api.del(`/account/favorites/${productId}`);
        else await api.post('/account/favorites', { productId });
        toast(has ? 'Removido dos favoritos.' : 'Salvo nos favoritos.');
      } catch (err) {
        setIds((s) => {
          const n = new Set(s);
          if (has) n.add(productId);
          else n.delete(productId);
          return n;
        });
        toast(err.message, { tone: 'error' });
      }
    },
    [user, ids, navigate, pathname, search, toast],
  );

  const value = useMemo(() => ({ ids, has: (id) => ids.has(id), toggle, count: ids.size }), [ids, toggle]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export const useFavorites = () => useContext(FavoritesContext);
