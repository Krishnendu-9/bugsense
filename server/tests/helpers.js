import http from 'http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Must be set before app.js (and the rate limiters it imports) is loaded.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.TELEMETRY_INGEST_KEY;
delete process.env.DISCORD_WEBHOOK_URL;
delete process.env.SLACK_WEBHOOK_URL;

const [{ createApp }, { initSocket }, { default: User }, { default: Bug }] = await Promise.all([
  import('../app.js'),
  import('../config/socket.js'),
  import('../models/User.model.js'),
  import('../models/Bug.model.js'),
]);

let mongo;

/**
 * Boots the app against a throwaway database. MONGO_URI_TEST points the suite
 * at an existing server instead of downloading an in-memory MongoDB binary.
 */
export const startTestServer = async () => {
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri('bugsense-test');
  }
  await mongoose.connect(uri);
  await mongoose.connection.db.dropDatabase();
  await Bug.syncIndexes();
  await User.syncIndexes();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  await new Promise((resolve) => server.listen(0, resolve));

  return { app, server, port: server.address().port };
};

export const stopTestServer = async (server) => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
};

export const createUser = async (request, overrides = {}) => {
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = overrides.email || `user-${suffix}@test.dev`;
  const password = overrides.password || 'password123';

  await User.create({
    name: overrides.name || `User ${suffix}`,
    email,
    password,
    role: overrides.role || 'reporter',
  });

  const res = await request.post('/api/auth/login').send({ email, password });
  return { token: res.body.token, user: res.body.user, email, password };
};

export { Bug, User };
