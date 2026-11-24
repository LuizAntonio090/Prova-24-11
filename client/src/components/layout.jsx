import { useEffect, useRef, useState } from 'react';
import { FiFacebook, FiHeart, FiInstagram, FiMenu, FiSearch, FiShoppingBag, FiTrash2, FiUser, FiX, FiYoutube } from 'react-icons/fi';
import { SiTiktok } from 'react-icons/si';
import { useAuth } from '../context/auth.jsx';
import { useCart } from '../context/cart.jsx';
import { useFavorites } from '../context/favorites.jsx';
import { useSettings } from '../context/settings.jsx';
import { api } from '../lib/api.js';
import { brl } from '../lib/format.js';
import { useDebounced, useFetch, useLockBody, useOnClickOutside } from '../lib/hooks.js';
import { Link, NavLink, useNavigate, useRouter } from '../lib/router.jsx';
import { ProductImage } from './product.jsx';
import { Button, Container, QuantityStepper, cx } from './ui.jsx';

export function Logo({ className, light }) {
  const { store } = useSettings();
  if (store.logoUrl) {
    return <img src={store.logoUrl} alt={store.name} className={cx('h-8 w-auto max-w-[180px] object-contain', className)} />;
  }
  return <span className={cx('display text-[26px] uppercase leading-none tracking-[0.04em]', light ? 'text-white' : 'text-brand', className)}>{store.name}</span>;
}

function useMenu() {
  const { data } = useFetch('/categories');
  const cats = data?.categories || [];
  return [
    ...cats.filter((c) => c.kind === 'departamento'),
    ...cats.filter((c) => c.kind === 'tipo'),
    { slug: 'promocoes', name: 'Promoções', sale: true },
  ].map((c) => ({ to: `/categoria/${c.slug}`, label: c.name, sale: c.sale }));
}

