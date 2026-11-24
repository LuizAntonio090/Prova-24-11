import { useEffect, useRef, useState } from 'react';
import { FiCheckCircle, FiEye, FiEyeOff } from 'react-icons/fi';
import { Alert, Button, Container, Input, PageLoader } from '../components/ui.jsx';
import { useAuth } from '../context/auth.jsx';
import { useSettings } from '../context/settings.jsx';
import { api } from '../lib/api.js';
import { maskCpf, maskPhone } from '../lib/format.js';
import { useDocumentTitle, useForm } from '../lib/hooks.js';
import { Link, Navigate, useNavigate, useSearchParams } from '../lib/router.jsx';

/** Só aceita redirecionamentos internos (evita open redirect). */
function safeReturn(v) {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/conta';
}

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <Container className="flex justify-center py-12 sm:py-20">
      <div className="w-full max-w-md">
        <h1 className="display text-4xl uppercase">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-8 border-t border-line pt-6 text-[15px]">{footer}</div>}
      </div>
    </Container>
  );
}

export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} inputClassName="pr-11" {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1 top-[30px] flex size-9 items-center justify-center text-muted hover:text-ink"
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {show ? <FiEyeOff /> : <FiEye />}
      </button>
    </div>
  );
}

export function Login() {
  const { store } = useSettings();
  useDocumentTitle('Entrar', store.name);
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const back = safeReturn(params.get('voltar'));
  const f = useForm({ email: '', password: '' });

  if (user) return <Navigate to={back} />;

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acompanhe pedidos, salve endereços e favoritos."
      footer={
        <p>
          Ainda não tem conta?{' '}
          <Link to={`/cadastro${params.get('voltar') ? `?voltar=${encodeURIComponent(back)}` : ''}`} className="font-semibold text-brand underline underline-offset-4">
            Criar conta
          </Link>
        </p>
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={f.submit(async (v) => {
          const u = await login(v.email, v.password);
          navigate(params.get('voltar') ? back : u.role === 'admin' ? '/admin' : '/conta', { replace: true });
        })}
      >
        {f.formError && <Alert>{f.formError}</Alert>}
        <Input label="E-mail" type="email" autoComplete="email" {...f.bind('email')} />
        <PasswordInput label="Senha" autoComplete="current-password" {...f.bind('password')} />
        <div className="text-right">
          <Link to="/esqueci-senha" className="text-sm text-brand underline underline-offset-4">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={f.submitting}>
          Entrar
        </Button>
      </form>
    </AuthShell>
  );
}

