import { useState } from "react";

import { Link } from "react-router-dom";

import { formatDate, formatStatus } from "../lib/format";
import type { TournamentSummary } from "../lib/types";

interface TournamentCardProps {
  tournament: TournamentSummary;
  busy?: boolean;
  onStart?: (tournamentId: string) => void;
  onDelete?: (tournament: TournamentSummary) => void;
}

export function TournamentCard({ tournament, busy = false, onStart, onDelete }: TournamentCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canShowMenu = Boolean(onDelete || (tournament.status === "draft" && onStart));

  return (
    <article className="panel tournament-card">
      <div className="tournament-card-header">
        <div>
          <p className="eyebrow">{tournament.format}</p>
          <h3>{tournament.name}</h3>
        </div>
        <div className="tournament-card-actions">
          <span className={`status-badge status-${tournament.status}`}>{formatStatus(tournament.status)}</span>
          {canShowMenu ? (
            <details
              className="context-menu-shell"
              onToggle={(event) => {
                if (!(event.currentTarget as HTMLDetailsElement).open) {
                  setConfirmDelete(false);
                }
              }}
            >
              <summary className="ghost-button menu-toggle">Menu</summary>
              <div className="context-menu">
                <Link className="context-menu-item" to={`/tournaments/${tournament.id}`}>
                  Open board
                </Link>
                {tournament.status === "draft" && onStart ? (
                  <button
                    type="button"
                    className="context-menu-item"
                    disabled={busy}
                    onClick={() => onStart(tournament.id)}
                  >
                    Start tournament
                  </button>
                ) : null}
                {onDelete ? (
                  confirmDelete ? (
                    <>
                      <button
                        type="button"
                        className="context-menu-item context-menu-item-danger"
                        disabled={busy}
                        onClick={() => onDelete(tournament)}
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        className="context-menu-item"
                        disabled={busy}
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="context-menu-item context-menu-item-danger"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete tournament
                    </button>
                  )
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>

      <div className="card-meta-grid">
        <div className="meta-tile">
          <span className="meta-label">Players</span>
          <strong className="meta-value">{tournament.participant_count}</strong>
        </div>
        <div className="meta-tile">
          <span className="meta-label">Courts</span>
          <strong className="meta-value">{tournament.court_count}</strong>
        </div>
      </div>

      <p className="muted-text">Created {formatDate(tournament.created_at)}</p>
      <Link className="button-link" to={`/tournaments/${tournament.id}`}>
        {tournament.status === "active" ? "Open live board" : "Open tournament"}
      </Link>
    </article>
  );
}
