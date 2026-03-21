import { useQuery } from "@tanstack/react-query";

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

export function ProfilePage() {
  const profileQuery = useQuery({
    queryKey: ["my-stats"],
    queryFn: api.getMyStats
  });

  if (profileQuery.isLoading) {
    return <section className="panel">Loading stats...</section>;
  }

  if (!profileQuery.data) {
    return <section className="panel">No profile data yet.</section>;
  }

  const profile = profileQuery.data;
  const tournamentsPlayed = profile.stats.tournaments_played ?? profile.history.length;
  const podiumFinishes = profile.history.filter((item) => item.placement !== null && item.placement <= 3).length;
  const completedEvents = profile.history.filter((item) => item.completed_at !== null).length;
  const resultsSegments: PieSegment[] = [
    { label: "Wins", value: profile.stats.wins, color: "#49baa8" },
    { label: "Losses", value: profile.stats.losses, color: "#ff7f3f" },
    { label: "Draws", value: profile.stats.draws, color: "#ffc980" }
  ];
  const eventSegments: PieSegment[] = [
    { label: "Podiums", value: podiumFinishes, color: "#ffb347" },
    { label: "Completed", value: Math.max(0, completedEvents - podiumFinishes), color: "#49baa8" },
    { label: "Still active", value: Math.max(0, tournamentsPlayed - completedEvents), color: "#27444a" }
  ];
  const formatSegments: PieSegment[] = [
    {
      label: "Americano",
      value: profile.history.filter((item) => item.format === "americano").length,
      color: "#a7fff1"
    },
    {
      label: "Mexicano",
      value: profile.history.filter((item) => item.format === "mexicano").length,
      color: "#c5dcff"
    }
  ];

  return (
    <div className="stack-section">
      <section className="panel">
        <p className="eyebrow">My profile 📈</p>
        <h2>{profile.display_name}</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">All-time points ✨</span>
            <strong className="stat-value">{profile.stats.points}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Game diff</span>
            <strong className="stat-value">{profile.stats.game_diff}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Matches</span>
            <strong className="stat-value">{profile.stats.matches_played}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Podiums</span>
            <strong className="stat-value">{podiumFinishes}</strong>
          </div>
        </div>
      </section>

      <section className="profile-chart-grid">
        <PieStatCard
          title="Results mix 🎯"
          subtitle="How your matches break down"
          totalLabel="Matches"
          totalValue={String(profile.stats.matches_played)}
          segments={resultsSegments}
        />
        <PieStatCard
          title="Event finishes 🏅"
          subtitle="How your tournaments have ended"
          totalLabel="Events"
          totalValue={String(tournamentsPlayed)}
          segments={eventSegments}
        />
        <PieStatCard
          title="Format split 🎾"
          subtitle="Where you play most often"
          totalLabel="Events"
          totalValue={String(tournamentsPlayed)}
          segments={formatSegments}
        />
      </section>

      <section className="panel">
        <p className="eyebrow">Recent history 🕘</p>
        <h3>Last tournaments</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Format</th>
                <th>Placement</th>
                <th>Points</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {profile.history.map((item) => (
                <tr key={item.tournament_id}>
                  <td>{item.tournament_name}</td>
                  <td>{item.format}</td>
                  <td>{item.placement ?? "-"}</td>
                  <td>{item.points}</td>
                  <td>{formatDate(item.completed_at ?? item.started_at ?? item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
