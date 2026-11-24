import { createContext, useCallback, useContext, useState } from 'react';
import { FiAlertCircle, FiCheck, FiX } from 'react-icons/fi';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message, { tone = 'ok', duration = 3500 } = {}) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t.slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast pointer-events-auto flex max-w-md items-center gap-3 rounded-md px-4 py-3 text-sm shadow-lg ${
              t.tone === 'error' ? 'bg-sale text-white' : 'bg-ink text-white'
            }`}
          >
            {t.tone === 'error' ? <FiAlertCircle className="shrink-0" /> : <FiCheck className="shrink-0 text-accent" />}
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} className="ml-1 opacity-70 hover:opacity-100" aria-label="Fechar aviso">
              <FiX />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
