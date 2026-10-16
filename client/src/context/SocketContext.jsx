import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import useAuth from '../hooks/useAuth.js';
import { getApiOrigin } from '../utils/helpers.js';
import { SocketContext } from './contexts.js';

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

    // Consumers receive the socket once it has connected; nothing can be
    // received before that, and joining rooms needs a live connection anyway.
    s.on('connect', () => {
      setSocket(s);
      setConnected(true);
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));

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
