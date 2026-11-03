// Sized cover URL: the server resizes /covers/<name>?w=<width> to WebP on demand.
// Only our own /covers/ files are touched; remote or already-parameterised URLs
// pass through unchanged. Allowed widths: 120, 240, 360, 480, 720.
export const coverUrl = (url, width) => {
  if (typeof url !== 'string' || !url.startsWith('/covers/') || url.includes('?')) return url;
  return `${url}?w=${width}`;
};
