import { FileText, Folder } from "lucide-react";
import { SearchResult as SearchResultType } from "@/types/explorer";
import { cn } from "@/lib/utils";

export function SearchResultRow({
    result,
    style,
    isSelected,
    onSelect,
}: {
    result: SearchResultType;
    style: React.CSSProperties;
    isSelected: boolean;
    onSelect: () => void;
}) {
    return (
        <div
            style={style}
            className={cn(
                "flex flex-col p-2 rounded-md cursor-pointer transition-colors absolute top-0 left-0 w-full border-l-4",
                isSelected
                    ? "bg-primary/10 border-primary shadow-sm"
                    : "border-transparent hover:bg-black/5 dark:hover:bg-white/5"
            )}
            onClick={onSelect}
        >
            <div className="flex items-center gap-2">
                {result.is_dir ? (
                    <Folder className="w-4 h-4 text-blue-400 fill-blue-400/20 shrink-0" />
                ) : (
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span className={cn("text-xs font-medium truncate flex-1", isSelected && "text-primary")}>{result.name}</span>
                {result.line_number !== undefined && (
                    <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded shrink-0">
                        L{result.line_number}
                    </span>
                )}
            </div>
        </div>
    );
}
