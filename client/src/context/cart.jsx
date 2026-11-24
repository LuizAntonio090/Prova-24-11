import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Carrinho salvo no navegador (localStorage), para continuar após recarregar a página.
 * Preços, estoque, cupom e frete são sempre recalculados pelo servidor em /cart/quote.
 */
const KEY = 'loja_cart_v1';
const CartContext = createContext(null);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      items: Array.isArray(saved.items) ? saved.items : [],
      couponCode: saved.couponCode || '',
      cep: saved.cep || '',
      shippingMethod: saved.shippingMethod || 'economica',
    };
  } catch {
    return { items: [], couponCode: '', cep: '', shippingMethod: 'economica' };
  }
}

export function CartProvider({ children }) {
  const [state, setState] = useState(load);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* armazenamento indisponível (modo privado) */
    }
  }, [state]);

  // sincroniza entre abas abertas
  useEffect(() => {
    const onStorage = (e) => e.key === KEY && setState(load());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const requestQuote = useCallback(async (s) => {
    const id = ++reqId.current;
    if (!s.items.length) {
      setQuote(null);
      return null;
    }
    setQuoting(true);
    try {
      const q = await api.post('/cart/quote', {
        items: s.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        couponCode: s.couponCode || null,
        cep: s.cep || null,
        shippingMethod: s.shippingMethod,
      });
      if (id === reqId.current) setQuote(q);
      return q;
    } catch {
      return null;
    } finally {
      if (id === reqId.current) setQuoting(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => requestQuote(state), 200);
    return () => clearTimeout(t);
  }, [state, requestQuote]);

  const add = useCallback((item, quantity = 1) => {
    setState((s) => {
      const existing = s.items.find((i) => i.variantId === item.variantId);
      const items = existing
        ? s.items.map((i) => (i.variantId === item.variantId ? { ...i, quantity: Math.min(10, i.quantity + quantity) } : i))
        : [...s.items, { ...item, quantity: Math.min(10, quantity) }];
      return { ...s, items };
    });
  }, []);

  const setQuantity = useCallback((variantId, quantity) => {
    setState((s) => ({
      ...s,
      items: s.items.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.max(1, Math.min(10, quantity)) } : i)),
    }));
  }, []);

  const remove = useCallback((variantId) => setState((s) => ({ ...s, items: s.items.filter((i) => i.variantId !== variantId) })), []);
  const clear = useCallback(() => setState((s) => ({ ...s, items: [], couponCode: '' })), []);
  const setField = useCallback((field, value) => setState((s) => ({ ...s, [field]: value })), []);

  /** Ajusta o carrinho ao estoque informado pelo servidor. */
  const applyIssues = useCallback((issues) => {
    setState((s) => ({
      ...s,
      items: s.items
        .map((i) => {
          const issue = issues.find((x) => x.variantId === i.variantId);
          if (!issue) return i;
          if (issue.type === 'insufficient_stock') return { ...i, quantity: issue.available };
          return null;
        })
        .filter(Boolean),
    }));
  }, []);

  const count = state.items.reduce((n, i) => n + i.quantity, 0);

  const value = useMemo(
    () => ({
      ...state,
      count,
      quote,
      quoting,
      add,
      setQuantity,
      remove,
      clear,
      applyIssues,
      setCouponCode: (v) => setField('couponCode', v),
      setCep: (v) => setField('cep', v),
      setShippingMethod: (v) => setField('shippingMethod', v),
      refreshQuote: () => requestQuote(state),
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    }),
    [state, count, quote, quoting, add, setQuantity, remove, clear, applyIssues, setField, requestQuote, drawerOpen],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
