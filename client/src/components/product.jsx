import { useState } from 'react';
import { FiHeart, FiImage } from 'react-icons/fi';
import { useFavorites } from '../context/favorites.jsx';
import { brl } from '../lib/format.js';
import { Link } from '../lib/router.jsx';
import { cx } from './ui.jsx';

export function ProductImage({ src, alt, className, imgClassName, loading = 'lazy' }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cx('flex items-center justify-center bg-cloth text-muted/50', className)} role="img" aria-label={alt}>
        <FiImage className="size-8" />
      </div>
    );
  }
  return (
    <div className={cx('overflow-hidden bg-cloth', className)}>
      <img src={src} alt={alt} loading={loading} decoding="async" onError={() => setFailed(true)} className={cx('size-full object-cover', imgClassName)} />
    </div>
  );
}

export function Price({ priceCents, finalPriceCents, onSale, size = 'md' }) {
  const big = size === 'lg';
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className={cx('font-bold tabular-nums', big ? 'text-3xl' : 'text-[15px]', onSale && 'text-sale')}>{brl(finalPriceCents)}</span>
      {onSale && (
        <span className={cx('tabular-nums text-muted line-through', big ? 'text-base' : 'text-[13px]')}>
          <span className="sr-only">de </span>
          {brl(priceCents)}
        </span>
      )}
    </div>
  );
}

export function FavoriteButton({ productId, className, withLabel }) {
  const fav = useFavorites();
  const active = fav.has(productId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fav.toggle(productId);
      }}
      aria-pressed={active}
      aria-label={active ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
      className={cx('inline-flex items-center justify-center gap-2 transition-colors', className)}
    >
      <FiHeart className={cx('size-5', active && 'fill-sale text-sale')} />
      {withLabel && <span>{active ? 'Salvo nos favoritos' : 'Salvar nos favoritos'}</span>}
    </button>
  );
}

export function ProductCard({ product, priority }) {
  const [hover, setHover] = useState(false);
  const p = product;
  return (
    <article className="group relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Link to={`/produto/${p.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-md">
          <ProductImage src={hover && p.image2 ? p.image2 : p.image} alt={p.name} className="size-full" loading={priority ? 'eager' : 'lazy'} />
          <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
            {p.onSale && <span className="rounded bg-sale px-2 py-0.5 text-[13px] font-bold text-white">−{p.discountPercent}%</span>}
            {p.isNew && !p.onSale && <span className="rounded bg-paper px-2 py-0.5 text-[13px] font-semibold text-ink">Novo</span>}
          </div>
          {!p.inStock && (
            <div className="absolute inset-x-0 bottom-0 bg-ink/75 py-2 text-center text-[13px] font-semibold text-white">Esgotado</div>
          )}
        </div>
        <div className="mt-3 space-y-1">
          <p className="text-[13px] text-muted">{p.brand}</p>
          <h3 className="line-clamp-2 text-[15px] font-medium leading-snug group-hover:underline group-hover:underline-offset-4">{p.name}</h3>
          <Price priceCents={p.priceCents} finalPriceCents={p.finalPriceCents} onSale={p.onSale} />
          {p.colors?.length > 1 && (
            <div className="flex items-center gap-1 pt-1" aria-label={`${p.colors.length} cores disponíveis`}>
              {p.colors.slice(0, 5).map((c) => (
                <span key={c.name} title={c.name} className="size-3 rounded-full ring-1 ring-ink/15" style={{ background: c.hex }} />
              ))}
              {p.colors.length > 5 && <span className="text-xs text-muted">+{p.colors.length - 5}</span>}
            </div>
          )}
        </div>
      </Link>
      <FavoriteButton productId={p.id} className="absolute right-2 top-2 size-9 rounded-full bg-paper/90 text-ink hover:bg-paper" />
    </article>
  );
}

export function ProductGrid({ products, cols = 'lg:grid-cols-4' }) {
  return (
    <div className={cx('grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 md:grid-cols-3', cols)}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < 4} />
      ))}
    </div>
  );
}

/** Faixa de produtos: rolagem horizontal no celular, grade no desktop. */
export function ProductRail({ title, products, to, linkLabel = 'Ver todos' }) {
  if (!products?.length) return null;
  return (
    <section className="py-12 sm:py-16">
      <div className="mb-7 flex items-end justify-between gap-4">
        <h2 className="display-soft text-2xl sm:text-3xl">{title}</h2>
        {to && (
          <Link to={to} className="shrink-0 text-sm font-semibold text-brand underline underline-offset-4 hover:no-underline">
            {linkLabel}
          </Link>
        )}
      </div>
      <div className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {products.slice(0, 8).map((p) => (
          <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-auto">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
