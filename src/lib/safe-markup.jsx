import { useState } from 'react';

// "About me" markup, rendered into React elements (never raw HTML, so nothing can inject script).
//   **bold**  *italic*  [text](https://link)  ||spoiler||
//   "## heading"  "- item" / "1. item" lists  blank line = new paragraph
const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\|\|[^|\n]+\|\||\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;

function Spoiler({ children }) {
  const [shown, setShown] = useState(false);
  return (
    <button type="button" className={`about-spoiler${shown ? ' is-open' : ''}`} onClick={() => setShown((on) => !on)} aria-pressed={shown}>
      <span aria-hidden={!shown}>{children}</span>
    </button>
  );
}

const inline = (text, keyPrefix, allowLinks = true) => String(text).split(INLINE).map((part, index) => {
  const key = `${keyPrefix}-${index}`;
  if (!part) return null;
  if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{inline(part.slice(2, -2), key, allowLinks)}</strong>;
  if (part.startsWith('||') && part.endsWith('||') && part.length > 4) return <Spoiler key={key}>{inline(part.slice(2, -2), key, false)}</Spoiler>;
  if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={key}>{inline(part.slice(1, -1), key, allowLinks)}</em>;
  const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
  if (link && allowLinks) {
    return <a key={key} href={link[2]} target="_blank" rel="nofollow noopener noreferrer ugc">{link[1]}</a>;
  }
  return part;
});

export function AboutRich({ text, className = '' }) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => { if (paragraph.length) { blocks.push({ type: 'p', lines: paragraph }); paragraph = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    if ((m = /^##\s+(.+)$/.exec(line))) { flushParagraph(); flushList(); blocks.push({ type: 'h', text: m[1] }); continue; }
    if ((m = /^[-•]\s+(.+)$/.exec(line))) { flushParagraph(); if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\d+[.)]\s+(.+)$/.exec(line))) { flushParagraph(); if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList();
  if (!blocks.length) return null;
  return (
    <div className={`about-rich ${className}`} dir="auto">
      {blocks.map((block, i) => {
        if (block.type === 'h') return <h3 key={i}>{inline(block.text, `h${i}`)}</h3>;
        if (block.type === 'ul') return <ul key={i}>{block.items.map((item, j) => <li key={j}>{inline(item, `u${i}-${j}`)}</li>)}</ul>;
        if (block.type === 'ol') return <ol key={i}>{block.items.map((item, j) => <li key={j}>{inline(item, `o${i}-${j}`)}</li>)}</ol>;
        return <p key={i}>{block.lines.map((line, j) => <span key={j}>{j > 0 && <br />}{inline(line, `p${i}-${j}`)}</span>)}</p>;
      })}
    </div>
  );
}
