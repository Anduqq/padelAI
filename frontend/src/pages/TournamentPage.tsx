import { useEffect, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { AvatarBadge } from "../components/AvatarBadge";
import { ScoreEditor } from "../components/ScoreEditor";
import { api } from "../lib/api";
import { formatDate, formatStatus } from "../lib/format";
import { downloadTournamentShareImage, openTournamentWhatsAppShare } from "../lib/share";
import type { LeaderboardRow, TournamentDetail } from "../lib/types";

const TROPHY_ICON = "\uD83C\uDFC6";
const SILVER_ICON = "\uD83E\uDD48";
const BRONZE_ICON = "\uD83E\uDD49";
const BRACKET_ICON = "\uD83E\uDDE9";

function resolveNextScrollTarget(tournament: TournamentDetail) {
  const activeRound = tournament.rounds.find((round) => round.status === "active");
  if (activeRound) {
    const nextOpenMatch = activeRound.matches.find((match) => match.team_a_games === null || match.team_b_games === null);
    return nextOpenMatch ? `match-${nextOpenMatch.id}` : "live-rounds";
  }

  return "tournament-actions";
}

function teamLabelLines(label: string) {
  return label.split(" + ").map((item) => item.trim());
}

function winningLabel(match: { team_a_label: string; team_b_label: string; team_a_score: number | null; team_b_score: number | null }) {
  if (match.team_a_score === null || match.team_b_score === null || match.team_a_score === match.team_b_score) {
    return null;
  }
  return match.team_a_score > match.team_b_score ? match.team_a_label : match.team_b_label;
}

function placementLabel(rank: number, isCompleted: boolean) {
  if (!isCompleted) {
    return String(rank);
  }

  if (rank === 1) {
    return "Champion";
  }
  if (rank === 2) {
    return "Runner-up";
  }
  if (rank === 3) {
    return "Third";
  }

  return String(rank);
}

function Podium({ tournament }: { tournament: TournamentDetail }) {
  const champion = tournament.leaderboard[0];
  const runnerUp = tournament.leaderboard[1];
  const thirdPlace = tournament.leaderboard[2];

  if (!champion) {
    return null;
  }

  return (
    <section className="podium-panel confetti-panel">
      <div className="split-row">
        <div>
          <p className="eyebrow">Final leaderboard</p>
          <h3>Podium finish</h3>
        </div>
        <div className="action-row">
          <span className="podium-ribbon">
            <span role="img" aria-label="trophy">
              {TROPHY_ICON}
            </span>{" "}
            Finished
          </span>
          <button type="button" className="secondary-button" onClick={() => openTournamentWhatsAppShare(tournament)}>
            Share on WhatsApp
          </button>
          <button type="button" className="ghost-button" onClick={() => downloadTournamentShareImage(tournament)}>
            Download share image
          </button>
        </div>
      </div>

      <article className="podium-hero">
        <div className="podium-hero-icon-wrap">
          <span className="podium-hero-icon" role="img" aria-label="trophy">
            {TROPHY_ICON}
          </span>
          <AvatarBadge
            name={champion.display_name}
            seed={champion.player_id}
            avatarUrl={champion.avatar_url}
            size="lg"
          />
        </div>
        <div className="podium-hero-copy">
          <span className="podium-hero-label">Champion</span>
          <strong>{champion.display_name}</strong>
          <span>
            {champion.points} pts • {champion.wins}W {champion.losses}L
          </span>
        </div>
      </article>

      <div className="podium-grid">
        {runnerUp ? (
          <article className="podium-card podium-card-silver">
            <span className="podium-card-icon" role="img" aria-label="silver medal">
              {SILVER_ICON}
            </span>
            <span className="podium-card-label">Runner-up</span>
            <strong>{runnerUp.display_name}</strong>
            <span>
              {runnerUp.points} pts • {runnerUp.wins}W {runnerUp.losses}L
            </span>
          </article>
        ) : null}

        {thirdPlace ? (
          <article className="podium-card podium-card-bronze">
            <span className="podium-card-icon" role="img" aria-label="bronze medal">
              {BRONZE_ICON}
            </span>
            <span className="podium-card-label">Third place</span>
            <strong>{thirdPlace.display_name}</strong>
            <span>
              {thirdPlace.points} pts • {thirdPlace.wins}W {thirdPlace.losses}L
            </span>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function BracketGraph({ graph }: { graph: TournamentDetail["bracket_graph"] }) {
  if (!graph || graph.length === 0) {
    return null;
  }

  const lastStage = graph[graph.length - 1];
  const hasBronzeMatch = lastStage.title === "Finals" && lastStage.matches.length > 1;
  const mainStages =
    hasBronzeMatch ? [...graph.slice(0, -1), { ...lastStage, matches: lastStage.matches.slice(0, 1) }] : graph;
  const bronzeMatch = hasBronzeMatch ? lastStage.matches[1] : null;

  const teamBoxHeight = 52;
  const teamGap = 14;
  const boxWidth = 230;
  const stageGap = 100;
  const matchGap = 32;
  const blockHeight = teamBoxHeight * 2 + teamGap;

  const stageLayouts: Array<Array<{ topY: number; centerY: number }>> = [];
  mainStages.forEach((stage, stageIndex) => {
    if (stageIndex === 0) {
      stageLayouts.push(
        stage.matches.map((_, matchIndex) => {
          const topY = 40 + matchIndex * (blockHeight + matchGap);
          return {
            topY,
            centerY: topY + blockHeight / 2
          };
        })
      );
      return;
    }

    const previousStage = stageLayouts[stageIndex - 1];
    stageLayouts.push(
      stage.matches.map((_, matchIndex) => {
        const firstSource = previousStage[Math.min(matchIndex * 2, previousStage.length - 1)];
        const secondSource = previousStage[Math.min(matchIndex * 2 + 1, previousStage.length - 1)];
        const centerY = (firstSource.centerY + secondSource.centerY) / 2;
        return {
          topY: centerY - blockHeight / 2,
          centerY
        };
      })
    );
  });

  const svgHeight =
    Math.max(
      blockHeight + 80,
      ...stageLayouts.flat().map((layout) => layout.topY + blockHeight)
    ) + 48;
  const finalStageIndex = mainStages.length - 1;
  const finalMatch = mainStages[finalStageIndex].matches[0];
  const championCenterY = stageLayouts[finalStageIndex][0].centerY;
  const championLabel = winningLabel(finalMatch) ?? "Champion pending";
  const championX = finalStageIndex * (boxWidth + stageGap) + boxWidth + stageGap;
  const svgWidth = championX + 260;

  return (
    <section className="panel">
      <div className="split-row">
        <div>
          <p className="eyebrow">
            Bracket board{" "}
            <span role="img" aria-label="bracket">
              {BRACKET_ICON}
            </span>
          </p>
          <h3>Knockout tree</h3>
        </div>
      </div>

      <div className="bracket-tree-wrap">
        <svg className="bracket-tree" viewBox={`0 0 ${svgWidth} ${svgHeight}`} aria-label="Tournament bracket">
          {mainStages.map((stage, stageIndex) => {
            const stageX = stageIndex * (boxWidth + stageGap);
            return (
              <g key={stage.round_id}>
                <text x={stageX} y={22} className="bracket-stage-title">
                  {stage.title}
                </text>

                {stage.matches.map((match, matchIndex) => {
                  const layout = stageLayouts[stageIndex][matchIndex];
                  const nextStageLayouts = stageLayouts[stageIndex + 1];
                  const currentRight = stageX + boxWidth;
                  const topRowY = layout.topY;
                  const bottomRowY = layout.topY + teamBoxHeight + teamGap;
                  const topCenterY = topRowY + teamBoxHeight / 2;
                  const bottomCenterY = bottomRowY + teamBoxHeight / 2;
                  const targetIndex = nextStageLayouts ? Math.min(Math.floor(matchIndex / 2), nextStageLayouts.length - 1) : -1;
                  const targetCenterY = targetIndex >= 0 ? nextStageLayouts[targetIndex].centerY : null;
                  const elbowX = currentRight + stageGap / 2;
                  const winner = winningLabel(match);
                  const highlightTeamA = match.team_a_label === championLabel;
                  const highlightTeamB = match.team_b_label === championLabel;
                  const highlightConnector = winner === championLabel && targetCenterY !== null;

                  return (
                    <g key={`${stage.round_id}-${match.court_number}`}>
                      <rect
                        x={stageX}
                        y={topRowY}
                        width={boxWidth}
                        height={teamBoxHeight}
                        rx={14}
                        className={highlightTeamA ? "bracket-box bracket-box-highlight" : "bracket-box"}
                      />
                      <rect
                        x={stageX}
                        y={bottomRowY}
                        width={boxWidth}
                        height={teamBoxHeight}
                        rx={14}
                        className={highlightTeamB ? "bracket-box bracket-box-highlight" : "bracket-box"}
                      />

                      <text
                        x={stageX + 14}
                        y={topRowY + 20}
                        className={highlightTeamA ? "bracket-label bracket-label-highlight" : "bracket-label"}
                      >
                        {teamLabelLines(match.team_a_label).map((line, lineIndex) => (
                          <tspan key={`${stage.round_id}-${match.court_number}-a-${lineIndex}`} x={stageX + 14} dy={lineIndex === 0 ? 0 : 14}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                      <text
                        x={stageX + 14}
                        y={bottomRowY + 20}
                        className={highlightTeamB ? "bracket-label bracket-label-highlight" : "bracket-label"}
                      >
                        {teamLabelLines(match.team_b_label).map((line, lineIndex) => (
                          <tspan key={`${stage.round_id}-${match.court_number}-b-${lineIndex}`} x={stageX + 14} dy={lineIndex === 0 ? 0 : 14}>
                            {line}
                          </tspan>
                        ))}
                      </text>

                      <text x={stageX + boxWidth - 18} y={topRowY + 31} textAnchor="end" className="bracket-score">
                        {match.team_a_score ?? "-"}
                      </text>
                      <text x={stageX + boxWidth - 18} y={bottomRowY + 31} textAnchor="end" className="bracket-score">
                        {match.team_b_score ?? "-"}
                      </text>

                      {targetCenterY !== null ? (
                        <>
                          <path
                            className={highlightConnector ? "bracket-connector bracket-connector-highlight" : "bracket-connector"}
                            d={`M ${currentRight} ${topCenterY} H ${elbowX} V ${targetCenterY} H ${stageX + boxWidth + stageGap}`}
                          />
                          <path
                            className={highlightConnector ? "bracket-connector bracket-connector-highlight" : "bracket-connector"}
                            d={`M ${currentRight} ${bottomCenterY} H ${elbowX} V ${targetCenterY} H ${stageX + boxWidth + stageGap}`}
                          />
                        </>
                      ) : null}
                    </g>
                  );
                })}

                {stage.carryover_label ? (
                  <g>
                    <rect
                      x={stageX}
                      y={svgHeight - 66}
                      width={boxWidth}
                      height={44}
                      rx={14}
                      className="bracket-bye-box"
                    />
                    <text x={stageX + 14} y={svgHeight - 38} className="bracket-bye-label">
                      Bye: {stage.carryover_label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          <g>
            <rect x={championX} y={championCenterY - 42} width={210} height={84} rx={18} className="bracket-champion-box" />
            <text x={championX + 105} y={championCenterY - 12} textAnchor="middle" className="bracket-champion-title">
              Champion
            </text>
            <text x={championX + 105} y={championCenterY + 4} textAnchor="middle" className="bracket-champion-name">
              {teamLabelLines(championLabel).map((line, lineIndex) => (
                <tspan key={`champion-${lineIndex}`} x={championX + 105} dy={lineIndex === 0 ? 0 : 15}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        </svg>
      </div>

      {bronzeMatch ? (
        <article className="small-final-card">
          <div className="split-row">
            <strong>Bronze match</strong>
            <span className="muted-text">Small final</span>
          </div>
          <div className="small-final-score">
            <span>{bronzeMatch.team_a_label}</span>
            <strong>{bronzeMatch.team_a_score ?? "-"}</strong>
          </div>
          <div className="small-final-score">
            <span>{bronzeMatch.team_b_label}</span>
            <strong>{bronzeMatch.team_b_score ?? "-"}</strong>
          </div>
        </article>
      ) : null}
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
  const canAdvance =
    tournament.can_generate_next_round ||
    tournament.can_continue_americano ||
    tournament.can_start_bracket ||
    tournament.can_continue_bracket;
  const mobilePrimaryAction = (() => {
    if (tournament.status === "draft") {
      return {
        label: startMutation.isPending ? "Starting..." : "Start",
        onClick: () => startMutation.mutate()
      };
    }
    if (tournament.status === "completed") {
      return {
        label: "Share",
        onClick: () => openTournamentWhatsAppShare(tournament)
      };
    }
    if (activeRound) {
      return {
        label: "Next score",
        onClick: () => setPendingScrollTarget(resolveNextScrollTarget(tournament))
      };
    }
    if (tournament.can_continue_americano) {
      return {
        label: continueAmericanoMutation.isPending ? "Building..." : "Next round",
        onClick: () => continueAmericanoMutation.mutate()
      };
    }
    if (tournament.can_generate_next_round) {
      return {
        label: nextRoundMutation.isPending ? "Generating..." : "Next round",
        onClick: () => nextRoundMutation.mutate()
      };
    }
    if (tournament.can_continue_bracket) {
      return {
        label: continueBracketMutation.isPending ? "Advancing..." : "Advance bracket",
        onClick: () => continueBracketMutation.mutate()
      };
    }
    if (tournament.can_start_bracket) {
      return {
        label: startBracketMutation.isPending ? "Building..." : "Start bracket",
        onClick: () => startBracketMutation.mutate()
      };
    }
    return null;
  })();

  return (
    <div className="stack-section">
      <section className={`panel ${tournament.status === "completed" ? "confetti-panel" : ""}`}>
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
                  <span className="player-row">
                    <AvatarBadge
                      name={participant.display_name}
                      seed={participant.player_id}
                      avatarUrl={participant.avatar_url}
                      size="sm"
                    />
                    <span>{participant.display_name}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="action-row">
            {tournament.status === "draft" ? (
              <button type="button" className="primary-button" onClick={() => startMutation.mutate()}>
                {startMutation.isPending ? "Starting..." : "Start tournament"}
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
                {finishTournamentMutation.isPending ? "Finishing..." : "Finish tournament"}
              </button>
            ) : null}

            {tournament.status === "completed" ? (
              <button type="button" className="secondary-button" onClick={() => openTournamentWhatsAppShare(tournament)}>
                Share on WhatsApp
              </button>
            ) : null}

            {tournament.can_generate_next_round ? (
              <button type="button" className="primary-button" onClick={() => nextRoundMutation.mutate()}>
                {nextRoundMutation.isPending ? "Generating..." : "Generate next Mexicano round"}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {tournament.status === "active" && !activeRound ? (
        <section id="tournament-actions" className="panel action-panel">
          <p className="eyebrow">What next?</p>
          <h3>Choose the next step</h3>
          <p className="muted-text">
            Finish the tournament now, continue the Americano rotation, move into the next Mexicano round, or start a
            seeded bracket built from the standings.
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
              {finishTournamentMutation.isPending ? "Finishing..." : "Finish tournament"}
            </button>

            {tournament.can_continue_americano ? (
              <button
                type="button"
                className="secondary-button"
                disabled={continueAmericanoMutation.isPending || finishTournamentMutation.isPending}
                onClick={() => continueAmericanoMutation.mutate()}
              >
                {continueAmericanoMutation.isPending ? "Building..." : "Continue rotations"}
              </button>
            ) : null}

            {tournament.can_generate_next_round ? (
              <button
                type="button"
                className="secondary-button"
                disabled={nextRoundMutation.isPending || finishTournamentMutation.isPending}
                onClick={() => nextRoundMutation.mutate()}
              >
                {nextRoundMutation.isPending ? "Generating..." : "Continue with next round"}
              </button>
            ) : null}

            {tournament.can_start_bracket ? (
              <button
                type="button"
                className="ghost-button"
                disabled={startBracketMutation.isPending || finishTournamentMutation.isPending}
                onClick={() => startBracketMutation.mutate()}
              >
                {startBracketMutation.isPending ? "Building bracket..." : "Start brackets"}
              </button>
            ) : null}

            {tournament.can_continue_bracket ? (
              <button
                type="button"
                className="ghost-button"
                disabled={continueBracketMutation.isPending || finishTournamentMutation.isPending}
                onClick={() => continueBracketMutation.mutate()}
              >
                {continueBracketMutation.isPending ? "Advancing..." : "Continue bracket"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <BracketGraph graph={tournament.bracket_graph} />

      <section className="page-columns">
        <section id="tournament-leaderboard" className="panel">
          <p className="eyebrow">Tournament leaderboard</p>
          <h3>{tournament.status === "completed" ? "Final standings" : "Current standings"}</h3>

          {tournament.status === "completed" ? <Podium tournament={tournament} /> : null}

          <div className="table-wrap">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Place</th>
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
                    <td className="leaderboard-place-cell">{placementLabel(row.rank, tournament.status === "completed")}</td>
                    <td className="leaderboard-player-cell">
                      <div className="player-row">
                        <AvatarBadge name={row.display_name} seed={row.player_id} avatarUrl={row.avatar_url} size="sm" />
                        <span>{row.display_name}</span>
                      </div>
                    </td>
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
          <p className="eyebrow">Live rounds</p>
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
                          <span className="player-row">
                            <AvatarBadge name={player.display_name} seed={player.player_id} avatarUrl={player.avatar_url} size="sm" />
                            <span>{player.display_name}</span>
                          </span>
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

      <div className="mobile-action-dock">
        {mobilePrimaryAction ? (
          <button type="button" className="primary-button" onClick={mobilePrimaryAction.onClick}>
            {mobilePrimaryAction.label}
          </button>
        ) : null}

        {tournament.status === "active" ? (
          <button
            type="button"
            className="ghost-button"
            disabled={finishTournamentMutation.isPending || (!activeRound && !canAdvance)}
            onClick={() => finishTournamentMutation.mutate()}
          >
            Finish
          </button>
        ) : null}

        {tournament.status === "completed" ? (
          <button type="button" className="ghost-button" onClick={() => downloadTournamentShareImage(tournament)}>
            Image
          </button>
        ) : null}
      </div>
    </div>
  );
}
