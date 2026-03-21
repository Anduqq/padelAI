import { startTransition, useDeferredValue, useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { AvatarBadge } from "../components/AvatarBadge";
import { EmptyState } from "../components/EmptyState";
import { TournamentCard } from "../components/TournamentCard";
import { api } from "../lib/api";
import type { ScoringSystem, TournamentFormat } from "../lib/types";

function buildDefaultTournamentName(format: TournamentFormat) {
  const label = format === "americano" ? "Americano" : "Mexicano";
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date());
  return `${label} ${dateLabel}`;
}

function getRecommendedAmericanoTarget(activePlayerCount: number) {
  if (activePlayerCount === 8) {
    return 17;
  }
  if (activePlayerCount === 12) {
    return 13;
  }
  return null;
}

function getRecommendedScoringSetup(format: TournamentFormat, activePlayerCount: number) {
  if (format !== "americano" || activePlayerCount === 4) {
    return { scoringSystem: "classic" as const, americanoPointsTarget: null };
  }

  return {
    scoringSystem: "americano_points" as const,
    americanoPointsTarget: getRecommendedAmericanoTarget(activePlayerCount)
  };
}

function describeSelection(selectedCount: number, courtCount: number) {
  const activeCourts = Math.min(courtCount, Math.floor(selectedCount / 4));
  const activePlayerCount = activeCourts * 4;
  const benchCount = selectedCount - activePlayerCount;
  const supported = activePlayerCount >= 4 && (benchCount === 0 || benchCount === 1);

  if (selectedCount < 4) {
    return {
      activeCourts,
      activePlayerCount,
      benchCount,
      supported,
      message: "Select at least 4 players to build a tournament."
    };
  }

  if (benchCount > 1) {
    return {
      activeCourts,
      activePlayerCount,
      benchCount,
      supported,
      message: "This version supports full courts plus at most 1 benched player per round."
    };
  }

  const courtsMessage =
    activeCourts < courtCount
      ? `${activeCourts} of ${courtCount} courts will be used.`
      : `${activeCourts} courts will be used.`;
  const benchMessage =
    benchCount === 1 ? " One player will rotate on the bench each round." : " Everyone will play every round.";

  return {
    activeCourts,
    activePlayerCount,
    benchCount,
    supported,
    message: `${courtsMessage}${benchMessage}`
  };
}

