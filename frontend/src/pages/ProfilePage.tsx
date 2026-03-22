import { useDeferredValue, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { AvatarBadge } from "../components/AvatarBadge";
import { EmptyState } from "../components/EmptyState";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";

interface PieSegment {
  label: string;
  value: number;
  color: string;
}

const TROPHY_ICON = "\uD83C\uDFC6";
const SILVER_ICON = "\uD83E\uDD48";
const BRONZE_ICON = "\uD83E\uDD49";
const SPARKLE_ICON = "\u2728";
const ADMIN_CAMERA_ICON = "\uD83D\uDCF8";
const HISTORY_ICON = "\uD83D\uDCDA";

function buildPieBackground(segments: PieSegment[]) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) {
    return "conic-gradient(rgba(248, 241, 231, 0.12) 0deg 360deg)";
  }

  let currentDegrees = 0;
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.value <= 0) {
      continue;
    }
    const nextDegrees = currentDegrees + (segment.value / total) * 360;
    parts.push(`${segment.color} ${currentDegrees}deg ${nextDegrees}deg`);
    currentDegrees = nextDegrees;
  }
  return `conic-gradient(${parts.join(", ")})`;
}

function PieStatCard({
  title,
  subtitle,
  totalLabel,
  totalValue,
  segments
}: {
  title: string;
  subtitle: string;
  totalLabel: string;
  totalValue: string;
  segments: PieSegment[];
}) {
  return (
    <article className="panel stat-spotlight">
      <div>
        <p className="eyebrow">{title}</p>
        <h3>{subtitle}</h3>
      </div>
      <div className="pie-stat-layout">
        <div className="pie-ring" style={{ backgroundImage: buildPieBackground(segments) }}>
          <div className="pie-ring-center">
            <span>{totalLabel}</span>
            <strong>{totalValue}</strong>
          </div>
        </div>
        <div className="pie-legend">
          {segments.map((segment) => (
            <div key={segment.label} className="legend-row">
              <span className="legend-swatch" style={{ backgroundColor: segment.color }} />
              <span>{segment.label}</span>
              <strong>{segment.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function ChemistryCard({
  eyebrow,
  title,
  emptyText,
  row
}: {
  eyebrow: string;
  title: string;
  emptyText: string;
  row: {
    player_id: string;
    display_name: string;
    avatar_url?: string | null;
    matches: number;
    wins: number;
    losses: number;
    win_rate: number;
  } | null;
}) {
  return (
    <article className="panel chemistry-card">
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      {row ? (
        <div className="chemistry-body">
          <AvatarBadge name={row.display_name} seed={row.player_id} avatarUrl={row.avatar_url} size="md" />
          <div>
            <strong>{row.display_name}</strong>
            <p className="muted-text">
              {row.matches} matches | {row.wins}W {row.losses}L | {row.win_rate}% win rate
            </p>
          </div>
        </div>
      ) : (
        <p className="muted-text">{emptyText}</p>
      )}
    </article>
  );
}

function ChemistryMiniChart({
  eyebrow,
  title,
  rows,
  metric
}: {
  eyebrow: string;
  title: string;
  rows: Array<{
    player_id: string;
    display_name: string;
    avatar_url?: string | null;
    matches: number;
    wins: number;
    losses: number;
    win_rate: number;
  }>;
  metric: "matches" | "win_rate";
}) {
  const topValue = Math.max(...rows.map((row) => (metric === "matches" ? row.matches : row.win_rate)), 1);

  return (
    <article className="panel chemistry-card">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
      </div>
      {rows.length > 0 ? (
        <div className="mini-chart-list">
          {rows.map((row) => {
            const value = metric === "matches" ? row.matches : row.win_rate;
            const width = `${Math.max(18, (value / topValue) * 100)}%`;
            return (
              <div key={`${eyebrow}-${row.player_id}`} className="mini-chart-row">
                <div className="mini-chart-copy">
                  <div className="player-row">
                    <AvatarBadge name={row.display_name} seed={row.player_id} avatarUrl={row.avatar_url} size="md" />
                    <strong>{row.display_name}</strong>
                  </div>
                  <span className="muted-text">
                    {row.matches} matches | {row.wins}W {row.losses}L
                  </span>
                </div>
                <div className="mini-chart-track">
                  <span className="mini-chart-fill" style={{ width }} />
                </div>
                <strong>{metric === "matches" ? row.matches : `${row.win_rate}%`}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted-text">Play a few more rounds and the chemistry chart will start filling up.</p>
      )}
    </article>
  );
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const [playerSearch, setPlayerSearch] = useState("");
  const deferredPlayerSearch = useDeferredValue(playerSearch.trim().toLowerCase());
  const [activeAdminUploadPlayerId, setActiveAdminUploadPlayerId] = useState<string | null>(null);

  const currentUserQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getCurrentUser
  });

  const profileQuery = useQuery({
    queryKey: ["my-stats"],
    queryFn: api.getMyStats
  });

  const playersQuery = useQuery({
    queryKey: ["players", "prod"],
    queryFn: () => api.getPlayers("prod"),
    enabled: currentUserQuery.data?.is_admin === true
  });

  const refreshPhotoQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["me"] }),
      queryClient.invalidateQueries({ queryKey: ["players"] }),
      queryClient.invalidateQueries({ queryKey: ["login-options"] }),
      queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] }),
      queryClient.invalidateQueries({ queryKey: ["elo-leaderboard"] }),
      queryClient.invalidateQueries({ queryKey: ["tournament"] }),
      queryClient.invalidateQueries({ queryKey: ["tournaments"] }),
      queryClient.invalidateQueries({ queryKey: ["head-to-head"] })
    ]);
  };

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => api.uploadMyAvatar(file),
    onSuccess: refreshPhotoQueries
  });

  const adminUploadAvatarMutation = useMutation({
    mutationFn: ({ playerId, file }: { playerId: string; file: File }) => api.uploadPlayerAvatar(playerId, file),
    onMutate: async ({ playerId }) => {
      setActiveAdminUploadPlayerId(playerId);
    },
    onSuccess: refreshPhotoQueries,
    onSettled: async () => {
      setActiveAdminUploadPlayerId(null);
    }
  });

  if (profileQuery.isLoading) {
    return <section className="panel">Loading stats...</section>;
  }

  if (!profileQuery.data) {
    return <section className="panel">No profile data yet.</section>;
  }

  const profile = profileQuery.data;
  const tournamentsPlayed = profile.stats.tournaments_played ?? profile.history.length;
  const resultsSegments: PieSegment[] = [
    { label: "Wins", value: profile.stats.wins, color: "#49baa8" },
    { label: "Losses", value: profile.stats.losses, color: "#ff7f3f" },
    { label: "Draws", value: profile.stats.draws, color: "#ffc980" }
  ];
  const gameBalanceSegments: PieSegment[] = [
    { label: "Points won", value: profile.stats.games_for, color: "#7be4d1" },
    { label: "Points allowed", value: profile.stats.games_against, color: "#27444a" }
  ];
  const unlockedBadges = profile.achievements.filter((achievement) => achievement.unlocked).length;
  const manageablePlayers =
    playersQuery.data?.filter((player) =>
      player.display_name.toLowerCase().includes(deferredPlayerSearch)
    ) ?? [];

  function badgeProgressLabel(achievement: (typeof profile.achievements)[number]) {
    if (
      achievement.unlocked ||
      !achievement.progress_target ||
      achievement.progress_target <= 1 ||
      achievement.progress_current === null ||
      achievement.progress_current === undefined
    ) {
      return null;
    }

    const clampedCurrent = Math.min(achievement.progress_current, achievement.progress_target);
    const suffix = achievement.progress_suffix ? ` ${achievement.progress_suffix}` : "";
    return `${clampedCurrent} / ${achievement.progress_target}${suffix}`;
  }

  return (
    <div className="stack-section">
      <section className="panel profile-hero">
        <div className="profile-hero-main">
          <AvatarBadge
            name={profile.display_name}
            seed={profile.player_id}
            avatarUrl={profile.avatar_url}
            size="lg"
          />
          <div className="profile-hero-copy">
            <p className="eyebrow">My stats</p>
            <h2>{profile.display_name}</h2>
            <div className="action-row">
              <label className="ghost-button upload-button">
                {uploadAvatarMutation.isPending ? "Uploading..." : "Upload my photo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    uploadAvatarMutation.mutate(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <Link className="secondary-button" to="/compare">
                Compare players
              </Link>
            </div>
            {uploadAvatarMutation.error ? <p className="error-text">{uploadAvatarMutation.error.message}</p> : null}
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">All-time points</span>
            <strong className="stat-value">{profile.stats.points}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Elo rating</span>
            <strong className="stat-value">{profile.elo_rating}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Tournaments</span>
            <strong className="stat-value">{tournamentsPlayed}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Best win streak</span>
            <strong className="stat-value">{profile.streaks.best_win_streak}</strong>
          </div>
        </div>
      </section>

      {currentUserQuery.data?.is_admin ? (
        <section className="panel stack-section">
          <div className="split-row">
            <div>
              <p className="eyebrow">Admin tools</p>
              <h3>Player photo desk</h3>
            </div>
            <span className="muted-text">
              <span aria-hidden="true">{ADMIN_CAMERA_ICON}</span> Upload avatars for everyone
            </span>
          </div>

          <label className="stack-form">
            <span>Find player</span>
            <input
              value={playerSearch}
              placeholder="Filter by player name"
              onChange={(event) => setPlayerSearch(event.target.value)}
            />
          </label>

          {adminUploadAvatarMutation.error ? <p className="error-text">{adminUploadAvatarMutation.error.message}</p> : null}

          <div className="admin-photo-grid">
            {manageablePlayers.map((player) => (
              <article key={player.id} className="admin-photo-card">
                <div className="player-row">
                  <AvatarBadge name={player.display_name} seed={player.id} avatarUrl={player.avatar_url} size="md" />
                  <div>
                    <strong>{player.display_name}</strong>
                    {player.id === profile.player_id ? <p className="muted-text">Current profile</p> : null}
                  </div>
                </div>

                <label className="ghost-button upload-button">
                  {activeAdminUploadPlayerId === player.id && adminUploadAvatarMutation.isPending
                    ? "Uploading..."
                    : "Upload photo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      adminUploadAvatarMutation.mutate({ playerId: player.id, file });
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="profile-chart-grid">
        <PieStatCard
          title="Results mix"
          subtitle="How your matches break down"
          totalLabel="Matches"
          totalValue={String(profile.stats.matches_played)}
          segments={resultsSegments}
        />
        <PieStatCard
          title="Point balance"
          subtitle="Points won versus points allowed"
          totalLabel="Diff"
          totalValue={String(profile.stats.game_diff)}
          segments={gameBalanceSegments}
        />
      </section>

      <section className="profile-chart-grid">
        <ChemistryCard
          eyebrow="Best partner"
          title="Who clicks with you"
          emptyText="Play a few matches and your best partner will show up here."
          row={profile.chemistry.best_partner}
        />
        <ChemistryCard
          eyebrow="Hardest opponent"
          title="Who gives you the most trouble"
          emptyText="No rivalry data yet."
          row={profile.chemistry.hardest_opponent}
        />
        <ChemistryCard
          eyebrow="Favorite opponent"
          title="Who you usually solve"
          emptyText="No rivalry data yet."
          row={profile.chemistry.favorite_opponent}
        />
      </section>

      <section className="profile-chart-grid">
        <ChemistryMiniChart
          eyebrow="Partner chemistry"
          title="Most-played partners"
          rows={profile.chemistry.partners}
          metric="matches"
        />
        <ChemistryMiniChart
          eyebrow="Rival radar"
          title="Most-played opponents"
          rows={profile.chemistry.opponents}
          metric="win_rate"
        />
      </section>

      <section className="panel stack-section">
        <div className="split-row">
          <div>
            <p className="eyebrow">Trophy shelf</p>
            <h3>Podium cabinet</h3>
          </div>
          <div className="streak-chip">
            <span>Current unbeaten streak</span>
            <strong>{profile.streaks.current_unbeaten_streak}</strong>
          </div>
        </div>
        <div className="trophy-shelf">
          <article className="trophy-card">
            <span className="trophy-icon" aria-hidden="true">
              {TROPHY_ICON}
            </span>
            <strong>{profile.trophies.champion}</strong>
            <span>Championships</span>
          </article>
          <article className="trophy-card">
            <span className="trophy-icon" aria-hidden="true">
              {SILVER_ICON}
            </span>
            <strong>{profile.trophies.runner_up}</strong>
            <span>Runner-up</span>
          </article>
          <article className="trophy-card">
            <span className="trophy-icon" aria-hidden="true">
              {BRONZE_ICON}
            </span>
            <strong>{profile.trophies.third_place}</strong>
            <span>Third place</span>
          </article>
          <article className="trophy-card">
            <span className="trophy-icon" aria-hidden="true">
              {SPARKLE_ICON}
            </span>
            <strong>{profile.trophies.podiums}</strong>
            <span>Total podiums</span>
          </article>
        </div>
      </section>

      <section className="panel stack-section">
        <div className="split-row">
          <div>
            <p className="eyebrow">Achievement tags</p>
            <h3>Club badges</h3>
          </div>
          <div className="streak-chip">
            <span>Unlocked</span>
            <strong>
              {unlockedBadges}/{profile.achievements.length}
            </strong>
          </div>
        </div>
        <div className="achievement-grid">
          {profile.achievements.map((achievement) => (
            <article
              key={achievement.slug}
              className={`achievement-card ${achievement.unlocked ? "" : "achievement-card-locked"}`}
            >
              <span className="achievement-icon" aria-hidden="true">
                {achievement.icon}
              </span>
              <strong>{achievement.title}</strong>
              <p className="muted-text">{achievement.description}</p>
              {badgeProgressLabel(achievement) ? (
                <p className="achievement-progress-copy">{badgeProgressLabel(achievement)}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="split-row">
          <div>
            <p className="eyebrow">Recent history</p>
            <h3>Last tournaments</h3>
          </div>
        </div>

        {profile.history.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tournament</th>
                  <th>Placement</th>
                  <th>Points</th>
                  <th>W-L</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {profile.history.map((item) => (
                  <tr key={item.tournament_id}>
                    <td>{item.tournament_name}</td>
                    <td>{item.placement ?? "-"}</td>
                    <td>{item.points}</td>
                    <td>
                      {item.wins}-{item.losses}
                    </td>
                    <td>{formatDate(item.completed_at ?? item.started_at ?? item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={HISTORY_ICON}
            title="No tournament history yet"
            description="Once you finish a few nights on court, the recent history table will start filling up."
          />
        )}
      </section>
    </div>
  );
}
