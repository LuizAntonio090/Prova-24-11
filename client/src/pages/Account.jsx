import { useState } from 'react';
import { FiEdit2, FiHeart, FiMapPin, FiPackage, FiTrash2 } from 'react-icons/fi';
import AddressForm from '../components/AddressForm.jsx';
import { ProductGrid, ProductImage } from '../components/product.jsx';
import { Alert, Badge, Button, ConfirmModal, Container, EmptyState, Input, PageLoader, cx } from '../components/ui.jsx';
import { useAuth } from '../context/auth.jsx';
import { useSettings } from '../context/settings.jsx';
import { useToast } from '../context/toast.jsx';
import { api } from '../lib/api.js';
import { addressLine, brl, date, maskCpf, maskPhone, plural } from '../lib/format.js';
import { useDocumentTitle, useFetch, useForm } from '../lib/hooks.js';
import { Link, NavLink, useNavigate } from '../lib/router.jsx';
import { PasswordInput } from './Auth.jsx';
import { StatusBadge } from './Order.jsx';

const TABS = [
  ['pedidos', 'Meus pedidos'],
  ['dados', 'Dados pessoais'],
  ['enderecos', 'Endereços'],
  ['senha', 'Alterar senha'],
  ['favoritos', 'Favoritos'],
];

function Orders() {
  const { data, loading } = useFetch('/orders');
  if (loading) return <PageLoader />;
  const orders = data?.orders || [];
  if (!orders.length) {
    return (
      <EmptyState icon={FiPackage} title="Você ainda não fez pedidos" action={<Button to="/produtos">Começar a comprar</Button>}>
        Quando fizer uma compra, você acompanha o status por aqui.
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link to={`/pedido/${o.id}`} className="flex items-center gap-4 rounded-lg border border-line p-4 hover:border-ink/30">
            <ProductImage src={o.preview?.image_url} alt="" className="h-20 w-16 shrink-0 rounded" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">Pedido #{o.id}</p>
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {date(o.createdAt)} · {plural(o.itemCount, 'item', 'itens')}
              </p>
            </div>
            <p className="font-bold tabular-nums">{brl(o.totalCents)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const f = useForm({ name: user.name, phone: maskPhone(user.phone), cpf: user.cpf ? maskCpf(user.cpf) : '' });
  const [resend, setResend] = useState({ busy: false, devLink: '' });
  return (
    <div className="max-w-xl space-y-6">
      {!user.emailVerified && (
        <Alert tone="warn">
          Seu e-mail ainda não foi confirmado.{' '}
          <button
            type="button"
            className="font-semibold underline"
            disabled={resend.busy}
            onClick={async () => {
              setResend({ busy: true, devLink: '' });
              try {
                const r = await api.post('/auth/resend-verification');
                toast('Enviamos um novo link de confirmação.');
                setResend({ busy: false, devLink: r.devLink || '' });
              } catch (err) {
                toast(err.message, { tone: 'error' });
                setResend({ busy: false, devLink: '' });
              }
            }}
          >
            Reenviar link
          </button>
          {resend.devLink && (
            <a href={resend.devLink} className="mt-1 block break-all text-[13px] underline">
              Modo de desenvolvimento: abrir link
            </a>
          )}
        </Alert>
      )}
      <form
        className="space-y-4"
        noValidate
        onSubmit={f.submit(async (v) => {
          const r = await api.put('/account/profile', v);
          setUser(r.user);
          toast('Dados atualizados.');
        })}
      >
        {f.formError && !Object.keys(f.errors).length && <Alert>{f.formError}</Alert>}
        <Input label="E-mail" value={user.email} disabled hint="Para trocar o e-mail, fale com o atendimento." />
        <Input label="Nome completo" autoComplete="name" {...f.bind('name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Telefone" type="tel" {...f.bind('phone', maskPhone)} />
          <Input label="CPF" optional inputMode="numeric" {...f.bind('cpf', maskCpf)} />
        </div>
        <Button type="submit" loading={f.submitting}>
          Salvar alterações
        </Button>
      </form>
    </div>
  );
}

function Password() {
  const toast = useToast();
  const f = useForm({ currentPassword: '', password: '', passwordConfirm: '' });
  return (
    <form
      className="max-w-md space-y-4"
      noValidate
      onSubmit={f.submit(async (v) => {
        await api.put('/account/password', v);
        f.setValues({ currentPassword: '', password: '', passwordConfirm: '' });
        toast('Senha alterada. As outras sessões foram encerradas.');
      })}
    >
      {f.formError && !Object.keys(f.errors).length && <Alert>{f.formError}</Alert>}
      <PasswordInput label="Senha atual" autoComplete="current-password" {...f.bind('currentPassword')} />
      <PasswordInput label="Nova senha" autoComplete="new-password" hint="Mínimo de 8 caracteres, com letras e números" {...f.bind('password')} />
      <PasswordInput label="Confirme a nova senha" autoComplete="new-password" {...f.bind('passwordConfirm')} />
      <Button type="submit" loading={f.submitting}>
        Alterar senha
      </Button>
    </form>
  );
}

function Addresses() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch('/account/addresses');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  if (loading && !data) return <PageLoader />;
  const list = data?.addresses || [];

  if (editing) {
    return (
      <div className="max-w-2xl">
        <h2 className="mb-4 text-lg font-bold">{editing.id ? 'Editar endereço' : 'Novo endereço'}</h2>
        <AddressForm
          initial={editing.id ? editing : null}
          defaultRecipient={user.name}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            toast('Endereço salvo.');
            setEditing(null);
            reload();
          }}
        />
      </div>
    );
  }

  return (
    <div>
      {list.length === 0 ? (
        <EmptyState icon={FiMapPin} title="Nenhum endereço cadastrado" action={<Button onClick={() => setEditing({})}>Cadastrar endereço</Button>}>
          Salve um endereço para agilizar suas compras.
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2">
            {list.map((a) => (
              <li key={a.id} className="rounded-lg border border-line p-5">
                <div className="flex items-center gap-2">
                  <p className="font-bold">{a.label}</p>
                  {a.isDefault && <Badge tone="brand">Principal</Badge>}
                </div>
                <p className="mt-1 text-sm">{a.recipient}</p>
                <p className="text-sm text-muted">{addressLine(a)}</p>
                <div className="mt-4 flex gap-4">
                  <button type="button" className="flex items-center gap-1.5 text-sm font-semibold text-brand" onClick={() => setEditing(a)}>
                    <FiEdit2 /> Editar
                  </button>
                  <button type="button" className="flex items-center gap-1.5 text-sm font-semibold text-sale" onClick={() => setRemoving(a)}>
                    <FiTrash2 /> Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="mt-5" onClick={() => setEditing({})}>
            Adicionar endereço
          </Button>
        </>
      )}
      <ConfirmModal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Excluir endereço?"
        confirmLabel="Excluir"
        onConfirm={async () => {
          try {
            await api.del(`/account/addresses/${removing.id}`);
            toast('Endereço excluído.');
            reload();
          } catch (err) {
            toast(err.message, { tone: 'error' });
          }
          setRemoving(null);
        }}
      >
        {removing && addressLine(removing)}
      </ConfirmModal>
    </div>
  );
}

export function FavoritesList() {
  const { data, loading } = useFetch('/account/favorites');
  if (loading) return <PageLoader />;
  if (!data?.items.length) {
    return (
      <EmptyState icon={FiHeart} title="Nenhum favorito ainda" action={<Button to="/produtos">Explorar produtos</Button>}>
        Toque no coração de um produto para salvá-lo aqui.
      </EmptyState>
    );
  }
  return <ProductGrid products={data.items} cols="lg:grid-cols-3" />;
}

export default function Account({ tab = 'pedidos' }) {
  const { store } = useSettings();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const active = TABS.find(([k]) => k === tab) || TABS[0];
  useDocumentTitle(active[1], store.name);

  return (
    <Container className="pb-20 pt-8">
      <h1 className="display text-4xl uppercase">Minha conta</h1>
      <p className="mt-1 text-muted">Olá, {user.name.split(' ')[0]}.</p>
      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Seções da conta" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {TABS.map(([k, label]) => (
            <NavLink
              key={k}
              to={`/conta/${k}`}
              className={({ active: a }) => cx('shrink-0 rounded-md px-3 py-2.5 text-[15px] font-medium', a || (k === 'pedidos' && active[0] === 'pedidos') ? 'bg-ink text-white' : 'hover:bg-cloth')}
            >
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/', { replace: true });
            }}
            className="shrink-0 rounded-md px-3 py-2.5 text-left text-[15px] font-medium text-sale hover:bg-sale/5"
          >
            Sair da conta
          </button>
        </nav>
        <section aria-label={active[1]}>
          <h2 className="display-soft mb-6 text-2xl">{active[1]}</h2>
          {active[0] === 'pedidos' && <Orders />}
          {active[0] === 'dados' && <Profile />}
          {active[0] === 'enderecos' && <Addresses />}
          {active[0] === 'senha' && <Password />}
          {active[0] === 'favoritos' && <FavoritesList />}
        </section>
      </div>
    </Container>
  );
}
