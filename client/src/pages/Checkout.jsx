import { useEffect, useState } from 'react';
import { FiCheckCircle, FiMail } from 'react-icons/fi';
import AddressForm from '../components/AddressForm.jsx';
import { CouponField, ShippingPicker, Totals } from '../components/OrderSummary.jsx';
import { ProductImage } from '../components/product.jsx';
import { Alert, Button, Container, EmptyState, Input, PageLoader, cx } from '../components/ui.jsx';
import { useAuth } from '../context/auth.jsx';
import { useCart } from '../context/cart.jsx';
import { useSettings } from '../context/settings.jsx';
import { api } from '../lib/api.js';
import { addressLine, brl, maskCpf } from '../lib/format.js';
import { useDocumentTitle, useFetch } from '../lib/hooks.js';
import { useNavigate } from '../lib/router.jsx';

const METHODS = [
  { id: 'pix', label: 'PIX', text: 'Aprovação na hora. O QR Code aparece logo após finalizar.' },
  { id: 'card', label: 'Cartão de crédito', text: 'Você digita o cartão no ambiente seguro do Mercado Pago.' },
  { id: 'boleto', label: 'Boleto bancário', text: 'Compensação em até 3 dias úteis. Pede CPF.' },
];

function Step({ n, title, done, children }) {
  return (
    <section className="rounded-lg border border-line p-5 sm:p-6" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="mb-4 flex items-center gap-3 text-lg font-bold">
        <span className={cx('flex size-7 items-center justify-center rounded-full text-sm', done ? 'bg-ok text-white' : 'bg-ink text-white')}>{done ? '✓' : n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmailVerification() {
  const { user, refresh } = useAuth();
  const [state, setState] = useState({ sending: false, sent: false, devLink: '', error: '' });
  const resend = async () => {
    setState((s) => ({ ...s, sending: true, error: '' }));
    try {
      const r = await api.post('/auth/resend-verification');
      setState({ sending: false, sent: true, devLink: r.devLink || '', error: '' });
    } catch (err) {
      setState({ sending: false, sent: false, devLink: '', error: err.message });
    }
  };
  return (
    <Alert tone="warn" className="mt-4">
      <p className="flex items-center gap-2 font-semibold">
        <FiMail /> Confirme seu e-mail para finalizar a compra
      </p>
      <p className="mt-1 text-ink/80">Enviamos um link para {user.email}. Abra o e-mail e clique em “Confirmar e-mail”.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={resend} loading={state.sending}>
          {state.sent ? 'Enviar de novo' : 'Reenviar e-mail'}
        </Button>
        <Button size="sm" variant="ghost" onClick={refresh}>
          Já confirmei
        </Button>
      </div>
      {state.sent && <p className="mt-2 text-ok">E-mail enviado.</p>}
      {state.devLink && (
        <p className="mt-2 break-all text-[13px] text-ink/70">
          Modo de desenvolvimento (SMTP não configurado):{' '}
          <a className="underline" href={state.devLink}>
            abrir link de confirmação
          </a>
        </p>
      )}
      {state.error && <p className="mt-2 text-sale">{state.error}</p>}
    </Alert>
  );
}

export default function Checkout() {
  const { store } = useSettings();
  useDocumentTitle('Finalizar compra', store.name);
  const { user, refresh } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const addresses = useFetch('/account/addresses');
  const gateway = useFetch('/payments/config');
  const [addressId, setAddressId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState('pix');
  const [cpf, setCpf] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState({ message: '', fields: {} });

  const list = addresses.data?.addresses || [];
  const selected = list.find((a) => a.id === addressId);

  useEffect(() => {
    if (!list.length) return;
    if (!addressId || !list.some((a) => a.id === addressId)) setAddressId((list.find((a) => a.isDefault) || list[0]).id);
  }, [list, addressId]);

  useEffect(() => {
    if (selected && selected.cep !== cart.cep) cart.setCep(selected.cep);
  }, [selected, cart]);

  if (!cart.items.length) {
    return (
      <Container>
        <EmptyState title="Não há itens para finalizar" action={<Button to="/produtos">Ver produtos</Button>}>
          Adicione produtos ao carrinho para fazer o pedido.
        </EmptyState>
      </Container>
    );
  }
  if (addresses.loading && !addresses.data) return <PageLoader />;

  const q = cart.quote;
  const needsCpf = method === 'boleto' && !user.cpf;
  const canPlace = user.emailVerified && selected && q?.shipping && !q?.issues?.length && (!needsCpf || cpf.replace(/\D/g, '').length === 11);

  const place = async () => {
    setPlacing(true);
    setError({ message: '', fields: {} });
    try {
      const { order } = await api.post('/orders', {
        items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        addressId,
        shippingMethod: cart.shippingMethod,
        paymentMethod: method,
        couponCode: cart.couponCode || null,
        cpf: needsCpf ? cpf : null,
      });
      cart.clear();
      if (needsCpf) refresh();
      navigate(`/pedido/${order.id}?novo=1`);
    } catch (err) {
      if (err.data?.issues) cart.applyIssues(err.data.issues);
      if (err.data?.code === 'EMAIL_NOT_VERIFIED') refresh();
      setError({ message: err.message, fields: err.fields || {} });
      setPlacing(false);
    }
  };

  return (
    <Container className="pb-20 pt-8">
      <h1 className="display mb-8 text-4xl uppercase">Finalizar compra</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <Step n={1} title="Identificação" done={user.emailVerified}>
            <p className="font-medium">{user.name}</p>
            <p className="text-sm text-muted">
              {user.email}
              {user.emailVerified && (
                <span className="ml-2 inline-flex items-center gap-1 text-ok">
                  <FiCheckCircle /> e-mail confirmado
                </span>
              )}
            </p>
            {!user.emailVerified && <EmailVerification />}
          </Step>

          <Step n={2} title="Endereço de entrega" done={Boolean(selected) && !adding}>
            {list.length > 0 && !adding && (
              <fieldset className="space-y-2.5">
                <legend className="sr-only">Escolha o endereço</legend>
                {list.map((a) => (
                  <label key={a.id} className={cx('flex cursor-pointer gap-3 rounded-md border p-4', addressId === a.id ? 'border-brand bg-brand/5' : 'border-line hover:border-ink/30')}>
                    <input type="radio" name="endereco" className="mt-1 accent-[var(--color-brand)]" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                    <span className="text-[15px]">
                      <b>{a.label}</b> · {a.recipient}
                      <span className="block text-sm text-muted">{addressLine(a)}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {adding || !list.length ? (
              <div className={cx(list.length && 'mt-2')}>
                <AddressForm
                  defaultRecipient={user.name}
                  submitLabel="Usar este endereço"
                  onCancel={list.length ? () => setAdding(false) : undefined}
                  onSaved={(a) => {
                    addresses.setData((d) => ({ addresses: [...(d?.addresses || []), a] }));
                    setAddressId(a.id);
                    setAdding(false);
                  }}
                />
              </div>
            ) : (
              <Button variant="link" className="mt-3" onClick={() => setAdding(true)}>
                Cadastrar outro endereço
              </Button>
            )}
          </Step>

          <Step n={3} title="Entrega" done={Boolean(q?.shipping) && Boolean(selected)}>
            {selected ? <ShippingPicker cepEditable={false} /> : <p className="text-sm text-muted">Escolha um endereço para ver as opções.</p>}
          </Step>

          <Step n={4} title="Pagamento" done={false}>
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Forma de pagamento</legend>
              {METHODS.map((m) => (
                <label key={m.id} className={cx('flex cursor-pointer gap-3 rounded-md border p-4', method === m.id ? 'border-brand bg-brand/5' : 'border-line hover:border-ink/30')}>
                  <input type="radio" name="pagamento" className="mt-1 accent-[var(--color-brand)]" checked={method === m.id} onChange={() => setMethod(m.id)} />
                  <span>
                    <b>{m.label}</b>
                    <span className="block text-sm text-muted">{m.text}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {needsCpf && (
              <Input className="mt-4 max-w-xs" label="CPF do pagador" inputMode="numeric" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} error={error.fields.cpf} placeholder="000.000.000-00" />
            )}
            {gateway.data && !gateway.data.configured && (
              <Alert tone="info" className="mt-4">
                O pagamento online ainda não foi ativado nesta loja. Seu pedido fica registrado e os produtos ficam reservados aguardando pagamento.
              </Alert>
            )}
            {gateway.data?.testMode && (
              <Alert tone="info" className="mt-4">
                Ambiente de testes do Mercado Pago: nenhuma cobrança real será feita.
              </Alert>
            )}
          </Step>
        </div>

        <aside className="h-fit space-y-5 rounded-lg bg-cloth p-6 lg:sticky lg:top-28">
          <h2 className="text-lg font-bold">Seu pedido</h2>
          <ul className="max-h-72 space-y-3 overflow-y-auto">
            {(q?.lines || []).map((l) => (
              <li key={l.variantId} className="flex gap-3 text-sm">
                <ProductImage src={l.image} alt="" className="h-16 w-13 shrink-0 rounded" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 font-medium">{l.name}</p>
                  <p className="text-muted">
                    {l.color} · {l.size} · {l.quantity}x
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{brl(l.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <CouponField />
          <Totals quote={q} />
          {q?.issues?.length > 0 && (
            <Alert tone="warn">
              {q.issues.map((i) => (
                <p key={i.variantId}>{i.message}</p>
              ))}
              <button type="button" className="mt-1 font-semibold underline" onClick={() => cart.applyIssues(q.issues)}>
                Ajustar ao estoque
              </button>
            </Alert>
          )}
          {error.message && <Alert>{error.message}</Alert>}
          <Button size="lg" className="w-full" onClick={place} loading={placing} disabled={!canPlace || placing}>
            Finalizar pedido
          </Button>
          {!canPlace && (
            <p className="text-center text-[13px] text-muted">
              {!user.emailVerified ? 'Confirme seu e-mail para continuar.' : !selected ? 'Escolha um endereço de entrega.' : !q?.shipping ? 'Escolha a forma de entrega.' : needsCpf ? 'Informe o CPF para o boleto.' : 'Revise os itens do carrinho.'}
            </p>
          )}
        </aside>
      </div>
    </Container>
  );
}