export function DashboardPage() {
  const [format, setFormat] = useState<TournamentFormat>("americano");
  const [name, setName] = useState(() => buildDefaultTournamentName("americano"));
  const [courtCount, setCourtCount] = useState(2);
  const [targetRounds, setTargetRounds] = useState(5);
  const [scoringSystem, setScoringSystem] = useState<ScoringSystem>("classic");
  const [americanoPointsTarget, setAmericanoPointsTarget] = useState("");
  const [hasCustomScoring, setHasCustomScoring] = useState(false);
  const [hasCustomAmericanoTarget, setHasCustomAmericanoTarget] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [newPlayerName, setNewPlayerName] = useState("");
  const deferredSearch = useDeferredValue(playerSearch);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const tournamentsQuery = useQuery({ queryKey: ["tournaments"], queryFn: api.getTournaments });
  const playersQuery = useQuery({ queryKey: ["players"], queryFn: api.getPlayers });
  const suggestionsQuery = useQuery({ queryKey: ["suggestions"], queryFn: api.getSuggestions });
  const selectionState = describeSelection(selectedPlayers.length, courtCount);
  const recommendedScoring = getRecommendedScoringSetup(format, selectionState.activePlayerCount);
  const canSubmit =
    selectionState.supported &&
    name.trim().length >= 3 &&
    (format !== "americano" || scoringSystem === "classic" || americanoPointsTarget.trim().length > 0);

  useEffect(() => {
    if (format !== "americano") {
      setScoringSystem("classic");
      setAmericanoPointsTarget("");
      setHasCustomScoring(false);
      setHasCustomAmericanoTarget(false);
      return;
    }

    if (!hasCustomScoring) {
      setScoringSystem(recommendedScoring.scoringSystem);
    }

    if (!hasCustomAmericanoTarget) {
      setAmericanoPointsTarget(
        recommendedScoring.americanoPointsTarget ? String(recommendedScoring.americanoPointsTarget) : ""
      );
    }
  }, [
    format,
    recommendedScoring.americanoPointsTarget,
    recommendedScoring.scoringSystem,
    hasCustomAmericanoTarget,
    hasCustomScoring
  ]);

  const createTournament = useMutation({
    mutationFn: () =>
      api.createTournament({
        name,
        format,
        court_count: courtCount,
        target_rounds: format === "mexicano" ? targetRounds : null,
        scoring_system: format === "americano" ? scoringSystem : "classic",
        americano_points_target:
          format === "americano" && scoringSystem === "americano_points" && americanoPointsTarget.trim().length > 0
            ? Number(americanoPointsTarget)
            : null,
        participant_ids: selectedPlayers
      }),
    onSuccess: async (tournament) => {
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      startTransition(() => navigate(`/tournaments/${tournament.id}`));
    }
  });

  const startTournament = useMutation({
    mutationFn: (tournamentId: string) => api.startTournament(tournamentId),
    onSuccess: async (tournament) => {
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      startTransition(() => navigate(`/tournaments/${tournament.id}#live-rounds`));
    }
  });

  const deleteTournament = useMutation({
    mutationFn: (tournamentId: string) => api.deleteTournament(tournamentId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tournaments"] }),
        queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["my-stats"] })
      ]);
    }
  });

  const createPlayer = useMutation({
    mutationFn: () => api.createPlayer({ display_name: newPlayerName }),
    onSuccess: async (player) => {
      setNewPlayerName("");
      setSelectedPlayers((current) => (current.includes(player.id) ? current : [...current, player.id]));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["suggestions"] }),
        queryClient.invalidateQueries({ queryKey: ["login-options"] })
      ]);
    }
  });

  const filteredPlayers =
    playersQuery.data?.filter((player) =>
      player.display_name.toLowerCase().includes(deferredSearch.trim().toLowerCase())
    ) ?? [];

  const selectedPlayerRows = playersQuery.data?.filter((player) => selectedPlayers.includes(player.id)) ?? [];

  function togglePlayer(playerId: string) {
    setSelectedPlayers((current) =>
      current.includes(playerId) ? current.filter((item) => item !== playerId) : [...current, playerId]
    );
  }

  function handleFormatChange(nextFormat: TournamentFormat) {
    const previousSuggested = buildDefaultTournamentName(format);
    const nextSuggested = buildDefaultTournamentName(nextFormat);
    setFormat(nextFormat);
    setName((current) => (current.trim().length === 0 || current === previousSuggested ? nextSuggested : current));
  }

  function handleDeleteTournament(tournamentId: string) {
    deleteTournament.mutate(tournamentId);
  }

  const activeTournaments = tournamentsQuery.data?.filter((item) => item.status !== "completed") ?? [];
  const completedTournaments = tournamentsQuery.data?.filter((item) => item.status === "completed") ?? [];

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <p className="eyebrow">Create tournament</p>
        <h2>Set up the next session</h2>
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            createTournament.mutate();
          }}
        >
          <label>
            <span>Tournament name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <div className="form-row">
            <label>
              <span>Format</span>
              <select value={format} onChange={(event) => handleFormatChange(event.target.value as TournamentFormat)}>
                <option value="americano">Americano</option>
                <option value="mexicano">Mexicano</option>
              </select>
            </label>
            <label>
              <span>Courts</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={8}
                value={courtCount}
                onChange={(event) => setCourtCount(Number(event.target.value))}
              />
            </label>
          </div>

          {format === "mexicano" ? (
            <label>
              <span>Target rounds</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                value={targetRounds}
                onChange={(event) => setTargetRounds(Number(event.target.value))}
              />
            </label>
          ) : null}

          {format === "americano" ? (
            <div className="panel inset-panel">
              <div className="split-row">
                <div>
                  <p className="eyebrow">Scoring</p>
                  <h3>Choose the point system</h3>
                </div>
                <span className="muted-text">
                  {recommendedScoring.scoringSystem === "americano_points"
                    ? "First-to target recommended"
                    : "Classic scoring recommended"}
                </span>
              </div>
              <label>
                <span>Point system</span>
                <select
                  value={scoringSystem}
                  onChange={(event) => {
                    setHasCustomScoring(true);
                    setScoringSystem(event.target.value as ScoringSystem);
                  }}
                >
                  <option value="classic">Classic scoring</option>
                  <option value="americano_points">Americano points</option>
                </select>
              </label>
              {scoringSystem === "americano_points" ? (
                <label>
                  <span>Points to win</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={americanoPointsTarget}
                    placeholder={recommendedScoring.americanoPointsTarget ? String(recommendedScoring.americanoPointsTarget) : "Enter points"}
                    onChange={(event) => {
                      setHasCustomAmericanoTarget(true);
                      setAmericanoPointsTarget(event.target.value);
                    }}
                    required
                  />
                </label>
              ) : null}
              <p className="muted-text selection-note">
                {selectionState.activePlayerCount === 4
                  ? "With 4 players, classic match scoring is usually the better default."
                  : recommendedScoring.americanoPointsTarget
                    ? `Recommended target: first to ${recommendedScoring.americanoPointsTarget} for ${selectionState.activePlayerCount} active players.`
                    : "Choose the Americano target score you want to race to."}
              </p>
            </div>
          ) : null}

          <div id="add-player-panel" className="panel inset-panel">
            <div className="split-row">
              <div>
                <p className="eyebrow">Player list</p>
                <h3>Add someone new</h3>
              </div>
              <span className="muted-text">{playersQuery.data?.length ?? 0} saved</span>
            </div>
            <div className="inline-form">
              <input
                value={newPlayerName}
                placeholder="New player name"
                onChange={(event) => setNewPlayerName(event.target.value)}
              />
              <button
                type="button"
                className="secondary-button"
                disabled={createPlayer.isPending || newPlayerName.trim().length < 2}
                onClick={() => createPlayer.mutate()}
              >
                {createPlayer.isPending ? "Adding..." : "Add player"}
              </button>
            </div>
            {createPlayer.error ? <p className="error-text">{createPlayer.error.message}</p> : null}
          </div>

          <label>
            <span>Search players</span>
            <input
              value={playerSearch}
              placeholder="Filter the saved player list"
              onChange={(event) => setPlayerSearch(event.target.value)}
            />
          </label>

          <div className="chip-list">
            {filteredPlayers.map((player) => (
              <button
                type="button"
                key={player.id}
                className={selectedPlayers.includes(player.id) ? "chip chip-active" : "chip"}
                onClick={() => togglePlayer(player.id)}
              >
                <span className="player-row">
                  <AvatarBadge name={player.display_name} seed={player.id} avatarUrl={player.avatar_url} size="sm" />
                  <span>{player.display_name}</span>
                </span>
              </button>
            ))}
          </div>

          {suggestionsQuery.data && suggestionsQuery.data.length > 0 ? (
            <div className="suggestion-strip">
              <p className="eyebrow">Suggested from recent history ✨</p>
              <div className="chip-list">
                {suggestionsQuery.data.slice(0, 8).map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion.player_id}
                    className={selectedPlayers.includes(suggestion.player_id) ? "chip chip-active" : "chip"}
                    onClick={() => togglePlayer(suggestion.player_id)}
                  >
                    <span className="player-row">
                      <AvatarBadge
                        name={suggestion.display_name}
                        seed={suggestion.player_id}
                        avatarUrl={suggestion.avatar_url}
                        size="sm"
                      />
                      <span>{suggestion.display_name}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="selection-summary-block">
            <div className="selection-summary">
              <strong>{selectedPlayers.length} selected</strong>
              <span className="selection-note">{selectionState.message}</span>
            </div>

            {selectedPlayerRows.length > 0 ? (
              <div className="selected-player-list">
                {selectedPlayerRows.map((player) => (
                  <button
                    type="button"
                    key={player.id}
                    className="selected-player"
                    onClick={() => togglePlayer(player.id)}
                  >
                    <span className="player-row">
                      <AvatarBadge name={player.display_name} seed={player.id} avatarUrl={player.avatar_url} size="sm" />
                      <span>{player.display_name}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted-text selection-placeholder">Selected players will stay pinned here.</p>
            )}
          </div>

          {createTournament.error ? <p className="error-text">{createTournament.error.message}</p> : null}

          <button
            type="submit"
            className="primary-button"
            disabled={createTournament.isPending || !canSubmit}
          >
            {createTournament.isPending ? "Creating..." : "Create tournament"}
          </button>
        </form>
      </section>

      <section className="stack-section">
        <section className="panel">
          <div className="split-row">
            <div>
              <p className="eyebrow">Active board 🎾</p>
              <h2>Live and draft tournaments</h2>
            </div>
            <span className="muted-text">{tournamentsQuery.data?.length ?? 0} total</span>
          </div>
          <div id="active-tournaments" className="card-grid">
            {activeTournaments.map((tournament) => (
              <TournamentCard
                key={tournament.id}
                tournament={tournament}
                busy={startTournament.isPending || deleteTournament.isPending}
                onStart={(tournamentId) => startTournament.mutate(tournamentId)}
                onDelete={(selectedTournament) => handleDeleteTournament(selectedTournament.id)}
              />
            ))}
            {activeTournaments.length === 0 ? (
              <EmptyState
                icon="🎾"
                title="No tournaments on court"
                description="Drafts and live sessions will show up here as soon as you spin up the next night."
              />
            ) : null}
          </div>
          {startTournament.error ? <p className="error-text">{startTournament.error.message}</p> : null}
          {deleteTournament.error ? <p className="error-text">{deleteTournament.error.message}</p> : null}
        </section>

        <section className="panel">
          <p className="eyebrow">Archive 🗂️</p>
          <h2>Completed tournaments</h2>
          <div className="card-grid">
            {completedTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
            {completedTournaments.length === 0 ? (
              <EmptyState
                icon="🗂️"
                title="Archive still empty"
                description="Once you finish a tournament, the full night will land here for replay and bragging rights."
              />
            ) : null}
          </div>
        </section>
      </section>

      <button
        type="button"
        className="mobile-fab"
        onClick={() => document.getElementById("add-player-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      >
        Add player
      </button>
    </div>
  );
}
