/** Local leaderboard client: the game server stores it on disk (/api/leaderboard); without a server it falls back to localStorage. */
export interface Entry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

/** 3-12 characters: letters (Vietnamese diacritics allowed), digits, underscore. */
export const NAME_RE = /^[\p{L}\p{N}_]{3,12}$/u;
const KEY = "ddl.leaderboard.v1";
const MAX = 10;

function sorted(list: Entry[]): Entry[] {
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || a.e.achieved_at.localeCompare(b.e.achieved_at) || a.i - b.i)
    .map((x) => x.e)
    .slice(0, MAX);
}

function readLocal(): Entry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? sorted(v) : [];
  } catch {
    return [];
  }
}

export async function fetchBoard(): Promise<Entry[]> {
  try {
    const r = await fetch("/api/leaderboard", { cache: "no-store" });
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) return ((await r.json()) as { entries: Entry[] }).entries;
  } catch {
    /* no server: use the browser's own storage */
  }
  return readLocal();
}

export async function submitEntry(e: Omit<Entry, "achieved_at">): Promise<{ entries: Entry[]; rank: number | null }> {
  try {
    const r = await fetch("/api/leaderboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) });
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) return (await r.json()) as { entries: Entry[]; rank: number | null };
    if (r.status === 400) throw new Error(((await r.json()) as { error: string }).error);
  } catch (err) {
    if (err instanceof Error && !(err instanceof TypeError)) throw err;
  }
  const entry: Entry = { ...e, achieved_at: new Date().toISOString() };
  const all = readLocal();
  const rank = all.filter((x) => x.score >= entry.score).length + 1;
  const entries = sorted([...all, entry]);
  localStorage.setItem(KEY, JSON.stringify(entries));
  return { entries, rank: rank <= MAX ? rank : null };
}
