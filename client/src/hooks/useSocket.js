import { useContext, useEffect, useRef } from 'react';
import { SocketContext } from '../context/SocketContext.jsx';

export default function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used inside SocketProvider');
  return context;
}

/**
 * Subscribes to a socket event for the lifetime of the component.
 *
 * The handler is held in a ref, so callers may pass an inline arrow function
 * without the listener being torn down and re-attached on every render. The
 * ref always holds the latest closure, so handlers still see current props.
 */
export function useSocketEvent(event, handler) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket) return;
    const listener = (...args) => handlerRef.current?.(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event]);
}
