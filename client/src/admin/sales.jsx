import { useState } from 'react';
import { FiDownload, FiPlus } from 'react-icons/fi';
import { ProductImage } from '../components/product.jsx';
import { Alert, Badge, Button, Checkbox, ConfirmModal, Input, Modal, PageLoader, Pagination, Select, Textarea } from '../components/ui.jsx';
import { useToast } from '../context/toast.jsx';
import { api } from '../lib/api.js';
import { ORDER_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, addressLine, brl, date, dateTime, maskCpf, maskPhone } from '../lib/format.js';
import { useDebounced, useFetch, useForm } from '../lib/hooks.js';
import { Link, useNavigate } from '../lib/router.jsx';
import { StatusBadge } from '../pages/Order.jsx';
import { BarChart, Card, FilterTabs, Kpi, PageHeader, SearchInput, Table } from './AdminApp.jsx';

const shortDay = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const brlShort = (c) => (c >= 100000 ? `R$ ${(c / 100000).toFixed(1).replace('.', ',')} mil` : brl(c));

// ---------------- Visão geral ----------------
export function Dashboard() {
  const { data, loading } = useFetch('/admin/dashboard');
  if (loading || !data) return <PageLoader />;
  const delta = data.revenuePrevMonthCents ? Math.round(((data.revenueMonthCents - data.revenuePrevMonthCents) / data.revenuePrevMonthCents) * 100) : null;
  return (
    <>
      <PageHeader title="Visão geral" description="Vendas consideram pedidos com pagamento aprovado." />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Receita no mês" value={brl(data.revenueMonthCents)} note={delta === null ? 'Sem vendas no mês anterior' : `${delta >= 0 ? '+' : ''}${delta}% em relação ao mês anterior`} />
        <Kpi label="Pedidos pagos no mês" value={data.ordersMonth} note={`Hoje: ${data.ordersToday} · ${brl(data.revenueTodayCents)}`} />
        <Kpi label="Ticket médio" value={brl(data.avgTicketCents)} />
        <Kpi label="Clientes" value={data.customersTotal} note={`${data.customersMonth} novos neste mês`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Link to="/admin/pedidos?status=aguardando_pagamento" className="rounded-lg border border-line bg-paper p-5 hover:border-ink/30">
          <p className="text-[13px] text-muted">Aguardando pagamento</p>
          <p className="text-2xl font-bold">{data.awaitingPayment}</p>
        </Link>
        <Link to="/admin/pedidos?status=pago" className="rounded-lg border border-line bg-paper p-5 hover:border-ink/30">
          <p className="text-[13px] text-muted">Para separar e enviar</p>
          <p className="text-2xl font-bold">{data.toShip}</p>
        </Link>
        <Link to="/admin/estoque?baixo=1" className="rounded-lg border border-line bg-paper p-5 hover:border-ink/30">
          <p className="text-[13px] text-muted">Variações com estoque baixo (até 3)</p>
          <p className="text-2xl font-bold">{data.lowStock.length}{data.lowStock.length === 8 ? '+' : ''}</p>
        </Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Receita dos últimos 14 dias">
          <BarChart label="Receita diária" data={data.daily.map((d) => ({ label: d.day, short: shortDay(d.day), value: d.revenue }))} format={brlShort} />
        </Card>
        <Card title="Mais vendidos (30 dias)">
          {data.topProducts.length ? (
            <ol className="space-y-3">
              {data.topProducts.map((p, i) => (
                <li key={p.name} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-muted">{i + 1}.</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-muted">{p.qty} un.</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Nenhuma venda aprovada nos últimos 30 dias.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Pedidos recentes" actions={<Link to="/admin/pedidos" className="text-sm font-semibold text-brand">Ver todos</Link>}>
          {data.recentOrders.length ? (
            <ul className="divide-y divide-line">
              {data.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link to={`/admin/pedidos/${o.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-brand">
                    <span className="w-14 font-semibold">#{o.id}</span>
                    <span className="flex-1 truncate">{o.customer?.name}</span>
                    <StatusBadge status={o.status} />
                    <span className="w-24 text-right tabular-nums">{brl(o.totalCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Os pedidos aparecem aqui assim que forem feitos.</p>
          )}
        </Card>
        <Card title="Estoque baixo" actions={<Link to="/admin/estoque?baixo=1" className="text-sm font-semibold text-brand">Repor</Link>}>
          {data.lowStock.length ? (
            <ul className="space-y-2 text-sm">
              {data.lowStock.map((v) => (
                <li key={v.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {v.name} <span className="text-muted">· {v.color} · {v.size}</span>
                  </span>
                  <Badge tone={v.stock === 0 ? 'sale' : 'warn'}>{v.stock}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nenhuma variação com estoque baixo.</p>
          )}
        </Card>
      </div>
    </>
  );
}

// ---------------- Pedidos ----------------
export function Orders() {
  const params = new URLSearchParams(window.location.search);
  const [status, setStatus] = useState(params.get('status') || '');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const navigate = useNavigate();
  const { data, loading } = useFetch(`/admin/orders?status=${status}&q=${encodeURIComponent(dq)}&pagina=${page}`);
  return (
    <>
      <PageHeader title="Pedidos" actions={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Buscar nº, cliente ou e-mail" />} />
      <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['', 'Todos'], ...Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label])]} />
      {loading && !data ? (
        <PageLoader />
      ) : (
        <>
          <Table
            onRowClick={(o) => navigate(`/admin/pedidos/${o.id}`)}
            rows={data?.items || []}
            empty="Nenhum pedido encontrado."
            columns={[
              { key: 'id', label: 'Pedido', render: (o) => <b>#{o.id}</b> },
              { key: 'date', label: 'Data', render: (o) => dateTime(o.createdAt) },
              { key: 'customer', label: 'Cliente', render: (o) => <><p>{o.customer?.name}</p><p className="text-[13px] text-muted">{o.customer?.email}</p></> },
              { key: 'pay', label: 'Pagamento', render: (o) => PAYMENT_METHODS[o.paymentMethod] },
              { key: 'status', label: 'Status', render: (o) => <StatusBadge status={o.status} /> },
              { key: 'total', label: 'Total', align: 'right', render: (o) => brl(o.totalCents) },
            ]}
          />
          <Pagination page={data?.page || 1} pages={data?.pages || 1} onChange={setPage} />
        </>
      )}
    </>
  );
}

const NEXT_STATUS = ['aguardando_pagamento', 'pago', 'em_separacao', 'enviado', 'entregue', 'cancelado'];

export function OrderDetail({ id }) {
  const toast = useToast();
  const { data, loading, setData } = useFetch(`/admin/orders/${id}`);
  const order = data?.order;
  const f = useForm({ status: '', trackingCode: '', note: '' });
  const [confirm, setConfirm] = useState(false);
  if (loading || !order) return <PageLoader />;

  const current = NEXT_STATUS.indexOf(order.status);
  const options = order.status === 'cancelado' ? [] : NEXT_STATUS.filter((s, i) => s === 'cancelado' ? !['enviado', 'entregue'].includes(order.status) : i > current);

  const save = f.submit(async (v) => {
    const r = await api.patch(`/admin/orders/${id}/status`, { status: v.status, trackingCode: v.trackingCode || null, note: v.note });
    setData({ order: r.order });
    f.setValues({ status: '', trackingCode: '', note: '' });
    setConfirm(false);
    toast(`Pedido atualizado: ${ORDER_STATUS[r.order.status].label}.`);
  });

  return (
    <>
      <PageHeader
        title={`Pedido #${order.id}`}
        description={`Feito em ${dateTime(order.createdAt)}`}
        actions={<StatusBadge status={order.status} />}
      />
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card title="Itens">
            <ul className="divide-y divide-line">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3">
                  <ProductImage src={it.image} alt="" className="h-16 w-13 shrink-0 rounded" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{it.name}</p>
                    <p className="text-muted">{it.color} · Tam. {it.size} · {it.quantity}x {brl(it.unitPriceCents)}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{brl(it.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{brl(order.subtotalCents)}</dd></div>
              {order.discountCents > 0 && <div className="flex justify-between text-ok"><dt>Desconto ({order.couponCode})</dt><dd>−{brl(order.discountCents)}</dd></div>}
              <div className="flex justify-between"><dt>Frete ({order.shippingLabel})</dt><dd>{order.shippingCents ? brl(order.shippingCents) : 'Grátis'}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{brl(order.totalCents)}</dd></div>
            </dl>
          </Card>
          <Card title="Histórico">
            <ol className="space-y-2 text-sm">
              {order.history.map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-36 shrink-0 text-muted">{dateTime(h.createdAt)}</span>
                  <span><b>{h.label}</b>{h.note && <span className="text-muted"> · {h.note}</span>}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Atualizar status">
            {options.length === 0 ? (
              <p className="text-sm text-muted">{order.status === 'cancelado' ? 'Pedido cancelado: não há mais etapas.' : 'Pedido concluído.'}</p>
            ) : (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (f.values.status === 'cancelado') setConfirm(true); else save(); }}>
                {f.formError && <Alert>{f.formError}</Alert>}
                <Select label="Novo status" {...f.bind('status')}>
                  <option value="">Escolha…</option>
                  {options.map((s) => <option key={s} value={s}>{ORDER_STATUS[s].label}</option>)}
                </Select>
                {f.values.status === 'pago' && <Alert tone="warn">Use apenas se o pagamento foi confirmado fora do gateway (ex.: transferência conferida no extrato).</Alert>}
                {f.values.status === 'enviado' && <Input label="Código de rastreio" {...f.bind('trackingCode')} />}
                <Textarea label="Observação" optional rows={2} {...f.bind('note')} />
                <Button type="submit" disabled={!f.values.status} loading={f.submitting}>Salvar status</Button>
              </form>
            )}
          </Card>
          <Card title="Cliente">
            <p className="font-medium">{order.customer?.name}</p>
            <p className="text-sm text-muted">{order.customer?.email}</p>
            {order.customer?.phone && <p className="text-sm text-muted">{maskPhone(order.customer.phone)}</p>}
          </Card>
          <Card title="Entrega">
            <p className="text-sm">{order.shippingAddress.recipient}</p>
            <p className="text-sm text-muted">{addressLine(order.shippingAddress)}</p>
            <p className="mt-2 text-sm">{order.shippingLabel} · {order.shippingDays}</p>
            {order.trackingCode && <p className="mt-1 text-sm">Rastreio: <b className="font-mono">{order.trackingCode}</b></p>}
          </Card>
          <Card title="Pagamento">
            <p className="text-sm">{PAYMENT_METHODS[order.paymentMethod]}</p>
            {order.payment ? (
              <>
                <p className="text-sm text-muted">Situação no gateway: {PAYMENT_STATUS[order.payment.status]}</p>
                {order.payment.providerPaymentId && <p className="text-sm text-muted">ID Mercado Pago: {order.payment.providerPaymentId}</p>}
                {order.payment.errorMessage && <p className="mt-1 text-sm text-sale">{order.payment.errorMessage}</p>}
              </>
            ) : <p className="text-sm text-muted">Nenhuma cobrança gerada.</p>}
            {order.paidAt && <p className="mt-1 text-sm text-ok">Pago em {dateTime(order.paidAt)}</p>}
          </Card>
        </div>
      </div>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} onConfirm={save} loading={f.submitting} title="Cancelar este pedido?" confirmLabel="Cancelar pedido">
        Os produtos voltam para o estoque e o cliente é avisado por e-mail. Se já houve pagamento, faça o estorno no painel do Mercado Pago.
      </ConfirmModal>
    </>
  );
}

// ---------------- Clientes ----------------
export function Customers() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const dq = useDebounced(q);
  const { data, loading } = useFetch(`/admin/customers?q=${encodeURIComponent(dq)}&pagina=${page}`);
  const detail = useFetch(selected ? `/admin/customers/${selected}` : null);
  return (
    <>
      <PageHeader title="Clientes" description={data ? `${data.total} clientes cadastrados` : ''} actions={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Buscar nome, e-mail ou telefone" />} />
      {loading && !data ? <PageLoader /> : (
        <>
          <Table
            rows={data?.items || []}
            onRowClick={(c) => setSelected(c.id)}
            empty="Nenhum cliente encontrado."
            columns={[
              { key: 'name', label: 'Cliente', render: (c) => <><p className="font-medium">{c.name}</p><p className="text-[13px] text-muted">{c.email}</p></> },
              { key: 'phone', label: 'Telefone', render: (c) => maskPhone(c.phone) },
              { key: 'verified', label: 'E-mail', render: (c) => c.emailVerified ? <Badge tone="ok">Confirmado</Badge> : <Badge tone="warn">Pendente</Badge> },
              { key: 'since', label: 'Desde', render: (c) => date(c.createdAt) },
              { key: 'orders', label: 'Pedidos', align: 'right', render: (c) => c.orders },
              { key: 'spent', label: 'Total pago', align: 'right', render: (c) => brl(c.spentCents) },
            ]}
          />
          <Pagination page={data?.page || 1} pages={data?.pages || 1} onChange={setPage} />
        </>
      )}
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={detail.data?.customer.name || 'Cliente'} size="lg">
        {!detail.data ? <PageLoader /> : (
          <div className="space-y-6 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p><span className="text-muted">E-mail:</span> {detail.data.customer.email}</p>
              <p><span className="text-muted">Telefone:</span> {maskPhone(detail.data.customer.phone)}</p>
              <p><span className="text-muted">CPF:</span> {detail.data.customer.cpf ? maskCpf(detail.data.customer.cpf) : '—'}</p>
              <p><span className="text-muted">Cliente desde:</span> {date(detail.data.customer.createdAt)}</p>
            </div>
            <div>
              <h3 className="mb-2 font-bold">Endereços</h3>
              {detail.data.addresses.length ? detail.data.addresses.map((a) => <p key={a.id} className="text-muted"><b className="text-ink">{a.label}:</b> {a.line}</p>) : <p className="text-muted">Nenhum endereço.</p>}
            </div>
            <div>
              <h3 className="mb-2 font-bold">Pedidos</h3>
              {detail.data.orders.length ? (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {detail.data.orders.map((o) => (
                    <li key={o.id}><Link to={`/admin/pedidos/${o.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-cloth"><b>#{o.id}</b><span className="flex-1 text-muted">{date(o.createdAt)}</span><StatusBadge status={o.status} /><span className="w-24 text-right">{brl(o.totalCents)}</span></Link></li>
                  ))}
                </ul>
              ) : <p className="text-muted">Nenhum pedido.</p>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ---------------- Cupons ----------------
const toLocalInput = (v) => (v ? new Date(new Date(v).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

function CouponForm({ coupon, onSaved, onClose }) {
  const f = useForm(coupon ? { ...coupon, maxUses: coupon.maxUses ?? '', startsAt: toLocalInput(coupon.startsAt), endsAt: toLocalInput(coupon.endsAt) } : { code: '', description: '', discountType: 'percent', value: '', minOrder: 0, maxUses: '', startsAt: '', endsAt: '', active: true });
  const save = f.submit(async (v) => {
    const body = { ...v, maxUses: v.maxUses === '' ? null : v.maxUses, startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : null, endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null };
    if (coupon) await api.put(`/admin/coupons/${coupon.id}`, body);
    else await api.post('/admin/coupons', body);
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={coupon ? `Editar ${coupon.code}` : 'Novo cupom'} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={f.submitting}>Salvar cupom</Button></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {f.formError && !Object.keys(f.errors).length && <Alert className="sm:col-span-2">{f.formError}</Alert>}
        <Input label="Código" {...f.bind('code', (v) => v.toUpperCase())} placeholder="EX: VERAO15" />
        <Select label="Tipo de desconto" {...f.bind('discountType')}>
          <option value="percent">Percentual (%)</option>
          <option value="fixed">Valor fixo (R$)</option>
        </Select>
        <Input label={f.values.discountType === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'} type="number" step="0.01" min="0" {...f.bind('value')} />
        <Input label="Pedido mínimo (R$)" type="number" step="0.01" min="0" {...f.bind('minOrder')} />
        <Input label="Limite de usos" optional type="number" min="1" {...f.bind('maxUses')} hint="Em branco = ilimitado" />
        <Input label="Descrição" optional {...f.bind('description')} />
        <Input label="Começa em" optional type="datetime-local" {...f.bind('startsAt')} />
        <Input label="Termina em" optional type="datetime-local" {...f.bind('endsAt')} />
        <Checkbox className="sm:col-span-2" label="Cupom ativo" checked={f.values.active} onChange={(e) => f.set('active', e.target.checked)} />
      </form>
    </Modal>
  );
}

export function Coupons() {
  const toast = useToast();
  const { data, loading, reload } = useFetch('/admin/coupons');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const now = Date.now();
  return (
    <>
      <PageHeader title="Cupons de desconto" actions={<Button onClick={() => setEditing({})}><FiPlus /> Novo cupom</Button>} />
      {loading && !data ? <PageLoader /> : (
        <Table
          rows={data?.items || []}
          onRowClick={(c) => setEditing(c)}
          empty="Nenhum cupom criado."
          columns={[
            { key: 'code', label: 'Código', render: (c) => <><b className="font-mono">{c.code}</b><p className="text-[13px] text-muted">{c.description}</p></> },
            { key: 'value', label: 'Desconto', render: (c) => (c.discountType === 'percent' ? `${c.value}%` : brl(c.value * 100)) },
            { key: 'min', label: 'Mínimo', render: (c) => (c.minOrder ? brl(c.minOrder * 100) : '—') },
            { key: 'uses', label: 'Usos', render: (c) => `${c.usedCount}${c.maxUses ? ` / ${c.maxUses}` : ''}` },
            { key: 'period', label: 'Validade', render: (c) => (c.endsAt ? `até ${date(c.endsAt)}` : 'Sem prazo') },
            { key: 'status', label: 'Situação', render: (c) => (!c.active ? <Badge>Inativo</Badge> : c.endsAt && new Date(c.endsAt) < now ? <Badge tone="warn">Expirado</Badge> : <Badge tone="ok">Ativo</Badge>) },
            { key: 'x', label: '', align: 'right', render: (c) => <button type="button" className="text-sm font-semibold text-sale" onClick={(e) => { e.stopPropagation(); setRemoving(c); }}>Excluir</button> },
          ]}
        />
      )}
      {editing && <CouponForm coupon={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Cupom salvo.'); }} />}
      <ConfirmModal open={Boolean(removing)} onClose={() => setRemoving(null)} title={`Excluir o cupom ${removing?.code}?`} confirmLabel="Excluir"
        onConfirm={async () => { try { await api.del(`/admin/coupons/${removing.id}`); toast('Cupom excluído.'); reload(); } catch (err) { toast(err.message, { tone: 'error' }); } setRemoving(null); }}>
        Pedidos que já usaram o cupom continuam registrados com o desconto aplicado.
      </ConfirmModal>
    </>
  );
}

// ---------------- Relatórios ----------------
function toCsv(rows) {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
}

export function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const { data, loading } = useFetch(`/admin/reports?de=${from}&ate=${to}`);

  const exportCsv = () => {
    const rows = [['Dia', 'Pedidos', 'Receita (R$)'], ...data.daily.map((d) => [d.day, d.orders, (d.revenue / 100).toFixed(2).replace('.', ',')]), [], ['Produto', 'Quantidade', 'Receita (R$)'], ...data.byProduct.map((p) => [p.name, p.qty, (p.revenue / 100).toFixed(2).replace('.', ',')])];
    const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-vendas-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        title="Relatórios de vendas"
        description="Pedidos com pagamento aprovado no período."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Input label="De" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <Input label="Até" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            <Button variant="secondary" onClick={exportCsv} disabled={!data}><FiDownload /> Exportar CSV</Button>
          </div>
        }
      />
      {loading || !data ? <PageLoader /> : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
            <Kpi label="Receita" value={brl(data.revenueCents)} />
            <Kpi label="Pedidos pagos" value={data.orders} />
            <Kpi label="Ticket médio" value={brl(data.avgTicketCents)} />
            <Kpi label="Descontos concedidos" value={brl(data.discountsCents)} />
            <Kpi label="Pedidos cancelados" value={data.cancelledOrders} />
          </div>
          <Card title="Receita por dia" className="mt-4">
            <BarChart label="Receita por dia" data={data.daily.map((d) => ({ label: d.day, short: shortDay(d.day), value: d.revenue }))} format={brlShort} height={220} />
          </Card>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Por categoria">
              <Breakdown rows={data.byCategory.map((c) => ({ label: c.name, value: c.revenue, note: `${c.qty} un.` }))} />
            </Card>
            <Card title="Por forma de pagamento">
              <Breakdown rows={data.byPayment.map((p) => ({ label: PAYMENT_METHODS[p.method], value: p.revenue, note: `${p.orders} pedidos` }))} />
            </Card>
          </div>
          <div className="mt-4">
            <Table
              rows={data.byProduct.map((p, i) => ({ ...p, id: i }))}
              empty="Sem vendas no período."
              columns={[
                { key: 'name', label: 'Produto' },
                { key: 'qty', label: 'Quantidade', align: 'right' },
                { key: 'revenue', label: 'Receita', align: 'right', render: (p) => brl(p.revenue) },
              ]}
            />
          </div>
        </>
      )}
    </>
  );
}

function Breakdown({ rows }) {
  if (!rows.length) return <p className="text-sm text-muted">Sem vendas no período.</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-2"><span>{r.label} <span className="text-muted">· {r.note}</span></span><b className="tabular-nums">{brl(r.value)}</b></div>
          <div className="mt-1 h-2 rounded-full bg-cloth"><div className="h-full rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

// ---------------- Newsletter ----------------
export function Newsletter() {
  const { data, loading } = useFetch('/admin/newsletter');
  const exportCsv = () => {
    const blob = new Blob(['﻿' + toCsv([['E-mail', 'Data'], ...data.items.map((i) => [i.email, date(i.createdAt)])])], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'newsletter.csv';
    a.click();
  };
  return (
    <>
      <PageHeader title="Newsletter" description="E-mails cadastrados no rodapé da loja." actions={<Button variant="secondary" onClick={exportCsv} disabled={!data?.items.length}><FiDownload /> Exportar CSV</Button>} />
      {loading ? <PageLoader /> : (
        <Table rows={data.items.map((i) => ({ ...i, id: i.email }))} empty="Ninguém se cadastrou ainda." columns={[{ key: 'email', label: 'E-mail' }, { key: 'createdAt', label: 'Cadastro', render: (i) => dateTime(i.createdAt) }]} />
      )}
    </>
  );
}
