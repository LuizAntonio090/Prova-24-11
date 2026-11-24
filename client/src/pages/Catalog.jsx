import { useEffect, useState } from 'react';
import { FiSearch, FiSliders, FiX } from 'react-icons/fi';
import { ProductGrid } from '../components/product.jsx';
import { Breadcrumbs, Button, Checkbox, Container, EmptyState, Pagination, Spinner, cx } from '../components/ui.jsx';
import { useSettings } from '../context/settings.jsx';
import { plural } from '../lib/format.js';
import { useDocumentTitle, useFetch, useLockBody } from '../lib/hooks.js';
import { useSearchParams } from '../lib/router.jsx';

const SORTS = [
  ['relevancia', 'Relevância'],
  ['menor_preco', 'Menor preço'],
  ['maior_preco', 'Maior preço'],
  ['lancamentos', 'Lançamentos'],
  ['mais_vendidos', 'Mais vendidos'],
];

const FILTER_KEYS = ['cats', 'tamanhos', 'cores', 'marcas', 'preco_min', 'preco_max', 'disponibilidade'];

function toggleList(params, key, value) {
  const list = (params.get(key) || '').split(',').filter(Boolean);
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  if (next.length) params.set(key, next.join(','));
  else params.delete(key);
}

function FilterGroup({ title, children }) {
  return (
    <fieldset className="border-b border-line py-5 first:pt-0">
      <legend className="mb-3 text-[15px] font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Filters({ facets, params, update }) {
  const selected = (key) => (params.get(key) || '').split(',').filter(Boolean);
  const [min, setMin] = useState(params.get('preco_min') || '');
  const [max, setMax] = useState(params.get('preco_max') || '');
  useEffect(() => {
    setMin(params.get('preco_min') || '');
    setMax(params.get('preco_max') || '');
  }, [params]);

  const toggle = (key, value) => update((p) => toggleList(p, key, value));
  const cats = selected('cats');
  const sizes = selected('tamanhos');
  const colors = selected('cores');
  const brands = selected('marcas');
  const depts = facets.categories.filter((c) => c.kind === 'departamento');
  const types = facets.categories.filter((c) => c.kind === 'tipo');

  return (
    <div>
      {[...depts, ...types].length > 0 && (
        <FilterGroup title="Categoria">
          <div className="space-y-2.5">
            {[...depts, ...types].map((c) => (
              <Checkbox key={c.slug} checked={cats.includes(c.slug)} onChange={() => toggle('cats', c.slug)} label={<>{c.name} <span className="text-muted">({c.count})</span></>} />
            ))}
          </div>
        </FilterGroup>
      )}
      {facets.sizes.length > 0 && (
        <FilterGroup title="Tamanho">
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sizes.includes(s)}
                onClick={() => toggle('tamanhos', s)}
                className={cx('h-9 min-w-11 rounded-md border px-2.5 text-sm font-medium', sizes.includes(s) ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink/50')}
              >
                {s}
              </button>
            ))}
          </div>
        </FilterGroup>
      )}
      {facets.colors.length > 0 && (
        <FilterGroup title="Cor">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {facets.colors.map((c) => (
              <button key={c.name} type="button" aria-pressed={colors.includes(c.name)} onClick={() => toggle('cores', c.name)} className="flex items-center gap-2 rounded py-0.5 text-left text-sm">
                <span className={cx('size-5 shrink-0 rounded-full ring-1 ring-ink/15', colors.includes(c.name) && 'ring-2 ring-ink ring-offset-2')} style={{ background: c.hex }} />
                <span className={cx(colors.includes(c.name) && 'font-semibold')}>{c.name}</span>
              </button>
            ))}
          </div>
        </FilterGroup>
      )}
      <FilterGroup title="Preço">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update((p) => {
              if (min) p.set('preco_min', min);
              else p.delete('preco_min');
              if (max) p.set('preco_max', max);
              else p.delete('preco_max');
            });
          }}
        >
          <label className="flex-1 text-[13px] text-muted">
            Mínimo
            <input type="number" min="0" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} placeholder={String(Math.floor(facets.price.minCents / 100))} className="mt-1 h-10 w-full rounded-md border border-line px-2 text-[15px] text-ink" />
          </label>
          <label className="flex-1 text-[13px] text-muted">
            Máximo
            <input type="number" min="0" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} placeholder={String(Math.ceil(facets.price.maxCents / 100))} className="mt-1 h-10 w-full rounded-md border border-line px-2 text-[15px] text-ink" />
          </label>
          <Button type="submit" variant="secondary" size="sm" className="h-10">
            Aplicar
          </Button>
        </form>
      </FilterGroup>
      {facets.brands.length > 1 && (
        <FilterGroup title="Marca">
          <div className="space-y-2.5">
            {facets.brands.map((b) => (
              <Checkbox key={b.name} checked={brands.includes(b.name)} onChange={() => toggle('marcas', b.name)} label={<>{b.name} <span className="text-muted">({b.count})</span></>} />
            ))}
          </div>
        </FilterGroup>
      )}
      <FilterGroup title="Disponibilidade">
        <Checkbox
          checked={params.get('disponibilidade') === 'em_estoque'}
          onChange={(e) => update((p) => (e.target.checked ? p.set('disponibilidade', 'em_estoque') : p.delete('disponibilidade')))}
          label="Somente em estoque"
        />
      </FilterGroup>
    </div>
  );
}

