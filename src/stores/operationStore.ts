import { create } from "zustand";

export interface OperationProgress {
    id: string;
    type: "copy" | "move" | "delete" | "batch";
    progress: number;
    current_item?: string;
    status: "running" | "completed" | "error" | "cancelled";
}

interface OperationStore {
    operations: Map<string, OperationProgress>;
    updateOperation: (id: string, update: Partial<OperationProgress>) => void;
    removeOperation: (id: string) => void;
}

export const useOperationStore = create<OperationStore>((set) => ({
    operations: new Map(),
    updateOperation: (id, update) => set((state) => {
        const next = new Map(state.operations);
        const existing = next.get(id) || { id, type: "batch", progress: 0, status: "running" } as OperationProgress;
        next.set(id, { ...existing, ...update });
        return { operations: next };
    }),
    removeOperation: (id) => set((state) => {
        const next = new Map(state.operations);
        next.delete(id);
        return { operations: next };
    }),
}));
