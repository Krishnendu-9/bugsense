import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { resolveUserFromToken } from '../middleware/auth.middleware.js';

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  // Every event carries bug data (error logs, descriptions), so a connection is
  // only accepted with the same JWT the REST API requires. CORS alone does not
  // stop non-browser clients from connecting.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));

      const user = await resolveUserFromToken(token);
      if (!user) return next(new Error('unauthorized'));

      socket.data.user = { _id: user._id.toString(), role: user.role };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join:bug', (bugId) => {
      if (mongoose.isValidObjectId(bugId)) socket.join(`bug:${bugId}`);
    });

    socket.on('leave:bug', (bugId) => {
      if (mongoose.isValidObjectId(bugId)) socket.leave(`bug:${bugId}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialised — call initSocket first');
  return io;
};

// Emits to everyone, or to one room. A no-op before initSocket has run, which
// keeps controllers usable from tests and scripts without a socket server.
export const broadcast = (event, payload, room) => {
  if (!io) return;
  (room ? io.to(room) : io).emit(event, payload);
};
