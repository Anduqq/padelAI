import { Link } from "react-router-dom";

import { formatDate, formatStatus } from "../lib/format";
import type { TournamentSummary } from "../lib/types";

export function TournamentCard({ tournament }: { tournament: TournamentSummary }) {
  return (
    <article className="panel tournament-card">
      <div className="split-row">
        <div>
          <p className="eyebrow">{tournament.format}</p>
          <h3>{tournament.name}</h3>
        </div>
        <span className={`status-badge status-${tournament.status}`}>{formatStatus(tournament.status)}</span>
      </div>
      <p className="muted-text">
        {tournament.participant_count} players • {tournament.court_count} courts
      </p>
      <p className="muted-text">Created {formatDate(tournament.created_at)}</p>
      <Link className="button-link" to={`/tournaments/${tournament.id}`}>
        Open tournament
      </Link>
    </article>
  );
}
