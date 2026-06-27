import type { Card } from '../types';
import { createCardElement } from './Card';

// -- Drop callback type -------------------------------------------------------

export type DropHandler = (cardId: string, insertIndex: number) => void;

// -- Drop zone ----------------------------------------------------------------

function createDropZone(
  index: number,
  getDraggedId: () => string | null,
  getSelectedId: () => string | null,
  onDrop: DropHandler
): HTMLElement {
  const dz = document.createElement('div');
  dz.className = 'drop-zone';
  dz.setAttribute('data-index', String(index));
  dz.setAttribute('aria-label', 'Place here');

  // Desktop drag events
  dz.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (getDraggedId()) dz.classList.add('drop-zone--active');
  });
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (getDraggedId()) {
      dz.classList.add('drop-zone--active');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }
  });
  dz.addEventListener('dragleave', (e) => {
    if (!dz.contains(e.relatedTarget as Node)) {
      dz.classList.remove('drop-zone--active');
    }
  });
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drop-zone--active');
    const cardId = getDraggedId();
    if (cardId) onDrop(cardId, index);
  });

  // Tap-to-place
  dz.addEventListener('click', () => {
    const cardId = getSelectedId();
    if (cardId) onDrop(cardId, index);
  });

  return dz;
}

// -- Timeline renderer --------------------------------------------------------

export function renderTimeline(
  container: HTMLElement,
  timeline: Card[],
  getDraggedId: () => string | null,
  onDrop: DropHandler,
  newCardId: string | null = null,
  getSelectedId: () => string | null = () => null
): void {
  container.innerHTML = '';
  const hasSelected = !!getSelectedId();

  const makeDz = (i: number) => {
    const dz = createDropZone(i, getDraggedId, getSelectedId, onDrop);
    if (hasSelected) dz.classList.add('drop-zone--tap-ready');
    return dz;
  };

  if (timeline.length === 0) {
    container.classList.add('timeline--empty-state');
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-empty-center';
    const dz = makeDz(0);
    dz.classList.add('drop-zone--first');
    const hint = document.createElement('div');
    hint.className = 'timeline-empty__text';
    hint.textContent = hasSelected ? 'Tap here to place' : 'Place your first card here';
    wrapper.appendChild(dz);
    wrapper.appendChild(hint);
    container.appendChild(wrapper);
    return;
  }

  container.classList.remove('timeline--empty-state');
  container.appendChild(makeDz(0));

  timeline.forEach((card, i) => {
    const cardEl = createCardElement(card, {
      draggable: false,
      placed: true,
      revealed: card.revealed,
      animateFlip: card.id === newCardId,
    });
    container.appendChild(cardEl);
    container.appendChild(makeDz(i + 1));
  });
}
