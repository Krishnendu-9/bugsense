import { createContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import useAuth from '../hooks/useAuth.js';
import { getApiOrigin } from '../utils/helpers.js';

export const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  // The server only accepts authenticated sockets, so a connection exists only
  // while signed in, and is rebuilt whenever the token changes.
  useEffect(() => {
    if (!token) return undefined;

    // Retries indefinitely (with back-off), so a server restart of any length
    // recovers on its own instead of leaving every client "Offline".
    const s = io(getApiOrigin(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}
