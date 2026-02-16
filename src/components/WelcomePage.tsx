import { motion } from "framer-motion";
import { FolderOpen, Settings, List, Keyboard } from "lucide-react";
import { useExplorerStore } from "@/stores/explorerStore";
import { Button } from "@/components/ui/button";

export const WelcomePage = () => {
    const addTab = useExplorerStore((state) => state.addTab);

    return (
        <div className="flex-1 h-full flex flex-col items-center justify-center bg-background p-8 text-center select-none overflow-hidden relative">

            {/* Background decoration */}
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px] pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center bg-background [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="z-10 flex flex-col items-center max-w-2xl"
            >
                <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-primary/20 ring-1 ring-primary/20 backdrop-blur-xl">
                    <FolderOpen className="w-12 h-12 text-primary" />
                </div>

                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/50">
                    Smart File Explorer
                </h1>

                <p className="text-xl text-muted-foreground mb-12 max-w-lg leading-relaxed">
                    A high-performance, dual-lane file manager built for power users.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
                    <Button
                        variant="outline"
                        size="lg"
                        className="h-14 text-base font-medium flex items-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                        onClick={() => addTab("/Users/rajantiwari")}
                    >
                        <FolderOpen className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" />
                        Open New Lane
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        className="h-14 text-base font-medium flex items-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                        onClick={() => addTab("/Users/rajantiwari/Desktop/file-viewer")}
                    >
                        <List className="w-5 h-5 text-purple-500 group-hover:scale-110 transition-transform" />
                        Open Current Project
                    </Button>
                </div>

                <div className="mt-16 flex items-center gap-8 text-xs text-muted-foreground/50 font-medium uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <Keyboard className="w-3 h-3" />
                        <span>⌘F Search</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Settings className="w-3 h-3" />
                        <span>Settings</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
