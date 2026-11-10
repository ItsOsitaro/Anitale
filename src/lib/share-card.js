// Share cards (PNG) drawn in the visitor's browser: no server load, and the site font is already loaded there.
// Two kinds: a title card (poster, score, genres) and a "my stats" card for a profile.
export const CARD_WIDTH = 1080;
export const CARD_SIZES = { story: 1920, square: 1080 };

const PAL = { rose: '#d1375c', deep: '#8c1d43', petal: '#fff6f9', blush: '#f9dbe6', ink: '#2b1320', mute: '#7a5a68', white: '#ffffff' };
const FONT = '"Vazirmatn Variable", Vazirmatn, Tahoma, Arial, sans-serif';
const SITE = 'anitale.itsositaro.ir';

const loadImage = (src) => new Promise((resolve) => {
  if (!src) { resolve(null); return; }
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

// object-fit: cover into a rounded rectangle
const drawCover = (ctx, image, x, y, w, h, r) => {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  if (image) {
    const scale = Math.max(w / image.width, h / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = PAL.blush;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
};

const setFont = (ctx, weight, size) => { ctx.font = `${weight} ${size}px ${FONT}`; };

// Breaks text into at most `maxLines` lines no wider than `maxWidth` (the last line gets an ellipsis).
const wrap = (ctx, text, maxWidth, maxLines) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,،:;-]+$/, '')}…`;
    return kept;
  }
  return lines;
};

const pill = (ctx, text, cx, y, { fill, color, size = 34, pad = 28, height = 70 }) => {
  setFont(ctx, 700, size);
  const w = ctx.measureText(text).width + pad * 2;
  ctx.fillStyle = fill;
  roundRect(ctx, cx - w / 2, y, w, height, height / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + height / 2 + 2);
  return w;
};

const background = (ctx, height, image) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, PAL.petal);
  gradient.addColorStop(1, PAL.blush);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, height);
  if (image) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.filter = 'blur(60px) saturate(1.4)';
    const scale = Math.max(CARD_WIDTH / image.width, height / image.height) * 1.3;
    ctx.drawImage(image, (CARD_WIDTH - image.width * scale) / 2, (height - image.height * scale) / 2, image.width * scale, image.height * scale);
    ctx.restore();
  }
};

const footer = async (ctx, height, tagline) => {
  const logo = await loadImage('/logo-badge.svg');
  const y = height - 130;
  if (logo) ctx.drawImage(logo, CARD_WIDTH / 2 - 75, y - 80, 150, 72);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PAL.deep;
  setFont(ctx, 800, 40);
  ctx.fillText(tagline, CARD_WIDTH / 2, y + 36);
  ctx.fillStyle = PAL.mute;
  setFont(ctx, 600, 30);
  ctx.direction = 'ltr';
  ctx.fillText(SITE, CARD_WIDTH / 2, y + 84);
};

const ensureFont = async () => {
  try { await Promise.all([document.fonts.load(`700 40px ${FONT}`), document.fonts.load(`800 40px ${FONT}`)]); } catch { /* the fallback font still renders */ }
};

const makeCanvas = (height) => {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = height;
  return canvas;
};

// data: { title, facts, score, scoreLabel, genres[], cover, rtl, tagline }
export async function drawTitleCard(data, size = 'story') {
  await ensureFont();
  const height = CARD_SIZES[size] || CARD_SIZES.story;
  const canvas = makeCanvas(height);
  const ctx = canvas.getContext('2d');
  const cover = await loadImage(data.cover);
  background(ctx, height, cover);
  ctx.direction = data.rtl ? 'rtl' : 'ltr';

  const story = height > CARD_WIDTH;
  const posterW = story ? 620 : 380;
  const posterH = Math.round(posterW * 1.42);
  const posterX = (CARD_WIDTH - posterW) / 2;
  const posterY = story ? 150 : 70;
  ctx.save();
  ctx.shadowColor = 'rgba(80, 20, 45, 0.35)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = PAL.white;
  roundRect(ctx, posterX, posterY, posterW, posterH, 36);
  ctx.fill();
  ctx.restore();
  drawCover(ctx, cover, posterX, posterY, posterW, posterH, 36);

  let y = posterY + posterH + (story ? 90 : 58);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PAL.ink;
  const titleSize = story ? 70 : 50;
  setFont(ctx, 800, titleSize);
  const lines = wrap(ctx, data.title, CARD_WIDTH - 160, story ? 3 : 2);
  for (const line of lines) { ctx.fillText(line, CARD_WIDTH / 2, y); y += titleSize * 1.3; }

  if (data.facts) {
    ctx.fillStyle = PAL.mute;
    setFont(ctx, 600, story ? 36 : 28);
    ctx.fillText(data.facts, CARD_WIDTH / 2, y + 10);
    y += story ? 70 : 50;
  }
  if (data.score) {
    y += story ? 24 : 6;
    pill(ctx, `${data.scoreLabel ? `${data.scoreLabel}  ` : ''}${data.score}`, CARD_WIDTH / 2, y, { fill: PAL.rose, color: PAL.white, size: story ? 44 : 34, pad: 44, height: story ? 96 : 74 });
    y += story ? 130 : 96;
  }
  if (data.genres?.length && story) {
    const row = data.genres.slice(0, 4);
    setFont(ctx, 700, 32);
    const widths = row.map((genre) => ctx.measureText(genre).width + 56);
    const total = widths.reduce((a, b) => a + b, 0) + (row.length - 1) * 16;
    let x = (CARD_WIDTH - total) / 2;
    row.forEach((genre, index) => {
      ctx.fillStyle = PAL.white;
      roundRect(ctx, x, y, widths[index], 64, 32);
      ctx.fill();
      ctx.fillStyle = PAL.deep;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(genre, x + widths[index] / 2, y + 34);
      x += widths[index] + 16;
    });
  }
  await footer(ctx, height, data.tagline);
  return canvas;
}

// data: { name, heading, tiles: [{ value, label }], genres[], posters[], rtl, tagline, genresLabel }
export async function drawProfileCard(data, size = 'story') {
  await ensureFont();
  const height = CARD_SIZES[size] || CARD_SIZES.story;
  const canvas = makeCanvas(height);
  const ctx = canvas.getContext('2d');
  const posters = await Promise.all((data.posters || []).slice(0, size === 'story' ? 5 : 4).map(loadImage));
  background(ctx, height, posters.find(Boolean) || null);
  ctx.direction = data.rtl ? 'rtl' : 'ltr';
  const story = height > CARD_WIDTH;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let y = story ? 190 : 120;
  ctx.fillStyle = PAL.mute;
  setFont(ctx, 700, 40);
  ctx.fillText(data.heading, CARD_WIDTH / 2, y);
  y += story ? 100 : 80;
  ctx.fillStyle = PAL.ink;
  setFont(ctx, 800, story ? 92 : 72);
  ctx.fillText(data.name, CARD_WIDTH / 2, y);
  y += story ? 90 : 60;

  // 2x2 stat tiles
  const tileW = 440;
  const tileH = story ? 220 : 170;
  const gap = 28;
  const startX = (CARD_WIDTH - (tileW * 2 + gap)) / 2;
  (data.tiles || []).slice(0, 4).forEach((tile, index) => {
    const x = startX + (index % 2) * (tileW + gap);
    const ty = y + Math.floor(index / 2) * (tileH + gap);
    ctx.fillStyle = index === 0 ? PAL.rose : PAL.white;
    roundRect(ctx, x, ty, tileW, tileH, 32);
    ctx.fill();
    ctx.fillStyle = index === 0 ? PAL.white : PAL.deep;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    setFont(ctx, 800, story ? 84 : 66);
    ctx.fillText(tile.value, x + tileW / 2, ty + tileH / 2 + (story ? 14 : 8));
    ctx.fillStyle = index === 0 ? 'rgba(255,255,255,0.85)' : PAL.mute;
    setFont(ctx, 600, 30);
    ctx.fillText(tile.label, x + tileW / 2, ty + tileH - 38);
  });
  y += (tileH + gap) * 2 + 10;

  if (data.genres?.length) {
    ctx.fillStyle = PAL.mute;
    ctx.textAlign = 'center';
    setFont(ctx, 700, 32);
    ctx.fillText(`${data.genresLabel}: ${data.genres.slice(0, 3).join(data.rtl ? '، ' : ', ')}`, CARD_WIDTH / 2, y + 30);
    y += 80;
  }
  const shown = posters.filter(Boolean);
  if (shown.length) {
    const pw = story ? 176 : 190;
    const ph = Math.round(pw * 1.42);
    const total = shown.length * pw + (shown.length - 1) * 18;
    let x = (CARD_WIDTH - total) / 2;
    for (const image of shown) { drawCover(ctx, image, x, y, pw, ph, 22); x += pw + 18; }
  }
  await footer(ctx, height, data.tagline);
  return canvas;
}

export const canvasToBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

// Builds the "my stats" card data from profile insights; the formatters are passed in so this file stays pure.
export const profileCardData = ({ profile, insights, lang, t, formatNumber, formatScore, genreLabel, coverUrl }) => {
  const posters = [...insights.topRated, ...insights.recent].filter((row) => row.item?.image).map((row) => coverUrl(row.item.image, 360));
  return {
    name: profile.username,
    heading: t('cardMyStats'),
    genresLabel: t('cardTopGenres'),
    tagline: t('cardTagline'),
    rtl: lang === 'fa',
    tiles: [
      { value: formatScore(insights.daysWatched, lang), label: t('cardDays') },
      { value: formatNumber(insights.total, lang), label: t('cardTitles') },
      { value: formatNumber(insights.statusCounts.completed, lang), label: t('cardCompleted') },
      { value: insights.average != null ? formatScore(insights.average, lang) : '—', label: t('dashAvgRating') },
    ],
    genres: insights.topGenres.map((row) => genreLabel(row.genre, lang)),
    posters: [...new Set(posters)].slice(0, 5),
  };
};
