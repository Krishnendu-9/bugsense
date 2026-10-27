// NODE_ENV decides the security defaults: in production the JWT secret is
// checked, developer sign-up is off and errors carry no stack traces. A host
// that leaves it unset gets the development defaults, so it is named here.

/** The development-only conveniences (stack traces, error details) are shown. */
export const exposesErrorDetails = (env = process.env) => env.NODE_ENV === 'development' || env.NODE_ENV === 'test';

/**
 * Startup warnings about the environment: a missing NODE_ENV, and in
 * production a telemetry endpoint anyone can post to.
 */
export const environmentWarnings = (env = process.env) => {
  const warnings = [];
  if (!env.NODE_ENV) {
    warnings.push(
      'NODE_ENV is not set, so the server runs with development defaults: a built-in JWT secret, ' +
        'developer self-sign-up and relaxed rate limits. Set NODE_ENV=production on any deployed host, ' +
        'or NODE_ENV=development locally to silence this.'
    );
  }
  if (env.NODE_ENV === 'production' && !env.TELEMETRY_INGEST_KEY && !env.TELEMETRY_ALLOWED_ORIGINS) {
    warnings.push(
      'Telemetry ingest is open to anyone: neither TELEMETRY_INGEST_KEY nor TELEMETRY_ALLOWED_ORIGINS is set, ' +
        'so any site or script can create SDK bugs. Set TELEMETRY_ALLOWED_ORIGINS to the sites that embed the SDK.'
    );
  }
  return warnings;
};
