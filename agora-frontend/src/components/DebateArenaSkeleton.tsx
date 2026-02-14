"use client";

export function DebateArenaSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-agora-border/50 bg-agora-surface/50 backdrop-blur-sm animate-pulse">
      {/* Header skeleton */}
      <div className="relative flex items-center justify-between border-b border-agora-border/50 px-6 py-4">
        {/* Left agent skeleton */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500/20 to-purple-500/5 animate-shimmer" />
          <div className="space-y-2">
            <div className="h-5 w-24 rounded bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
            <div className="h-3 w-20 rounded bg-gradient-to-r from-agora-border/30 to-agora-border/10 animate-shimmer" />
          </div>
        </div>

        {/* VS skeleton */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-16 rounded-full bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
          <div className="h-7 w-12 rounded bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
        </div>

        {/* Right agent skeleton */}
        <div className="flex items-center gap-3">
          <div className="space-y-2 text-right">
            <div className="h-5 w-24 rounded bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
            <div className="h-3 w-20 rounded bg-gradient-to-r from-agora-border/30 to-agora-border/10 animate-shimmer" />
          </div>
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/5 animate-shimmer" />
        </div>
      </div>

      {/* Topic + Phase skeleton */}
      <div className="flex items-center justify-between border-b border-agora-border/50 px-6 py-3">
        <div className="h-4 w-64 rounded bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
        <div className="h-6 w-24 rounded-full bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
      </div>

      {/* Transcript skeleton */}
      <div className="max-h-96 space-y-4 p-4">
        {/* Message 1 - left */}
        <div className="flex gap-3">
          <div className="max-w-[75%] space-y-2 rounded-lg rounded-tl-none border border-agora-border/30 bg-purple-500/5 px-4 py-3">
            <div className="h-3 w-32 rounded bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
            <div className="h-3 w-full rounded bg-gradient-to-r from-agora-border/30 to-agora-border/10 animate-shimmer" />
            <div className="h-3 w-5/6 rounded bg-gradient-to-r from-agora-border/30 to-agora-border/10 animate-shimmer" />
          </div>
        </div>

        {/* Message 2 - right */}
        <div className="flex flex-row-reverse gap-3">
          <div className="max-w-[75%] space-y-2 rounded-lg rounded-tr-none border border-agora-border/30 bg-blue-500/5 px-4 py-3">
            <div className="h-3 w-32 rounded bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
            <div className="h-3 w-full rounded bg-gradient-to-r from-agora-border/30 to-agora-border/10 animate-shimmer" />
            <div className="h-3 w-4/6 rounded bg-gradient-to-r from-agora-border/30 to-agora-border/10 animate-shimmer" />
          </div>
        </div>

        {/* Message 3 - left */}
        <div className="flex gap-3">
          <div className="max-w-[75%] space-y-2 rounded-lg rounded-tl-none border border-agora-border/30 bg-purple-500/5 px-4 py-3">
            <div className="h-3 w-32 rounded bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
            <div className="h-3 w-full rounded bg-gradient-to-r from-agora-border/30 to-agora-border/10 animate-shimmer" />
          </div>
        </div>
      </div>

      {/* Stake info skeleton */}
      <div className="flex items-center justify-between border-t border-agora-border/50 px-6 py-2">
        <div className="h-3 w-32 rounded bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded bg-gradient-to-r from-agora-border/40 to-agora-border/20 animate-shimmer" />
        </div>
      </div>

      {/* Shimmer effect overlay */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer-sweep" />
      </div>
    </div>
  );
}
