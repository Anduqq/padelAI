import { describe, expect, it } from "vitest";

import { buildTournamentShareText } from "./share";
import type { TournamentDetail } from "./types";

const tournament = {
  id: "t-1",
  name: "Friday Night",
  format: "americano",
  status: "completed",
  court_count: 2,
  target_rounds: 7,
  scoring_system: "americano_points",
  americano_points_target: 17,
  participant_count: 4,
  created_at: "2026-03-21T10:00:00Z",
  started_at: "2026-03-21T10:15:00Z",
  completed_at: "2026-03-21T12:15:00Z",
  participants: [],
  rounds: [],
  leaderboard: [
    {
      rank: 1,
      player_id: "p1",
      display_name: "IAR",
      avatar_url: null,
      points: 35,
      games_for: 35,
      games_against: 18,
      game_diff: 17,
      matches_played: 7,
      wins: 6,
      losses: 1,
      draws: 0
    },
    {
      rank: 2,
      player_id: "p2",
      display_name: "Radu",
      avatar_url: null,
      points: 29,
      games_for: 29,
      games_against: 23,
      game_diff: 6,
      matches_played: 7,
      wins: 4,
      losses: 3,
      draws: 0
    },
    {
      rank: 3,
      player_id: "p3",
      display_name: "Daniel",
      avatar_url: null,
      points: 24,
      games_for: 24,
      games_against: 28,
      game_diff: -4,
      matches_played: 7,
      wins: 3,
      losses: 4,
      draws: 0
    }
  ],
  last_snapshot: null,
  can_generate_next_round: false,
  can_continue_americano: false,
  can_start_bracket: false,
  can_continue_bracket: false,
  bracket_graph: null
} satisfies TournamentDetail;

describe("buildTournamentShareText", () => {
  it("includes the full leaderboard and public link", () => {
    const text = buildTournamentShareText(tournament);

    expect(text).toContain("🏆 Champion: IAR");
    expect(text).toContain("🥇 1. IAR - 35 pts | 6W 1L | diff +17");
    expect(text).toContain("🥈 2. Radu - 29 pts | 4W 3L | diff +6");
    expect(text).toContain("🥉 3. Daniel - 24 pts | 3W 4L | diff -4");
    expect(text).toContain("https://padel.anduhomelab.dev/tournaments/t-1");
  });
});
