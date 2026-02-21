import { useExplorerStore } from "@/stores/explorerStore";
import { Folder, CopyCheck, FileSearch, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

export const ActivityBar = () => {
    const activeView = useExplorerStore(state => state.activeView);
    const setActiveView = useExplorerStore(state => state.setActiveView);

    const tabs = [
        { id: "explorer", label: "File Explorer", icon: Folder },
        { id: "dedupe", label: "Duplicate Finder", icon: CopyCheck },
        { id: "content_search", label: "Content Search", icon: FileSearch },
        { id: "clean", label: "Clean View", icon: Eraser },
    ] as const;

    return (
        <div className="w-14 h-full bg-muted/20 border-r flex flex-col items-center py-4 gap-3 z-30 shrink-0">
            {tabs.map(tab => {
                const isActive = activeView === tab.id;
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.id}
                        onClick={() => setActiveView(tab.id)}
                        title={tab.label}
                        className={cn(
                            "group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all",
                            isActive
                                ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                    >
                        {/* Active indicator pill */}
                        {isActive && (
                            <div className="absolute -left-2 w-1 h-5 bg-primary rounded-r-full" />
                        )}
                        <Icon className={cn("w-5 h-5 transition-transform", isActive ? "scale-110" : "group-hover:scale-110")} />
                    </button>
                );
            })}
        </div>
    );
};
