import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const DEFAULTS = {
  store: {
    name: 'Loja',
    tagline: '',
    logoUrl: '',
    colors: { primary: '#1F2A5C', accent: '#D9A441', sale: '#B3261E' },
    contact: {},
    social: {},
  },
  banners: [],
  shipping: { freeShippingMinCents: 0 },
};

const SettingsContext = createContext({ ...DEFAULTS, reload: () => {} });

function readableInk(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? '#23252B' : '#FFFFFF';
}

export function applyTheme(colors) {
  const root = document.documentElement.style;
  root.setProperty('--brand', colors.primary);
  root.setProperty('--brand-ink', readableInk(colors.primary));
  root.setProperty('--accent', colors.accent);
  root.setProperty('--accent-ink', readableInk(colors.accent));
  root.setProperty('--sale', colors.sale);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.primary);
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.get('/settings');
      setSettings(s);
      applyTheme(s.store.colors);
      document.title = s.store.name;
    } catch {
      applyTheme(DEFAULTS.store.colors);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return <SettingsContext.Provider value={{ ...settings, ready, reload: load }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
