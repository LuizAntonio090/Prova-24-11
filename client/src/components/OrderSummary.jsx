import { useEffect, useState } from 'react';
import { FiTag, FiX } from 'react-icons/fi';
import { useCart } from '../context/cart.jsx';
import { brl, maskCep } from '../lib/format.js';
import { Button, cx } from './ui.jsx';

export function CouponField() {
  const cart = useCart();
  const [code, setCode] = useState(cart.couponCode);
  useEffect(() => setCode(cart.couponCode), [cart.couponCode]);
  const q = cart.quote;
  const applied = q?.coupon;

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-md bg-ok/10 px-3 py-2.5 text-sm text-ok">
        <span className="flex items-center gap-2">
          <FiTag /> Cupom <b>{applied.code}</b> aplicado
        </span>
        <button type="button" onClick={() => cart.setCouponCode('')} className="p-1" aria-label="Remover cupom">
          <FiX />
        </button>
      </div>
    );
  }
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          cart.setCouponCode(code.trim().toUpperCase());
        }}
      >
        <label htmlFor="cupom" className="sr-only">
          Cupom de desconto
        </label>
        <input
          id="cupom"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Cupom de desconto"
          className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-[15px] uppercase placeholder:normal-case focus:border-brand focus:outline-none"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-10" disabled={!code.trim()}>
          Aplicar
        </Button>
      </form>
      {cart.couponCode && q?.couponError && <p className="mt-1.5 text-[13px] text-sale">{q.couponError}</p>}
    </div>
  );
}

export function ShippingPicker({ cepEditable = true }) {
  const cart = useCart();
  const [cep, setCep] = useState(maskCep(cart.cep));
  useEffect(() => setCep(maskCep(cart.cep)), [cart.cep]);
  const options = cart.quote?.shippingOptions || [];
  return (
    <div className="space-y-3">
      {cepEditable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            cart.setCep(cep.replace(/\D/g, ''));
          }}
        >
          <label htmlFor="cep-carrinho" className="sr-only">
            CEP
          </label>
          <input
            id="cep-carrinho"
            value={cep}
            inputMode="numeric"
            onChange={(e) => setCep(maskCep(e.target.value))}
            placeholder="CEP para calcular o frete"
            className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-[15px] focus:border-brand focus:outline-none"
          />
          <Button type="submit" variant="secondary" size="sm" className="h-10">
            Calcular
          </Button>
        </form>
      )}
      {options.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="sr-only">Forma de entrega</legend>
          {options.map((o) => (
            <label key={o.id} className={cx('flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm', cart.shippingMethod === o.id ? 'border-brand bg-brand/5' : 'border-line')}>
              <input type="radio" name="entrega" className="accent-[var(--color-brand)]" checked={cart.shippingMethod === o.id} onChange={() => cart.setShippingMethod(o.id)} />
              <span className="flex-1">
                <b>{o.label}</b>
                <span className="block text-[13px] text-muted">{o.days}</span>
              </span>
              <span className={cx('font-semibold tabular-nums', o.priceCents === 0 && 'text-ok')}>{o.priceCents === 0 ? 'Grátis' : brl(o.priceCents)}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

export function Totals({ quote }) {
  if (!quote) return null;
  const row = 'flex justify-between text-[15px]';
  return (
    <dl className="space-y-2">
      <div className={row}>
        <dt>Subtotal ({quote.itemCount} {quote.itemCount === 1 ? 'item' : 'itens'})</dt>
        <dd className="tabular-nums">{brl(quote.subtotalCents)}</dd>
      </div>
      {quote.discountCents > 0 && (
        <div className={cx(row, 'text-ok')}>
          <dt>Desconto{quote.coupon ? ` (${quote.coupon.code})` : ''}</dt>
          <dd className="tabular-nums">−{brl(quote.discountCents)}</dd>
        </div>
      )}
      <div className={row}>
        <dt>Frete</dt>
        <dd className="tabular-nums">{quote.shipping ? (quote.shipping.priceCents === 0 ? 'Grátis' : brl(quote.shipping.priceCents)) : <span className="text-muted">a calcular</span>}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-3 text-lg font-bold">
        <dt>Total</dt>
        <dd className="tabular-nums">{brl(quote.totalCents)}</dd>
      </div>
    </dl>
  );
}
