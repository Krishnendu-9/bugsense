import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import api from './axios.js';

// A per-request adapter stands in for the network, so the real interceptors run
// around it: the request interceptor before it is called, the response
// interceptor on what it returns or throws.
const respondWith = (status, seen = {}) => async (config) => {
  seen.config = config;
  const response = { data: {}, status, statusText: String(status), headers: {}, config };
  if (status < 400) return response;
  throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, response);
};

// jsdom cannot navigate, so the page's location is replaced with a plain object
// for these tests and restored afterwards.
const realLocation = window.location;
let location;

beforeEach(() => {
  localStorage.clear();
  location = { pathname: '/bugs', href: 'http://localhost/bugs' };
  Object.defineProperty(window, 'location', { configurable: true, value: location });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  localStorage.clear();
});

describe('api (the axios instance)', () => {
  it('attaches the stored token as a Bearer header, and nothing without one', async () => {
    const seen = {};
    await api.get('/bugs', { adapter: respondWith(200, seen) });
    expect(seen.config.headers.Authorization).toBeUndefined();

    localStorage.setItem('bugsense_token', 'stored-token');
    await api.get('/bugs', { adapter: respondWith(200, seen) });
    expect(seen.config.headers.Authorization).toBe('Bearer stored-token');
  });

  it('signs the user out and goes to the sign-in page on a 401', async () => {
    localStorage.setItem('bugsense_token', 'expired-token');
    localStorage.setItem('bugsense_user', '{"name":"Ada"}');

    await expect(api.get('/bugs', { adapter: respondWith(401) })).rejects.toMatchObject({ response: { status: 401 } });
    expect(localStorage.getItem('bugsense_token')).toBeNull();
    expect(localStorage.getItem('bugsense_user')).toBeNull();
    expect(location.href).toBe('/login');
  });

  it('keeps the session on a failed sign-in, which is a wrong password, not an expired session', async () => {
    localStorage.setItem('bugsense_token', 'current-token');
    location.pathname = '/login';
    location.href = 'http://localhost/login';

    await expect(api.post('/auth/login', {}, { adapter: respondWith(401) })).rejects.toMatchObject({ response: { status: 401 } });
    expect(localStorage.getItem('bugsense_token')).toBe('current-token');
    expect(location.href).toBe('http://localhost/login');
  });
});
