import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/auth.jsx';
import { CartProvider } from './context/cart.jsx';
import { FavoritesProvider } from './context/favorites.jsx';
import { SettingsProvider } from './context/settings.jsx';
import { ToastProvider } from './context/toast.jsx';
import './index.css';
import { RouterProvider } from './lib/router.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider>
      <SettingsProvider>
        <ToastProvider>
          <AuthProvider>
            <FavoritesProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </FavoritesProvider>
          </AuthProvider>
        </ToastProvider>
      </SettingsProvider>
    </RouterProvider>
  </StrictMode>,
);
