import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import { formatDate } from "../lib/format";

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

  return (
    <div className="stack-section">
      <section className="panel">
        <p className="eyebrow">My profile</p>
        <h2>{profile.display_name}</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <span>Points</span>
            <strong>{profile.stats.points}</strong>
          </div>
          <div className="stat-card">
            <span>Game diff</span>
            <strong>{profile.stats.game_diff}</strong>
          </div>
          <div className="stat-card">
            <span>Matches</span>
            <strong>{profile.stats.matches_played}</strong>
          </div>
          <div className="stat-card">
            <span>Wins</span>
            <strong>{profile.stats.wins}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">Recent history</p>
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
