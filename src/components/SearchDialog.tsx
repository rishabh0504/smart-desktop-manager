import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { SearchMainView } from "./SearchMainView";

export const SearchDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-[1240px] h-[85vh] flex flex-col p-0 overflow-hidden outline-none bg-background/95 backdrop-blur-md shadow-2xl border-primary/20">
                <DialogHeader className="p-3 py-2 border-b bg-muted/20">
                    <DialogTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-primary/10 rounded-lg">
                                <Search className="w-5 h-5 text-primary" />
                            </div>
                            <span className="text-lg font-bold tracking-tight">Advanced Search</span>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <SearchMainView
                    onClose={() => onOpenChange(false)}
                />
            </DialogContent>
        </Dialog>
    );
};
