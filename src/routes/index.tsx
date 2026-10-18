import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/chess/Shell";
import { bootStore, useOe } from "@/lib/chess/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const booted = useOe((s) => s.booted);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    void bootStore();
  }, []);
  if (!mounted || !booted) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink text-ivory">
        <img src="/favicon.svg" alt="" className="h-16 w-16" />
        <h1 className="font-display text-4xl">OE Chess</h1>
        <p className="text-sm text-mist">Opening repertoire and endgame trainer</p>
      </main>
    );
  }
  return <Shell />;
}
