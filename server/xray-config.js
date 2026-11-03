// Turns a v2ray share link (vless:// vmess:// trojan://) into an Xray client
// config that only opens a LOCAL proxy (HTTP 127.0.0.1:10809, SOCKS 127.0.0.1:10808).
// Used by the admin "VPN" page and by server/scripts/make-xray-config.js.
export const PROXY_HTTP_PORT = 10809;
export const PROXY_SOCKS_PORT = 10808;

const q = (params, key, fallback = '') => params.get(key) || fallback;

const streamFrom = ({ network, security, sni, host, path, fp, pbk, sid, spx, alpn, serviceName, headerType }) => {
  const stream = { network: network || 'tcp' };
  if (stream.network === 'ws') stream.wsSettings = { path: path || '/', ...(host ? { headers: { Host: host } } : {}) };
  else if (stream.network === 'grpc') stream.grpcSettings = { serviceName: serviceName || path || '' };
  else if (stream.network === 'httpupgrade') stream.httpupgradeSettings = { path: path || '/', ...(host ? { host } : {}) };
  else if (stream.network === 'xhttp') stream.xhttpSettings = { path: path || '/', ...(host ? { host } : {}) };
  else if (stream.network === 'tcp' && headerType === 'http') {
    stream.tcpSettings = { header: { type: 'http', request: { path: [path || '/'], headers: { Host: host ? [host] : [] } } } };
  }
  if (security === 'tls') {
    stream.security = 'tls';
    stream.tlsSettings = { serverName: sni || host || undefined, ...(fp ? { fingerprint: fp } : {}), ...(alpn ? { alpn: alpn.split(',') } : {}) };
  } else if (security === 'reality') {
    stream.security = 'reality';
    stream.realitySettings = { serverName: sni || undefined, fingerprint: fp || 'chrome', publicKey: pbk, shortId: sid || '', spiderX: spx || '' };
  } else stream.security = 'none';
  return stream;
};


// Returns { config, info } where info is safe to show (no secrets).
export const buildXrayConfig = (rawLink) => {
  const link = String(rawLink || '').replace(/\s+/g, '');
  if (!link) throw new Error('No link given.');
  const scheme = link.split(':')[0].toLowerCase();
  let outbound;
  let info;
  try {
    if (scheme === 'vless' || scheme === 'trojan') {
      const url = new URL(link);
      const p = url.searchParams;
      const common = {
        network: q(p, 'type', 'tcp'), security: q(p, 'security', scheme === 'trojan' ? 'tls' : 'none'),
        sni: q(p, 'sni') || q(p, 'peer'), host: q(p, 'host'), path: decodeURIComponent(q(p, 'path')),
        fp: q(p, 'fp'), pbk: q(p, 'pbk'), sid: q(p, 'sid'), spx: decodeURIComponent(q(p, 'spx')),
        alpn: decodeURIComponent(q(p, 'alpn')), serviceName: q(p, 'serviceName'), headerType: q(p, 'headerType'),
      };
      const address = url.hostname.replace(/^\[|\]$/g, '');
      const port = Number(url.port) || 443;
      if (!address) throw new Error('missing server address');
      if (scheme === 'vless') {
        if (common.security === 'reality' && !common.pbk) throw new Error('this Reality link has no public key (pbk=)');
        outbound = {
          protocol: 'vless',
          settings: { vnext: [{ address, port, users: [{ id: decodeURIComponent(url.username), encryption: q(p, 'encryption', 'none'), ...(q(p, 'flow') ? { flow: q(p, 'flow') } : {}) }] }] },
          streamSettings: streamFrom(common),
        };
      } else {
        outbound = {
          protocol: 'trojan',
          settings: { servers: [{ address, port, password: decodeURIComponent(url.username) }] },
          streamSettings: streamFrom(common),
        };
      }
      info = { protocol: scheme, address, port, network: common.network, security: common.security };
    } else if (scheme === 'vmess') {
      const raw = JSON.parse(Buffer.from(link.slice('vmess://'.length), 'base64').toString('utf8'));
      if (!raw.add || !raw.id) throw new Error('missing server address or id');
      outbound = {
        protocol: 'vmess',
        settings: { vnext: [{ address: raw.add, port: Number(raw.port), users: [{ id: raw.id, alterId: Number(raw.aid || 0), security: raw.scy || 'auto' }] }] },
        streamSettings: streamFrom({
          network: raw.net || 'tcp', security: raw.tls === 'tls' ? 'tls' : 'none', sni: raw.sni, host: raw.host, path: raw.path,
          fp: raw.fp, alpn: raw.alpn, serviceName: raw.path, headerType: raw.type,
        }),
      };
      info = { protocol: 'vmess', address: raw.add, port: Number(raw.port), network: raw.net || 'tcp', security: raw.tls === 'tls' ? 'tls' : 'none' };
    } else {
      throw new Error(`unsupported link type "${scheme}" (use vless://, vmess:// or trojan://)`);
    }
  } catch (error) {
    throw new Error(`Could not read the link: ${error.message}`);
  }
  return {
    info,
    config: {
      log: { loglevel: 'warning' },
      inbounds: [
        { tag: 'http-in', listen: '127.0.0.1', port: PROXY_HTTP_PORT, protocol: 'http' },
        { tag: 'socks-in', listen: '127.0.0.1', port: PROXY_SOCKS_PORT, protocol: 'socks', settings: { udp: false } },
      ],
      outbounds: [{ tag: 'proxy', ...outbound }, { tag: 'direct', protocol: 'freedom' }],
    },
  };
};

