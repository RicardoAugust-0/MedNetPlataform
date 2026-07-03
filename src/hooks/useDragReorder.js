import { useRef } from 'react';
import { useToast } from './useToast.jsx';

// Wraps native HTML5 drag-and-drop reordering with an Alt+Seta keyboard
// equivalent, já que DnD nativo não é operável via teclado.
export function useDragReorder(list, reorder, getId = (item) => item.id) {
  const draggedId = useRef(null);
  const toast = useToast();

  const move = (draggedIdx, targetIdx, label) => {
    if (draggedIdx === -1 || targetIdx < 0 || targetIdx >= list.length || draggedIdx === targetIdx) return;
    const newList = [...list];
    const [item] = newList.splice(draggedIdx, 1);
    newList.splice(targetIdx, 0, item);
    reorder(newList);
    if (label) toast(`"${label}" movido para a posição ${targetIdx + 1}.`, 'success');
  };

  const getItemProps = (item, enabled = true, { label, onKeyDown: extraKeyDown } = {}) => {
    const id = getId(item);
    if (!enabled && !extraKeyDown) return {};
    const base = {
      tabIndex: 0,
      onKeyDown: (e) => {
        if (enabled && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const idx = list.findIndex(i => getId(i) === id);
          move(idx, e.key === 'ArrowUp' ? idx - 1 : idx + 1, label);
          return;
        }
        extraKeyDown?.(e);
      },
    };
    if (!enabled) return base;
    return {
      ...base,
      draggable: true,
      'aria-roledescription': 'item reordenável — use Alt+Seta para cima/baixo para mover',
      onDragStart: (e) => {
        draggedId.current = id;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('dragging');
      },
      onDragEnd: (e) => {
        e.currentTarget.classList.remove('dragging');
        draggedId.current = null;
      },
      onDragOver: (e) => e.preventDefault(),
      onDrop: (e) => {
        e.preventDefault();
        if (draggedId.current == null || draggedId.current === id) return;
        const draggedIdx = list.findIndex(i => getId(i) === draggedId.current);
        const targetIdx = list.findIndex(i => getId(i) === id);
        move(draggedIdx, targetIdx, label);
        draggedId.current = null;
      },
    };
  };

  return { getItemProps };
}
