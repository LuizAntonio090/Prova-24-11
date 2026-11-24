import { useEffect, useState } from 'react';
import { FiCheckCircle, FiCopy, FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { ProductImage } from '../components/product.jsx';
import { Alert, Badge, Breadcrumbs, Button, ConfirmModal, Container, EmptyState, PageLoader, cx } from '../components/ui.jsx';
import { useAuth } from '../context/auth.jsx';
import { useSettings } from '../context/settings.jsx';
import { useToast } from '../context/toast.jsx';
import { api } from '../lib/api.js';
import { ORDER_STATUS, PAYMENT_METHODS, addressLine, brl, dateTime } from '../lib/format.js';
import { useDocumentTitle, useFetch } from '../lib/hooks.js';
import { Link, useSearchParams } from '../lib/router.jsx';

export function StatusBadge({ status }) {
  const s = ORDER_STATUS[status] || { label: status, tone: 'muted' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function CopyField({ value, label }) {
  const toast = useToast();
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <input readOnly value={value} className="h-11 min-w-0 flex-1 rounded-md border border-line bg-cloth px-3 font-mono text-[13px]" onFocus={(e) => e.target.select()} aria-label={label} />
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast('Código copiado.');
            } catch {
              toast('Selecione o código e copie manualmente.', { tone: 'error' });
            }
          }}
        >
          <FiCopy /> Copiar
        </Button>
      </div>
    </div>
  );
}

