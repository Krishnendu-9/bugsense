import { createContext } from 'react';

// The context objects live apart from their providers so that the provider
// files export only components, which React Fast Refresh needs to hot-reload
// them without a full page reload.
export const AuthContext = createContext(null);
export const SocketContext = createContext(null);
export const ThemeContext = createContext(null);
