import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, SocketContext } from '../context/contexts.js';

export const USERS = {
  reporter: { _id: 'u-reporter', name: 'Reporter User', email: 'reporter@bugsense.dev', role: 'reporter' },
  developer: { _id: 'u-dev', name: 'Dev User', email: 'dev@bugsense.dev', role: 'developer' },
  admin: { _id: 'u-admin', name: 'Admin User', email: 'admin@bugsense.dev', role: 'admin' },
};

// A socket stand-in: `serverEmit(event, payload)` delivers an event to the
// component's listeners, and `emitted` records what the component sent.
export function createFakeSocket() {
  const listeners = {};
  return {
    emitted: [],
    on(event, fn) {
      (listeners[event] ||= new Set()).add(fn);
    },
    off(event, fn) {
      listeners[event]?.delete(fn);
    },
    emit(event, payload) {
      this.emitted.push([event, payload]);
    },
    serverEmit(event, payload) {
      [...(listeners[event] || [])].forEach((fn) => fn(payload));
    },
  };
}

// Renders `ui` as the given user, inside a router, without touching the API.
// `path` mounts it on a route pattern so useParams works (e.g. '/bugs/:id').
export function renderWithProviders(ui, { user = USERS.developer, route = '/', path, socket = null } = {}) {
  const auth = {
    user,
    token: user ? 'test-token' : null,
    loading: false,
    login: async () => user,
    register: async () => user,
    logout: () => {},
    updateUser: () => {},
    replaceToken: () => {},
  };

  return render(
    <AuthContext.Provider value={auth}>
      <SocketContext.Provider value={{ socket, connected: Boolean(socket) }}>
        <MemoryRouter initialEntries={[route]}>
          {path ? (
            <Routes>
              <Route path={path} element={ui} />
              <Route path="*" element={<p>Navigated away</p>} />
            </Routes>
          ) : (
            ui
          )}
        </MemoryRouter>
      </SocketContext.Provider>
    </AuthContext.Provider>
  );
}
