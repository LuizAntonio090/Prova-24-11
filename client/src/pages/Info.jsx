import { Button, Container, EmptyState } from '../components/ui.jsx';
import { useSettings } from '../context/settings.jsx';
import { brl } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { Link } from '../lib/router.jsx';

/**
 * Páginas institucionais. Os textos são um ponto de partida:
 * revise-os com as regras reais da sua loja antes de publicar.
 */
function pages({ store, shipping }) {
  const free = shipping.freeShippingMinCents ? brl(shipping.freeShippingMinCents) : null;
  const c = store.contact || {};
  return {
    sobre: {
      title: 'Sobre a loja',
      body: [
        `A ${store.name} nasceu para vender roupas bem-feitas, confortáveis e fáceis de combinar, com preço justo e atendimento próximo.`,
        'Escolhemos tecidos que duram, modelagens que funcionam no dia a dia e fornecedores que tratam bem quem produz.',
      ],
    },
    trocas: {
      title: 'Trocas e devoluções',
      body: [
        'Você pode pedir a troca ou devolução em até 30 dias após o recebimento. A peça precisa estar sem uso, com etiqueta e na embalagem original.',
        'A primeira troca de cada pedido é gratuita: enviamos um código de postagem para você levar a peça a uma agência dos Correios.',
        'Pelo Código de Defesa do Consumidor, você pode desistir da compra em até 7 dias após o recebimento e receber o valor integral de volta, incluindo o frete.',
        `Para solicitar, fale com o atendimento${c.email ? ` pelo e-mail ${c.email}` : ''} informando o número do pedido.`,
      ],
    },
    entregas: {
      title: 'Prazos de entrega',
      body: [
        'O prazo começa a contar após a confirmação do pagamento. PIX e cartão costumam ser confirmados em minutos; o boleto leva até 3 dias úteis.',
        'Você vê o valor e o prazo exatos para o seu CEP na página do produto e no carrinho. Há duas opções: Econômica e Expressa.',
        free ? `Compras a partir de ${free} têm frete grátis na entrega Econômica.` : 'Enviamos para todo o Brasil.',
        'Assim que o pedido for enviado, você recebe o código de rastreio por e-mail e pode acompanhar em Minha conta.',
      ],
    },
    pagamentos: {
      title: 'Formas de pagamento',
      body: [
        'Aceitamos PIX, cartão de crédito e boleto bancário. Os pagamentos são processados pelo Mercado Pago, e os dados do cartão não passam pelos nossos servidores.',
        'No cartão de crédito, você pode parcelar conforme as condições exibidas no Mercado Pago.',
        'O pedido fica reservado enquanto aguarda o pagamento. Se precisar, você pode gerar uma nova cobrança na página do pedido.',
      ],
    },
    perguntas: {
      title: 'Perguntas frequentes',
      faq: [
        ['Como sei meu tamanho?', 'Cada produto informa a modelagem na descrição. Em caso de dúvida entre dois tamanhos, prefira o maior para peças de modelagem slim.'],
        ['Posso alterar o endereço depois de comprar?', 'Sim, enquanto o pedido ainda não foi enviado. Fale com o atendimento com o número do pedido.'],
        ['Meu pagamento não foi confirmado. E agora?', 'Na página do pedido, use “Já paguei, verificar”. PIX costuma ser confirmado em minutos; boleto, em até 3 dias úteis.'],
        ['Como cancelo um pedido?', 'Pedidos que ainda aguardam pagamento podem ser cancelados na própria página do pedido. Para pedidos pagos, fale com o atendimento.'],
        ['Preciso de cadastro para comprar?', 'Sim. O cadastro é rápido e permite acompanhar pedidos, salvar endereços e favoritos.'],
      ],
    },
    privacidade: {
      title: 'Política de privacidade',
      body: [
        'Coletamos apenas os dados necessários para processar seus pedidos: nome, e-mail, telefone, CPF (quando exigido para o pagamento) e endereço de entrega.',
        'Suas senhas são armazenadas de forma criptografada e nunca são enviadas por e-mail. Os dados de cartão são tratados exclusivamente pelo Mercado Pago.',
        'Não vendemos seus dados. Compartilhamos somente o necessário com transportadoras e com o processador de pagamentos.',
        'Conforme a LGPD, você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento pelo atendimento.',
      ],
    },
    termos: {
      title: 'Termos de uso',
      body: [
        'Ao usar esta loja, você concorda em fornecer informações verdadeiras e em manter sua senha em sigilo.',
        'Preços e disponibilidade podem mudar sem aviso. O valor válido é o exibido no momento da finalização do pedido.',
        'Pedidos podem ser cancelados em caso de suspeita de fraude ou de erro evidente de preço, com reembolso integral.',
      ],
    },
  };
}

export default function Info({ slug }) {
  const settings = useSettings();
  const page = pages(settings)[slug];
  useDocumentTitle(page?.title, settings.store.name);
  if (!page) {
    return (
      <Container>
        <EmptyState title="Página não encontrada" action={<Button to="/">Voltar ao início</Button>} />
      </Container>
    );
  }
  const c = settings.store.contact || {};
  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="display text-[clamp(2rem,5vw,3.2rem)] uppercase">{page.title}</h1>
        <div className="stitch mt-5 h-[2px] w-24" aria-hidden="true" />
        {page.body && (
          <div className="mt-8 space-y-5 text-[17px] leading-relaxed text-ink/85">
            {page.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        )}
        {page.faq && (
          <div className="mt-8 divide-y divide-line border-y border-line">
            {page.faq.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                  {q}
                  <span className="text-xl text-muted transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-ink/80">{a}</p>
              </details>
            ))}
          </div>
        )}
        <div className="mt-12 rounded-lg bg-cloth p-6">
          <h2 className="font-bold">Ainda com dúvidas?</h2>
          <p className="mt-1 text-[15px] text-muted">
            Fale com a gente{c.email ? ` pelo e-mail ${c.email}` : ''}
            {c.phone ? ` ou pelo telefone ${c.phone}` : ''}
            {c.hours ? ` (${c.hours.toLowerCase()})` : ''}.
          </p>
          <Link to="/conta/pedidos" className="mt-3 inline-block text-sm font-semibold text-brand underline underline-offset-4">
            Ver meus pedidos
          </Link>
        </div>
      </div>
    </Container>
  );
}
