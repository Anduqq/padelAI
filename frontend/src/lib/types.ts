export type TournamentFormat = "americano" | "mexicano";
export type TournamentStatus = "draft" | "active" | "completed";
export type RoundStatus = "pending" | "active" | "completed";
export type ScoringSystem = "classic" | "americano_points";

export interface User {
  id: string;
  full_name: string;
  player_id: string;
  display_name: string;
  is_admin: boolean;
}

export interface LoginOption {
  player_id: string;
  display_name: string;
  is_admin: boolean;
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
  scoring_system: ScoringSystem;
  americano_points_target: number | null;
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

export interface RoundMetadata {
  strategy?: string;
  type?: string;
  ranking_order?: string[];
  rotation_order?: string[];
  schedule_index?: number;
  bracket_round_index?: number;
  bracket_stage?: string;
  team_slots?: Array<{
    court_number: number;
    team_a: {
      player_ids: string[];
      label: string;
      seed_positions?: number[];
    };
    team_b: {
      player_ids: string[];
      label: string;
      seed_positions?: number[];
    };
  }>;
  carryover_team?: {
    player_ids: string[];
    label: string;
    seed_positions?: number[];
  } | null;
  excluded_player_ids?: string[];
  bench_player_ids?: string[];
  bench_players?: MatchPlayer[];
}

export interface RoundItem {
  id: string;
  number: number;
  status: RoundStatus;
  metadata: RoundMetadata | null;
  started_at: string | null;
  completed_at: string | null;
  can_unlock: boolean;
  matches: MatchItem[];
}

export interface TournamentDetail extends TournamentSummary {
  participants: TournamentParticipant[];
  rounds: RoundItem[];
  leaderboard: LeaderboardRow[];
  last_snapshot: LeaderboardRow[] | null;
  can_generate_next_round: boolean;
  can_continue_americano: boolean;
  can_start_bracket: boolean;
  can_continue_bracket: boolean;
  bracket_graph: Array<{
    round_id: string;
    title: string;
    carryover_label?: string | null;
    matches: Array<{
      court_number: number;
      team_a_label: string;
      team_b_label: string;
      team_a_score: number | null;
      team_b_score: number | null;
    }>;
  }> | null;
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
