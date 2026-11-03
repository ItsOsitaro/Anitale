// One place that decides whether outgoing requests go through the local proxy.
// Read on every call so the admin "VPN" page can switch it on without a restart.
import { ProxyAgent } from 'undici';

let cached = { url: '', agent: undefined };

export const getDispatcher = () => {
  const url = String(process.env.PROXY_URL || '').trim();
  if (!url) return undefined;
  if (cached.url !== url) cached = { url, agent: new ProxyAgent({ uri: url, connectTimeout: 30_000 }) };
  return cached.agent;
};

// A VPN hop is slower than a direct line: give requests more time when it is on.
export const viaProxy = () => Boolean(String(process.env.PROXY_URL || '').trim());
