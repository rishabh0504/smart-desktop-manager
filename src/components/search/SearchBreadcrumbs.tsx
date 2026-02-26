import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SearchBreadcrumbs({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
    const parts = path.split('/').filter(Boolean);
    const isWindows = path.includes('\\') || /^[A-Z]:/.test(path);

    const finalParts = isWindows ? path.split('\\').filter(Boolean) : parts;
    const separator = isWindows ? '\\' : '/';
    const rootPrefix = isWindows ? '' : '/';

    return (
        <div className="flex items-center flex-wrap gap-0.5 text-[9px] text-muted-foreground group/bc">
            <Button
                variant="ghost"
                className="h-4 px-1 text-muted-foreground hover:text-foreground text-[9px]"
                onClick={() => onNavigate(rootPrefix)}
            >
                {isWindows ? "PC" : rootPrefix}
            </Button>
            {finalParts.map((part, i) => {
                const currentPath = rootPrefix + finalParts.slice(0, i + 1).join(separator);
                return (
                    <div key={currentPath} className="flex items-center gap-0.5">
                        <ChevronRight className="w-2.5 h-2.5 opacity-20" />
                        <Button
                            variant="ghost"
                            className="h-4 px-1 text-muted-foreground hover:text-foreground truncate max-w-[120px] text-[9px]"
                            onClick={() => onNavigate(currentPath)}
                        >
                            {part}
                        </Button>
                    </div>
                );
            })}
        </div>
    );
}
