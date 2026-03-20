import { startTransition, useDeferredValue, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { TournamentCard } from "../components/TournamentCard";
import { api } from "../lib/api";

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
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"americano" | "mexicano">("americano");
  const [courtCount, setCourtCount] = useState(2);
  const [targetRounds, setTargetRounds] = useState(5);
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

  const createTournament = useMutation({
    mutationFn: () =>
      api.createTournament({
        name,
        format,
        court_count: courtCount,
        target_rounds: format === "mexicano" ? targetRounds : null,
        participant_ids: selectedPlayers
      }),
    onSuccess: async (tournament) => {
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      startTransition(() => navigate(`/tournaments/${tournament.id}`));
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
              placeholder="Wednesday evening league"
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <div className="form-row">
            <label>
              <span>Format</span>
              <select value={format} onChange={(event) => setFormat(event.target.value as "americano" | "mexicano")}>
                <option value="americano">Americano</option>
                <option value="mexicano">Mexicano</option>
              </select>
            </label>
            <label>
              <span>Courts</span>
              <input
                type="number"
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
                min={1}
                max={30}
                value={targetRounds}
                onChange={(event) => setTargetRounds(Number(event.target.value))}
              />
            </label>
          ) : null}

          <div className="panel inset-panel">
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
                  {player.display_name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="chip-list">
            {filteredPlayers.map((player) => (
              <button
                type="button"
                key={player.id}
                className={selectedPlayers.includes(player.id) ? "chip chip-active" : "chip"}
                onClick={() => togglePlayer(player.id)}
              >
                {player.display_name}
              </button>
            ))}
          </div>

          {suggestionsQuery.data && suggestionsQuery.data.length > 0 ? (
            <div className="suggestion-strip">
              <p className="eyebrow">Suggested from recent history</p>
              <div className="chip-list">
                {suggestionsQuery.data.slice(0, 8).map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion.player_id}
                    className={selectedPlayers.includes(suggestion.player_id) ? "chip chip-active" : "chip"}
                    onClick={() => togglePlayer(suggestion.player_id)}
                  >
                    {suggestion.display_name} - {suggestion.frequency}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {createTournament.error ? <p className="error-text">{createTournament.error.message}</p> : null}

          <button
            type="submit"
            className="primary-button"
            disabled={createTournament.isPending || !selectionState.supported}
          >
            {createTournament.isPending ? "Creating..." : "Create tournament"}
          </button>
        </form>
      </section>

      <section className="stack-section">
        <section className="panel">
          <div className="split-row">
            <div>
              <p className="eyebrow">Active board</p>
              <h2>Recent tournaments</h2>
            </div>
            <span className="muted-text">{tournamentsQuery.data?.length ?? 0} total</span>
          </div>
          <div className="card-grid">
            {tournamentsQuery.data?.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Archive</p>
          <h2>Completed tournaments</h2>
          <div className="card-grid">
            {completedTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
            {completedTournaments.length === 0 ? <p className="muted-text">Completed events will show up here.</p> : null}
          </div>
        </section>
      </section>
    </div>
  );
}
