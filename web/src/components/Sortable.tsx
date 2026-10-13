import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type Modifier,
  MouseSensor,
  PointerSensor,
  type SensorDescriptor,
  type SensorOptions,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import './Sortable.css';

// A list whose rows are put in order by dragging them: by their handle
// (Figma: Icon/DragHandle), or by the row itself where no handle is drawn.
// Written once for every such list. Dragging is for a pointer or a finger
// only: each list keeps "Monter" and "Descendre" for the keyboard and screen
// readers, so the handle is hidden from them.

type ListProps = {
  /** The key of each row, in order. */
  ids: string[];
  /** A row was dropped: it goes from one index to another. */
  onMove: (from: number, to: number) => void;
  /**
   * What a row is dragged by. A whole row waits for a finger to rest on it a
   * moment, so that the page still scrolls under a finger that only passes.
   */
  by?: 'handle' | 'row';
  children: ReactNode;
};

// A row moves up and down only.
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

// A few pixels before a drag starts: a tap or a click does nothing.
const moved = { activationConstraint: { distance: 4 } };
const rested = { activationConstraint: { delay: 250, tolerance: 8 } };

export function SortableList({ by = 'handle', ...props }: ListProps) {
  return by === 'row' ? <ByRow {...props} /> : <ByHandle {...props} />;
}

function ByHandle(props: Omit<ListProps, 'by'>) {
  return <Base {...props} sensors={useSensors(useSensor(PointerSensor, moved))} />;
}

function ByRow(props: Omit<ListProps, 'by'>) {
  const sensors = useSensors(useSensor(MouseSensor, moved), useSensor(TouchSensor, rested));
  return <Base {...props} sensors={sensors} />;
}

type BaseProps = Omit<ListProps, 'by'> & { sensors: SensorDescriptor<SensorOptions>[] };

function Base({ ids, onMove, sensors, children }: BaseProps) {
  const dropped = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const [from, to] = [ids.indexOf(String(active.id)), ids.indexOf(String(over.id))];
    if (from >= 0 && to >= 0) onMove(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[vertical]}
      onDragEnd={dropped}
      // The moves are said by each list in its own words, when the row is dropped.
      accessibility={{ announcements: silent, screenReaderInstructions: { draggable: '' } }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

const silent = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

/**
 * What a row of a SortableList needs: `row` on its element, and `handle` on
 * its SortableHandle.
 */
export function useSortableRow(id: string) {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } =
    useSortable({ id });
  const style: CSSProperties = {
    transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  };

  return {
    row: { ref: setNodeRef, style, 'data-dragging': isDragging ? 'true' : undefined },
    /** On the SortableHandle of the row, or on the row itself when it has none. */
    handle: { ref: setActivatorNodeRef, ...listeners } as HTMLAttributes<HTMLElement> & {
      ref: (element: HTMLElement | null) => void;
    },
  };
}

/** The handle a row is dragged by. Takes the `handle` of useSortableRow. */
export function SortableHandle(
  props: HTMLAttributes<HTMLSpanElement> & { ref?: (element: HTMLElement | null) => void },
) {
  return (
    <span className="SortableHandle" aria-hidden="true" {...props}>
      <Icon name="DragHandle" />
    </span>
  );
}
