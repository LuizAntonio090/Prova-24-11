import { useEffect, useId, useRef } from 'react';
import { FiAlertCircle, FiX } from 'react-icons/fi';
import { useLockBody } from '../lib/hooks.js';
import { Link } from '../lib/router.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

const BTN = {
  primary: 'bg-brand text-brand-ink hover:brightness-110',
  accent: 'bg-accent text-accent-ink hover:brightness-105',
  secondary: 'border border-ink/20 bg-paper text-ink hover:border-ink/50',
  ghost: 'text-ink hover:bg-cloth',
  danger: 'bg-sale text-white hover:brightness-110',
  link: 'text-brand underline underline-offset-4 hover:no-underline px-0 py-0 h-auto',
};
const SIZES = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-5 text-[15px]', lg: 'h-13 px-7 text-base' };

export function Button({ variant = 'primary', size = 'md', loading, className, children, to, ...rest }) {
  const classes = cx(
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-[filter,background-color,border-color] duration-150 disabled:cursor-not-allowed disabled:opacity-50',
    variant !== 'link' && SIZES[size],
    BTN[variant],
    className,
  );
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'size-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader({ label = 'Carregando…' }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-muted" role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function Field({ label, error, hint, children, id, className, optional }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
          {optional && <span className="font-normal text-muted"> (opcional)</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1 text-[13px] text-sale">
          <FiAlertCircle className="shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const INPUT = 'block w-full rounded-md border bg-paper px-3 text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:bg-cloth';

export function Input({ label, error, hint, className, optional, inputClassName, ...rest }) {
  const autoId = useId();
  const id = rest.id || autoId;
  return (
    <Field label={label} error={error} hint={hint} id={id} className={className} optional={optional}>
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cx(INPUT, 'h-11', error ? 'border-sale' : 'border-line focus:border-brand', inputClassName)}
        {...rest}
      />
    </Field>
  );
}

export function Textarea({ label, error, hint, className, optional, ...rest }) {
  const autoId = useId();
  const id = rest.id || autoId;
  return (
    <Field label={label} error={error} hint={hint} id={id} className={className} optional={optional}>
      <textarea id={id} aria-invalid={error ? 'true' : undefined} className={cx(INPUT, 'min-h-28 py-2.5', error ? 'border-sale' : 'border-line focus:border-brand')} {...rest} />
    </Field>
  );
}

export function Select({ label, error, hint, className, children, optional, selectClassName, ...rest }) {
  const autoId = useId();
  const id = rest.id || autoId;
  return (
    <Field label={label} error={error} hint={hint} id={id} className={className} optional={optional}>
      <select id={id} aria-invalid={error ? 'true' : undefined} className={cx(INPUT, 'h-11 pr-8', error ? 'border-sale' : 'border-line focus:border-brand', selectClassName)} {...rest}>
        {children}
      </select>
    </Field>
  );
}

export function Checkbox({ label, className, ...rest }) {
  return (
    <label className={cx('flex cursor-pointer items-center gap-2.5 text-[15px]', className)}>
      <input type="checkbox" className="size-4 rounded border-line accent-[var(--color-brand)]" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function Alert({ tone = 'error', children, className }) {
  const tones = {
    error: 'border-sale/30 bg-sale/5 text-sale',
    warn: 'border-warn/30 bg-warn/5 text-warn',
    ok: 'border-ok/30 bg-ok/5 text-ok',
    info: 'border-brand/20 bg-brand/5 text-brand',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-md border px-4 py-3 text-sm', tones[tone], className)}>
      {children}
    </div>
  );
}

const BADGE = {
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  brand: 'bg-brand/10 text-brand',
  muted: 'bg-cloth text-muted',
  sale: 'bg-sale text-white',
};
export function Badge({ tone = 'muted', children, className }) {
  return <span className={cx('inline-flex items-center rounded px-2 py-0.5 text-[13px] font-semibold', BADGE[tone], className)}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {Icon && <Icon className="mb-4 size-10 text-muted/60" aria-hidden="true" />}
      <h2 className="display-soft text-xl">{title}</h2>
      {children && <p className="mt-2 max-w-md text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Container({ className, children }) {
  return <div className={cx('mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-10', className)}>{children}</div>;
}

export function Modal({ open, onClose, title, children, size = 'md', footer }) {
  const ref = useRef(null);
  useLockBody(open);
  useEffect(() => {
    if (!open) return undefined;
    const onEsc = () => onClose();
    document.addEventListener('app:escape', onEsc);
    ref.current?.focus();
    return () => document.removeEventListener('app:escape', onEsc);
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Fechar" className="animate-fade absolute inset-0 bg-ink/50" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('animate-toast relative flex max-h-[92vh] w-full flex-col rounded-t-xl bg-paper shadow-2xl outline-none sm:rounded-xl', widths[size])}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1.5 hover:bg-cloth" aria-label="Fechar">
            <FiX className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirmar', tone = 'danger', loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[15px] text-muted">{children}</div>
    </Modal>
  );
}

export function QuantityStepper({ value, onChange, max = 10, min = 1, size = 'md', label = 'Quantidade' }) {
  const h = size === 'sm' ? 'h-9' : 'h-11';
  return (
    <div className={cx('inline-flex items-center rounded-md border border-line', h)} role="group" aria-label={label}>
      <button type="button" className="h-full w-9 text-lg disabled:opacity-30" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Diminuir">
        −
      </button>
      <span className="w-8 text-center tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className="h-full w-9 text-lg disabled:opacity-30" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Aumentar">
        +
      </button>
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <nav className="mt-10 flex items-center justify-center gap-1" aria-label="Paginação">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      {nums.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-current={n === page ? 'page' : undefined}
          className={cx('size-9 rounded-md text-sm font-semibold', n === page ? 'bg-ink text-white' : 'hover:bg-cloth')}
        >
          {n}
        </button>
      ))}
      <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Próxima
      </Button>
    </nav>
  );
}

export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Você está em" className="text-[13px] text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {it.to ? (
              <Link to={it.to} className="hover:text-ink">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