export function Register() {
  const { store } = useSettings();
  useDocumentTitle('Criar conta', store.name);
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const f = useForm({ name: '', email: '', cpf: '', phone: '', password: '', passwordConfirm: '' });
  const [done, setDone] = useState(null);

  if (user && !done) return <Navigate to={safeReturn(params.get('voltar'))} />;

  if (done) {
    return (
      <AuthShell title="Conta criada" subtitle={`Enviamos um link de confirmação para ${done.user.email}.`}>
        <Alert tone="ok">Confirme seu e-mail para poder finalizar compras. Você já pode navegar e montar seu carrinho.</Alert>
        {done.devLink && (
          <p className="mt-4 break-all text-sm text-muted">
            Modo de desenvolvimento (SMTP não configurado):{' '}
            <a href={done.devLink} className="text-brand underline">
              abrir link de confirmação
            </a>
          </p>
        )}
        <Button className="mt-6 w-full" size="lg" onClick={() => navigate(safeReturn(params.get('voltar')), { replace: true })}>
          Continuar
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Criar conta"
      subtitle="Leva menos de um minuto."
      footer={
        <p>
          Já tem conta?{' '}
          <Link to={`/entrar${params.get('voltar') ? `?voltar=${encodeURIComponent(params.get('voltar'))}` : ''}`} className="font-semibold text-brand underline underline-offset-4">
            Entrar
          </Link>
        </p>
      }
    >
      <form className="space-y-4" noValidate onSubmit={f.submit(async (v) => setDone(await register(v)))}>
        {f.formError && !Object.keys(f.errors).length && <Alert>{f.formError}</Alert>}
        <Input label="Nome completo" autoComplete="name" {...f.bind('name')} />
        <Input label="E-mail" type="email" autoComplete="email" {...f.bind('email')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Telefone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" {...f.bind('phone', maskPhone)} />
          <Input label="CPF" optional inputMode="numeric" placeholder="000.000.000-00" hint="Necessário para boleto" {...f.bind('cpf', maskCpf)} />
        </div>
        <PasswordInput label="Senha" autoComplete="new-password" hint="Mínimo de 8 caracteres, com letras e números" {...f.bind('password')} />
        <PasswordInput label="Confirme a senha" autoComplete="new-password" {...f.bind('passwordConfirm')} />
        <Button type="submit" size="lg" className="w-full" loading={f.submitting}>
          Criar conta
        </Button>
        <p className="text-[13px] text-muted">
          Ao criar a conta você concorda com os{' '}
          <Link to="/institucional/termos" className="underline">
            termos de uso
          </Link>{' '}
          e a{' '}
          <Link to="/institucional/privacidade" className="underline">
            política de privacidade
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const { store } = useSettings();
  useDocumentTitle('Recuperar senha', store.name);
  const f = useForm({ email: '' });
  const [sent, setSent] = useState(null);
  return (
    <AuthShell title="Recuperar senha" subtitle="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.">
      {sent ? (
        <>
          <Alert tone="ok">Se houver uma conta com {sent.email}, você vai receber o link em instantes. Ele vale por 1 hora.</Alert>
          {sent.devLink && (
            <p className="mt-4 break-all text-sm text-muted">
              Modo de desenvolvimento (SMTP não configurado):{' '}
              <a href={sent.devLink} className="text-brand underline">
                abrir link de redefinição
              </a>
            </p>
          )}
          <Button variant="secondary" className="mt-6" to="/entrar">
            Voltar para o login
          </Button>
        </>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={f.submit(async (v) => {
            const r = await api.post('/auth/forgot-password', v);
            setSent({ email: v.email, devLink: r.devLink });
          })}
        >
          {f.formError && !Object.keys(f.errors).length && <Alert>{f.formError}</Alert>}
          <Input label="E-mail" type="email" autoComplete="email" {...f.bind('email')} />
          <Button type="submit" size="lg" className="w-full" loading={f.submitting}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const { store } = useSettings();
  useDocumentTitle('Nova senha', store.name);
  const [params] = useSearchParams();
  const f = useForm({ password: '', passwordConfirm: '' });
  const [done, setDone] = useState(false);
  const token = params.get('token') || '';
  return (
    <AuthShell title="Nova senha" subtitle={done ? null : 'Crie uma senha nova para sua conta.'}>
      {done ? (
        <>
          <Alert tone="ok">Senha alterada. Por segurança, encerramos as sessões abertas. Entre com a nova senha.</Alert>
          <Button className="mt-6 w-full" size="lg" to="/entrar">
            Entrar
          </Button>
        </>
      ) : !token ? (
        <Alert>Link inválido. Solicite um novo na página de recuperação de senha.</Alert>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={f.submit(async (v) => {
            await api.post('/auth/reset-password', { ...v, token });
            setDone(true);
          })}
        >
          {f.formError && !Object.keys(f.errors).length && (
            <Alert>
              {f.formError}{' '}
              <Link to="/esqueci-senha" className="underline">
                Pedir novo link
              </Link>
            </Alert>
          )}
          <PasswordInput label="Nova senha" autoComplete="new-password" hint="Mínimo de 8 caracteres, com letras e números" {...f.bind('password')} />
          <PasswordInput label="Confirme a nova senha" autoComplete="new-password" {...f.bind('passwordConfirm')} />
          <Button type="submit" size="lg" className="w-full" loading={f.submitting}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmail() {
  const { store } = useSettings();
  useDocumentTitle('Confirmar e-mail', store.name);
  const [params] = useSearchParams();
  const { refresh, user } = useAuth();
  const [state, setState] = useState({ status: 'loading', message: '' });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    api
      .post('/auth/verify-email', { token: params.get('token') || '' })
      .then(() => {
        setState({ status: 'ok', message: '' });
        refresh();
      })
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [params, refresh]);

  if (state.status === 'loading') return <PageLoader label="Confirmando seu e-mail…" />;
  return (
    <AuthShell title={state.status === 'ok' ? 'E-mail confirmado' : 'Link inválido'}>
      {state.status === 'ok' ? (
        <>
          <p className="flex items-center gap-2 text-ok">
            <FiCheckCircle /> Tudo certo. Sua conta está pronta para comprar.
          </p>
          <Button className="mt-6" size="lg" to={user ? '/checkout' : '/entrar'}>
            {user ? 'Continuar para o checkout' : 'Entrar'}
          </Button>
        </>
      ) : (
        <>
          <Alert>{state.message}</Alert>
          <p className="mt-4 text-sm text-muted">Entre na sua conta e peça um novo link na etapa de identificação do checkout ou em Minha conta.</p>
        </>
      )}
    </AuthShell>
  );
}
