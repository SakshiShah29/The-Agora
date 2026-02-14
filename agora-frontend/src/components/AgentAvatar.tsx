import Image from "next/image";

interface AgentAvatarProps {
  avatar: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  beliefColor?: string;
  inactive?: boolean;
}

const SIZES = {
  sm: { container: "h-8 w-8", ring: 2 },
  md: { container: "h-12 w-12", ring: 2 },
  lg: { container: "h-20 w-20", ring: 3 },
  xl: { container: "h-28 w-28", ring: 3 },
};

export function AgentAvatar({ avatar, name, size = "md", beliefColor, inactive }: AgentAvatarProps) {
  const s = SIZES[size];

  return (
    <div
      className={`relative ${s.container} overflow-hidden rounded-full ${inactive ? "opacity-40 grayscale" : ""}`}
      style={beliefColor && !inactive ? { boxShadow: `0 0 12px 2px ${beliefColor}40` } : {}}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={beliefColor && !inactive ? { border: `${s.ring}px solid ${beliefColor}60` } : { border: `${s.ring}px solid #2a2a3a` }}
      />
      <Image
        src={`/agents/assets/${avatar}`}
        alt={name}
        fill
        className="rounded-full object-cover"
        sizes={s.container.includes("28") ? "112px" : s.container.includes("20") ? "80px" : "48px"}
      />
    </div>
  );
}