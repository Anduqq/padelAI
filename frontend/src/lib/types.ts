export type TournamentFormat = "americano" | "mexicano";
export type TournamentStatus = "draft" | "active" | "completed";
export type RoundStatus = "pending" | "active" | "completed";

export interface User {
  id: string;
  email: string;
  full_name: string;
  player_id: string;
  display_name: string;
}

export interface PlayerSummary {
  id: string;
  display_name: string;
}

export interface SuggestionRow {
  player_id: string;
  display_name: string;
  frequency: number;
  last_played_at: string | null;
  suggestion_score: number;
}

export interface LeaderboardRow {
  rank: number;
  player_id: string;
  display_name: string;
  points: number;
  games_for: number;
  games_against: number;
  game_diff: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  tournaments_played?: number;
}

export interface TournamentSummary {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  court_count: number;
  target_rounds: number | null;
  participant_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TournamentParticipant {
  player_id: string;
  display_name: string;
  order_index: number;
}

export interface MatchPlayer {
  player_id: string;
  display_name: string;
}

export interface MatchItem {
  id: string;
  court_number: number;
  version: number;
  team_a_games: number | null;
  team_b_games: number | null;
  updated_at: string | null;
  team_a: MatchPlayer[];
  team_b: MatchPlayer[];
}

export interface RoundItem {
  id: string;
  number: number;
  status: RoundStatus;
  metadata: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  matches: MatchItem[];
}

export interface TournamentDetail extends TournamentSummary {
  participants: TournamentParticipant[];
  rounds: RoundItem[];
  leaderboard: LeaderboardRow[];
  last_snapshot: LeaderboardRow[] | null;
  can_generate_next_round: boolean;
}

export interface PlayerStatsResponse {
  player_id: string;
  display_name: string;
  stats: LeaderboardRow;
  history: Array<{
    tournament_id: string;
    tournament_name: string;
    format: TournamentFormat;
    status: TournamentStatus;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    placement: number | null;
    points: number;
  }>;
}
