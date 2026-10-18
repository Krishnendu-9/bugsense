import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import ThemeProvider from './context/ThemeContext.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
// Self-hosted, so the built bundle (and the Docker image) has no runtime
// dependency on a font CDN. Only the weights the interface uses: Sans for all
// text, Mono for data -- counts, timestamps, identifiers, code.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-mono/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <SocketProvider>
              <App />
              <Toaster
                position="top-right"
                // Below the sticky 64px navbar (h-16), so toasts never cover the
                // signed-in user's name, avatar or the Live indicator.
                containerStyle={{ top: 76 }}
                toastOptions={{
                  // Toasts are mounted once for the life of the app, so these
                  // reference the custom properties directly instead of reading
                  // them through readToken(): that way the cascade re-resolves
                  // them when the theme changes and open toasts follow along.
                  style: {
                    background: 'rgb(var(--surface))',
                    color: 'rgb(var(--text))',
                    border: '1px solid rgb(var(--border))',
                    boxShadow: '0 8px 24px -8px rgb(var(--shadow) / var(--shadow-opacity))',
                    borderRadius: '12px',
                    fontSize: '14px',
                  },
                  success: {
                    iconTheme: {
                      primary: 'rgb(var(--status-resolved))',
                      secondary: 'rgb(var(--surface))',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: 'rgb(var(--danger))',
                      secondary: 'rgb(var(--surface))',
                    },
                  },
                }}
              />
            </SocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
