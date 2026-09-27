import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

export const USERS = {
  reporter: { _id: 'u-reporter', name: 'Reporter User', email: 'reporter@bugsense.dev', role: 'reporter' },
  developer: { _id: 'u-dev', name: 'Dev User', email: 'dev@bugsense.dev', role: 'developer' },
  admin: { _id: 'u-admin', name: 'Admin User', email: 'admin@bugsense.dev', role: 'admin' },
};

// Renders `ui` as the given user, inside a router, without touching the API.
export function renderWithProviders(ui, { user = USERS.developer, route = '/' } = {}) {
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
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthContext.Provider>
  );
}
