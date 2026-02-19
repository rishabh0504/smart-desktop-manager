import { useEffect, useState } from "react";
import { FilePanel } from "@/panels/FilePanel";
import { useExplorerStore } from "@/stores/explorerStore";
import { SearchDialog } from "@/components/SearchDialog";
import { Button } from "@/components/ui/button";
import { Search, Sun, Moon, Settings, Keyboard, Menu, Plus, Trash2, FolderInput } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { PreviewModal } from "@/components/PreviewModal";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useListStore } from "@/stores/listStore";
import { cn } from "@/lib/utils";
import { ListTray } from "@/components/ListTray";
import { WelcomePage } from "@/components/WelcomePage";
import { DuplicateTab } from "@/components/DuplicateTab";
import { ContentTypeTab } from "@/components/ContentTypeTab";
import { TabBar } from "@/components/TabBar";
import { DeleteQueueModal } from "@/components/DeleteQueueModal";
import { MoveQueueManagerModal } from "@/components/MoveQueueManagerModal";
import { useDeleteQueueStore } from "@/stores/deleteQueueStore";
import { useMoveQueueStore } from "@/stores/moveQueueStore";
import { ThemeApplier } from "@/components/ThemeApplier";
import { CleanTab } from "@/components/CleanTab";

export const MainLayout = () => {
    const tabs = useExplorerStore((state) => state.tabs);
    const addTab = useExplorerStore((state) => state.addTab);
    const activeTabId = useExplorerStore((state) => state.activeTabId);
    const activeView = useExplorerStore((state) => state.activeView);
    const setActiveView = useExplorerStore((state) => state.setActiveView);
    const closeTab = useExplorerStore((state) => state.closeTab);

    const { theme, setTheme } = useTheme();
    const { toggleSidebar } = useSidebarStore();
    const { items } = useListStore();

    const [searchOpen, setSearchOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [trayOpen, setTrayOpen] = useState(false);
    const [deleteQueueOpen, setDeleteQueueOpen] = useState(false);
    const deleteQueue = useDeleteQueueStore((s) => s.queue);
    const moveQueueTotal = useMoveQueueStore((s) =>
        s.queues.reduce((sum, q) => sum + q.items.length, 0)
    );
    const moveQueueManagerOpen = useMoveQueueStore((s) => s.openManager);
    const setMoveQueueManagerOpen = useMoveQueueStore((s) => s.setOpenManager);


    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;

            switch (e.key.toLowerCase()) {
                case "f":
                    e.preventDefault();
                    setSearchOpen(true);
                    break;
                case "b":
                    e.preventDefault();
                    toggleSidebar();
                    break;
                case ",":
                    e.preventDefault();
                    setSettingsOpen(true);
                    break;
                case "w":
                    e.preventDefault();
                    if (activeView === "explorer" && activeTabId) {
                        closeTab(activeTabId);
                    } else if (activeView === "dedupe") {
                        setActiveView("explorer");
                    }
                    break;
                case "n":
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Trigger new folder logic if a tab is active
                        // This would ideally emit an event to the active FilePanel
                    } else {
                        addTab("/");
                    }
                    break;
                case "1":
                    e.preventDefault();
                    setActiveView("explorer");
                    break;
                case "2":
                    e.preventDefault();
                    setActiveView("dedupe");
                    break;
                case "3":
                    e.preventDefault();
                    setActiveView("content_search");
                    break;
                case "4":
                    e.preventDefault();
                    setActiveView("clean");
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggleSidebar, activeTabId, closeTab, addTab, setActiveView]);

    return (
        <div className="flex flex-col h-screen w-full bg-background overflow-hidden text-foreground">
            <ThemeApplier />
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={toggleSidebar}
                    >
                        <Menu className="w-4 h-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <h1 className="text-sm font-bold tracking-tight">SuperExplorer</h1>
                        <div className="hidden sm:flex items-center gap-1 bg-muted/50 rounded-md px-2 py-0.5 border border-border/50">
                            <Keyboard className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                                ⌘F Search
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "h-8 px-2 gap-1.5 text-xs font-bold",
                            deleteQueue.length > 0
                                ? "text-destructive hover:bg-destructive/10"
                                : "text-muted-foreground hover:text-destructive"
                        )}
                        onClick={() => setDeleteQueueOpen(true)}
                        title="Delete queue"
                    >
                        <Trash2 className="h-4 w-4" />
                        {deleteQueue.length > 0 && (
                            <span className="min-w-[1.25rem] h-5 px-1 rounded bg-destructive/20 text-destructive flex items-center justify-center">
                                {deleteQueue.length}
                            </span>
                        )}
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "h-8 px-2 gap-1.5 text-xs font-bold",
                            moveQueueTotal > 0
                                ? "text-primary hover:bg-primary/10"
                                : "text-muted-foreground hover:text-primary"
                        )}
                        onClick={() => setMoveQueueManagerOpen(true)}
                        title="Move queue manager"
                    >
                        <FolderInput className="h-4 w-4" />
                        {moveQueueTotal > 0 && (
                            <span className="min-w-[1.25rem] h-5 px-1 rounded bg-primary/20 text-primary flex items-center justify-center">
                                {moveQueueTotal}
                            </span>
                        )}
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => addTab("/Users/rajantiwari")}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>

                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSearchOpen(true)}>
                        <Search className="h-4 w-4" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </Button>

                    <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={() => setTrayOpen(!trayOpen)}>
                        <Menu className="h-4 w-4" />
                        {items.length > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full ring-2 ring-background" />
                        )}
                    </Button>

                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)}>
                        <Settings className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden">
                <Sidebar />

                <div className="flex-1 flex flex-col overflow-hidden">
                    {activeView === "explorer" ? (
                        <>
                            <TabBar />
                            <div className="flex-1 relative overflow-hidden bg-background">
                                {tabs.length > 0 ? (
                                    tabs.map((tab) => (
                                        <div
                                            key={tab.id}
                                            className={cn(
                                                "absolute inset-0 transition-opacity duration-200",
                                                activeTabId === tab.id ? "opacity-100 z-10" : "opacity-0 pointer-events-none z-0"
                                            )}
                                        >
                                            {tab.type === "explorer" && <FilePanel tabId={tab.id} />}
                                            {tab.type === "duplicates" && <DuplicateTab tabId={tab.id} />}
                                        </div>
                                    ))
                                ) : (
                                    <WelcomePage />
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 p-4 overflow-hidden bg-background">
                            {activeView === "dedupe" && <DuplicateTab tabId="dedupe-service" />}
                            {activeView === "content_search" && <ContentTypeTab tabId="content-search-service" />}
                            {activeView === "clean" && <CleanTab tabId="clean" />}
                        </div>
                    )}
                </div>

                <ListTray open={trayOpen} onClose={() => setTrayOpen(false)} />
            </div>

            {/* Bottom Status Bar */}
            <StatusBar />

            <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
            <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
            <PreviewModal />
            <DeleteQueueModal open={deleteQueueOpen} onOpenChange={setDeleteQueueOpen} />
            <MoveQueueManagerModal open={moveQueueManagerOpen} onOpenChange={setMoveQueueManagerOpen} />
        </div>
    );
};
