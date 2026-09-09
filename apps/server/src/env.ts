// Where are we running? Railway does not set NODE_ENV=production by itself
// (S10 found the CORS allowlist inert on the live API), so production is
// either NODE_ENV=production or Railway's own environment name.
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
}
