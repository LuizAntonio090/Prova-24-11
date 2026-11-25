import { useEffect, useRef, useState } from 'react';
import { FiArrowDown, FiArrowUp, FiExternalLink, FiPlus, FiTrash2, FiUpload, FiX } from 'react-icons/fi';
import { ProductImage } from '../components/product.jsx';
import { Alert, Badge, Button, Checkbox, ConfirmModal, Input, Modal, PageLoader, Pagination, Select, Textarea, cx } from '../components/ui.jsx';
import { useToast } from '../context/toast.jsx';
import { api, uploadImage } from '../lib/api.js';
import { brl, date } from '../lib/format.js';
import { useDebounced, useFetch, useForm } from '../lib/hooks.js';
import { Link, useNavigate } from '../lib/router.jsx';
import { Card, FilterTabs, PageHeader, SearchInput, Table } from './AdminApp.jsx';

// ---------------- Produtos ----------------
export function Products() {
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState(null);
  const dq = useDebounced(q);
  const { data, loading, reload } = useFetch(`/admin/products?q=${encodeURIComponent(dq)}&status=${status}&pagina=${page}`);

  return (
    <>
      <PageHeader
        title="Produtos"
        description={data ? `${data.total} produtos` : ''}
        actions={
          <>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Buscar nome, marca ou SKU" />
            <Button to="/admin/produtos/novo"><FiPlus /> Novo produto</Button>
          </>
        }
      />
      <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['', 'Todos'], ['ativos', 'Ativos'], ['inativos', 'Inativos'], ['sem_estoque', 'Sem estoque']]} />
      {loading && !data ? <PageLoader /> : (
        <>
          <Table
            rows={data?.items || []}
            onRowClick={(p) => navigate(`/admin/produtos/${p.id}`)}
            empty="Nenhum produto encontrado."
            columns={[
              { key: 'name', label: 'Produto', render: (p) => (
                <div className="flex items-center gap-3">
                  <ProductImage src={p.image} alt="" className="h-14 w-11 shrink-0 rounded" />
                  <div className="min-w-0"><p className="font-medium">{p.name}</p><p className="text-[13px] text-muted">{p.brand} · {p.categories}</p></div>
                </div>
              ) },
              { key: 'price', label: 'Preço', render: (p) => <>{brl(p.finalPriceCents)}{p.onSale && <span className="ml-1.5 text-[13px] text-muted line-through">{brl(p.priceCents)}</span>}</> },
              { key: 'stock', label: 'Estoque', render: (p) => <Badge tone={p.totalStock === 0 ? 'sale' : p.totalStock < 10 ? 'warn' : 'muted'}>{p.totalStock} un.</Badge> },
              { key: 'sold', label: 'Vendidos', align: 'right', render: (p) => p.soldCount },
              { key: 'status', label: 'Situação', render: (p) => <div className="flex gap-1">{p.active ? <Badge tone="ok">Ativo</Badge> : <Badge>Inativo</Badge>}{p.featured && <Badge tone="brand">Destaque</Badge>}</div> },
              { key: 'x', label: '', align: 'right', render: (p) => <button type="button" className="p-2 text-muted hover:text-sale" aria-label={`Excluir ${p.name}`} onClick={(e) => { e.stopPropagation(); setRemoving(p); }}><FiTrash2 /></button> },
            ]}
          />
          <Pagination page={data?.page || 1} pages={data?.pages || 1} onChange={setPage} />
        </>
      )}
      <ConfirmModal open={Boolean(removing)} onClose={() => setRemoving(null)} title={`Excluir “${removing?.name}”?`} confirmLabel="Excluir produto"
        onConfirm={async () => {
          try { await api.del(`/admin/products/${removing.id}`); toast('Produto excluído.'); reload(); } catch (err) { toast(err.message, { tone: 'error' }); }
          setRemoving(null);
        }}>
        O produto, suas variações e fotos saem do catálogo. Pedidos antigos continuam com o nome e o preço registrados. Para apenas esconder da loja, desative o produto.
      </ConfirmModal>
    </>
  );
}

const EMPTY_PRODUCT = { name: '', slug: '', description: '', brand: '', price: '', salePrice: '', saleEndsAt: '', featured: false, active: true, weightGrams: 300, categoryIds: [], images: [], variants: [] };

