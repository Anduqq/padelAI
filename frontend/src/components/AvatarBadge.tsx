import { playerAccentColor, playerInitials } from "../lib/players";

interface AvatarBadgeProps {
  name: string;
  seed: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
}

export function AvatarBadge({ name, seed, avatarUrl, size = "md" }: AvatarBadgeProps) {
  const className = `avatar-badge avatar-${size}`;

  if (avatarUrl) {
    return <img className={className} src={avatarUrl} alt={name} />;
  }

  return (
    <span className={className} style={{ backgroundColor: playerAccentColor(seed) }}>
      {playerInitials(name)}
    </span>
  );
}
