import { useEffect, useRef, useState } from 'react';
import { FiPlus, FiTrash2, FiUpload } from 'react-icons/fi';
import { GARMENT_SHAPES } from '../components/Garment.jsx';
import { Alert, Button, Input, PageLoader, Select } from '../components/ui.jsx';
import { applyTheme, useSettings } from '../context/settings.jsx';
import { useToast } from '../context/toast.jsx';
import { api, uploadImage } from '../lib/api.js';
import { useFetch } from '../lib/hooks.js';
import { Card, PageHeader } from './AdminApp.jsx';

const MOTIF_LABELS = { jacket: 'Jaqueta', pants: 'Calça', tshirt: 'Camiseta', shorts: 'Bermuda', sneaker: 'Tênis', cap: 'Boné', bag: 'Bolsa' };

function ImageField({ label, value, onChange, hint }) {
  const toast = useToast();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt="" className="h-12 max-w-[140px] rounded border border-line object-contain p-1" /> : <span className="flex h-12 w-24 items-center justify-center rounded border border-dashed border-line text-[12px] text-muted">sem imagem</span>}
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          setBusy(true);
          try { onChange(await uploadImage(file)); } catch (err) { toast(err.message, { tone: 'error' }); } finally { setBusy(false); e.target.value = ''; }
        }} />
        <Button variant="secondary" size="sm" loading={busy} onClick={() => ref.current?.click()}><FiUpload /> Enviar</Button>
        {value && <Button variant="ghost" size="sm" onClick={() => onChange('')}>Remover</Button>}
      </div>
      {hint && <p className="mt-1.5 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <span className="mt-1.5 flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-11 w-14 cursor-pointer rounded-md border border-line" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-28 rounded-md border border-line px-3 font-mono text-sm uppercase" aria-label={`${label} em hexadecimal`} />
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const settings = useSettings();
  const { data, loading } = useFetch('/admin/settings');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({ message: '', fields: {} });

  useEffect(() => {
    if (data) setForm({ store: data.store, banners: data.banners, shipping: data.shipping });
  }, [data]);

  // pré-visualiza as cores enquanto edita
  useEffect(() => {
    if (form?.store.colors && Object.values(form.store.colors).every((c) => /^#[0-9a-f]{6}$/i.test(c))) applyTheme(form.store.colors);
  }, [form?.store.colors]);
  const savedColors = useRef(settings.store.colors);
  savedColors.current = settings.store.colors;
  // ao sair da página, volta às cores salvas
  useEffect(() => () => applyTheme(savedColors.current), []);

  if (loading || !form) return <PageLoader />;

  const set = (path, value) => {
    setForm((f) => {
      const next = structuredClone(f);
      const keys = path.split('.');
      let o = next;
      for (const k of keys.slice(0, -1)) o = o[k];
      o[keys.at(-1)] = value;
      return next;
    });
  };
  const err = (k) => errors.fields[k];

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setErrors({ message: '', fields: {} });
    try {
      await api.put('/admin/settings', form);
      await settings.reload();
      toast('Configurações salvas.');
    } catch (ex) {
      setErrors({ message: ex.message, fields: ex.fields || {} });
    } finally {
      setSaving(false);
    }
  };

  const s = form.store;
  return (
    <form onSubmit={save} noValidate>
      <PageHeader title="Configurações da loja" description="Nome, identidade visual, contato, banners da página inicial e frete." actions={<Button type="submit" loading={saving}>Salvar configurações</Button>} />
      {errors.message && (
        <Alert className="mb-4">
          {errors.message}
          {Object.keys(errors.fields).length > 0 && <ul className="mt-1 list-disc pl-5">{Object.entries(errors.fields).map(([k, m]) => <li key={k}>{m}</li>)}</ul>}
        </Alert>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Identidade">
          <div className="space-y-4">
            <Input label="Nome da loja" value={s.name} onChange={(e) => set('store.name', e.target.value)} error={err('store.name')} />
            <Input label="Frase de apresentação" value={s.tagline} onChange={(e) => set('store.tagline', e.target.value)} hint="Aparece no rodapé e no título da página inicial." />
            <ImageField label="Logotipo" value={s.logoUrl} onChange={(v) => set('store.logoUrl', v)} hint="PNG com fundo transparente, cerca de 300×80 px. Sem logotipo, o nome da loja é usado." />
            <div className="flex flex-wrap gap-5">
              <ColorField label="Cor principal" value={s.colors.primary} onChange={(v) => set('store.colors.primary', v)} />
              <ColorField label="Cor de destaque" value={s.colors.accent} onChange={(v) => set('store.colors.accent', v)} />
              <ColorField label="Cor de promoção" value={s.colors.sale} onChange={(v) => set('store.colors.sale', v)} />
            </div>
            <Button variant="link" onClick={() => set('store.colors', { primary: data.defaults.primary, accent: data.defaults.accent, sale: data.defaults.sale })}>Restaurar cores padrão</Button>
          </div>
        </Card>
        <Card title="Contato e dados legais">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="E-mail de atendimento" value={s.contact.email} onChange={(e) => set('store.contact.email', e.target.value)} error={err('store.contact.email')} />
            <Input label="Telefone" value={s.contact.phone} onChange={(e) => set('store.contact.phone', e.target.value)} />
            <Input label="WhatsApp" optional value={s.contact.whatsapp} onChange={(e) => set('store.contact.whatsapp', e.target.value)} placeholder="(11) 99999-9999" />
            <Input label="Horário de atendimento" value={s.contact.hours} onChange={(e) => set('store.contact.hours', e.target.value)} />
            <Input className="sm:col-span-2" label="Endereço" value={s.contact.address} onChange={(e) => set('store.contact.address', e.target.value)} />
            <Input label="Razão social" optional value={s.legalName} onChange={(e) => set('store.legalName', e.target.value)} />
            <Input label="CNPJ" optional value={s.cnpj} onChange={(e) => set('store.cnpj', e.target.value)} />
          </div>
        </Card>
        <Card title="Redes sociais">
          <div className="grid gap-4 sm:grid-cols-2">
            {['instagram', 'facebook', 'tiktok', 'youtube'].map((k) => (
              <Input key={k} label={k[0].toUpperCase() + k.slice(1)} optional value={s.social[k]} onChange={(e) => set(`store.social.${k}`, e.target.value)} placeholder={`https://${k}.com/sualoja`} />
            ))}
          </div>
          <p className="mt-3 text-[13px] text-muted">Só as redes preenchidas aparecem no rodapé.</p>
        </Card>
        <Card title="Frete">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Frete grátis a partir de (R$)" type="number" min="0" step="0.01" value={form.shipping.freeShippingMin} onChange={(e) => set('shipping.freeShippingMin', e.target.value)} hint="0 desativa o frete grátis." />
            <Input label="Adicional por kg extra (R$)" type="number" min="0" step="0.01" value={form.shipping.perKg} onChange={(e) => set('shipping.perKg', e.target.value)} />
            <Input label="Base da entrega Econômica (R$)" type="number" min="0" step="0.01" value={form.shipping.economyBase} onChange={(e) => set('shipping.economyBase', e.target.value)} />
            <Input label="Base da entrega Expressa (R$)" type="number" min="0" step="0.01" value={form.shipping.expressBase} onChange={(e) => set('shipping.expressBase', e.target.value)} />
          </div>
          <p className="mt-3 text-[13px] text-muted">O valor final é ajustado pela região do CEP (de 1× na Grande São Paulo a 1,9× na região Norte) e pelo peso dos produtos.</p>
        </Card>
      </div>

      <Card title="Banners da página inicial" className="mt-4" actions={form.banners.length < 6 && (
        <Button variant="secondary" size="sm" onClick={() => set('banners', [...form.banners, { id: `b${Date.now().toString(36)}`, title: 'Novo banner', subtitle: '', ctaLabel: 'Ver produtos', ctaUrl: '/produtos', imageUrl: '', motif: 'tshirt' }])}><FiPlus /> Adicionar banner</Button>
      )}>
        <div className="space-y-4">
          {form.banners.map((b, i) => (
            <fieldset key={b.id} className="grid gap-4 rounded-md border border-line p-4 md:grid-cols-6">
              <legend className="px-1 text-sm font-semibold">Banner {i + 1}</legend>
              <Input className="md:col-span-3" label="Título" value={b.title} onChange={(e) => set(`banners.${i}.title`, e.target.value)} error={err(`banners.${i}.title`)} />
              <Input className="md:col-span-3" label="Texto" value={b.subtitle} onChange={(e) => set(`banners.${i}.subtitle`, e.target.value)} />
              <Input className="md:col-span-2" label="Texto do botão" value={b.ctaLabel} onChange={(e) => set(`banners.${i}.ctaLabel`, e.target.value)} />
              <Input className="md:col-span-2" label="Link do botão" value={b.ctaUrl} onChange={(e) => set(`banners.${i}.ctaUrl`, e.target.value)} error={err(`banners.${i}.ctaUrl`)} hint="Ex.: /categoria/promocoes" />
              <Select className="md:col-span-2" label="Ilustração (sem foto)" value={b.motif} onChange={(e) => set(`banners.${i}.motif`, e.target.value)}>
                {GARMENT_SHAPES.map((m) => <option key={m} value={m}>{MOTIF_LABELS[m]}</option>)}
              </Select>
              <div className="flex items-end justify-between gap-4 md:col-span-6">
                <ImageField label="Foto do banner" value={b.imageUrl} onChange={(v) => set(`banners.${i}.imageUrl`, v)} hint="Opcional. Foto vertical ou quadrada, mínimo 900 px de altura." />
                <Button variant="ghost" size="sm" className="text-sale" onClick={() => set('banners', form.banners.filter((_, j) => j !== i))}><FiTrash2 /> Remover</Button>
              </div>
            </fieldset>
          ))}
          {form.banners.length === 0 && <p className="text-sm text-muted">Sem banners, a página inicial começa pelos destaques.</p>}
        </div>
      </Card>
      <div className="mt-6 flex justify-end">
        <Button type="submit" size="lg" loading={saving}>Salvar configurações</Button>
      </div>
    </form>
  );
}