function PaymentPanel({ order, onUpdate }) {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [busy, setBusy] = useState('');
  const [method, setMethod] = useState(order.paymentMethod);
  const p = order.payment;
  const awaiting = order.status === 'aguardando_pagamento';

  const run = async (key, fn) => {
    setBusy(key);
    try {
      const r = await fn();
      onUpdate(r.order);
      return r.order;
    } catch (err) {
      toast(err.message, { tone: 'error' });
      return null;
    } finally {
      setBusy('');
    }
  };
  const refresh = () =>
    run('refresh', () => api.post(`/orders/${order.id}/payment/refresh`)).then((o) => {
      if (o && o.status === 'aguardando_pagamento') toast('Ainda não recebemos a confirmação do pagamento.');
    });
  const retry = () => run('retry', () => api.post(`/orders/${order.id}/pay`, { method }));

  if (!awaiting) {
    if (order.status === 'cancelado') return <Alert tone="info">Este pedido foi cancelado. Os produtos voltaram para o estoque.</Alert>;
    return (
      <div className="flex items-start gap-3 rounded-lg bg-ok/10 p-5 text-ok">
        <FiCheckCircle className="mt-0.5 size-6 shrink-0" />
        <div>
          <p className="font-bold">Pagamento aprovado</p>
          <p className="text-sm text-ink/80">
            {PAYMENT_METHODS[order.paymentMethod]}
            {order.paidAt && ` · ${dateTime(order.paidAt)}`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-lg border border-line p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Pagamento · {PAYMENT_METHODS[order.paymentMethod]}</h2>
        <span className="text-xl font-bold tabular-nums">{brl(order.totalCents)}</span>
      </div>

      {order.gateway?.testMode && <Alert tone="info">Ambiente de testes do Mercado Pago: use os dados de teste, nenhuma cobrança real será feita.</Alert>}

      {!p || p.status === 'not_configured' ? (
        <Alert tone="warn">
          O pagamento online ainda não foi ativado nesta loja. Seu pedido está registrado e os produtos estão reservados.
          {isAdmin && <span className="mt-1 block text-ink/80">Administrador: configure MP_ACCESS_TOKEN no .env do servidor (veja o README).</span>}
        </Alert>
      ) : p.status === 'error' ? (
        <Alert>Não foi possível gerar a cobrança: {p.errorMessage}</Alert>
      ) : p.status === 'rejected' ? (
        <Alert>O pagamento foi recusado. Escolha outra forma de pagamento ou tente novamente.</Alert>
      ) : p.status === 'pending' && p.method === 'pix' ? (
        <div className="grid gap-5 sm:grid-cols-[200px_1fr] sm:items-start">
          {p.pixQrBase64 && <img src={`data:image/png;base64,${p.pixQrBase64}`} alt="QR Code PIX" className="size-[200px] rounded-md border border-line" />}
          <div className="space-y-4">
            <p className="text-[15px]">Abra o app do seu banco, escolha pagar com PIX e leia o QR Code ou use o código copia e cola.</p>
            {p.pixQrCode && <CopyField label="PIX copia e cola" value={p.pixQrCode} />}
            {p.expiresAt && <p className="text-sm text-muted">Válido até {dateTime(p.expiresAt)}.</p>}
          </div>
        </div>
      ) : p.status === 'pending' && p.method === 'boleto' ? (
        <div className="space-y-4">
          <p className="text-[15px]">Pague o boleto no app do banco, internet banking ou lotérica. A confirmação leva até 3 dias úteis.</p>
          {p.barcode && <CopyField label="Linha digitável" value={p.barcode} />}
          {p.ticketUrl && (
            <Button variant="secondary" onClick={() => window.open(p.ticketUrl, '_blank', 'noopener')}>
              <FiExternalLink /> Abrir boleto
            </Button>
          )}
        </div>
      ) : p.status === 'pending' && p.method === 'card' ? (
        <div className="space-y-3">
          <p className="text-[15px]">Você será levado ao ambiente seguro do Mercado Pago para digitar os dados do cartão.</p>
          {p.checkoutUrl && (
            <Button size="lg" onClick={() => (window.location.href = p.checkoutUrl)}>
              Pagar com cartão
            </Button>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        {p?.status === 'pending' && (
          <Button variant="secondary" onClick={refresh} loading={busy === 'refresh'}>
            <FiRefreshCw /> Já paguei, verificar
          </Button>
        )}
        <div className="flex items-center gap-2">
          <label htmlFor="trocar-metodo" className="text-sm text-muted">
            Pagar com
          </label>
          <select id="trocar-metodo" value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 rounded-md border border-line px-2 text-sm">
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={retry} loading={busy === 'retry'}>
            Gerar nova cobrança
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Order({ id }) {
  const { store } = useSettings();
  useDocumentTitle(`Pedido #${id}`, store.name);
  const { data, loading, error, setData } = useFetch(`/orders/${id}`);
  const [params] = useSearchParams();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const toast = useToast();
  const order = data?.order;

  // ao voltar do Mercado Pago, consulta o status automaticamente
  useEffect(() => {
    if (params.get('payment_id') || params.get('collection_id')) {
      api.post(`/orders/${id}/payment/refresh`).then((r) => setData({ order: r.order })).catch(() => {});
    }
  }, [id, params, setData]);

  if (loading) return <PageLoader />;
  if (error || !order) {
    return (
      <Container>
        <EmptyState title="Pedido não encontrado" action={<Button to="/conta/pedidos">Ver meus pedidos</Button>}>
          {error?.message}
        </EmptyState>
      </Container>
    );
  }

  const cancel = async () => {
    setCancelling(true);
    try {
      const r = await api.post(`/orders/${order.id}/cancel`);
      setData({ order: r.order });
      toast('Pedido cancelado.');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  const steps = ['aguardando_pagamento', 'pago', 'em_separacao', 'enviado', 'entregue'];
  const reached = steps.indexOf(order.status);

  return (
    <Container className="pb-20 pt-6">
      <Breadcrumbs items={[{ to: '/conta', label: 'Minha conta' }, { to: '/conta/pedidos', label: 'Pedidos' }, { label: `#${order.id}` }]} />
      {params.get('novo') && (
        <div className="mt-6 rounded-lg bg-brand px-6 py-6 text-brand-ink">
          <p className="display text-3xl uppercase">Pedido recebido</p>
          <p className="mt-1 opacity-85">Enviamos a confirmação para {order.customer?.email}. Conclua o pagamento abaixo.</p>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display-soft text-3xl">Pedido #{order.id}</h1>
          <p className="text-sm text-muted">Feito em {dateTime(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {order.status !== 'cancelado' && (
        <ol className="mt-8 grid grid-cols-5 gap-2" aria-label="Andamento do pedido">
          {steps.map((s, i) => (
            <li key={s} className="text-center">
              <div className={cx('h-1.5 rounded-full', i <= reached ? 'bg-brand' : 'bg-line')} />
              <p className={cx('mt-2 text-[12px] sm:text-[13px]', i <= reached ? 'font-semibold text-ink' : 'text-muted')}>{ORDER_STATUS[s].label}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <PaymentPanel order={order} onUpdate={(o) => setData({ order: o })} />
          {order.trackingCode && (
            <Alert tone="info">
              Código de rastreio: <b className="font-mono">{order.trackingCode}</b>{' '}
              <a className="underline" href={`https://rastreamento.correios.com.br/app/index.php?objetos=${order.trackingCode}`} target="_blank" rel="noreferrer noopener">
                Rastrear
              </a>
            </Alert>
          )}
          <section>
            <h2 className="mb-3 text-lg font-bold">Itens</h2>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {order.items.map((it) => (
                <li key={it.id} className="flex gap-4 p-4">
                  <ProductImage src={it.image} alt="" className="h-20 w-16 shrink-0 rounded" />
                  <div className="min-w-0 flex-1">
                    {it.productId ? (
                      <Link to={`/produto/${it.slug}`} className="font-medium hover:underline">
                        {it.name}
                      </Link>
                    ) : (
                      <p className="font-medium">{it.name}</p>
                    )}
                    <p className="text-sm text-muted">
                      {it.color} · Tam. {it.size} · {it.quantity}x {brl(it.unitPriceCents)}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{brl(it.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 text-lg font-bold">Histórico</h2>
            <ol className="space-y-3 border-l-2 border-line pl-5">
              {order.history.map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[27px] top-1.5 size-3 rounded-full bg-brand ring-4 ring-paper" />
                  <p className="font-medium">{h.label}</p>
                  <p className="text-sm text-muted">
                    {dateTime(h.createdAt)}
                    {h.note && ` · ${h.note}`}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="h-fit space-y-5 rounded-lg bg-cloth p-6">
          <div>
            <h2 className="mb-2 font-bold">Entrega</h2>
            <p className="text-sm">{order.shippingAddress.recipient}</p>
            <p className="text-sm text-muted">{addressLine(order.shippingAddress)}</p>
            <p className="mt-2 text-sm">
              {order.shippingLabel} · {order.shippingDays}
            </p>
          </div>
          <dl className="space-y-2 border-t border-line pt-4 text-[15px]">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{brl(order.subtotalCents)}</dd>
            </div>
            {order.discountCents > 0 && (
              <div className="flex justify-between text-ok">
                <dt>Desconto {order.couponCode && `(${order.couponCode})`}</dt>
                <dd className="tabular-nums">−{brl(order.discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Frete</dt>
              <dd className="tabular-nums">{order.shippingCents ? brl(order.shippingCents) : 'Grátis'}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-lg font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{brl(order.totalCents)}</dd>
            </div>
          </dl>
          {order.status === 'aguardando_pagamento' && (
            <Button variant="secondary" className="w-full" onClick={() => setConfirmCancel(true)}>
              Cancelar pedido
            </Button>
          )}
        </aside>
      </div>
      <ConfirmModal open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={cancel} loading={cancelling} title="Cancelar pedido?" confirmLabel="Cancelar pedido">
        Os produtos voltam para o estoque e a cobrança em aberto é cancelada. Essa ação não pode ser desfeita.
      </ConfirmModal>
    </Container>
  );
}
