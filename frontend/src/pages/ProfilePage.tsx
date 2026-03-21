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
              {row.matches} matches • {row.wins}W {row.losses}L • {row.win_rate}% win rate
            </p>
          </div>
        </div>
      ) : (
        <p className="muted-text">{emptyText}</p>
      )}
    </article>
  );
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["my-stats"],
    queryFn: api.getMyStats
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => api.uploadMyAvatar(file),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["login-options"] }),
        queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["elo-leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["tournament"] })
      ]);
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
    { label: "Games won", value: profile.stats.games_for, color: "#7be4d1" },
    { label: "Games conceded", value: profile.stats.games_against, color: "#27444a" }
  ];

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
                {uploadAvatarMutation.isPending ? "Uploading..." : "Upload photo"}
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

      <section className="profile-chart-grid">
        <PieStatCard
          title="Results mix"
          subtitle="How your matches break down"
          totalLabel="Matches"
          totalValue={String(profile.stats.matches_played)}
          segments={resultsSegments}
        />
        <PieStatCard
          title="Game balance"
          subtitle="Points scored versus points allowed"
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
              🏆
            </span>
            <strong>{profile.trophies.champion}</strong>
            <span>Championships</span>
          </article>
          <article className="trophy-card">
            <span className="trophy-icon" aria-hidden="true">
              🥈
            </span>
            <strong>{profile.trophies.runner_up}</strong>
            <span>Runner-up</span>
          </article>
          <article className="trophy-card">
            <span className="trophy-icon" aria-hidden="true">
              🥉
            </span>
            <strong>{profile.trophies.third_place}</strong>
            <span>Third place</span>
          </article>
          <article className="trophy-card">
            <span className="trophy-icon" aria-hidden="true">
              ✨
            </span>
            <strong>{profile.trophies.podiums}</strong>
            <span>Total podiums</span>
          </article>
        </div>
      </section>

      <section className="panel stack-section">
        <div>
          <p className="eyebrow">Achievement tags</p>
          <h3>Club badges</h3>
        </div>
        {profile.achievements.length > 0 ? (
          <div className="achievement-grid">
            {profile.achievements.map((achievement) => (
              <article key={achievement.slug} className="achievement-card">
                <span className="achievement-icon" aria-hidden="true">
                  {achievement.icon}
                </span>
                <strong>{achievement.title}</strong>
                <p className="muted-text">{achievement.description}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🌱"
            title="Badges will start stacking soon"
            description="Keep playing and the club tags will begin to unlock here."
          />
        )}
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
            icon="📚"
            title="No tournament history yet"
            description="Once you finish a few nights on court, the recent history table will start filling up."
          />
        )}
      </section>
    </div>
  );
}