function VariantGenerator({ meta, onAdd }) {
  const [open, setOpen] = useState(false);
  const [sizes, setSizes] = useState('P, M, G, GG');
  const [color, setColor] = useState({ name: '', hex: '#1E1E1F' });
  const [stock, setStock] = useState(10);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Gerar grade de tamanhos</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Gerar variações para uma cor" size="sm"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={!color.name.trim() || !sizes.trim()} onClick={() => {
          onAdd(sizes.split(',').map((s) => s.trim()).filter(Boolean).map((s) => ({ size: s, color: color.name.trim(), colorHex: color.hex, sku: '', stock: Number(stock) || 0 })));
          setOpen(false);
        }}>Adicionar variações</Button></>}>
        <div className="space-y-4">
          <Input label="Tamanhos (separados por vírgula)" value={sizes} onChange={(e) => setSizes(e.target.value)} hint="Ex.: PP, P, M, G, GG · 36, 38, 40 · Único" />
          <div className="flex items-end gap-3">
            <Input className="flex-1" label="Nome da cor" list="cores-existentes" value={color.name} onChange={(e) => {
              const found = meta?.colors.find((c) => c.name.toLowerCase() === e.target.value.toLowerCase());
              setColor({ name: e.target.value, hex: found?.hex || color.hex });
            }} />
            <input type="color" aria-label="Cor" value={color.hex} onChange={(e) => setColor({ ...color, hex: e.target.value })} className="h-11 w-14 cursor-pointer rounded-md border border-line" />
          </div>
          <datalist id="cores-existentes">{meta?.colors.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          <Input label="Estoque inicial de cada tamanho" type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}