function SearchBox({ autoFocus, onDone, className }) {
  const navigate = useNavigate();
  const { search, pathname } = useRouter();
  const [q, setQ] = useState(() => (pathname === '/busca' ? new URLSearchParams(search).get('q') || '' : ''));
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const debounced = useDebounced(q, 250);
  const box = useRef(null);
  useOnClickOutside(box, () => setOpen(false), open);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const ctrl = new AbortController();
    api
      .get(`/products?q=${encodeURIComponent(debounced.trim())}&limite=5`, { signal: ctrl.signal })
      .then((r) => setSuggestions(r.items))
      .catch(() => {});
    return () => ctrl.abort();
  }, [debounced]);

  const go = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setOpen(false);
    navigate(`/busca?q=${encodeURIComponent(q.trim())}`);
    onDone?.();
  };

  return (
    <div ref={box} className={cx('relative', className)}>
      <form role="search" onSubmit={go} className="relative">
        <label htmlFor="busca" className="sr-only">
          Buscar produtos
        </label>
        <input
          id="busca"
          type="search"
          value={q}
          autoFocus={autoFocus}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder="Buscar camiseta, jeans, tênis…"
          className="h-11 w-full rounded-full border border-line bg-cloth pl-11 pr-4 text-[15px] placeholder:text-muted focus:border-brand focus:bg-paper focus:outline-none"
        />
        <button type="submit" className="absolute left-1 top-1 flex size-9 items-center justify-center rounded-full text-muted" aria-label="Buscar">
          <FiSearch className="size-[18px]" />
        </button>
      </form>
      {open && suggestions.length > 0 && (
        <div className="animate-fade absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-line bg-paper shadow-xl">
          {suggestions.map((p) => (
            <Link
              key={p.id}
              to={`/produto/${p.slug}`}
              onClick={() => {
                setOpen(false);
                onDone?.();
              }}
              className="flex items-center gap-3 px-3 py-2 hover:bg-cloth"
            >
              <ProductImage src={p.image} alt="" className="size-12 shrink-0 rounded" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="text-[13px] text-muted">{brl(p.finalPriceCents)}</span>
              </span>
            </Link>
          ))}
          <button type="button" onClick={go} className="block w-full border-t border-line px-3 py-2.5 text-left text-sm font-semibold text-brand hover:bg-cloth">
            Ver todos os resultados para “{q.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { store, shipping } = useSettings();
  const { user, isAdmin } = useAuth();
  const cart = useCart();
  const fav = useFavorites();
  const menu = useMenu();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useRouter();

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  const iconBtn = 'relative flex size-11 items-center justify-center rounded-full text-ink hover:bg-cloth';

  return (
    <>
      {shipping.freeShippingMinCents > 0 && (
        <div className="bg-brand py-2 text-center text-[13px] text-brand-ink">
          Frete grátis para compras a partir de {brl(shipping.freeShippingMinCents)} na entrega econômica
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
        <Container>
          <div className="flex h-16 items-center gap-3 lg:h-[72px] lg:gap-8">
            <button type="button" className={cx(iconBtn, 'lg:hidden')} onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
              <FiMenu className="size-[22px]" />
            </button>
            <Link to="/" className="shrink-0" aria-label={`${store.name}, página inicial`}>
              <Logo />
            </Link>
            <SearchBox className="hidden max-w-xl flex-1 lg:block" />
            <div className="ml-auto flex items-center gap-0.5">
              <button type="button" className={cx(iconBtn, 'lg:hidden')} onClick={() => setSearchOpen((v) => !v)} aria-label="Buscar" aria-expanded={searchOpen}>
                <FiSearch className="size-[21px]" />
              </button>
              {isAdmin && (
                <Link to="/admin" className="mr-2 hidden rounded-md border border-line px-3 py-1.5 text-sm font-semibold hover:border-ink/40 md:inline-block">
                  Painel
                </Link>
              )}
              <Link to={user ? '/conta' : '/entrar'} className={cx(iconBtn, 'gap-2 md:w-auto md:px-3')} aria-label={user ? 'Minha conta' : 'Entrar ou criar conta'}>
                <FiUser className="size-[21px]" />
                <span className="hidden text-sm font-medium md:inline">{user ? `Olá, ${user.name.split(' ')[0]}` : 'Entrar'}</span>
              </Link>
              <Link to="/favoritos" className={iconBtn} aria-label={`Favoritos${fav.count ? `, ${fav.count} itens` : ''}`}>
                <FiHeart className="size-[21px]" />
                {fav.count > 0 && <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-sale px-1 text-[11px] font-bold leading-4 text-white">{fav.count}</span>}
              </Link>
              <button type="button" onClick={cart.openDrawer} className={iconBtn} aria-label={`Carrinho, ${cart.count} itens`}>
                <FiShoppingBag className="size-[21px]" />
                {cart.count > 0 && <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold leading-4 text-brand-ink">{cart.count}</span>}
              </button>
            </div>
          </div>
          {searchOpen && <SearchBox autoFocus onDone={() => setSearchOpen(false)} className="pb-3 lg:hidden" />}
          <nav aria-label="Categorias" className="hidden lg:block">
            <ul className="-mb-px flex items-center gap-7">
              {menu.map((m) => (
                <li key={m.to}>
                  <NavLink
                    to={m.to}
                    className={({ active }) =>
                      cx('relative block py-3 text-[14px] font-medium transition-colors hover:text-brand', m.sale && 'text-sale', active && 'text-brand after:stitch after:absolute after:inset-x-0 after:bottom-0 after:h-[2px]')
                    }
                  >
                    {m.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </header>
      {mobileOpen && <MobileMenu menu={menu} onClose={() => setMobileOpen(false)} />}
      <CartDrawer />
    </>
  );
}

function MobileMenu({ menu, onClose }) {
  const { user, isAdmin } = useAuth();
  useLockBody(true);
  useEffect(() => {
    document.addEventListener('app:escape', onClose);
    return () => document.removeEventListener('app:escape', onClose);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] lg:hidden">
      <button type="button" className="animate-fade absolute inset-0 bg-ink/50" onClick={onClose} aria-label="Fechar menu" />
      <div className="animate-drawer-left absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-paper" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="flex h-16 items-center justify-between border-b border-line px-4">
          <Logo />
          <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-full hover:bg-cloth" aria-label="Fechar menu">
            <FiX className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Categorias">
          {menu.map((m) => (
            <Link key={m.to} to={m.to} className={cx('block rounded-md px-3 py-3 text-[17px] font-medium hover:bg-cloth', m.sale && 'text-sale')}>
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-1 border-t border-line p-3">
          <Link to={user ? '/conta' : '/entrar'} className="block rounded-md px-3 py-2.5 font-medium hover:bg-cloth">
            {user ? 'Minha conta' : 'Entrar ou criar conta'}
          </Link>
          <Link to="/favoritos" className="block rounded-md px-3 py-2.5 font-medium hover:bg-cloth">
            Favoritos
          </Link>
          {isAdmin && (
            <Link to="/admin" className="block rounded-md px-3 py-2.5 font-medium hover:bg-cloth">
              Painel administrativo
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function CartDrawer() {
  const cart = useCart();
  const navigate = useNavigate();
  useLockBody(cart.drawerOpen);
  useEffect(() => {
    if (!cart.drawerOpen) return undefined;
    document.addEventListener('app:escape', cart.closeDrawer);
    return () => document.removeEventListener('app:escape', cart.closeDrawer);
  }, [cart.drawerOpen, cart.closeDrawer]);
  if (!cart.drawerOpen) return null;

  const lines = new Map((cart.quote?.lines || []).map((l) => [l.variantId, l]));
  const subtotal = cart.quote?.subtotalCents ?? cart.items.reduce((n, i) => n + i.unitPriceCents * i.quantity, 0);
  const free = cart.quote?.freeShippingMinCents || 0;

  const go = (to) => {
    cart.closeDrawer();
    navigate(to);
  };

  return (
    <div className="fixed inset-0 z-[60]">
      <button type="button" className="animate-fade absolute inset-0 bg-ink/50" onClick={cart.closeDrawer} aria-label="Fechar carrinho" />
      <aside className="animate-drawer absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-paper shadow-2xl" role="dialog" aria-modal="true" aria-label="Carrinho">
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <h2 className="text-lg font-bold">Seu carrinho {cart.count > 0 && <span className="font-normal text-muted">({cart.count})</span>}</h2>
          <button type="button" onClick={cart.closeDrawer} className="flex size-10 items-center justify-center rounded-full hover:bg-cloth" aria-label="Fechar carrinho">
            <FiX className="size-5" />
          </button>
        </div>
        {cart.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <FiShoppingBag className="mb-4 size-10 text-muted/50" />
            <p className="font-semibold">Seu carrinho está vazio</p>
            <p className="mt-1 text-sm text-muted">Escolha uma peça e ela aparece aqui.</p>
            <Button className="mt-6" onClick={() => go('/categoria/lancamentos')}>
              Ver lançamentos
            </Button>
          </div>
        ) : (
          <>
            {free > 0 && (
              <div className="border-b border-line px-5 py-3 text-sm">
                {subtotal >= free ? (
                  <p className="font-medium text-ok">Você ganhou frete grátis na entrega econômica.</p>
                ) : (
                  <p>
                    Faltam <b>{brl(free - subtotal)}</b> para o frete grátis.
                  </p>
                )}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cloth">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.min(100, (subtotal / free) * 100)}%` }} />
                </div>
              </div>
            )}
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {cart.items.map((item) => {
                const line = lines.get(item.variantId);
                return (
                  <li key={item.variantId} className="flex gap-4 py-4">
                    <Link to={`/produto/${item.slug}`} onClick={cart.closeDrawer} className="shrink-0">
                      <ProductImage src={item.image} alt={item.name} className="h-24 w-20 rounded" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{item.name}</p>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {item.color} · Tam. {item.size}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <QuantityStepper size="sm" value={item.quantity} max={Math.min(10, line?.stock ?? 10)} onChange={(q) => cart.setQuantity(item.variantId, q)} />
                        <span className="text-sm font-semibold tabular-nums">{brl((line?.unitPriceCents ?? item.unitPriceCents) * item.quantity)}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => cart.remove(item.variantId)} className="self-start p-1 text-muted hover:text-sale" aria-label={`Remover ${item.name}`}>
                      <FiTrash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="space-y-3 border-t border-line px-5 py-5">
              <div className="flex justify-between text-[15px]">
                <span>Subtotal</span>
                <span className="font-bold tabular-nums">{brl(subtotal)}</span>
              </div>
              <p className="text-[13px] text-muted">Frete e cupom são calculados no carrinho.</p>
              <Button className="w-full" size="lg" onClick={() => go('/checkout')}>
                Finalizar compra
              </Button>
              <Button className="w-full" variant="secondary" onClick={() => go('/carrinho')}>
                Ver carrinho
              </Button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ status: 'idle', message: '' });
  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'loading', message: '' });
    try {
      await api.post('/newsletter', { email });
      setState({ status: 'ok', message: 'Pronto! Você vai receber nossas novidades.' });
      setEmail('');
    } catch (err) {
      setState({ status: 'error', message: err.fields?.email || err.message });
    }
  };
  return (
    <section className="border-t border-line bg-cloth" aria-labelledby="news-title">
      <Container className="grid gap-6 py-12 md:grid-cols-2 md:items-center">
        <div>
          <h2 id="news-title" className="display-soft text-2xl">
            Novidades no seu e-mail
          </h2>
          <p className="mt-2 max-w-md text-muted">Lançamentos, promoções e reposições de estoque. Sem excesso, só o que importa.</p>
        </div>
        <form onSubmit={submit} className="w-full">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="news-email" className="sr-only">
              Seu e-mail
            </label>
            <input
              id="news-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="h-12 flex-1 rounded-md border border-line bg-paper px-4 focus:border-brand focus:outline-none"
            />
            <Button type="submit" size="lg" loading={state.status === 'loading'}>
              Quero receber
            </Button>
          </div>
          {state.message && (
            <p className={cx('mt-2 text-sm', state.status === 'ok' ? 'text-ok' : 'text-sale')} role="status">
              {state.message}
            </p>
          )}
        </form>
      </Container>
    </section>
  );
}

export function Footer() {
  const { store } = useSettings();
  const menu = useMenu();
  const social = [
    ['instagram', FiInstagram, 'Instagram'],
    ['facebook', FiFacebook, 'Facebook'],
    ['tiktok', SiTiktok, 'TikTok'],
    ['youtube', FiYoutube, 'YouTube'],
  ].filter(([k]) => store.social?.[k]);
  const c = store.contact || {};
  return (
    <footer>
      <Newsletter />
      <div className="bg-brand text-brand-ink">
        <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo light className="!text-brand-ink" />
            {store.tagline && <p className="mt-4 max-w-xs text-[15px] opacity-80">{store.tagline}</p>}
            {social.length > 0 && (
              <div className="mt-6 flex gap-2">
                {social.map(([k, Icon, label]) => (
                  <a key={k} href={store.social[k]} target="_blank" rel="noreferrer noopener" className="flex size-10 items-center justify-center rounded-full border border-current/30 hover:bg-white/10" aria-label={label}>
                    <Icon className="size-[18px]" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <FooterCol title="Comprar" links={menu.slice(0, 7).map((m) => [m.to, m.label])} />
          <FooterCol
            title="Ajuda"
            links={[
              ['/conta/pedidos', 'Meus pedidos'],
              ['/institucional/trocas', 'Trocas e devoluções'],
              ['/institucional/entregas', 'Prazos de entrega'],
              ['/institucional/pagamentos', 'Formas de pagamento'],
              ['/institucional/perguntas', 'Perguntas frequentes'],
              ['/institucional/sobre', 'Sobre a loja'],
            ]}
          />
          <div>
            <h3 className="mb-4 font-bold">Atendimento</h3>
            <ul className="space-y-2 text-[15px] opacity-85">
              {c.phone && <li>{c.phone}</li>}
              {c.whatsapp && (
                <li>
                  <a className="underline underline-offset-4" href={`https://wa.me/55${c.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer noopener">
                    WhatsApp {c.whatsapp}
                  </a>
                </li>
              )}
              {c.email && (
                <li>
                  <a className="underline underline-offset-4" href={`mailto:${c.email}`}>
                    {c.email}
                  </a>
                </li>
              )}
              {c.hours && <li>{c.hours}</li>}
              {c.address && <li>{c.address}</li>}
            </ul>
          </div>
        </Container>
        <div className="border-t border-current/15">
          <Container className="flex flex-col gap-2 py-5 text-[13px] opacity-75 sm:flex-row sm:justify-between">
            <p>
              © {new Date().getFullYear()} {store.legalName || store.name}
              {store.cnpj && ` · CNPJ ${store.cnpj}`}
            </p>
            <p className="flex gap-4">
              <Link to="/institucional/privacidade" className="hover:underline">
                Privacidade
              </Link>
              <Link to="/institucional/termos" className="hover:underline">
                Termos de uso
              </Link>
              <span>Pagamentos: PIX, cartão e boleto</span>
            </p>
          </Container>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <h3 className="mb-4 font-bold">{title}</h3>
      <ul className="space-y-2 text-[15px] opacity-85">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="hover:underline hover:underline-offset-4">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
