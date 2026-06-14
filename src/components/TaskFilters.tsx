/**
 * TaskFilters — list-filter chip row for the TaskList sidebar.
 *
 * Renders an "All" chip, one chip per task list (with the list's color
 * dot), and a "No list" chip for tasks without a list assignment. Active
 * chip uses the primary background; inactive chips use the muted
 * background with hover-to-accent transition.
 *
 * Sibling of TaskList (the orchestrator). The orchestrator owns the
 * `activeListId` state and derives the `listCounts` map.
 */
interface TaskFiltersProps {
  /** Currently-active list filter, or null for "All". `__none__` = "No list". */
  activeListId: string | null;
  setActiveListId: (id: string | null) => void;
  /** All task lists (filtered to those with at least 1 active task inside the orchestrator). */
  taskLists: { id: string; name: string; color: string }[];
  /** Map of list_id (or `__none__`) → count of active tasks. */
  listCounts: Map<string, number>;
  /** Total count of active tasks (used in the "All" chip label). */
  totalActiveCount: number;
}

const NO_LIST_KEY = '__none__';

export function TaskFilters({
  activeListId,
  setActiveListId,
  taskLists,
  listCounts,
  totalActiveCount,
}: TaskFiltersProps) {
  const noListCount = listCounts.get(NO_LIST_KEY) || 0;

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto">
      <button
        onClick={() => setActiveListId(null)}
        className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
          activeListId === null
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:bg-accent'
        }`}
      >
        All {activeListId === null && totalActiveCount}
      </button>
      {taskLists.map((list) => {
        const count = listCounts.get(list.id) || 0;
        if (count === 0) return null;
        return (
          <button
            key={list.id}
            onClick={() => setActiveListId(list.id)}
            className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeListId === list.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: list.color }} />
            {list.name} {count}
          </button>
        );
      })}
      {noListCount > 0 && (
        <button
          onClick={() => setActiveListId(NO_LIST_KEY)}
          className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            activeListId === NO_LIST_KEY
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          No list {noListCount}
        </button>
      )}
    </div>
  );
}
