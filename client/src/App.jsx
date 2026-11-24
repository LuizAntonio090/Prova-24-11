import { lazy, Suspense, useEffect } from 'react';
import { FiCompass } from 'react-icons/fi';
import { Footer, Header } from './components/layout.jsx';
import { Button, Container, EmptyState, PageLoader } from './components/ui.jsx';
import { useAuth } from './context/auth.jsx';
import { Navigate, matchRoute, useRouter } from './lib/router.jsx';
import Account, { FavoritesList } from './pages/Account.jsx';
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/Auth.jsx';
import Cart from './pages/Cart.jsx';
import Catalog from './pages/Catalog.jsx';
import Checkout from './pages/Checkout.jsx';
import Home from './pages/Home.jsx';
import Info from './pages/Info.jsx';
import Order from './pages/Order.jsx';
import Product from './pages/Product.jsx';

// O painel é carregado sob demanda, só para administradores
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const { pathname, search } = useRouter();
  if (!ready) return <PageLoader />;
  if (!user) return <Navigate to={`/entrar?voltar=${encodeURIComponent(pathname + search)}`} />;
  return children;
}

function NotFound() {
  return (
    <Container>
      <EmptyState icon={FiCompass} title="Página não encontrada" action={<Button to="/">Voltar ao início</Button>}>
        O endereço pode ter mudado ou não existe mais.
      </EmptyState>
    </Container>
  );
}

const ROUTES = [
  ['/', () => <Home />],
  ['/produtos', () => <Catalog key="all" />],
  ['/busca', () => <Catalog key="search" mode="search" />],
  ['/categoria/:slug', ({ slug }) => <Catalog key={slug} slug={slug} />],
  ['/produto/:slug', ({ slug }) => <Product key={slug} slug={slug} />],
  ['/carrinho', () => <Cart />],
  ['/checkout', () => <RequireAuth><Checkout /></RequireAuth>],
  ['/pedido/:id', ({ id }) => <RequireAuth><Order key={id} id={id} /></RequireAuth>],
  ['/entrar', () => <Login />],
  ['/cadastro', () => <Register />],
  ['/esqueci-senha', () => <ForgotPassword />],
  ['/redefinir-senha', () => <ResetPassword />],
  ['/verificar-email', () => <VerifyEmail />],
  ['/conta/:tab?', ({ tab }) => <RequireAuth><Account tab={tab} /></RequireAuth>],
  ['/favoritos', () => (
    <RequireAuth>
      <Container className="pb-20 pt-8">
        <h1 className="display mb-8 text-4xl uppercase">Favoritos</h1>
        <FavoritesList />
      </Container>
    </RequireAuth>
  )],
  ['/institucional/:slug', ({ slug }) => <Info key={slug} slug={slug} />],
];

export default function App() {
  const { pathname } = useRouter();
  const { user, ready, isAdmin } = useAuth();

  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!ready) return <PageLoader />;
    if (!user) return <Navigate to={`/entrar?voltar=${encodeURIComponent(pathname)}`} />;
    if (!isAdmin) {
      return (
        <Container>
          <EmptyState title="Área restrita" action={<Button to="/">Voltar para a loja</Button>}>
            Esta área é exclusiva para administradores da loja.
          </EmptyState>
        </Container>
      );
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <AdminApp />
      </Suspense>
    );
  }

  let page = <NotFound />;
  for (const [pattern, render] of ROUTES) {
    const params = matchRoute(pattern, pathname);
    if (params) {
      page = render(params);
      break;
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[90] focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {page}
      </main>
      <Footer />
    </div>
  );
}
