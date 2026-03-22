export type TournamentFormat = "americano" | "mexicano";
export type TournamentStatus = "draft" | "active" | "completed";
export type RoundStatus = "pending" | "active" | "completed";
export type ScoringSystem = "classic" | "americano_points";
export type DataScope = "prod" | "test";

export interface PlayerIdentity {
  player_id: string;
  display_name: string;
  avatar_url?: string | null;
}

export interface User {
  id: string;
  full_name: string;
  player_id: string;
  display_name: string;
  avatar_url?: string | null;
  is_admin: boolean;
  data_scope: DataScope;
}

export interface LoginOption {
  player_id: string;
  display_name: string;
  avatar_url?: string | null;
  is_admin: boolean;
}

export interface PlayerSummary {
  id: string;
  display_name: string;
  avatar_url?: string | null;
}

export interface SuggestionRow {
  player_id: string;
  display_name: string;
  avatar_url?: string | null;
  frequency: number;
  last_played_at: string | null;
  suggestion_score: number;
}

export interface LeaderboardRow extends PlayerIdentity {
  rank: number;
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

export interface EloLeaderboardRow extends PlayerIdentity {
  rank: number;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface TournamentSummary {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  data_scope: DataScope;
  court_count: number;
  target_rounds: number | null;
  scoring_system: ScoringSystem;
  americano_points_target: number | null;
  participant_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TournamentParticipant extends PlayerIdentity {
  order_index: number;
}

export interface MatchPlayer extends PlayerIdentity {}

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

export interface ChemistryRow extends PlayerIdentity {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  points_for: number;
  points_against: number;
  game_diff: number;
  win_rate: number;
}

export interface AchievementTag {
  slug: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress_current?: number | null;
  progress_target?: number | null;
  progress_suffix?: string | null;
}

export interface PlayerStatsHistoryRow {
  tournament_id: string;
  tournament_name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  placement: number | null;
  points: number;
  wins: number;
  losses: number;
  game_diff: number;
}

export interface PlayerStatsResponse extends PlayerIdentity {
  stats: LeaderboardRow;
  elo_rating: number;
  chemistry: {
    best_partner: ChemistryRow | null;
    hardest_opponent: ChemistryRow | null;
    favorite_opponent: ChemistryRow | null;
    partners: ChemistryRow[];
    opponents: ChemistryRow[];
  };
  streaks: {
    current_win_streak: number;
    current_unbeaten_streak: number;
    best_win_streak: number;
  };
  trophies: {
    champion: number;
    runner_up: number;
    third_place: number;
    podiums: number;
  };
  achievements: AchievementTag[];
  history: PlayerStatsHistoryRow[];
}

export interface AdminOverview {
  current_scope: DataScope;
  available_scopes: DataScope[];
  prod_tournaments: number;
  test_tournaments: number;
}

export interface HeadToHeadResponse {
  player_a: PlayerIdentity;
  player_b: PlayerIdentity;
  against: {
    matches: number;
    player_a_wins: number;
    player_b_wins: number;
    draws: number;
    player_a_points: number;
    player_b_points: number;
  };
  together: {
    matches: number;
    wins: number;
    losses: number;
    draws: number;
  };
  recent_meetings: Array<{
    match_id: string;
    tournament_id: string;
    tournament_name: string;
    played_at: string;
    player_a_points: number;
    player_b_points: number;
    result: string;
  }>;
}