export function ProductForm({ id }) {
  const isNew = !id;
  const toast = useToast();
  const navigate = useNavigate();
  const existing = useFetch(isNew ? null : `/admin/products/${id}`);
  const cats = useFetch('/admin/categories');
  const meta = useFetch('/admin/meta');
  const f = useForm(EMPTY_PRODUCT);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (existing.data?.product) {
      const p = existing.data.product;
      f.setValues({ ...p, salePrice: p.salePrice ?? '', saleEndsAt: p.saleEndsAt ? p.saleEndsAt.slice(0, 10) : '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  if ((!isNew && existing.loading) || cats.loading) return <PageLoader />;
  if (!isNew && existing.error) return <Alert>{existing.error.message}</Alert>;
  const v = f.values;
  const setVariant = (i, patch) => f.set('variants', v.variants.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const moveImage = (i, d) => {
    const imgs = [...v.images];
    [imgs[i], imgs[i + d]] = [imgs[i + d], imgs[i]];
    f.set('images', imgs);
  };

  const save = f.submit(async (vals) => {
    const body = {
      ...vals,
      salePrice: vals.salePrice === '' || vals.salePrice === null ? null : vals.salePrice,
      saleEndsAt: vals.saleEndsAt ? new Date(`${vals.saleEndsAt}T23:59:59`).toISOString() : null,
    };
    const r = isNew ? await api.post('/admin/products', body) : await api.put(`/admin/products/${id}`, body);
    toast(isNew ? 'Produto criado.' : 'Alterações salvas.');
    if (isNew) navigate(`/admin/produtos/${r.product.id}`, { replace: true });
    else f.setValues({ ...r.product, salePrice: r.product.salePrice ?? '', saleEndsAt: r.product.saleEndsAt ? r.product.saleEndsAt.slice(0, 10) : '' });
  });

  const onFiles = async (files) => {
    setUploading(true);
    try {
      const urls = [];
      for (const file of files) urls.push(await uploadImage(file));
      f.set('images', [...v.images, ...urls.map((url) => ({ url, alt: v.name }))]);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const allCats = cats.data?.items || [];
  const fieldErrors = Object.entries(f.errors).filter(([, m]) => m);

  return (
    <form onSubmit={save} noValidate>
      <PageHeader
        title={isNew ? 'Novo produto' : v.name || 'Editar produto'}
        actions={
          <>
            {!isNew && v.slug && <Button variant="secondary" onClick={() => window.open(`/produto/${v.slug}`, '_blank')}><FiExternalLink /> Ver na loja</Button>}
            <Button variant="ghost" to="/admin/produtos">Voltar</Button>
            <Button type="submit" loading={f.submitting}>{isNew ? 'Criar produto' : 'Salvar alterações'}</Button>
          </>
        }
      />
      {f.formError && (
        <Alert className="mb-4">
          {f.formError}
          {fieldErrors.length > 0 && <ul className="mt-1 list-disc pl-5">{fieldErrors.map(([k, m]) => <li key={k}>{m}</li>)}</ul>}
        </Alert>
      )}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card title="Informações">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input className="sm:col-span-2" label="Nome" {...f.bind('name')} />
              <Input label="Marca" list="marcas" {...f.bind('brand')} />
              <datalist id="marcas">{meta.data?.brands.map((b) => <option key={b} value={b} />)}</datalist>
              <Input label="Endereço na loja (slug)" optional {...f.bind('slug')} hint="Gerado a partir do nome se ficar em branco" />
              <Textarea className="sm:col-span-2" label="Descrição" rows={7} {...f.bind('description')} hint="Inclua composição, modelagem e cuidados. Quebras de linha são mantidas." />
            </div>
          </Card>

          <Card title="Fotos" actions={
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => onFiles([...e.target.files])} />
              <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}><FiUpload /> Enviar fotos</Button>
            </div>
          }>
            {v.images.length === 0 && <p className="mb-3 text-sm text-muted">Envie fotos JPG, PNG ou WEBP de até 3 MB. A primeira é a capa.</p>}
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {v.images.map((img, i) => (
                <li key={img.url + i} className="relative">
                  <ProductImage src={img.url} alt={img.alt} className="aspect-[4/5] rounded-md" />
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-ink px-1.5 text-[11px] font-semibold text-white">Capa</span>}
                  <div className="mt-1 flex justify-center gap-1">
                    <button type="button" disabled={i === 0} onClick={() => moveImage(i, -1)} className="p-1 disabled:opacity-30" aria-label="Mover para a esquerda"><FiArrowUp className="-rotate-90" /></button>
                    <button type="button" disabled={i === v.images.length - 1} onClick={() => moveImage(i, 1)} className="p-1 disabled:opacity-30" aria-label="Mover para a direita"><FiArrowDown className="-rotate-90" /></button>
                    <button type="button" onClick={() => f.set('images', v.images.filter((_, j) => j !== i))} className="p-1 text-sale" aria-label="Remover foto"><FiX /></button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Ou cole o endereço (URL) de uma imagem" className="h-10 flex-1 rounded-md border border-line px-3 text-sm focus:border-brand focus:outline-none" />
              <Button variant="secondary" size="sm" className="h-10" disabled={!/^(https:\/\/|\/uploads\/|\/api\/media\/)/.test(imageUrl)} onClick={() => { f.set('images', [...v.images, { url: imageUrl.trim(), alt: v.name }]); setImageUrl(''); }}>Adicionar</Button>
            </div>
          </Card>

          <Card title="Variações e estoque" actions={<VariantGenerator meta={meta.data} onAdd={(rows) => f.set('variants', [...v.variants, ...rows])} />}>
            {v.variants.length === 0 ? (
              <p className="text-sm text-muted">Cada combinação de tamanho e cor tem seu próprio estoque. Use “Gerar grade de tamanhos” para criar várias de uma vez.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-[13px] text-muted"><tr><th className="pb-2 font-semibold">Tamanho</th><th className="pb-2 font-semibold">Cor</th><th className="pb-2 font-semibold">SKU</th><th className="pb-2 font-semibold">Estoque</th><th /></tr></thead>
                  <tbody>
                    {v.variants.map((x, i) => (
                      <tr key={x.id || `n${i}`}>
                        <td className="py-1 pr-2"><input aria-label="Tamanho" value={x.size} onChange={(e) => setVariant(i, { size: e.target.value })} className="h-9 w-20 rounded border border-line px-2" /></td>
                        <td className="py-1 pr-2"><div className="flex items-center gap-1.5"><input type="color" aria-label="Cor" value={x.colorHex} onChange={(e) => setVariant(i, { colorHex: e.target.value })} className="h-9 w-9 cursor-pointer rounded border border-line" /><input aria-label="Nome da cor" value={x.color} onChange={(e) => setVariant(i, { color: e.target.value })} className="h-9 w-32 rounded border border-line px-2" /></div></td>
                        <td className="py-1 pr-2"><input aria-label="SKU" value={x.sku} placeholder="automático" onChange={(e) => setVariant(i, { sku: e.target.value })} className="h-9 w-40 rounded border border-line px-2 font-mono text-[13px]" /></td>
                        <td className="py-1 pr-2"><input aria-label="Estoque" type="number" min="0" value={x.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} className="h-9 w-20 rounded border border-line px-2" /></td>
                        <td className="py-1 text-right"><button type="button" onClick={() => f.set('variants', v.variants.filter((_, j) => j !== i))} className="p-2 text-muted hover:text-sale" aria-label="Remover variação"><FiTrash2 /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button variant="link" className="mt-3" onClick={() => f.set('variants', [...v.variants, { size: '', color: v.variants.at(-1)?.color || '', colorHex: v.variants.at(-1)?.colorHex || '#888888', sku: '', stock: 0 }])}>Adicionar uma variação</Button>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Preço">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Preço (R$)" type="number" step="0.01" min="0" {...f.bind('price')} />
              <Input label="Preço promocional (R$)" optional type="number" step="0.01" min="0" {...f.bind('salePrice')} />
              <Input className="sm:col-span-2" label="Promoção válida até" optional type="date" {...f.bind('saleEndsAt')} hint="Sem data, a promoção vale até você remover." />
            </div>
          </Card>
          <Card title="Organização">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Categorias</legend>
              {f.errors.categoryIds && <p className="mb-2 text-[13px] text-sale">{f.errors.categoryIds}</p>}
              {['departamento', 'tipo'].map((kind) => (
                <div key={kind} className="mb-3">
                  <p className="mb-1.5 text-[13px] text-muted">{kind === 'departamento' ? 'Departamentos' : 'Tipos de peça'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {allCats.filter((c) => c.kind === kind).map((c) => (
                      <Checkbox key={c.id} label={c.name} checked={v.categoryIds.includes(c.id)} onChange={(e) => f.set('categoryIds', e.target.checked ? [...v.categoryIds, c.id] : v.categoryIds.filter((x) => x !== c.id))} />
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
            <div className="space-y-2.5 border-t border-line pt-4">
              <Checkbox label="Produto ativo (visível na loja)" checked={v.active} onChange={(e) => f.set('active', e.target.checked)} />
              <Checkbox label="Mostrar em Destaques da semana" checked={v.featured} onChange={(e) => f.set('featured', e.target.checked)} />
            </div>
          </Card>
          <Card title="Envio">
            <Input label="Peso com embalagem (gramas)" type="number" min="1" {...f.bind('weightGrams')} hint="Usado no cálculo do frete." />
          </Card>
        </div>
      </div>
    </form>
  );
}

// ---------------- Estoque ----------------
export function Stock() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [low, setLow] = useState(new URLSearchParams(window.location.search).get('baixo') === '1');
  const dq = useDebounced(q);
  const { data, loading, setData } = useFetch(`/admin/stock?q=${encodeURIComponent(dq)}${low ? '&ate=3' : ''}`);
  const [drafts, setDrafts] = useState({});

  const save = async (row) => {
    const value = Number(drafts[row.id]);
    if (!Number.isInteger(value) || value < 0) return toast('Informe um número inteiro maior ou igual a zero.', { tone: 'error' });
    try {
      const r = await api.patch(`/admin/stock/${row.id}`, { stock: value });
      setData((d) => ({ items: d.items.map((x) => (x.id === row.id ? { ...x, stock: r.variant.stock } : x)) }));
      setDrafts((d) => { const n = { ...d }; delete n[row.id]; return n; });
      toast(`Estoque atualizado: ${row.product} (${row.color}, ${row.size}).`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  return (
    <>
      <PageHeader title="Estoque" description="Ajuste a quantidade de cada variação. As vendas baixam o estoque automaticamente e os cancelamentos devolvem." actions={<SearchInput value={q} onChange={setQ} placeholder="Buscar produto ou SKU" />} />
      <FilterTabs value={low ? 'baixo' : ''} onChange={(v) => setLow(v === 'baixo')} options={[['', 'Todas as variações'], ['baixo', 'Estoque baixo (até 3)']]} />
      {loading && !data ? <PageLoader /> : (
        <Table
          rows={data?.items || []}
          empty="Nenhuma variação encontrada."
          columns={[
            { key: 'product', label: 'Produto', render: (r) => <Link to={`/admin/produtos/${r.productId}`} className="font-medium hover:underline">{r.product}</Link> },
            { key: 'variant', label: 'Variação', render: (r) => <span className="flex items-center gap-2"><span className="size-3.5 rounded-full ring-1 ring-ink/15" style={{ background: r.colorHex }} />{r.color} · {r.size}</span> },
            { key: 'sku', label: 'SKU', render: (r) => <span className="font-mono text-[13px] text-muted">{r.sku}</span> },
            { key: 'stock', label: 'Quantidade', render: (r) => (
              <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); save(r); }}>
                <input type="number" min="0" aria-label={`Estoque de ${r.product} ${r.color} ${r.size}`} value={drafts[r.id] ?? r.stock} onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                  className={cx('h-9 w-20 rounded border px-2', r.stock === 0 ? 'border-sale/50' : r.stock <= 3 ? 'border-warn/50' : 'border-line')} />
                {drafts[r.id] !== undefined && Number(drafts[r.id]) !== r.stock && <Button size="sm" type="submit">Salvar</Button>}
              </form>
            ) },
          ]}
        />
      )}
    </>
  );
}

// ---------------- Categorias ----------------
function CategoryForm({ category, onClose, onSaved }) {
  const f = useForm(category || { name: '', slug: '', kind: 'tipo', description: '', sortOrder: 0, active: true });
  const save = f.submit(async (v) => {
    if (category) await api.put(`/admin/categories/${category.id}`, v);
    else await api.post('/admin/categories', v);
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={category ? `Editar ${category.name}` : 'Nova categoria'} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={f.submitting}>Salvar categoria</Button></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {f.formError && !Object.keys(f.errors).length && <Alert className="sm:col-span-2">{f.formError}</Alert>}
        <Input label="Nome" {...f.bind('name')} />
        <Select label="Tipo" {...f.bind('kind')}>
          <option value="departamento">Departamento (ex.: Masculino)</option>
          <option value="tipo">Tipo de peça (ex.: Camisetas)</option>
        </Select>
        <Input label="Endereço (slug)" optional {...f.bind('slug')} hint="Ex.: /categoria/camisetas" />
        <Input label="Ordem no menu" type="number" min="0" {...f.bind('sortOrder')} />
        <Textarea className="sm:col-span-2" label="Descrição" optional rows={2} {...f.bind('description')} />
        <Checkbox className="sm:col-span-2" label="Categoria ativa (aparece no menu)" checked={f.values.active} onChange={(e) => f.set('active', e.target.checked)} />
      </form>
    </Modal>
  );
}

export function Categories() {
  const toast = useToast();
  const { data, loading, reload } = useFetch('/admin/categories');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  return (
    <>
      <PageHeader title="Categorias" description="Departamentos e tipos de peça aparecem no menu da loja, na ordem definida aqui." actions={<Button onClick={() => setEditing({})}><FiPlus /> Nova categoria</Button>} />
      {loading && !data ? <PageLoader /> : (
        <Table
          rows={data?.items || []}
          onRowClick={(c) => setEditing(c)}
          columns={[
            { key: 'name', label: 'Nome', render: (c) => <b>{c.name}</b> },
            { key: 'kind', label: 'Tipo', render: (c) => (c.kind === 'departamento' ? 'Departamento' : 'Tipo de peça') },
            { key: 'slug', label: 'Endereço', render: (c) => <span className="font-mono text-[13px] text-muted">/categoria/{c.slug}</span> },
            { key: 'sortOrder', label: 'Ordem', align: 'right' },
            { key: 'products', label: 'Produtos', align: 'right' },
            { key: 'active', label: 'Situação', render: (c) => (c.active ? <Badge tone="ok">Ativa</Badge> : <Badge>Inativa</Badge>) },
            { key: 'x', label: '', align: 'right', render: (c) => <button type="button" className="text-sm font-semibold text-sale" onClick={(e) => { e.stopPropagation(); setRemoving(c); }}>Excluir</button> },
          ]}
        />
      )}
      {editing && <CategoryForm category={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Categoria salva.'); }} />}
      <ConfirmModal open={Boolean(removing)} onClose={() => setRemoving(null)} title={`Excluir ${removing?.name}?`} confirmLabel="Excluir"
        onConfirm={async () => { try { await api.del(`/admin/categories/${removing.id}`); toast('Categoria excluída.'); reload(); } catch (err) { toast(err.message, { tone: 'error' }); } setRemoving(null); }}>
        Só é possível excluir categorias sem produtos. Para tirar do menu sem excluir, desative a categoria.
      </ConfirmModal>
    </>
  );
}

// ---------------- Promoções ----------------
export function Promotions() {
  const toast = useToast();
  const { data, loading, reload } = useFetch('/admin/promotions');
  const cats = useFetch('/admin/categories');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const search = useFetch(dq.trim().length >= 2 ? `/admin/products?q=${encodeURIComponent(dq)}` : null);
  const [picked, setPicked] = useState([]);
  const f = useForm({ percent: 20, target: 'produtos', categoryId: '', endsAt: '' });

  const apply = f.submit(async (v) => {
    const r = await api.post('/admin/promotions/apply', {
      percent: v.percent,
      productIds: v.target === 'produtos' ? picked.map((p) => p.id) : [],
      categoryId: v.target === 'categoria' ? v.categoryId : null,
      endsAt: v.endsAt ? new Date(`${v.endsAt}T23:59:59`).toISOString() : null,
    });
    toast(`Promoção aplicada em ${r.updated} produto(s).`);
    setPicked([]);
    reload();
  });

  const remove = async (ids) => {
    try {
      await api.post('/admin/promotions/remove', { productIds: ids });
      toast('Promoção encerrada.');
      reload();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  return (
    <>
      <PageHeader title="Promoções" description="Aplique descontos percentuais em produtos ou categorias inteiras. O preço promocional aparece na loja e na página Promoções." />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card title="Criar promoção">
          <form onSubmit={apply} className="space-y-4">
            {f.formError && <Alert>{f.formError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Desconto (%)" type="number" min="1" max="90" {...f.bind('percent')} />
              <Input label="Válida até" optional type="date" {...f.bind('endsAt')} />
            </div>
            <Select label="Aplicar em" {...f.bind('target')}>
              <option value="produtos">Produtos escolhidos</option>
              <option value="categoria">Uma categoria inteira</option>
            </Select>
            {f.values.target === 'categoria' ? (
              <Select label="Categoria" {...f.bind('categoryId')}>
                <option value="">Escolha…</option>
                {cats.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.products})</option>)}
              </Select>
            ) : (
              <div>
                <Input label="Buscar produtos" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome" />
                {search.data?.items.length > 0 && (
                  <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-line">
                    {search.data.items.filter((p) => !picked.some((x) => x.id === p.id)).map((p) => (
                      <li key={p.id}><button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-cloth" onClick={() => setPicked([...picked, p])}><span>{p.name}</span><span className="text-muted">{brl(p.priceCents)}</span></button></li>
                    ))}
                  </ul>
                )}
                {picked.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {picked.map((p) => <button key={p.id} type="button" onClick={() => setPicked(picked.filter((x) => x.id !== p.id))} className="inline-flex items-center gap-1 rounded-full bg-cloth px-3 py-1 text-sm">{p.name} <FiX /></button>)}
                  </div>
                )}
              </div>
            )}
            <Button type="submit" loading={f.submitting} disabled={f.values.target === 'produtos' ? !picked.length : !f.values.categoryId}>Aplicar desconto</Button>
          </form>
        </Card>
        <Card title="Produtos em promoção" actions={data?.items.length > 0 && <Button variant="ghost" size="sm" onClick={() => remove(data.items.map((p) => p.id))}>Encerrar todas</Button>}>
          {loading ? <PageLoader /> : data.items.length === 0 ? <p className="text-sm text-muted">Nenhum produto em promoção.</p> : (
            <ul className="divide-y divide-line">
              {data.items.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <ProductImage src={p.image} alt="" className="h-12 w-10 shrink-0 rounded" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-muted">{brl(p.salePriceCents)} <span className="line-through">{brl(p.priceCents)}</span> · −{p.percent}% · {p.endsAt ? `até ${date(p.endsAt)}` : 'sem prazo'}</p>
                  </div>
                  {!p.active && <Badge tone="warn">Expirada</Badge>}
                  <Button variant="ghost" size="sm" onClick={() => remove([p.id])}>Encerrar</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
