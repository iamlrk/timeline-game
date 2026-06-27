import type { Card } from '../types';
import { createCardElement } from './Card';

// -- Shared state -------------------------------------------------------------

let _draggedCardId: string | null = null;
let _selectedCardId: string | null = null;

export function getDraggedCardId(): string | null  { return _draggedCardId; }
export function getSelectedCardId(): string | null { return _selectedCardId; }
export function clearSelectedCard(): void          { _selectedCardId = null; }

// -- Types --------------------------------------------------------------------

export type CardPickupHandler = (cardId: string | null) => void;
export type DropHandler       = (cardId: string, insertIndex: number) => void;

// -- Touch drag helpers -------------------------------------------------------

const DRAG_THRESHOLD = 8;

function findDropZoneAt(x: number, y: number, ghost: HTMLElement): { el: Element; index: number } | null {
  ghost.style.display = 'none';
  const target = document.elementFromPoint(x, y);
  ghost.style.display = '';
  const dz = target?.closest?.('.drop-zone');
  if (!dz) return null;
  const index = parseInt(dz.getAttribute('data-index') ?? '-1', 10);
  if (index < 0) return null;
  return { el: dz, index };
}

function clearDropHighlights(): void {
  document.querySelectorAll('.drop-zone--active').forEach(el =>
    el.classList.remove('drop-zone--active')
  );
}

// -- Hand renderer ------------------------------------------------------------

export function renderPlayerHand(
  container: HTMLElement,
  hand: Card[],
  isMyTurn = true,
  onPickup?: CardPickupHandler,
  onDrop?: DropHandler
): void {
  container.innerHTML = '';
  container.classList.toggle('player-hand--disabled', !isMyTurn);

  hand.forEach((card) => {
    const isSelected = _selectedCardId === card.id;
    const el = createCardElement(card, { draggable: isMyTurn });
    if (isSelected) el.classList.add('card--selected');

    // Desktop HTML5 drag
    el.addEventListener('dragstart', (e) => {
      if (!isMyTurn) { e.preventDefault(); return; }
      _draggedCardId = card.id;
      _selectedCardId = null;
      el.classList.add('card--dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      onPickup?.(card.id);
    });
    el.addEventListener('dragend', () => {
      _draggedCardId = null;
      el.classList.remove('card--dragging');
    });

    // Tap-to-select
    el.addEventListener('click', () => {
      if (!isMyTurn) return;
      _selectedCardId = _selectedCardId === card.id ? null : card.id;
      onPickup?.(_selectedCardId);
    });

    // Touch drag-and-drop
    if (isMyTurn) {
      let startX = 0, startY = 0;
      let dragging = false;
      let ghost: HTMLElement | null = null;
      let cardRect: DOMRect | null = null;

      el.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        dragging = false;
        cardRect = el.getBoundingClientRect();
      }, { passive: true });

      el.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          dragging = true;
          _selectedCardId = null;
          onPickup?.(null);

          ghost = el.cloneNode(true) as HTMLElement;
          const r = cardRect!;
          Object.assign(ghost.style, {
            position: 'fixed',
            width: r.width + 'px',
            height: r.height + 'px',
            left: r.left + 'px',
            top: r.top + 'px',
            opacity: '0.9',
            pointerEvents: 'none',
            zIndex: '9999',
            transform: 'scale(1.1)',
            transformOrigin: 'center center',
            transition: 'none',
          });
          document.body.appendChild(ghost);
          el.style.opacity = '0.3';
        }

        if (dragging && ghost && cardRect) {
          e.preventDefault();
          ghost.style.left = (t.clientX - cardRect.width  / 2) + 'px';
          ghost.style.top  = (t.clientY - cardRect.height / 2) + 'px';
          clearDropHighlights();
          const hit = findDropZoneAt(t.clientX, t.clientY, ghost);
          if (hit) hit.el.classList.add('drop-zone--active');
        }
      }, { passive: false });

      const endDrag = (clientX: number, clientY: number) => {
        if (!dragging) return;
        dragging = false;
        clearDropHighlights();
        const hit = ghost ? findDropZoneAt(clientX, clientY, ghost) : null;
        if (ghost) { ghost.remove(); ghost = null; }
        el.style.opacity = '';
        if (hit && onDrop) onDrop(card.id, hit.index);
      };

      el.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        endDrag(t.clientX, t.clientY);
      });

      el.addEventListener('touchcancel', () => {
        dragging = false;
        if (ghost) { ghost.remove(); ghost = null; }
        el.style.opacity = '';
        clearDropHighlights();
      });
    }

    container.appendChild(el);
  });
}
