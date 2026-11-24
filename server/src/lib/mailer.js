import { config } from '../config.js';

let transporter = null;

export const isEmailConfigured = () => Boolean(config.smtp.host);

/**
 * Envia um e-mail via SMTP (nodemailer). Sem SMTP configurado, registra
 * o conteúdo no console para que o desenvolvimento local continue possível.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    console.log(`\n[e-mail não enviado — SMTP não configurado]\nPara: ${to}\nAssunto: ${subject}\n${text}\n`);
    return { delivered: false };
  }
  if (!transporter) {
    const nodemailer = (await import('nodemailer')).default;
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
  return { delivered: true };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function layout(storeName, title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f2f3f5;font-family:Arial,sans-serif;color:#23252b">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:32px">
<tr><td style="font-size:22px;font-weight:bold;letter-spacing:1px;padding-bottom:24px">${esc(storeName)}</td></tr>
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:12px">${esc(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (url, label) =>
  `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#1f2a5c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${esc(label)}</a></p>
<p style="font-size:13px;color:#6b6f78">Se o botão não funcionar, copie este endereço: ${esc(url)}</p>`;

export const templates = {
  verifyEmail(storeName, name, url) {
    return {
      subject: `Confirme seu e-mail — ${storeName}`,
      text: `Olá, ${name}! Confirme seu e-mail acessando: ${url}`,
      html: layout(storeName, 'Confirme seu e-mail', `<p>Olá, ${esc(name)}! Para ativar sua conta e finalizar compras, confirme seu endereço de e-mail.</p>${button(url, 'Confirmar e-mail')}`),
    };
  },
  resetPassword(storeName, name, url) {
    return {
      subject: `Redefinição de senha — ${storeName}`,
      text: `Olá, ${name}! Para criar uma nova senha, acesse: ${url} (o link vale por 1 hora).`,
      html: layout(storeName, 'Redefinir senha', `<p>Olá, ${esc(name)}! Recebemos um pedido para redefinir sua senha. O link vale por 1 hora.</p>${button(url, 'Criar nova senha')}<p>Se não foi você, ignore este e-mail.</p>`),
    };
  },
  orderCreated(storeName, name, orderId, totalText, url) {
    return {
      subject: `Pedido #${orderId} recebido — ${storeName}`,
      text: `Olá, ${name}! Recebemos seu pedido #${orderId} no valor de ${totalText}. Acompanhe em: ${url}`,
      html: layout(storeName, `Pedido #${orderId} recebido`, `<p>Olá, ${esc(name)}! Recebemos seu pedido no valor de <b>${esc(totalText)}</b>. Assim que o pagamento for confirmado, começamos a separar seus produtos.</p>${button(url, 'Acompanhar pedido')}`),
    };
  },
  orderStatus(storeName, name, orderId, statusText, url) {
    return {
      subject: `Pedido #${orderId}: ${statusText} — ${storeName}`,
      text: `Olá, ${name}! Seu pedido #${orderId} agora está: ${statusText}. Detalhes: ${url}`,
      html: layout(storeName, `Pedido #${orderId}: ${statusText}`, `<p>Olá, ${esc(name)}! O status do seu pedido foi atualizado para <b>${esc(statusText)}</b>.</p>${button(url, 'Ver pedido')}`),
    };
  },
};
