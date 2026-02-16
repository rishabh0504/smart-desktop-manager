import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ThemeProvider } from "@/components/theme-provider";
import { MainLayout } from "@/layout/MainLayout";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";

function App() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const complete = await invoke<boolean>("is_setup_complete");
        setSetupComplete(complete);
      } catch (e) {
        console.error("Failed to check setup status:", e);
        setSetupComplete(false);
      }
    };
    checkSetup();
  }, []);

  if (setupComplete === null) {
    return <div className="h-screen w-screen bg-background" />;
  }

  if (!setupComplete) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background p-10 text-center gap-6">
        <h1 className="text-4xl font-bold text-primary">System Not Ready</h1>
        <p className="text-muted-foreground max-w-md">
          Smart Desktop Manager requires a system-level setup before it can be used.
          Please run the <strong>SDM Installer</strong> utility included with your download.
        </p>
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-500 text-sm">
          Prerequisites: Ollama & AI Models (gemma3:1b)
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="explorer-theme">
      <MainLayout />
      <Toaster />
      <SonnerToaster />
    </ThemeProvider>
  );
}

export default App;
