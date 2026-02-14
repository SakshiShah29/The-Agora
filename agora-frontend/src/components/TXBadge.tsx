import { MONAD_EXPLORER } from "@/lib/constants";

interface TxBadgeProps {
  txHash: string;
  short?: boolean;
}

export function TxBadge({ txHash, short = true }: TxBadgeProps) {
  const display = short
    ? `${txHash.slice(0, 6)}...${txHash.slice(-4)}`
    : txHash;

  return (
    <a
      href={`${MONAD_EXPLORER}/tx/${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md bg-agora-surface px-2 py-0.5 font-mono text-xs text-agora-textSecondary transition-colors hover:bg-agora-surfaceHover hover:text-agora-text"
    >
      {display}
      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
        <path d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}