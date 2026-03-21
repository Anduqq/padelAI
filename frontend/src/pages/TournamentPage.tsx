import { useEffect, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { ScoreEditor } from "../components/ScoreEditor";
import { api } from "../lib/api";
import { formatDate, formatStatus } from "../lib/format";
import type { TournamentDetail } from "../lib/types";

function resolveNextScrollTarget(tournament: TournamentDetail) {
  const activeRound = tournament.rounds.find((round) => round.status === "active");
  if (activeRound) {
    const nextOpenMatch = activeRound.matches.find((match) => match.team_a_games === null || match.team_b_games === null);
    return nextOpenMatch ? `match-${nextOpenMatch.id}` : "live-rounds";
  }

  return "tournament-actions";
}

function BracketGraph({ graph }: { graph: TournamentDetail["bracket_graph"] }) {
  if (!graph || graph.length === 0) {
    return null;
  }

  return (
    <section className="panel">
      <p className="eyebrow">Bracket board 🧩</p>
      <h3>Knockout view</h3>
      <div className="bracket-board">
        {graph.map((stage) => (
          <article key={stage.round_id} className="bracket-column">
            <strong>{stage.title}</strong>
            <div className="bracket-match-stack">
              {stage.matches.map((match) => (
                <div key={`${stage.round_id}-${match.court_number}`} className="bracket-match">
                  <div>
                    <span>{match.team_a_label}</span>
                    <strong>{match.team_a_score ?? "-"}</strong>
                  </div>
                  <div>
                    <span>{match.team_b_label}</span>
                    <strong>{match.team_b_score ?? "-"}</strong>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TournamentPage() {
  const { tournamentId = "" } = useParams();
  const queryClient = useQueryClient();
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(null);
  const hasHandledInitialHash = useRef(false);
  const tournamentQuery = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => api.getTournament(tournamentId),
    enabled: tournamentId.length > 0
  });

  useEffect(() => {
    if (!tournamentId) {
      return undefined;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/tournaments/${tournamentId}`);

    socket.onopen = () => {
      socket.send("ready");
    };

    socket.onmessage = async () => {
      await queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      await queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
      await queryClient.invalidateQueries({ queryKey: ["my-stats"] });
    };

    return () => socket.close();
  }, [queryClient, tournamentId]);

  useEffect(() => {
    if (!tournamentQuery.data || hasHandledInitialHash.current) {
      return;
    }

    const hashTarget = window.location.hash.replace("#", "");
    if (!hashTarget) {
      return;
    }

    hasHandledInitialHash.current = true;
    setPendingScrollTarget(hashTarget);
  }, [tournamentQuery.data]);

  useEffect(() => {
    if (!pendingScrollTarget || !tournamentQuery.data) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(pendingScrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (window.location.hash === `#${pendingScrollTarget}`) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      setPendingScrollTarget(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pendingScrollTarget, tournamentQuery.data]);

  const startMutation = useMutation({
    mutationFn: () => api.startTournament(tournamentId),
    onSuccess: async (tournament) => {
      queryClient.setQueryData(["tournament", tournamentId], tournament);
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      setPendingScrollTarget("live-rounds");
    }
  });

  const nextRoundMutation = useMutation({
    mutationFn: () => api.generateNextRound(tournamentId),
    onSuccess: async (tournament) => {
      queryClient.setQueryData(["tournament", tournamentId], tournament);
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      setPendingScrollTarget(resolveNextScrollTarget(tournament));
    }
  });

  const continueAmericanoMutation = useMutation({
    mutationFn: () => api.generateNextRotation(tournamentId),
    onSuccess: async (tournament) => {
      queryClient.setQueryData(["tournament", tournamentId], tournament);
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      setPendingScrollTarget(resolveNextScrollTarget(tournament));
    }
  });

  const scoreMutation = useMutation({
    mutationFn: (payload: { matchId: string; team_a_games: number; team_b_games: number; version: number }) =>
      api.updateScore(payload.matchId, payload),
    onSuccess: async (tournament) => {
      queryClient.setQueryData(["tournament", tournamentId], tournament);
      await queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
      await queryClient.invalidateQueries({ queryKey: ["my-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      setPendingScrollTarget(resolveNextScrollTarget(tournament));
    }
  });

  const unlockRoundMutation = useMutation({
    mutationFn: (roundId: string) => api.unlockRound(tournamentId, roundId),
    onSuccess: async (tournament) => {
      queryClient.setQueryData(["tournament", tournamentId], tournament);
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      await queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
      await queryClient.invalidateQueries({ queryKey: ["my-stats"] });
      setPendingScrollTarget(resolveNextScrollTarget(tournament));
    }
  });

  const finishTournamentMutation = useMutation({
    mutationFn: () => api.finishTournament(tournamentId),
    onSuccess: async (tournament) => {
      queryClient.setQueryData(["tournament", tournamentId], tournament);
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      await queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
      await queryClient.invalidateQueries({ queryKey: ["my-stats"] });
      setPendingScrollTarget("tournament-leaderboard");
    }
  });

  const startBracketMutation = useMutation({
    mutationFn: () => api.startBracket(tournamentId),
    onSuccess: async (tournament) => {
      queryClient.setQueryData(["tournament", tournamentId], tournament);
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      await queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
      await queryClient.invalidateQueries({ queryKey: ["my-stats"] });
      setPendingScrollTarget(resolveNextScrollTarget(tournament));
    }
  });

  const continueBracketMutation = useMutation({
    mutationFn: () => api.continueBracket(tournamentId),
    onSuccess: async (tournament) => {
      queryClient.setQueryData(["tournament", tournamentId], tournament);
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      await queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
      await queryClient.invalidateQueries({ queryKey: ["my-stats"] });
      setPendingScrollTarget(resolveNextScrollTarget(tournament));
    }
  });

  if (tournamentQuery.isLoading) {
    return <section className="panel">Loading tournament...</section>;
  }

  if (!tournamentQuery.data) {
    return <section className="panel">Tournament not found.</section>;
  }

  const tournament = tournamentQuery.data;
  const activeRound = tournament.rounds.find((round) => round.status === "active");
  const scoringDescription =
    tournament.scoring_system === "americano_points" && tournament.americano_points_target
      ? `First to ${tournament.americano_points_target}`
      : "Classic";

  return (
    <div className="stack-section">
      <section className="panel">
        <div className="split-row">
          <div>
            <p className="eyebrow">{tournament.format}</p>
            <h2>{tournament.name}</h2>
          </div>
          <span className={`status-badge status-${tournament.status}`}>{formatStatus(tournament.status)}</span>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">Players</span>
            <strong className="stat-value">{tournament.participants.length}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Courts</span>
            <strong className="stat-value">{tournament.court_count}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Rounds target</span>
            <strong className="stat-value">{tournament.target_rounds ?? "Auto"}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Scoring</span>
            <strong className="stat-value">{scoringDescription}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Started</span>
            <strong className="stat-value">{formatDate(tournament.started_at)}</strong>
          </div>
        </div>

        <div className="split-row">
          <div>
            <p className="muted-text">Participants</p>
            <div className="chip-list">
              {tournament.participants.map((participant) => (
                <span key={participant.player_id} className="chip chip-static">
                  {participant.display_name}
                </span>
              ))}
            </div>
          </div>
          <div className="action-row">
            {tournament.status === "draft" ? (
              <button type="button" className="primary-button" onClick={() => startMutation.mutate()}>
                {startMutation.isPending ? "Starting..." : "Start tournament ▶️"}
              </button>
            ) : null}
            {tournament.status === "active" ? (
              <button
                type="button"
                className="ghost-button"
                disabled={
                  finishTournamentMutation.isPending ||
                  nextRoundMutation.isPending ||
                  continueAmericanoMutation.isPending ||
                  startBracketMutation.isPending ||
                  continueBracketMutation.isPending ||
                  scoreMutation.isPending
                }
                onClick={() => finishTournamentMutation.mutate()}
              >
                {finishTournamentMutation.isPending ? "Finishing..." : "Finish tournament 🏁"}
              </button>
            ) : null}
            {tournament.can_generate_next_round ? (
              <button type="button" className="primary-button" onClick={() => nextRoundMutation.mutate()}>
                {nextRoundMutation.isPending ? "Generating..." : "Generate next Mexicano round ➡️"}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {tournament.status === "active" && !activeRound ? (
        <section id="tournament-actions" className="panel action-panel">
          <p className="eyebrow">What next? 🧭</p>
          <h3>Choose how you want to wrap up the session</h3>
          <p className="muted-text">
            Finish now, continue the Americano rotations, move into the next Mexicano round, or launch and advance a
            seeded bracket built as 1 + 3 vs 2 + 4, 5 + 7 vs 6 + 8, and so on.
          </p>
          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              disabled={
                finishTournamentMutation.isPending ||
                continueAmericanoMutation.isPending ||
                nextRoundMutation.isPending ||
                startBracketMutation.isPending ||
                continueBracketMutation.isPending
              }
              onClick={() => finishTournamentMutation.mutate()}
            >
              {finishTournamentMutation.isPending ? "Finishing..." : "Finish tournament 🏁"}
            </button>
            {tournament.can_continue_americano ? (
              <button
                type="button"
                className="secondary-button"
                disabled={continueAmericanoMutation.isPending || finishTournamentMutation.isPending}
                onClick={() => continueAmericanoMutation.mutate()}
              >
                {continueAmericanoMutation.isPending ? "Building..." : "Continue rotations 🔁"}
              </button>
            ) : null}
            {tournament.can_generate_next_round ? (
              <button
                type="button"
                className="secondary-button"
                disabled={nextRoundMutation.isPending || finishTournamentMutation.isPending}
                onClick={() => nextRoundMutation.mutate()}
              >
                {nextRoundMutation.isPending ? "Generating..." : "Continue with next round ➡️"}
              </button>
            ) : null}
            {tournament.can_start_bracket ? (
              <button
                type="button"
                className="ghost-button"
                disabled={startBracketMutation.isPending || finishTournamentMutation.isPending}
                onClick={() => startBracketMutation.mutate()}
              >
                {startBracketMutation.isPending ? "Building bracket..." : "Start brackets 🧩"}
              </button>
            ) : null}
            {tournament.can_continue_bracket ? (
              <button
                type="button"
                className="ghost-button"
                disabled={continueBracketMutation.isPending || finishTournamentMutation.isPending}
                onClick={() => continueBracketMutation.mutate()}
              >
                {continueBracketMutation.isPending ? "Advancing..." : "Continue bracket 🏆"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <BracketGraph graph={tournament.bracket_graph} />

      <section className="page-columns">
        <section id="tournament-leaderboard" className="panel">
          <p className="eyebrow">Tournament leaderboard 🏆</p>
          <h3>Current standings</h3>
          <div className="table-wrap">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="leaderboard-player-cell">Player</th>
                  <th>Points</th>
                  <th>Diff</th>
                  <th>W</th>
                  <th>L</th>
                </tr>
              </thead>
              <tbody>
                {tournament.leaderboard.map((row) => (
                  <tr key={row.player_id}>
                    <td>{row.rank}</td>
                    <td className="leaderboard-player-cell">{row.display_name}</td>
                    <td>{row.points}</td>
                    <td>{row.game_diff}</td>
                    <td>{row.wins}</td>
                    <td>{row.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="live-rounds" className="panel">
          <p className="eyebrow">Live rounds 📲</p>
          <h3>Score input</h3>
          <div className="round-stack">
            {tournament.rounds.map((round) => (
              <article key={round.id} className="round-card">
                <div className="split-row">
                  <div>
                    <strong>{round.metadata?.bracket_stage ?? `Round ${round.number}`}</strong>
                    <p className="muted-text">{formatStatus(round.status)}</p>
                  </div>
                  <span className={`status-badge status-${round.status}`}>{formatStatus(round.status)}</span>
                </div>

                {round.metadata?.bench_players && round.metadata.bench_players.length > 0 ? (
                  <div className="bench-strip">
                    <span className="muted-text">Bench</span>
                    <div className="chip-list">
                      {round.metadata.bench_players.map((player) => (
                        <span key={player.player_id} className="chip chip-static">
                          {player.display_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {round.can_unlock ? (
                  <div className="action-row unlock-row">
                    <span className="muted-text">Unlock this round if a result was entered incorrectly.</span>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={unlockRoundMutation.isPending}
                      onClick={() => unlockRoundMutation.mutate(round.id)}
                    >
                      {unlockRoundMutation.isPending ? "Unlocking..." : "Unlock results"}
                    </button>
                  </div>
                ) : null}

                <div className="match-stack">
                  {round.matches.map((match) =>
                    round.status === "active" ? (
                      <div id={`match-${match.id}`} key={match.id}>
                        <ScoreEditor
                          match={match}
                          disabled={
                            scoreMutation.isPending ||
                            unlockRoundMutation.isPending ||
                            finishTournamentMutation.isPending ||
                            continueAmericanoMutation.isPending ||
                            startBracketMutation.isPending ||
                            continueBracketMutation.isPending
                          }
                          scoringSystem={tournament.scoring_system}
                          americanoPointsTarget={tournament.americano_points_target}
                          onSubmit={(payload) =>
                            scoreMutation.mutate({
                              matchId: match.id,
                              ...payload
                            })
                          }
                        />
                      </div>
                    ) : (
                      <div key={match.id} className="score-summary">
                        <div>
                          <strong>Court {match.court_number}</strong>
                          <p className="muted-text">
                            {match.team_a.map((item) => item.display_name).join(" / ")} vs{" "}
                            {match.team_b.map((item) => item.display_name).join(" / ")}
                          </p>
                        </div>
                        <strong>
                          {match.team_a_games ?? "-"} : {match.team_b_games ?? "-"}
                        </strong>
                      </div>
                    )
                  )}
                </div>
              </article>
            ))}
          </div>
          {scoreMutation.error ? <p className="error-text">{scoreMutation.error.message}</p> : null}
          {unlockRoundMutation.error ? <p className="error-text">{unlockRoundMutation.error.message}</p> : null}
          {finishTournamentMutation.error ? <p className="error-text">{finishTournamentMutation.error.message}</p> : null}
          {continueAmericanoMutation.error ? <p className="error-text">{continueAmericanoMutation.error.message}</p> : null}
          {startBracketMutation.error ? <p className="error-text">{startBracketMutation.error.message}</p> : null}
          {continueBracketMutation.error ? <p className="error-text">{continueBracketMutation.error.message}</p> : null}
        </section>
      </section>
    </div>
  );
}
