import type {
  EloLeaderboardRow,
  HeadToHeadResponse,
  LeaderboardRow,
  LoginOption,
  PlayerStatsResponse,
  PlayerSummary,
  SuggestionRow,
  TournamentDetail,
  TournamentSummary,
  User
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    let message = "Request failed.";
    try {
      const body = await response.json();
      message = body.detail ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getLoginOptions: () => request<LoginOption[]>("/api/auth/options"),
  selectPlayerLogin: (payload: { player_id: string }) =>
    request<User>("/api/auth/select", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getCurrentUser: () => request<User>("/api/auth/me"),
  logout: () =>
    request<void>("/api/auth/logout", {
      method: "POST"
    }),
  getPlayers: () => request<PlayerSummary[]>("/api/players"),
  createPlayer: (payload: { display_name: string }) =>
    request<PlayerSummary>("/api/players", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  uploadMyAvatar: (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    return request<PlayerSummary>("/api/players/me/avatar", {
      method: "POST",
      body: formData
    });
  },
  uploadPlayerAvatar: (playerId: string, file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    return request<PlayerSummary>(`/api/players/${playerId}/avatar`, {
      method: "POST",
      body: formData
    });
  },
  getSuggestions: () => request<SuggestionRow[]>("/api/players/suggestions"),
  getMyStats: () => request<PlayerStatsResponse>("/api/players/me/stats"),
  getHeadToHead: (playerAId: string, playerBId: string) =>
    request<HeadToHeadResponse>(
      `/api/players/head-to-head?player_a_id=${encodeURIComponent(playerAId)}&player_b_id=${encodeURIComponent(playerBId)}`
    ),
  getTournaments: () => request<TournamentSummary[]>("/api/tournaments"),
  getTournament: (tournamentId: string) => request<TournamentDetail>(`/api/tournaments/${tournamentId}`),
  deleteTournament: (tournamentId: string) =>
    request<void>(`/api/tournaments/${tournamentId}`, {
      method: "DELETE"
    }),
  createTournament: (payload: {
    name: string;
    format: "americano" | "mexicano";
    court_count: number;
    target_rounds?: number | null;
    scoring_system: "classic" | "americano_points";
    americano_points_target?: number | null;
    participant_ids: string[];
  }) =>
    request<TournamentDetail>("/api/tournaments", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  startTournament: (tournamentId: string) =>
    request<TournamentDetail>(`/api/tournaments/${tournamentId}/start`, {
      method: "POST"
    }),
  generateNextRound: (tournamentId: string) =>
    request<TournamentDetail>(`/api/tournaments/${tournamentId}/generate-next-round`, {
      method: "POST"
    }),
  generateNextRotation: (tournamentId: string) =>
    request<TournamentDetail>(`/api/tournaments/${tournamentId}/generate-next-rotation`, {
      method: "POST"
    }),
  finishTournament: (tournamentId: string) =>
    request<TournamentDetail>(`/api/tournaments/${tournamentId}/finish`, {
      method: "POST"
    }),
  startBracket: (tournamentId: string) =>
    request<TournamentDetail>(`/api/tournaments/${tournamentId}/start-bracket`, {
      method: "POST"
    }),
  continueBracket: (tournamentId: string) =>
    request<TournamentDetail>(`/api/tournaments/${tournamentId}/continue-bracket`, {
      method: "POST"
    }),
  playTopFourFinal: (tournamentId: string) =>
    request<TournamentDetail>(`/api/tournaments/${tournamentId}/play-top-four-final`, {
      method: "POST"
    }),
  unlockRound: (tournamentId: string, roundId: string) =>
    request<TournamentDetail>(`/api/tournaments/${tournamentId}/rounds/${roundId}/unlock`, {
      method: "POST"
    }),
  updateScore: (matchId: string, payload: { team_a_games: number; team_b_games: number; version: number }) =>
    request<TournamentDetail>(`/api/tournaments/matches/${matchId}/score`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getGlobalLeaderboard: () => request<LeaderboardRow[]>("/api/leaderboards/global"),
  getEloLeaderboard: () => request<EloLeaderboardRow[]>("/api/leaderboards/elo")
};
