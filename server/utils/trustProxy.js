// Express's 'trust proxy' setting from TRUST_PROXY: a hop count ("1"),
// "true"/"false", or a list of addresses/subnets. Defaults to one hop.
export const parseTrustProxy = (value) => {
  if (value === undefined || value === '') return 1;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};
