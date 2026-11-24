import { FiShoppingBag, FiTrash2 } from 'react-icons/fi';
import { CouponField, ShippingPicker, Totals } from '../components/OrderSummary.jsx';
import { ProductImage } from '../components/product.jsx';
import { Alert, Button, Container, EmptyState, QuantityStepper } from '../components/ui.jsx';
import { useCart } from '../context/cart.jsx';
import { useSettings } from '../context/settings.jsx';
import { brl } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { Link } from '../lib/router.jsx';

export default function Cart() {
  const { store } = useSettings();
  useDocumentTitle('Carrinho', store.name);
  const cart = useCart();
  const q = cart.quote;
  const lines = new Map((q?.lines || []).map((l) => [l.variantId, l]));

  if (!cart.items.length) {
    return (
      <Container>
        <EmptyState icon={FiShoppingBag} title="Seu carrinho está vazio" action={<Button to="/produtos">Ver produtos</Button>}>
          Explore as categorias e adicione as peças que quiser levar.
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container className="pb-20 pt-8">
      <h1 className="display mb-8 text-4xl uppercase">Carrinho</h1>
      <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          {q?.issues?.length > 0 && (
            <Alert tone="warn" className="mb-5">
              <ul className="space-y-1">
                {q.issues.map((i) => (
                  <li key={i.variantId}>{i.message}</li>
                ))}
              </ul>
              <button type="button" className="mt-2 font-semibold underline" onClick={() => cart.applyIssues(q.issues)}>
                Ajustar carrinho ao estoque
              </button>
            </Alert>
          )}
          <ul className="divide-y divide-line border-y border-line">
            {cart.items.map((item) => {
              const line = lines.get(item.variantId);
              const unit = line?.unitPriceCents ?? item.unitPriceCents;
              return (
                <li key={item.variantId} className="flex gap-4 py-5 sm:gap-6">
                  <Link to={`/produto/${item.slug}`} className="shrink-0">
                    <ProductImage src={item.image} alt={item.name} className="h-32 w-26 rounded-md sm:h-36 sm:w-28" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/produto/${item.slug}`} className="font-medium hover:underline">
                          {item.name}
                        </Link>
                        <p className="mt-0.5 text-sm text-muted">
                          Cor: {item.color} · Tamanho: {item.size}
                        </p>
                        <p className="mt-1 text-sm tabular-nums">
                          {brl(unit)}
                          {line && line.listPriceCents > unit && <span className="ml-2 text-muted line-through">{brl(line.listPriceCents)}</span>}
                        </p>
                      </div>
                      <p className="shrink-0 font-bold tabular-nums">{brl(unit * item.quantity)}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <QuantityStepper value={item.quantity} max={Math.min(10, line?.stock ?? 10)} onChange={(n) => cart.setQuantity(item.variantId, n)} />
                      <button type="button" onClick={() => cart.remove(item.variantId)} className="flex items-center gap-1.5 text-sm text-muted hover:text-sale">
                        <FiTrash2 /> Remover
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link to="/produtos" className="mt-5 inline-block text-sm font-semibold text-brand underline underline-offset-4">
            Continuar comprando
          </Link>
        </div>

        <aside className="h-fit space-y-5 rounded-lg bg-cloth p-6 lg:sticky lg:top-28">
          <h2 className="text-lg font-bold">Resumo</h2>
          <CouponField />
          <ShippingPicker />
          <Totals quote={q} />
          <Button size="lg" className="w-full" to="/checkout">
            Finalizar compra
          </Button>
          <p className="text-center text-[13px] text-muted">PIX, cartão de crédito ou boleto</p>
        </aside>
      </div>
    </Container>
  );
}
