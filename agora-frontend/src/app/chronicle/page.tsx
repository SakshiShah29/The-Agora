"use client";
import { usePolling } from "@/lib/hook";
import { Verdict } from "@/lib/types";
import { ActivityFeed } from "@/components/ActivityFeed";
import { VerdictCard } from "@/components/VerdictCard";

export default function ChroniclePage() {
  const { data: verdictData } = usePolling<{ verdicts: Verdict[] }>("/api/frontend/verdicts", 10000);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-black">The Chronicle</h1>
        <p className="mt-1 text-sm text-agora-textSecondary">
          Every event. Every verdict. The complete record of The Agora.
        </p>
      </div>

      {verdictData && verdictData.verdicts.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-agora-gold">⚖️ Verdicts</h2>
          <div className="space-y-3">
            {verdictData.verdicts.map((v) => (
              <VerdictCard key={v.debateId} verdict={v} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-agora-textSecondary">All Activity</h2>
        <div className="rounded-xl border border-agora-border bg-agora-surface p-4">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}