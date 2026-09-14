"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

export interface BoardColumn {
  id: string;
  label: string;
  color?: string;
}
export interface BoardItem {
  id: string;
  columnId: string;
  position: number;
}
export interface BoardNeighbours {
  prev?: number;
  next?: number;
}

interface BoardProps {
  columns: BoardColumn[];
  items: BoardItem[];
  renderCard: (id: string) => ReactNode;
  // Persist a move. The board has already reordered itself optimistically;
  // reject (throw) to have the caller reload and reset it.
  onMove: (itemId: string, toColumnId: string, newPosition: number, neighbours: BoardNeighbours) => Promise<void>;
  renderColumnHeader?: (column: BoardColumn, itemIds: string[]) => ReactNode;
  emptyLabel?: string;
  className?: string;
}

// Midpoint between neighbours; open-ended at the top/bottom; 1000 when empty.
export function positionBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return 1000;
  if (prev === undefined) return next! > 0 ? next! / 2 : next! - 1000;
  if (next === undefined) return prev + 1000;
  return (prev + next) / 2;
}

type ColumnMap = Record<string, string[]>;

function buildColumns(columns: BoardColumn[], items: BoardItem[]): ColumnMap {
  const map: ColumnMap = {};
  for (const c of columns) map[c.id] = [];
  for (const it of [...items].sort((a, b) => a.position - b.position)) (map[it.columnId] ??= []).push(it.id);
  return map;
}

// Generic kanban: one SortableContext per column, columns are droppables so
// empty ones accept cards, DragOverlay for the lifted card. Pass memoised
// `items` – a new array identity resets the optimistic local order.
export function Board({ columns, items, renderCard, onMove, renderColumnHeader, emptyLabel = "Nothing here", className }: BoardProps) {
  const [cols, setCols] = useState<ColumnMap>(() => buildColumns(columns, items));
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  // Swallows the click that the browser fires right after a drop so card
  // links/handlers don't trigger.
  const dragEndedAt = useRef(0);

  useEffect(() => {
    setCols(buildColumns(columns, items));
    setPositions(Object.fromEntries(items.map((i) => [i.id, i.position])));
  }, [columns, items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columnIds = useMemo(() => new Set(columns.map((c) => c.id)), [columns]);

  const findColumn = useCallback(
    (id: string, map: ColumnMap): string | undefined => {
      if (columnIds.has(id)) return id;
      return Object.keys(map).find((c) => map[c].includes(id));
    },
    [columnIds]
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  // Cross-column hover: move the card into the hovered column immediately so
  // the sortable strategy can animate the gap.
  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    setCols((prev) => {
      const from = findColumn(aId, prev);
      const to = findColumn(oId, prev);
      if (!from || !to || from === to) return prev;
      const fromList = prev[from].filter((id) => id !== aId);
      const toList = [...prev[to]];
      let insertAt = toList.length;
      if (oId !== to) {
        const overIdx = toList.indexOf(oId);
        const translated = active.rect.current.translated;
        const below = !!translated && translated.top > over.rect.top + over.rect.height / 2;
        insertAt = overIdx + (below ? 1 : 0);
      }
      toList.splice(insertAt, 0, aId);
      return { ...prev, [from]: fromList, [to]: toList };
    });
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    dragEndedAt.current = Date.now();
    const aId = String(active.id);
    if (!over) {
      setCols(buildColumns(columns, items));
      return;
    }
    const oId = String(over.id);
    const toColumn = findColumn(aId, cols);
    if (!toColumn) return;

    // Same-column reorder (cross-column moves were already applied on hover).
    let list = cols[toColumn];
    if (oId !== aId && list.includes(oId)) {
      list = arrayMove(list, list.indexOf(aId), list.indexOf(oId));
    }
    const idx = list.indexOf(aId);
    const neighbours: BoardNeighbours = {
      prev: idx > 0 ? positions[list[idx - 1]] : undefined,
      next: idx < list.length - 1 ? positions[list[idx + 1]] : undefined,
    };

    // No-op if the card ends up where it started.
    const original = items.find((i) => i.id === aId);
    const originalList = buildColumns(columns, items)[original?.columnId ?? ""] ?? [];
    if (original && original.columnId === toColumn && originalList.indexOf(aId) === idx) {
      setCols((prev) => ({ ...prev, [toColumn]: list }));
      return;
    }

    const newPosition = positionBetween(neighbours.prev, neighbours.next);
    setCols((prev) => ({ ...prev, [toColumn]: list }));
    setPositions((prev) => ({ ...prev, [aId]: newPosition }));
    try {
      await onMove(aId, toColumn, newPosition, neighbours);
    } catch {
      setCols(buildColumns(columns, items));
      setPositions(Object.fromEntries(items.map((i) => [i.id, i.position])));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        dragEndedAt.current = Date.now();
        setCols(buildColumns(columns, items));
      }}
    >
      <div className={cn("flex gap-3 overflow-x-auto pb-3 items-start", className)}>
        {columns.map((col) => (
          <Column
            key={col.id}
            column={col}
            ids={cols[col.id] ?? []}
            renderCard={renderCard}
            header={renderColumnHeader?.(col, cols[col.id] ?? [])}
            emptyLabel={emptyLabel}
            dragEndedAt={dragEndedAt}
          />
        ))}
      </div>
      <DragOverlay>
        {activeId ? <div className="rotate-[1.5deg] shadow-xl rounded cursor-grabbing">{renderCard(activeId)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  column,
  ids,
  renderCard,
  header,
  emptyLabel,
  dragEndedAt,
}: {
  column: BoardColumn;
  ids: string[];
  renderCard: (id: string) => ReactNode;
  header?: ReactNode;
  emptyLabel: string;
  dragEndedAt: React.MutableRefObject<number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div className="w-72 shrink-0 flex flex-col rounded border bg-neutral-100/70 max-h-[calc(100vh-200px)]">
      <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
        {header ?? (
          <>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded", column.color ?? "bg-neutral-200 text-neutral-700")}>{column.label}</span>
            <span className="text-xs text-neutral-500">{ids.length}</span>
          </>
        )}
      </div>
      <SortableContext id={column.id} items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn("flex-1 min-h-[96px] p-2 space-y-2 overflow-y-auto rounded-b", isOver && "bg-neutral-200/60")}>
          {ids.map((id) => (
            <SortableCard key={id} id={id} dragEndedAt={dragEndedAt}>
              {renderCard(id)}
            </SortableCard>
          ))}
          {ids.length === 0 && <p className="text-xs text-neutral-400 text-center py-6">{emptyLabel}</p>}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({ id, children, dragEndedAt }: { id: string; children: ReactNode; dragEndedAt: React.MutableRefObject<number> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClickCapture={(e) => {
        if (Date.now() - dragEndedAt.current < 200) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={cn("outline-none", isDragging && "opacity-30")}
    >
      {children}
    </div>
  );
}
