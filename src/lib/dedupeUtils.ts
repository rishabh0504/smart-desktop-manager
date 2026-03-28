import type { DuplicateGroup } from "@/types/explorer";

/** Parent directory path (no trailing slash), cross-platform. */
export function parentPathOf(filePath: string): string {
    const i = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
    return i <= 0 ? "" : filePath.slice(0, i);
}

/**
 * Same-folder-only filter: keep paths where another duplicate of the same hash
 * lives in the same parent folder. Aligns `modified_times` with filtered `paths`.
 */
export function filterSameFolderGroup(g: DuplicateGroup): DuplicateGroup | null {
    const parentGroups: Record<string, string[]> = {};
    const pathToIdx = new Map(g.paths.map((p, i) => [p, i] as const));

    for (const p of g.paths) {
        const parent = parentPathOf(p);
        if (!parentGroups[parent]) parentGroups[parent] = [];
        parentGroups[parent].push(p);
    }

    const filteredPaths: string[] = [];
    const filteredTimes: number[] = [];

    for (const pl of Object.values(parentGroups)) {
        if (pl.length <= 1) continue;
        for (const p of pl) {
            const idx = pathToIdx.get(p);
            if (idx !== undefined) {
                filteredPaths.push(p);
                filteredTimes.push(g.modified_times[idx] ?? 0);
            }
        }
    }

    if (filteredPaths.length <= 1) return null;
    return { ...g, paths: filteredPaths, modified_times: filteredTimes };
}

export function pickNewestPathIndex(group: DuplicateGroup): number {
    if (group.paths.length === 0) return 0;
    let best = 0;
    let maxT = group.modified_times[0] ?? 0;
    for (let i = 1; i < group.paths.length; i++) {
        const t = group.modified_times[i] ?? 0;
        if (t > maxT) {
            maxT = t;
            best = i;
        }
    }
    return best;
}

export function pickOldestPathIndex(group: DuplicateGroup): number {
    if (group.paths.length === 0) return 0;
    let best = 0;
    let minT = group.modified_times[0] ?? Infinity;
    for (let i = 1; i < group.paths.length; i++) {
        const t = group.modified_times[i] ?? Infinity;
        if (t < minT) {
            minT = t;
            best = i;
        }
    }
    return best;
}

export function defaultKeeperPath(group: DuplicateGroup): string {
    const i = pickNewestPathIndex(group);
    return group.paths[i] ?? group.paths[0];
}

/**
 * Remove given paths from duplicate groups (aligned paths/modified_times), drop groups with fewer than 2 paths.
 */
export function removePathsFromDuplicateGroups(
    duplicates: DuplicateGroup[],
    removedPaths: Set<string>
): DuplicateGroup[] {
    return duplicates
        .map((g) => ({
            ...g,
            paths: g.paths.filter((p) => !removedPaths.has(p)),
            modified_times: g.modified_times.filter((_, i) => !removedPaths.has(g.paths[i])),
        }))
        .filter((g) => g.paths.length >= 2);
}

/** Incremental single-path removal (same semantics as batch). */
export function removeSinglePathFromDuplicateGroups(
    duplicates: DuplicateGroup[],
    path: string
): DuplicateGroup[] {
    return removePathsFromDuplicateGroups(duplicates, new Set([path]));
}

/** Short label for select: `folder/…/file.ext` truncated */
export function keeperOptionLabel(path: string, maxLen = 56): string {
    const parts = path.split(/[/\\]/);
    const name = parts.pop() || path;
    const parent = parts.pop() || "";
    const s = parent ? `${parent}/${name}` : name;
    if (s.length <= maxLen) return s;
    return "…" + s.slice(-(maxLen - 1));
}
