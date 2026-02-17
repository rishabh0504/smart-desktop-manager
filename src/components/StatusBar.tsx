import { useExplorerStore } from "@/stores/explorerStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useOperationStore } from "@/stores/operationStore";
import { Database, MousePointer2, FileCode, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export const StatusBar = () => {
    const tabs = useExplorerStore((state) => state.tabs);
    const activeTabId = useExplorerStore((state) => state.activeTabId);
    const tab = tabs.find((t) => t.id === activeTabId);
    const { settings, updateSettings } = useSettingsStore();
    const { operations, updateOperation, removeOperation } = useOperationStore();

    useEffect(() => {
        const unlistenCopy = listen("copy_progress", (event: any) => {
            const data = event.payload;
            updateOperation(data.operation_id, {
                type: "copy",
                progress: data.progress,
                status: "running",
            });
        });

        const unlistenBatch = listen("batch_progress", (event: any) => {
            const data = event.payload;
            updateOperation(data.operation_id, {
                type: "batch",
                progress: data.progress,
                current_item: data.current_item,
                status: "running",
            });
        });

        const unlistenBatchCompleted = listen("batch_completed", (event: any) => {
            setTimeout(() => removeOperation(event.payload), 2000);
        });

        const unlistenCopyCompleted = listen("copy_completed", (event: any) => {
            setTimeout(() => removeOperation(event.payload), 2000);
        });

        return () => {
            unlistenCopy.then((u) => u());
            unlistenBatch.then((u) => u());
            unlistenBatchCompleted.then((u) => u());
            unlistenCopyCompleted.then((u) => u());
        };
    }, [updateOperation, removeOperation]);

    if (!tab) return null; // No active tab

    const activeOps = Array.from(operations.values()).filter((op) => op.status === "running");
    const latestOp = activeOps[activeOps.length - 1];

    const selectionCount = tab.selection.size;
    const totalItems = tab.total;
    const hasMore = tab.has_more ?? false;
    const shownCount = tab.entries.length;

    return (
        <div className="h-6 bg-muted/30 border-t flex items-center justify-between px-3 text-[10px] text-muted-foreground select-none">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 border-r pr-4">
                    <Database className="w-3 h-3 text-primary/60" />
                    <span className="font-medium uppercase tracking-wider">Storage Active</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                        <FileCode className="w-3 h-3 opacity-50" />
                        <span>{hasMore ? `${shownCount} of ${totalItems} items` : `${totalItems} items`}</span>
                    </div>

                    {selectionCount > 0 && (
                        <div className="flex items-center gap-1.5 text-primary font-semibold transition-all">
                            <MousePointer2 className="w-3 h-3" />
                            <span>{selectionCount} selected</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 px-1.5 flex items-center gap-1 hover:bg-muted font-bold text-[9px] uppercase tracking-tighter"
                    onClick={() => updateSettings({ show_system_files: !settings.show_system_files })}
                >
                    {settings.show_system_files ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 opacity-50" />}
                    {settings.show_system_files ? "System Shown" : "System Hidden"}
                </Button>

                <div className="flex items-center gap-1.5 min-w-[100px] justify-end">
                    {latestOp ? (
                        <div className="flex items-center gap-2 animate-pulse text-primary font-bold">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>{latestOp.type === "batch" ? "DELETING" : "COPYING"} {Math.round(latestOp.progress)}%</span>
                        </div>
                    ) : (
                        <>
                            <CheckCircle2 className="w-3 h-3 text-green-500/60" />
                            <span>Ready</span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-1 font-mono text-[9px] bg-muted/50 px-1.5 rounded border border-border/20">
                    <span>MEM: 142MB</span>
                </div>
                <span className="opacity-70">SuperExplorer 0.1.0-alpha</span>
            </div>
        </div>
    );
};