function ActiveChips({ params, update, facets }) {
  const chips = [];
  const names = new Map(facets.categories.map((c) => [c.slug, c.name]));
  for (const [key, label] of [['cats', null], ['tamanhos', 'Tam.'], ['cores', null], ['marcas', null]]) {
    for (const v of (params.get(key) || '').split(',').filter(Boolean)) {
      chips.push({ id: key + v, text: label ? `${label} ${v}` : names.get(v) || v, remove: () => update((p) => toggleList(p, key, v)) });
    }
  }
  if (params.get('preco_min') || params.get('preco_max')) {
    chips.push({
      id: 'preco',
      text: `${params.get('preco_min') ? `de R$ ${params.get('preco_min')}` : ''} ${params.get('preco_max') ? `até R$ ${params.get('preco_max')}` : ''}`.trim(),
      remove: () => update((p) => { p.delete('preco_min'); p.delete('preco_max'); }),
    });
  }
  if (params.get('disponibilidade')) chips.push({ id: 'disp', text: 'Em estoque', remove: () => update((p) => p.delete('disponibilidade')) });
  if (!chips.length) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button key={c.id} type="button" onClick={c.remove} className="inline-flex items-center gap-1.5 rounded-full bg-cloth px-3 py-1.5 text-sm hover:bg-line">
          {c.text}
          <FiX className="size-3.5" aria-label="remover filtro" />
        </button>
      ))}
      <button type="button" onClick={() => update((p) => FILTER_KEYS.forEach((k) => p.delete(k)))} className="px-2 text-sm font-semibold text-brand underline underline-offset-4">
        Limpar filtros
      </button>
    </div>
  );
}

