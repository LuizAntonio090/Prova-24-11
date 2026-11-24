const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const brl = (cents) => currency.format((cents || 0) / 100);

/** Parcelamento ilustrativo no cartão (parcela mínima de R$ 30, até 10x). */
export function installments(cents) {
  const n = Math.min(10, Math.floor(cents / 3000));
  return n >= 2 ? `ou em até ${n}x de ${brl(Math.ceil(cents / n))} no cartão` : null;
}

export const date = (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : '');
export const dateTime = (v) =>
  v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export const digits = (v) => String(v || '').replace(/\D/g, '');

export function maskCpf(v) {
  const d = digits(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
export function maskPhone(v) {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export function maskCep(v) {
  const d = digits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export const ORDER_STATUS = {
  aguardando_pagamento: { label: 'Aguardando pagamento', tone: 'warn' },
  pago: { label: 'Pagamento aprovado', tone: 'ok' },
  em_separacao: { label: 'Em separação', tone: 'brand' },
  enviado: { label: 'Enviado', tone: 'brand' },
  entregue: { label: 'Entregue', tone: 'ok' },
  cancelado: { label: 'Cancelado', tone: 'muted' },
};

export const PAYMENT_METHODS = {
  pix: 'PIX',
  card: 'Cartão de crédito',
  boleto: 'Boleto bancário',
};

export const PAYMENT_STATUS = {
  not_configured: 'Gateway não configurado',
  error: 'Falha ao gerar cobrança',
  pending: 'Aguardando pagamento',
  approved: 'Aprovado',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

export function addressLine(a) {
  if (!a) return '';
  return `${a.street}, ${a.number}${a.complement ? ` — ${a.complement}` : ''}, ${a.district}, ${a.city}/${a.state}, CEP ${maskCep(a.cep)}`;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
