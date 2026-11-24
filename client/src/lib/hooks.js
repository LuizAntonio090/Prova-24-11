import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Busca dados da API com estado de carregamento/erro e recarga manual. */
export function useFetch(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get(path, { signal: ctrl.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ data: null, error, loading: false });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  return { ...state, reload, setData };
}

export function useDocumentTitle(title, storeName) {
  useEffect(() => {
    if (!storeName) return;
    document.title = title ? `${title} | ${storeName}` : storeName;
  }, [title, storeName]);
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Estado de formulário com erros por campo vindos da API. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const set = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const bind = (name, transform) => ({
    name,
    value: values[name] ?? '',
    error: errors[name],
    onChange: (e) => set(name, transform ? transform(e.target.value) : e.target.value),
  });

  const submit = (fn) => async (e) => {
    e?.preventDefault?.();
    setSubmitting(true);
    setFormError('');
    try {
      await fn(values);
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message || 'Não foi possível salvar.');
    } finally {
      setSubmitting(false);
    }
  };

  return { values, setValues, set, bind, errors, setErrors, submitting, submit, formError, setFormError };
}

export function useOnClickOutside(ref, handler, active = true) {
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    if (!active) return undefined;
    const fn = (e) => {
      if (ref.current && !ref.current.contains(e.target)) saved.current(e);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [ref, active]);
}

/** Trava a rolagem da página enquanto um painel lateral/modal está aberto. */
export function useLockBody(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && document.dispatchEvent(new CustomEvent('app:escape'));
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [locked]);
}