/** Lista de produtos: categoria, busca ou todos os produtos. */
export default function Catalog({ slug, mode }) {
  const { store } = useSettings();
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState(false);
  useLockBody(drawer);

  const query = new URLSearchParams(params);
  if (slug) query.set('categoria', slug);
  const { data, loading, error } = useFetch(`/products?${query.toString()}`);
  const [last, setLast] = useState(null);
  useEffect(() => {
    if (data) setLast(data);
  }, [data]);
  const view = data || last;

  const search = params.get('q') || '';
  const title = mode === 'search' ? (search ? `Resultados para “${search}”` : 'Busca') : view?.category?.name || 'Todos os produtos';
  useDocumentTitle(mode === 'search' ? `Busca: ${search}` : view?.category?.name || 'Produtos', store.name);

  const update = (fn) => {
    const p = new URLSearchParams(params);
    fn(p);
    p.delete('pagina');
    setParams(p, { replace: true });
  };
  const filterCount = FILTER_KEYS.filter((k) => params.get(k)).length;

  if (error) {
    return (
      <Container>
        <EmptyState title="Categoria não encontrada" action={<Button to="/">Voltar ao início</Button>}>
          {error.message}
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container className="pb-16 pt-6">
      <Breadcrumbs items={[{ to: '/', label: 'Início' }, { label: title }]} />
      <div className="mb-8 mt-4">
        <h1 className="display text-[clamp(2rem,4.5vw,3.4rem)] uppercase">{title}</h1>
        {view?.category?.description && <p className="mt-2 max-w-2xl text-muted">{view.category.description}</p>}
      </div>

      {!view ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-[250px_1fr] lg:gap-12">
          <aside className="hidden lg:block" aria-label="Filtros">
            <Filters facets={view.facets} params={params} update={update} />
          </aside>
          <div>
            <div className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-4">
              <p className="text-sm text-muted" aria-live="polite">
                {loading ? 'Atualizando…' : plural(view.total, 'produto', 'produtos')}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setDrawer(true)}>
                  <FiSliders /> Filtrar{filterCount > 0 && ` (${filterCount})`}
                </Button>
                <label htmlFor="ordem" className="sr-only">
                  Ordenar por
                </label>
                <select
                  id="ordem"
                  value={view.sort}
                  onChange={(e) => update((p) => p.set('ordem', e.target.value))}
                  className="h-9 rounded-md border border-line bg-paper px-2 text-sm focus:border-brand focus:outline-none"
                >
                  {SORTS.map(([v, l]) => (
                    <option key={v} value={v}>
                      Ordenar: {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <ActiveChips params={params} update={update} facets={view.facets} />
            <div className={cx('transition-opacity', loading && 'opacity-50')}>
              {view.items.length ? (
                <ProductGrid products={view.items} cols="lg:grid-cols-3 xl:grid-cols-3" />
              ) : (
                <EmptyState
                  icon={FiSearch}
                  title={mode === 'search' ? 'Nenhum produto encontrado' : 'Nenhum produto com esses filtros'}
                  action={
                    filterCount ? (
                      <Button variant="secondary" onClick={() => update((p) => FILTER_KEYS.forEach((k) => p.delete(k)))}>
                        Limpar filtros
                      </Button>
                    ) : (
                      <Button to="/produtos">Ver todos os produtos</Button>
                    )
                  }
                >
                  {mode === 'search' ? 'Tente outra palavra, como “camiseta”, “jeans” ou o nome de uma marca.' : 'Remova algum filtro para ver mais opções.'}
                </EmptyState>
              )}
            </div>
            <Pagination
              page={view.page}
              pages={view.pages}
              onChange={(n) => {
                const p = new URLSearchParams(params);
                p.set('pagina', String(n));
                setParams(p, { scroll: true });
              }}
            />
          </div>
        </div>
      )}

      {drawer && view && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" className="animate-fade absolute inset-0 bg-ink/50" onClick={() => setDrawer(false)} aria-label="Fechar filtros" />
          <div className="animate-drawer-left absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-paper" role="dialog" aria-modal="true" aria-label="Filtros">
            <div className="flex h-16 items-center justify-between border-b border-line px-5">
              <h2 className="text-lg font-bold">Filtrar</h2>
              <button type="button" onClick={() => setDrawer(false)} className="flex size-10 items-center justify-center rounded-full hover:bg-cloth" aria-label="Fechar filtros">
                <FiX className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <Filters facets={view.facets} params={params} update={update} />
            </div>
            <div className="border-t border-line p-4">
              <Button className="w-full" onClick={() => setDrawer(false)}>
                Ver {plural(view.total, 'produto', 'produtos')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
