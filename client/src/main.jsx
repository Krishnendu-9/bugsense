import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SocketProvider>
            <App />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1E293B',
                color: '#F1F5F9',
                border: '1px solid #334155',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#22C55E', secondary: '#1E293B' } },
              error: { iconTheme: { primary: '#EF4444', secondary: '#1E293B' } },
            }}
          />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
</React.StrictMode>
);
