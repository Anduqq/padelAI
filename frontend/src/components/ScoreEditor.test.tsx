import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScoreEditor } from "./ScoreEditor";
import type { MatchItem } from "../lib/types";

const americanoMatch: MatchItem = {
  id: "match-1",
  court_number: 1,
  version: 3,
  team_a_games: null,
  team_b_games: null,
  updated_at: null,
  team_a: [
    { player_id: "a1", display_name: "Alpha" },
    { player_id: "a2", display_name: "Beta" }
  ],
  team_b: [
    { player_id: "b1", display_name: "Gamma" },
    { player_id: "b2", display_name: "Delta" }
  ]
};

afterEach(() => {
  cleanup();
});

describe("ScoreEditor", () => {
  it("requires picking a winner before the losing score can be selected", () => {
    const onSubmit = vi.fn();

    render(
      <ScoreEditor
        match={americanoMatch}
        disabled={false}
        scoringSystem="americano_points"
        americanoPointsTarget={17}
        onSubmit={onSubmit}
      />
    );

    const scoreButton = screen.getByRole("button", { name: "12" }) as HTMLButtonElement;
    expect(scoreButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /alpha \/ beta/i }));

    expect(scoreButton.disabled).toBe(false);
  });

  it("submits Americano points when winner and losing score are selected", () => {
    const onSubmit = vi.fn();

    render(
      <ScoreEditor
        match={americanoMatch}
        disabled={false}
        scoringSystem="americano_points"
        americanoPointsTarget={17}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /alpha \/ beta/i }));
    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.click(screen.getByRole("button", { name: /save points/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      team_a_games: 17,
      team_b_games: 12,
      version: 3
    });
  });

  it("lets the losing score be deselected with a second tap", () => {
    const onSubmit = vi.fn();

    render(
      <ScoreEditor
        match={americanoMatch}
        disabled={false}
        scoringSystem="americano_points"
        americanoPointsTarget={17}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /gamma \/ delta/i }));
    const scoreButton = screen.getByRole("button", { name: "6" });
    fireEvent.click(scoreButton);
    fireEvent.click(scoreButton);

    expect(scoreButton.getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByRole("button", { name: /save points/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a saved state when a match already has points", () => {
    const onSubmit = vi.fn();

    render(
      <ScoreEditor
        match={{
          ...americanoMatch,
          team_a_games: 17,
          team_b_games: 9,
          updated_at: "2026-03-21T09:15:00Z"
        }}
        disabled={false}
        scoringSystem="americano_points"
        americanoPointsTarget={17}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText("Points saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: /update points/i })).toBeTruthy();
  });
});
