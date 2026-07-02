"use client";

export interface DraftItem {
  key: string;
  description: string;
  line_total: string; // empty string = no amount (sub-bullet line)
}

export function LineItemsEditor({
  items,
  onChange,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
}) {
  function update(key: string, patch: Partial<DraftItem>) {
    onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function remove(key: string) {
    onChange(items.filter((it) => it.key !== key));
  }

  function add() {
    onChange([...items, { key: crypto.randomUUID(), description: "", line_total: "" }]);
  }

  return (
    <div className="space-y-2">
      <div className="flex text-xs text-neutral-500 px-1">
        <div className="flex-1">Description</div>
        <div className="w-32 text-right">Amount (RM)</div>
        <div className="w-8"></div>
      </div>
      {items.map((it) => (
        <div key={it.key} className="flex gap-2 items-center">
          <input
            className="flex-1 border rounded px-2 py-1.5 text-sm"
            placeholder="Description"
            value={it.description}
            onChange={(e) => update(it.key, { description: e.target.value })}
          />
          <input
            className="w-32 border rounded px-2 py-1.5 text-sm text-right"
            placeholder="-"
            inputMode="decimal"
            value={it.line_total}
            onChange={(e) => update(it.key, { line_total: e.target.value })}
          />
          <button type="button" onClick={() => remove(it.key)} className="w-8 text-neutral-400 hover:text-red-500">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-sm text-neutral-600 hover:underline">
        + Add line
      </button>
    </div>
  );
}
