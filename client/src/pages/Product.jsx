import { useEffect, useMemo, useState } from 'react';
import { FiCheck, FiPackage, FiRefreshCw, FiTruck } from 'react-icons/fi';
import { FavoriteButton, Price, ProductImage, ProductRail } from '../components/product.jsx';
import { Breadcrumbs, Button, Container, EmptyState, PageLoader, QuantityStepper, cx } from '../components/ui.jsx';
import { useCart } from '../context/cart.jsx';
import { useSettings } from '../context/settings.jsx';
import { useToast } from '../context/toast.jsx';
import { api } from '../lib/api.js';
import { brl, date, installments, maskCep } from '../lib/format.js';
import { useDocumentTitle, useFetch } from '../lib/hooks.js';

function Gallery({ images, name }) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [images]);
  if (!images.length) return <ProductImage alt={name} className="aspect-[4/5] rounded-lg" />;
  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row">
      <div className="scrollbar-none flex gap-2 overflow-x-auto lg:w-20 lg:flex-col lg:overflow-visible" role="tablist" aria-label="Fotos do produto">
        {images.map((img, i) => (
          <button
            key={img.id ?? i}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Foto ${i + 1}`}
            onClick={() => setActive(i)}
            className={cx('w-16 shrink-0 overflow-hidden rounded-md border-2 lg:w-full', i === active ? 'border-ink' : 'border-transparent opacity-75 hover:opacity-100')}
          >
            <ProductImage src={img.url} alt="" className="aspect-[4/5]" />
          </button>
        ))}
      </div>
      <div className="flex-1">
        <ProductImage src={images[active].url} alt={images[active].alt} className="aspect-[4/5] rounded-lg" loading="eager" />
      </div>
    </div>
  );
}

function ShippingCalculator({ variantId, quantity }) {
  const cart = useCart();
  const [cep, setCep] = useState(cart.cep ? maskCep(cart.cep) : '');
  const [state, setState] = useState({ loading: false, options: null, error: '' });

  const calc = async (e) => {
    e.preventDefault();
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return setState({ loading: false, options: null, error: 'Digite um CEP com 8 números.' });
    if (!variantId) return setState({ loading: false, options: null, error: 'Escolha cor e tamanho para calcular.' });
    setState({ loading: true, options: null, error: '' });
    try {
      const q = await api.post('/cart/quote', { items: [{ variantId, quantity }], cep: digits });
      cart.setCep(digits);
      setState({ loading: false, options: q.shippingOptions, error: q.shippingOptions.length ? '' : 'Não encontramos opções para esse CEP.' });
    } catch (err) {
      setState({ loading: false, options: null, error: err.message });
    }
  };

  return (
    <div className="rounded-lg border border-line p-4">
      <form onSubmit={calc} className="flex items-end gap-2">
        <label className="flex-1 text-sm font-medium">
          Calcular frete e prazo
          <input
            value={cep}
            onChange={(e) => setCep(maskCep(e.target.value))}
            inputMode="numeric"
            placeholder="00000-000"
            autoComplete="postal-code"
            className="mt-1.5 h-10 w-full rounded-md border border-line px-3 font-normal focus:border-brand focus:outline-none"
          />
        </label>
        <Button type="submit" variant="secondary" size="sm" className="h-10" loading={state.loading}>
          Calcular
        </Button>
      </form>
      <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-[13px] text-muted underline underline-offset-2">
        Não sei meu CEP
      </a>
      {state.error && <p className="mt-2 text-sm text-sale">{state.error}</p>}
      {state.options && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {state.options.map((o) => (
            <li key={o.id} className="flex justify-between py-2">
              <span>
                <b>{o.label}</b> <span className="text-muted">· {o.days}</span>
              </span>
              <span className={cx('font-semibold', o.priceCents === 0 && 'text-ok')}>{o.priceCents === 0 ? 'Grátis' : brl(o.priceCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Product({ slug }) {
  const { store, shipping } = useSettings();
  const { data, loading, error } = useFetch(`/products/${slug}`);
  const cart = useCart();
  const toast = useToast();
  const [color, setColor] = useState(null);
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [showError, setShowError] = useState(false);

  const p = data?.product;
  useDocumentTitle(p?.name, store.name);

  useEffect(() => {
    if (!p) return;
    const firstInStock = p.variants.find((v) => v.stock > 0) || p.variants[0];
    setColor(firstInStock?.color || null);
    setSize(p.sizes.length === 1 ? p.sizes[0] : null);
    setQty(1);
    setShowError(false);
  }, [p]);

  const variant = useMemo(() => p?.variants.find((v) => v.color === color && v.size === size) || null, [p, color, size]);
  const stockFor = (s) => p.variants.find((v) => v.color === color && v.size === s)?.stock ?? 0;
  const images = useMemo(() => {
    if (!p) return [];
    // mostra primeiro as fotos da cor escolhida (quando o texto alternativo cita a cor)
    const match = p.images.filter((i) => color && i.alt.toLowerCase().includes(color.toLowerCase()));
    return match.length ? [...match, ...p.images.filter((i) => !match.includes(i))] : p.images;
  }, [p, color]);

  if (loading) return <PageLoader />;
  if (error || !p) {
    return (
      <Container>
        <EmptyState icon={FiPackage} title="Produto não encontrado" action={<Button to="/produtos">Ver todos os produtos</Button>}>
          Ele pode ter sido removido ou o endereço está incorreto.
        </EmptyState>
      </Container>
    );
  }

  const dept = p.categories.find((c) => c.kind === 'departamento');
  const type = p.categories.find((c) => c.kind === 'tipo');
  const maxQty = Math.min(10, variant?.stock || 1);
  const colorStock = p.variants.filter((v) => v.color === color).reduce((n, v) => n + v.stock, 0);

  const addToCart = () => {
    if (!variant) {
      setShowError(true);
      return;
    }
    cart.add({
      variantId: variant.id,
      productId: p.id,
      slug: p.slug,
      name: p.name,
      image: images[0]?.url || p.image,
      size: variant.size,
      color: variant.color,
      unitPriceCents: p.finalPriceCents,
    }, qty);
    toast(`${p.name} foi adicionado ao carrinho.`);
    cart.openDrawer();
  };

  return (
    <>
      <Container className="pt-6">
        <Breadcrumbs items={[{ to: '/', label: 'Início' }, dept && { to: `/categoria/${dept.slug}`, label: dept.name }, type && { to: `/categoria/${type.slug}`, label: type.name }, { label: p.name }].filter(Boolean)} />
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <Gallery images={images} name={p.name} />

          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-sm text-muted">{p.brand}</p>
            <h1 className="display-soft mt-1 text-3xl sm:text-4xl">{p.name}</h1>

            <div className="mt-5 space-y-1">
              <div className="flex items-center gap-3">
                <Price priceCents={p.priceCents} finalPriceCents={p.finalPriceCents} onSale={p.onSale} size="lg" />
                {p.onSale && <span className="rounded bg-sale px-2 py-0.5 text-sm font-bold text-white">−{p.discountPercent}%</span>}
              </div>
              {installments(p.finalPriceCents) && <p className="text-sm text-muted">{installments(p.finalPriceCents)}</p>}
              {p.saleEndsAt && <p className="text-sm font-medium text-sale">Preço promocional até {date(p.saleEndsAt)}</p>}
            </div>

            <div className="mt-8 space-y-6">
              <div>
                <p className="mb-2.5 text-sm">
                  Cor: <b>{color}</b>
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {p.colors.map((c) => {
                    const out = p.variants.filter((v) => v.color === c.name).every((v) => v.stock === 0);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          setColor(c.name);
                          setQty(1);
                          if (size && !p.variants.find((v) => v.color === c.name && v.size === size)?.stock) setSize(null);
                        }}
                        aria-pressed={color === c.name}
                        aria-label={`${c.name}${out ? ' (esgotada)' : ''}`}
                        title={c.name}
                        className={cx('relative size-10 rounded-full ring-1 ring-ink/15 ring-offset-2', color === c.name && 'ring-2 ring-ink', out && 'opacity-40')}
                        style={{ background: c.hex }}
                      >
                        {out && <span className="absolute left-1/2 top-1/2 h-[2px] w-[130%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-ink/60" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2.5 text-sm">
                  Tamanho: <b>{size || 'escolha'}</b>
                </p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tamanho">
                  {p.sizes.map((s) => {
                    const st = stockFor(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={size === s}
                        disabled={st === 0}
                        onClick={() => {
                          setSize(s);
                          setQty(1);
                          setShowError(false);
                        }}
                        className={cx(
                          'h-11 min-w-12 rounded-md border px-3 text-[15px] font-medium',
                          size === s ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink/60',
                          st === 0 && 'cursor-not-allowed text-muted/60 line-through hover:border-line',
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                {showError && !variant && <p className="mt-2 text-sm text-sale">Escolha um tamanho para continuar.</p>}
                <p className="mt-2.5 text-sm" aria-live="polite">
                  {variant ? (
                    variant.stock === 0 ? (
                      <span className="text-sale">Esgotado nesta combinação.</span>
                    ) : variant.stock <= 3 ? (
                      <span className="font-medium text-warn">Restam só {variant.stock} unidade{variant.stock > 1 ? 's' : ''}.</span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-ok">
                        <FiCheck /> Em estoque · {variant.stock} disponíveis
                      </span>
                    )
                  ) : colorStock === 0 ? (
                    <span className="text-sale">Esta cor está esgotada.</span>
                  ) : null}
                </p>
              </div>

              <div className="flex gap-3">
                <QuantityStepper value={qty} onChange={setQty} max={maxQty} />
                <Button size="lg" className="h-11 flex-1" onClick={addToCart} disabled={variant?.stock === 0 || p.totalStock === 0}>
                  {p.totalStock === 0 ? 'Produto esgotado' : 'Adicionar ao carrinho'}
                </Button>
              </div>
              <FavoriteButton productId={p.id} withLabel className="h-11 w-full rounded-md border border-line text-[15px] font-semibold hover:border-ink/40" />

              <ShippingCalculator variantId={variant?.id || p.variants.find((v) => v.stock > 0)?.id} quantity={qty} />

              <ul className="space-y-2.5 text-sm">
                <li className="flex gap-2.5">
                  <FiTruck className="mt-0.5 shrink-0 text-brand" />
                  {shipping.freeShippingMinCents > 0 ? `Frete grátis na entrega econômica para compras acima de ${brl(shipping.freeShippingMinCents)}.` : 'Enviamos para todo o Brasil.'}
                </li>
                <li className="flex gap-2.5">
                  <FiRefreshCw className="mt-0.5 shrink-0 text-brand" />
                  Trocas em até 30 dias após o recebimento.
                </li>
              </ul>
            </div>

            <section className="mt-10 border-t border-line pt-8">
              <h2 className="mb-3 text-lg font-bold">Descrição</h2>
              <div className="max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{p.description}</div>
            </section>
          </div>
        </div>
      </Container>
      <Container>
        <ProductRail title="Você também pode gostar" products={data.related} to={type ? `/categoria/${type.slug}` : undefined} />
      </Container>
    </>
  );
}
