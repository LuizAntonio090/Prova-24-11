import { useEffect, useState } from 'react';
import { FiCreditCard, FiLock, FiRefreshCw, FiTruck } from 'react-icons/fi';
import { Garment } from '../components/Garment.jsx';
import { ProductImage, ProductRail } from '../components/product.jsx';
import { Button, Container, PageLoader, cx } from '../components/ui.jsx';
import { useSettings } from '../context/settings.jsx';
import { brl } from '../lib/format.js';
import { useDocumentTitle, useFetch } from '../lib/hooks.js';
import { Link } from '../lib/router.jsx';

const MOTIF_FILL = {
  jacket: '#86A2C8',
  pants: '#9DB2D3',
  tshirt: '#F2EEE6',
  shorts: '#CDB89A',
  sneaker: '#F5F5F3',
  cap: '#E4B95C',
  bag: '#ECE6DA',
};

function Hero({ banners }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  useEffect(() => {
    if (count < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setI((v) => (v + 1) % count), 7000);
    return () => clearInterval(t);
  }, [count, paused]);

  if (!count) return null;
  const b = banners[Math.min(i, count - 1)];

  return (
    <section aria-roledescription="carrossel" aria-label="Destaques da loja" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)}>
      <Container className="pt-4 sm:pt-6">
        <div className="stitch-frame relative overflow-hidden rounded-xl bg-brand text-brand-ink">
          <div className="grid min-h-[480px] md:grid-cols-[1.15fr_1fr] lg:min-h-[540px]">
            <div key={b.id} className="animate-hero relative z-10 flex flex-col justify-center gap-6 px-8 py-12 sm:px-12 lg:px-16">
              <h1 className="display max-w-[14ch] text-[clamp(2.5rem,6.2vw,5.4rem)] uppercase">{b.title}</h1>
              {b.subtitle && <p className="max-w-md text-lg opacity-85">{b.subtitle}</p>}
              <div className="flex flex-wrap gap-3">
                <Button to={b.ctaUrl} variant="accent" size="lg">
                  {b.ctaLabel}
                </Button>
              </div>
            </div>
            <div className="relative flex items-end justify-center md:items-center">
              {b.imageUrl ? (
                <img src={b.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <>
                  <div className="absolute -right-24 bottom-[-30%] size-[130%] rounded-full bg-white/[0.06] md:-right-10 md:bottom-auto md:size-[115%]" aria-hidden="true" />
                  <Garment key={b.id} shape={b.motif} fill={MOTIF_FILL[b.motif] || '#86A2C8'} className="animate-fade relative h-[300px] w-auto drop-shadow-[0_30px_40px_rgba(0,0,0,.25)] md:h-[440px]" />
                </>
              )}
            </div>
          </div>
          {count > 1 && (
            <div className="absolute bottom-6 left-8 z-20 flex gap-2 sm:left-12 lg:left-16">
              {banners.map((x, idx) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setI(idx)}
                  aria-label={`Mostrar destaque ${idx + 1} de ${count}: ${x.title}`}
                  aria-current={idx === i}
                  className={cx('h-1.5 rounded-full transition-all', idx === i ? 'w-10 bg-accent' : 'w-5 bg-white/40 hover:bg-white/70')}
                />
              ))}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

function Benefits() {
  const { shipping } = useSettings();
  const items = [
    [FiTruck, shipping.freeShippingMinCents ? `Frete grátis acima de ${brl(shipping.freeShippingMinCents)}` : 'Entrega para todo o Brasil', 'Na entrega econômica'],
    [FiRefreshCw, 'Trocas em até 30 dias', 'A primeira troca é por nossa conta'],
    [FiCreditCard, 'PIX, cartão ou boleto', 'Parcelamento no cartão'],
    [FiLock, 'Compra protegida', 'Pagamento processado pelo Mercado Pago'],
  ];
  return (
    <Container>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-line py-8 lg:grid-cols-4">
        {items.map(([Icon, title, text]) => (
          <li key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
            <div>
              <p className="text-[15px] font-semibold leading-snug">{title}</p>
              <p className="text-[13px] text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Container>
  );
}

function Categories({ categories }) {
  const depts = categories.filter((c) => c.kind === 'departamento');
  const types = categories.filter((c) => c.kind === 'tipo');
  return (
    <section className="py-12 sm:py-16" aria-labelledby="cat-title">
      <h2 id="cat-title" className="display-soft mb-7 text-2xl sm:text-3xl">
        Compre por categoria
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
        {depts.map((c) => (
          <Link key={c.slug} to={`/categoria/${c.slug}`} className="group relative block overflow-hidden rounded-lg">
            <ProductImage src={c.image} alt="" className="aspect-[16/10] sm:aspect-[4/5]" imgClassName="transition-transform duration-500 group-hover:scale-[1.04]" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
            <span className="display absolute bottom-5 left-5 text-3xl uppercase text-white sm:text-4xl">{c.name}</span>
          </Link>
        ))}
      </div>
      <div className="scrollbar-none -mx-4 mt-6 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-6 sm:px-0">
        {types.map((c) => (
          <Link key={c.slug} to={`/categoria/${c.slug}`} className="group w-32 shrink-0 sm:w-auto">
            <ProductImage src={c.image} alt="" className="aspect-square rounded-lg" imgClassName="transition-transform duration-500 group-hover:scale-[1.05]" />
            <span className="mt-2 block text-center text-[15px] font-medium group-hover:text-brand">{c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function OffersBand({ products }) {
  if (!products?.length) return null;
  const best = Math.max(...products.map((p) => p.discountPercent));
  return (
    <section className="py-4">
      <Link to="/categoria/promocoes" className="flex flex-col gap-4 rounded-xl bg-sale px-8 py-8 text-white sm:flex-row sm:items-center sm:justify-between sm:px-12">
        <div>
          <p className="display text-4xl uppercase sm:text-5xl">Até {best}% off</p>
          <p className="mt-1 text-lg opacity-90">{products.length >= 8 ? 'Dezenas de peças' : `${products.length} peças`} com preço reduzido por tempo limitado.</p>
        </div>
        <span className="inline-flex h-12 items-center justify-center rounded-md bg-white px-6 font-semibold text-sale">Ver promoções</span>
      </Link>
    </section>
  );
}

export default function Home() {
  const { store } = useSettings();
  useDocumentTitle(store.tagline, store.name);
  const { data, loading, error } = useFetch('/home');
  if (loading) return <PageLoader />;
  if (error) return <Container className="py-20 text-center text-muted">{error.message}</Container>;
  return (
    <>
      <Hero banners={data.banners} />
      <Benefits />
      <Container>
        <ProductRail title="Destaques da semana" products={data.featured} to="/produtos" />
        <ProductRail title="Lançamentos" products={data.newest} to="/categoria/lancamentos" />
        <Categories categories={data.categories} />
        <OffersBand products={data.onSale} />
        <ProductRail title="Ofertas" products={data.onSale} to="/categoria/promocoes" linkLabel="Ver todas as ofertas" />
        <ProductRail title="Mais vendidos" products={data.bestSellers} to="/categoria/mais-vendidos" />
      </Container>
    </>
  );
}
