import { useListStore } from "@/stores/listStore";
import { useExplorerStore } from "@/stores/explorerStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { File, Folder, X, Trash2, Plus, Copy, Move } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface ListTrayProps {
    open: boolean;
    onClose: () => void;
}

export const ListTray = ({ open, onClose }: ListTrayProps) => {
    const items = useListStore((state) => state.items);
    const removeItem = useListStore((state) => state.removeItem);
    const clearList = useListStore((state) => state.clearList);

    const tabs = useExplorerStore((state) => state.tabs);
    const activeTabId = useExplorerStore((state) => state.activeTabId);
    const refresh = useExplorerStore((state) => state.refresh);

    const handleBatchAction = async (type: "copy" | "move") => {
        if (items.length === 0 || !activeTabId) return;

        // Find another explorer tab to use as destination
        const otherTab = tabs.find(t => t.id !== activeTabId && t.type === "explorer");
        if (!otherTab) {
            console.error("No other explorer tab found as destination");
            return;
        }

        const destinationDir = otherTab.path;
        const paths = items.map(i => i.path);
        const operation_id = crypto.randomUUID();

        try {
            const command = type === "copy" ? "batch_copy" : "batch_move";
            await invoke(command, {
                operation_id,
                sources: paths,
                destination_dir: destinationDir
            });
            clearList();

            // Refresh both tabs
            refresh(activeTabId);
            refresh(otherTab.id);
        } catch (err) {
            console.error(`Batch ${type} failed:`, err);
        }
    };

    const handleBatchDelete = async () => {
        if (items.length === 0) return;

        const paths = items.map(i => i.path);
        const operationId = crypto.randomUUID();

        try {
            await invoke("delete_items", {
                operation_id: operationId,
                paths
            });
            clearList();
        } catch (err) {
            console.error("Batch deletion failed:", err);
        }
    };

    if (!open) return null;

    return (
        <div className="w-80 border-l bg-muted/10 flex flex-col h-full animate-in slide-in-from-right duration-200">
            <div className="p-3 border-b flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">List Tray</h2>
                    <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        {items.length}
                    </span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {items.length === 0 ? (
                        <div className="py-20 text-center space-y-2">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto opacity-20">
                                <Plus className="w-5 h-5" />
                            </div>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Your tray is empty</p>
                            <p className="text-[9px] text-muted-foreground/50 px-8 leading-relaxed">Click the + button on any file or folder to add it here for batch actions.</p>
                        </div>
                    ) : (
                        items.map((item) => (
                            <div
                                key={item.path}
                                className="group flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50"
                            >
                                <div className="text-muted-foreground/60 shrink-0">
                                    {item.is_dir ? <Folder className="w-4 h-4 text-blue-400" /> : <File className="w-4 h-4" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{item.name}</p>
                                    <p className="text-[9px] text-muted-foreground/60 truncate uppercase">{item.path}</p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => removeItem(item.path)}
                                >
                                    <X className="w-3 h-3" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>

            {items.length > 0 && (
                <div className="p-3 border-t bg-muted/20 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase" onClick={clearList}>
                            <Trash2 className="w-3 h-3 mr-2" />
                            Clear
                        </Button>
                        <Button variant="default" size="sm" className="h-8 text-[10px] font-bold uppercase" onClick={handleBatchDelete}>
                            <Trash2 className="w-3 h-3 mr-2" />
                            Delete
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" size="sm" className="h-8 text-[10px] font-bold uppercase" onClick={() => handleBatchAction("copy")}>
                            <Copy className="w-3 h-3 mr-2" />
                            Copy to Other
                        </Button>
                        <Button variant="secondary" size="sm" className="h-8 text-[10px] font-bold uppercase" onClick={() => handleBatchAction("move")}>
                            <Move className="w-3 h-3 mr-2" />
                            Move to Other
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