// ---- WireGuard (.conf text) -> Xray config ---------------------------------
// Xray has a built-in userspace WireGuard client, so it serves the same local
// HTTP proxy as v2ray: only the site's own requests go through the tunnel, the
// server's routing table is never touched.
const WG_KEY = /^[A-Za-z0-9+/]{43}=$/;

const parseIni = (text) => {
  const sections = [];
  let current = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s[#;].*$/, '').trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const header = /^\[(\w+)\]$/.exec(line);
    if (header) { current = { name: header[1].toLowerCase(), values: {} }; sections.push(current); continue; }
    const eq = line.indexOf('=');
    if (eq < 0 || !current) continue;
    current.values[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
  }
  return sections;
};

const splitList = (value) => String(value || '').split(',').map((part) => part.trim()).filter(Boolean);

export const buildWireguardConfig = (rawText) => {
  const sections = parseIni(rawText);
  const iface = sections.find((section) => section.name === 'interface')?.values;
  const peer = sections.find((section) => section.name === 'peer')?.values;
  if (!iface || !peer) throw new Error('Could not read the WireGuard config: it needs an [Interface] and a [Peer] section.');
  const fail = (message) => { throw new Error(`Could not read the WireGuard config: ${message}`); };

  const secretKey = iface.privatekey;
  if (!WG_KEY.test(secretKey || '')) fail('PrivateKey is missing or not valid.');
  const publicKey = peer.publickey;
  if (!WG_KEY.test(publicKey || '')) fail('the peer PublicKey is missing or not valid.');
  const preSharedKey = peer.presharedkey;
  if (preSharedKey && !WG_KEY.test(preSharedKey)) fail('PresharedKey is not valid.');

  const addresses = splitList(iface.address).map((entry) => (entry.includes('/') ? entry : `${entry}/${entry.includes(':') ? 128 : 32}`));
  if (addresses.length === 0) fail('Address is missing.');

  const endpoint = String(peer.endpoint || '').trim();
  const match = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(endpoint);
  if (!match) fail('Endpoint must look like host:port.');
  const host = match[1].replace(/^\[|\]$/g, '');
  const port = Number(match[2]);
  if (port < 1 || port > 65535) fail('Endpoint port is not valid.');

  const allowedIPs = splitList(peer.allowedips);
  const keepAlive = Number(peer.persistentkeepalive) || 25;
  const mtu = Number(iface.mtu) || 1280;
  const reserved = splitList(iface.reserved).map(Number);
  const hasIPv6 = addresses.some((entry) => entry.includes(':'));

  return {
    info: { protocol: 'wireguard', address: host, port, network: 'udp', security: 'wireguard' },
    config: {
      log: { loglevel: 'warning' },
      inbounds: [
        { tag: 'http-in', listen: '127.0.0.1', port: PROXY_HTTP_PORT, protocol: 'http' },
        { tag: 'socks-in', listen: '127.0.0.1', port: PROXY_SOCKS_PORT, protocol: 'socks', settings: { udp: false } },
      ],
      outbounds: [
        {
          tag: 'proxy',
          protocol: 'wireguard',
          settings: {
            secretKey,
            address: addresses,
            peers: [{
              publicKey,
              ...(preSharedKey ? { preSharedKey } : {}),
              endpoint: `${host.includes(':') ? `[${host}]` : host}:${port}`,
              keepAlive,
              allowedIPs: allowedIPs.length ? allowedIPs : ['0.0.0.0/0', '::/0'],
            }],
            mtu,
            noKernelTun: true, // always userspace: never creates a network interface on the server
            ...(reserved.length === 3 && reserved.every((n) => Number.isInteger(n) && n >= 0 && n < 256) ? { reserved } : {}),
            domainStrategy: hasIPv6 ? 'ForceIP' : 'ForceIPv4',
          },
        },
        { tag: 'direct', protocol: 'freedom' },
      ],
    },
  };
};
