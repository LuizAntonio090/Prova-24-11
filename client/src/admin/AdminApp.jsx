import { useState } from 'react';
import {
  FiBarChart2, FiBox, FiExternalLink, FiGrid, FiLayers, FiLogOut, FiMail, FiMenu, FiPercent, FiSettings, FiShoppingCart, FiTag, FiUsers, FiX,
} from 'react-icons/fi';
import { Logo } from '../components/layout.jsx';
import { Container, cx } from '../components/ui.jsx';
import { useAuth } from '../context/auth.jsx';
import { useSettings } from '../context/settings.jsx';
import { useDocumentTitle } from '../lib/hooks.js';
import { Link, NavLink, matchRoute, useNavigate, useRouter } from '../lib/router.jsx';
import { Categories, ProductForm, Products, Promotions, Stock } from './catalog.jsx';
import { Coupons, Customers, Dashboard, Newsletter, OrderDetail, Orders, Reports } from './sales.jsx';
import SettingsPage from './Settings.jsx';

const NAV = [
  ['/admin', 'Visão geral', FiGrid, true],
  ['/admin/pedidos', 'Pedidos', FiShoppingCart],
  ['/admin/produtos', 'Produtos', FiBox],
  ['/admin/estoque', 'Estoque', FiLayers],
  ['/admin/categorias', 'Categorias', FiTag],
  ['/admin/promocoes', 'Promoções', FiPercent],
  ['/admin/cupons', 'Cupons', FiPercent],
  ['/admin/clientes', 'Clientes', FiUsers],
  ['/admin/relatorios', 'Relatórios', FiBarChart2],
  ['/admin/newsletter', 'Newsletter', FiMail],
  ['/admin/configuracoes', 'Configurações', FiSettings],
];

const ROUTES = [
  ['/admin', () => <Dashboard />, 'Visão geral'],
  ['/admin/pedidos', () => <Orders />, 'Pedidos'],
  ['/admin/pedidos/:id', ({ id }) => <OrderDetail key={id} id={id} />, 'Pedido'],
  ['/admin/produtos', () => <Products />, 'Produtos'],
  ['/admin/produtos/novo', () => <ProductForm key="novo" />, 'Novo produto'],
  ['/admin/produtos/:id', ({ id }) => <ProductForm key={id} id={id} />, 'Editar produto'],
  ['/admin/estoque', () => <Stock />, 'Estoque'],
  ['/admin/categorias', () => <Categories />, 'Categorias'],
  ['/admin/promocoes', () => <Promotions />, 'Promoções'],
  ['/admin/cupons', () => <Coupons />, 'Cupons'],
  ['/admin/clientes', () => <Customers />, 'Clientes'],
  ['/admin/relatorios', () => <Reports />, 'Relatórios'],
  ['/admin/newsletter', () => <Newsletter />, 'Newsletter'],
  ['/admin/configuracoes', () => <SettingsPage />, 'Configurações'],
];

function Sidebar({ onNavigate }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 px-5">
        <Link to="/admin" onClick={onNavigate}>
          <Logo className="!text-[22px]" />
        </Link>
        <span className="rounded bg-cloth px-1.5 py-0.5 text-[11px] font-semibold text-muted">Painel</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Painel">
        {NAV.map(([to, label, Icon, exact]) => (
          <NavLink
            key={to}
            to={to}
            exact={exact}
            onClick={onNavigate}
            className={({ active }) => cx('flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium', active ? 'bg-brand text-brand-ink' : 'text-ink/80 hover:bg-cloth')}
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-line p-3">
        <Link to="/" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium hover:bg-cloth">
          <FiExternalLink className="size-[18px]" /> Ver loja
        </Link>
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/', { replace: true });
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[15px] font-medium text-sale hover:bg-sale/5"
        >
          <FiLogOut className="size-[18px]" /> Sair
        </button>
        <p className="truncate px-3 pt-1 text-[12px] text-muted">{user.email}</p>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const { pathname } = useRouter();
  const { store } = useSettings();
  const [open, setOpen] = useState(false);

  let page = <p className="text-muted">Página não encontrada.</p>;
  let title = 'Painel';
  for (const [pattern, render, t] of ROUTES) {
    const params = matchRoute(pattern, pathname);
    if (params) {
      page = render(params);
      title = t;
      break;
    }
  }
  useDocumentTitle(`${title} · Painel`, store.name);

  return (
    <div className="min-h-screen bg-cloth/60 lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-paper lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <div className="animate-drawer-left absolute inset-y-0 left-0 w-72 bg-paper">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 p-2" aria-label="Fechar menu">
              <FiX className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-paper px-4 lg:hidden">
          <button type="button" onClick={() => setOpen(true)} className="p-2" aria-label="Abrir menu">
            <FiMenu className="size-5" />
          </button>
          <Logo className="!text-[20px]" />
        </header>
        <main className="py-8">
          <Container className="lg:!px-10">{page}</Container>
        </main>
      </div>
    </div>
  );
}

/* ---------- peças compartilhadas do painel ---------- */

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display-soft text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }) {
  return (
    <section className={cx('rounded-lg border border-line bg-paper p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Table({ columns, rows, empty = 'Nenhum registro encontrado.', onRowClick }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-paper">
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <thead className="border-b border-line bg-cloth/70 text-[13px] text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx('px-4 py-3 font-semibold', c.align === 'right' && 'text-right')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={r.id ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx(onRowClick && 'cursor-pointer hover:bg-cloth/60')}>
                {columns.map((c) => (
                  <td key={c.key} className={cx('px-4 py-3 align-middle', c.align === 'right' && 'text-right tabular-nums')}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Kpi({ label, value, note }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 text-[26px] font-bold tabular-nums leading-tight">{value}</p>
      {note && <p className="mt-1 text-[13px] text-muted">{note}</p>}
    </div>
  );
}

/** Gráfico de barras simples em SVG (valores em centavos ou unidades). */
export function BarChart({ data, format = (v) => v, height = 200, label }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  const ticks = [0, 0.5, 1].map((t) => max * t);
  return (
    <figure>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between pb-6 text-right text-[11px] text-muted tabular-nums" style={{ height }}>
          {[...ticks].reverse().map((t) => (
            <span key={t}>{format(Math.round(t))}</span>
          ))}
        </div>
        <div className="relative flex-1">
          <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height: height - 24 }} role="img" aria-label={label}>
            {ticks.map((t) => (
              <line key={t} x1="0" x2="100" y1={(height - 24) * (1 - t / max)} y2={(height - 24) * (1 - t / max)} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {data.map((d, i) => {
              const h = ((height - 24) * d.value) / max;
              return (
                <rect key={d.label} x={i * w + w * 0.18} width={w * 0.64} y={height - 24 - h} height={Math.max(h, d.value ? 1 : 0)} rx="0.6" fill="var(--color-brand)">
                  <title>{`${d.label}: ${format(d.value)}`}</title>
                </rect>
              );
            })}
          </svg>
          <div className="flex text-[11px] text-muted">
            {data.map((d, i) => (
              <span key={d.label} className="truncate text-center" style={{ width: `${w}%` }}>
                {data.length <= 16 || i % Math.ceil(data.length / 12) === 0 ? d.short || d.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

export function FilterTabs({ value, onChange, options }) {
  return (
    <div className="scrollbar-none mb-4 flex gap-1 overflow-x-auto">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cx('shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium', value === v ? 'bg-ink text-white' : 'bg-paper text-ink/80 ring-1 ring-line hover:ring-ink/30')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-10 w-full max-w-xs rounded-md border border-line bg-paper px-3 text-[15px] focus:border-brand focus:outline-none"
    />
  );
}
