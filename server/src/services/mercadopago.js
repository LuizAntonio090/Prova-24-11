import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../lib/http.js';
import { safeEqual } from '../lib/security.js';

/**
 * Integração com o Mercado Pago (PIX, boleto e cartão via Checkout Pro).
 * Use credenciais de TESTE (prefixo TEST-) até a loja ir ao ar.
 * Docs: https://www.mercadopago.com.br/developers/pt/reference
 */
const API = 'https://api.mercadopago.com';

export const isConfigured = () => Boolean(config.mercadoPago.accessToken);
export const isTestMode = () => config.mercadoPago.accessToken.startsWith('TEST-');

async function mp(path, { method = 'GET', body, idempotencyKey } = {}) {
  if (!isConfigured()) throw new HttpError(503, 'Gateway de pagamento não configurado.');
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${config.mercadoPago.accessToken}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.cause?.[0]?.description || data?.message || `HTTP ${res.status}`;
    const err = new HttpError(502, `O Mercado Pago recusou a solicitação: ${detail}`);
    err.gateway = data;
    throw err;
  }
  return data;
}

const notificationUrl = () =>
  config.publicApiUrl.startsWith('https://') ? `${config.publicApiUrl}/api/payments/webhook/mercadopago` : undefined;

function payer(user, address) {
  const [first, ...rest] = user.name.trim().split(/\s+/);
  const p = { email: user.email, first_name: first, last_name: rest.join(' ') || first };
  if (user.cpf) p.identification = { type: 'CPF', number: user.cpf };
  if (address) {
    p.address = {
      zip_code: address.cep,
      street_name: address.street,
      street_number: address.number,
      neighborhood: address.district,
      city: address.city,
      federal_unit: address.state,
    };
  }
  return p;
}

const amount = (cents) => Math.round(cents) / 100;

export async function createPix(order, user) {
  const data = await mp('/v1/payments', {
    method: 'POST',
    idempotencyKey: `order-${order.id}-pix-${Date.now()}`,
    body: {
      transaction_amount: amount(order.total_cents),
      description: `Pedido #${order.id}`,
      payment_method_id: 'pix',
      external_reference: String(order.id),
      notification_url: notificationUrl(),
      date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      payer: payer(user),
    },
  });
  const tx = data.point_of_interaction?.transaction_data || {};
  return {
    providerPaymentId: String(data.id),
    status: mapStatus(data.status),
    pixQrCode: tx.qr_code || null,
    pixQrBase64: tx.qr_code_base64 || null,
    ticketUrl: tx.ticket_url || null,
    expiresAt: data.date_of_expiration || null,
    raw: data,
  };
}

export async function createBoleto(order, user, address) {
  if (!user.cpf) throw new HttpError(422, 'Informe seu CPF para pagar com boleto.', { code: 'CPF_REQUIRED' });
  const data = await mp('/v1/payments', {
    method: 'POST',
    idempotencyKey: `order-${order.id}-boleto-${Date.now()}`,
    body: {
      transaction_amount: amount(order.total_cents),
      description: `Pedido #${order.id}`,
      payment_method_id: 'bolbradesco',
      external_reference: String(order.id),
      notification_url: notificationUrl(),
      payer: payer(user, address),
    },
  });
  return {
    providerPaymentId: String(data.id),
    status: mapStatus(data.status),
    ticketUrl: data.transaction_details?.external_resource_url || null,
    barcode: data.barcode?.content || null,
    expiresAt: data.date_of_expiration || null,
    raw: data,
  };
}

/** Cartão: Checkout Pro (o cliente digita o cartão no ambiente seguro do Mercado Pago). */
export async function createCardCheckout(order, user) {
  const back = `${config.appUrl}/pedido/${order.id}`;
  const data = await mp('/checkout/preferences', {
    method: 'POST',
    body: {
      items: [{ id: String(order.id), title: `Pedido #${order.id}`, quantity: 1, unit_price: amount(order.total_cents), currency_id: 'BRL' }],
      external_reference: String(order.id),
      payer: { email: user.email, name: user.name },
      back_urls: { success: back, failure: back, pending: back },
      auto_return: config.appUrl.startsWith('https://') ? 'approved' : undefined,
      notification_url: notificationUrl(),
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }, { id: 'atm' }],
        installments: 10,
      },
      statement_descriptor: 'LOJA',
    },
  });
  return {
    preferenceId: data.id,
    status: 'pending',
    checkoutUrl: isTestMode() ? data.sandbox_init_point || data.init_point : data.init_point,
    raw: { id: data.id },
  };
}

export const getPayment = (id) => mp(`/v1/payments/${encodeURIComponent(id)}`);

export async function findPaymentsByReference(orderId) {
  const data = await mp(`/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc`);
  return data.results || [];
}

export async function cancelPayment(id) {
  return mp(`/v1/payments/${encodeURIComponent(id)}`, { method: 'PUT', body: { status: 'cancelled' } });
}

export function mapStatus(s) {
  switch (s) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
    case 'charged_back':
      return 'refunded';
    default:
      return 'pending'; // pending, in_process, authorized, in_mediation
  }
}

/**
 * Valida a assinatura do webhook (cabeçalho x-signature).
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export function verifyWebhookSignature(req, dataId) {
  const secret = config.mercadoPago.webhookSecret;
  if (!secret) return !config.isProd; // em produção, exige o segredo configurado
  const header = String(req.get('x-signature') || '');
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : dataId;
  const manifest = `id:${id};request-id:${req.get('x-request-id') || ''};ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return safeEqual(expected, parts.v1);
}
