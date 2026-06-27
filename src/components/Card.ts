import type { Card } from '../types';
import { formatYear } from '../data/cardLoader';

export interface CardElementOptions {
  draggable?:   boolean;
  placed?:      boolean;
  revealed?:    boolean;
  animateFlip?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  'science-technology':   'Science & Tech',
  'war-politics':         'War & Politics',
  'art-culture-religion': 'Arts & Culture',
  'exploration-disasters':'Exploration',
};

export function createCardElement(card: Card, options: CardElementOptions = {}): HTMLElement {
  const { draggable = false, placed = false, revealed = false, animateFlip = false } = options;

  const el = document.createElement('div');
  el.className = 'card';
  el.setAttribute('data-card-id', card.id);
  el.setAttribute('data-category', card.category);
  el.draggable = draggable;

  if (placed)      el.classList.add('card--placed');
  if (animateFlip) el.classList.add('card--flip-in');
  if (!draggable)  el.style.cursor = 'default';

  // ── Masthead (category only) ─────────────────────────────────────────────
  const masthead = document.createElement('div');
  masthead.className = 'card-masthead';

  const section = document.createElement('span');
  section.className = 'card-section';
  section.textContent = CATEGORY_LABELS[card.category] ?? card.category;

  masthead.appendChild(section);
  el.appendChild(masthead);

  // ── Article body (newspaper text layout) ─────────────────────────────────
  const article = document.createElement('div');
  article.className = 'card-article';

  const nameEl = document.createElement('div');
  nameEl.className = 'card-name';
  nameEl.textContent = card.event;
  article.appendChild(nameEl);

  const rule = document.createElement('div');
  rule.className = 'card-rule';
  article.appendChild(rule);

  // Fake body-text lines
  const lines = document.createElement('div');
  lines.className = 'card-lines';
  const lineWidths = ['100%', '100%', '72%', '100%', '88%', '55%'];
  lineWidths.forEach(w => {
    const line = document.createElement('div');
    line.className = 'card-line';
    line.style.width = w;
    lines.appendChild(line);
  });
  article.appendChild(lines);

  el.appendChild(article);

  // ── Image overlay (absolute, expands on hover) ────────────────────────────
  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';

  const slug = (card as any).wikipediaSlug as string | undefined;
  if (slug) {
    const img = document.createElement('img');
    img.className = 'card-img';
    img.src = '/api/image/' + encodeURIComponent(slug);
    img.alt = card.imageCaption ?? card.event;
    img.onerror = () => {
      imgWrap.classList.add('card-img-wrap--fallback');
      img.style.display = 'none';
    };
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add('card-img-wrap--fallback');
  }

  el.appendChild(imgWrap);

  // ── Year strip (bottom) ───────────────────────────────────────────────────
  const yearStrip = document.createElement('div');
  yearStrip.className = 'card-year-strip';

  const yearEl = document.createElement('div');
  yearEl.className = 'card-year' + (revealed ? '' : ' card-year--hidden');
  yearEl.textContent = revealed ? formatYear(card.year) : '?';
  yearStrip.appendChild(yearEl);

  // Wiki link — always present if source URL exists
  const wikiUrl = card.source || (
    (card as any).wikipediaSlug
      ? `https://en.wikipedia.org/wiki/${(card as any).wikipediaSlug}`
      : null
  );
  if (wikiUrl) {
    const wikiLink = document.createElement('a');
    wikiLink.className = 'card-wiki-link';
    wikiLink.href = wikiUrl;
    wikiLink.target = '_blank';
    wikiLink.rel = 'noopener noreferrer';
    wikiLink.title = 'Open Wikipedia article';
    wikiLink.textContent = 'W';
    wikiLink.addEventListener('click', e => e.stopPropagation());
    yearStrip.appendChild(wikiLink);
  }

  el.appendChild(yearStrip);

  return el;
}
