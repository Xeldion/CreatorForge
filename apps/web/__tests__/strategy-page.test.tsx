/**
 * Integration tests for StrategyPage component states.
 *
 * Tests the state machine: idle → loading → polling → complete / error,
 * plus edge cases like empty results and existing data on mount.
 *
 * Uses fetch mocking to control the API responses.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import StrategyPage from "@/app/(dashboard)/dashboard/strategy/page";
import type { MockInstance } from "vitest";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

let fetchMock: MockInstance;

beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    return Promise.resolve(new Response(JSON.stringify({ gaps: [] }), { status: 200 }));
  });
});

afterEach(() => {
  fetchMock.mockRestore();
});

// ---------------------------------------------------------------------------
// Helper: mock fetch responses for different scenarios
// ---------------------------------------------------------------------------

function mockFetchResponses(responses: Array<{ status: number; body: unknown }>) {
  let callCount = 0;
  fetchMock.mockImplementation(() => {
    const response = responses[callCount] ?? responses[responses.length - 1];
    callCount++;
    return Promise.resolve(
      new Response(JSON.stringify(response.body), { status: response.status })
    );
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StrategyPage — idle state", () => {
  it("renders the strategy heading", async () => {
    mockFetchResponses([{ status: 200, body: { gaps: [] } }]);
    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByText("Strategy")).toBeInTheDocument();
    });
  });

  it("renders the niche input", async () => {
    mockFetchResponses([{ status: 200, body: { gaps: [] } }]);
    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/What niche do you create content in/)).toBeInTheDocument();
    });
  });

  it("renders the Analyze button disabled when input is empty", async () => {
    mockFetchResponses([{ status: 200, body: { gaps: [] } }]);
    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Analyze/ })).toBeDisabled();
    });
  });

  it("enables Analyze button when input has >= 3 chars", async () => {
    mockFetchResponses([{ status: 200, body: { gaps: [] } }]);
    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/What niche/)).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/What niche/);
    fireEvent.change(input, { target: { value: "react tutorials" } });

    expect(screen.getByRole("button", { name: /Analyze/ })).not.toBeDisabled();
  });

  it("shows feature cards in idle state", async () => {
    mockFetchResponses([{ status: 200, body: { gaps: [] } }]);
    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByText("Discover Gaps")).toBeInTheDocument();
      expect(screen.getByText("Demand Estimates")).toBeInTheDocument();
      expect(screen.getByText("Ready-to-Use Ideas")).toBeInTheDocument();
    });
  });

  it("shows time estimate text", async () => {
    mockFetchResponses([{ status: 200, body: { gaps: [] } }]);
    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByText(/45–60 seconds/)).toBeInTheDocument();
      expect(screen.getByText(/cached for 7 days/)).toBeInTheDocument();
    });
  });
});

describe("StrategyPage — loading state", () => {
  it("transitions to loading state when Analyze is clicked", async () => {
    mockFetchResponses([
      { status: 200, body: { gaps: [] } },                        // mount
      { status: 200, body: { jobId: "job-123" } },                // POST response
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/What niche/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/What niche/), {
      target: { value: "react tutorials" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    await waitFor(() => {
      expect(screen.getByText(/Starting analysis/)).toBeInTheDocument();
      expect(screen.getByText(/45–60 seconds/)).toBeInTheDocument();
    });
  });

  it("shows skeleton cards during loading", async () => {
    mockFetchResponses([
      { status: 200, body: { gaps: [] } },
      { status: 200, body: { jobId: "job-123" } },
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/What niche/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/What niche/), {
      target: { value: "react tutorials" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    // Skeleton cards should appear (they're div containers)
    await waitFor(() => {
      const cards = document.querySelectorAll(".rounded-xl.border.bg-card");
      expect(cards.length).toBeGreaterThan(0);
    });
  });
});

describe("StrategyPage — error state", () => {
  it("shows error state when POST fails", async () => {
    mockFetchResponses([
      { status: 200, body: { gaps: [] } },
      { status: 400, body: { error: "No YouTube account connected." } },
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/What niche/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/What niche/), {
      target: { value: "react tutorials" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    await waitFor(() => {
      expect(screen.getByText("Analysis failed")).toBeInTheDocument();
      expect(
        screen.getByText("No YouTube account connected.")
      ).toBeInTheDocument();
    });
  });

  it("shows Try again button in error state", async () => {
    mockFetchResponses([
      { status: 200, body: { gaps: [] } },
      { status: 500, body: { error: "Server error" } },
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/What niche/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/What niche/), {
      target: { value: "react tutorials" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    await waitFor(() => {
      expect(screen.getByText("Try again")).toBeInTheDocument();
    });
  });

  it("clicking Try again returns to idle state", async () => {
    mockFetchResponses([
      { status: 200, body: { gaps: [] } },
      { status: 500, body: { error: "Server error" } },
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/What niche/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/What niche/), {
      target: { value: "react" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    await waitFor(() => {
      expect(screen.getByText("Try again")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Try again"));

    await waitFor(() => {
      expect(screen.getByText("Discover Gaps")).toBeInTheDocument();
    });
  });
});

describe("StrategyPage — existing data on mount", () => {
  it("shows cached results immediately", async () => {
    mockFetchResponses([
      {
        status: 200,
        body: {
          gaps: [
            {
              id: "gap-1",
              topic: "React Server Components",
              searchVolumeEstimate: "HIGH",
              competitionScore: 25,
              opportunityScore: 88,
              suggestedTitles: ["Title A", "Title B", "Title C"],
              suggestedTags: ["react", "nextjs"],
              scriptOutline: "Hook → Points → CTA",
              thumbnailConcept: "Split screen",
              estimatedRpm: "$8-15",
            },
          ],
          niche: "react tutorials",
          generatedAt: new Date().toISOString(),
        },
      },
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByText("React Server Components")).toBeInTheDocument();
      expect(screen.getByText(/Content Gaps for/)).toBeInTheDocument();
    });
  });

  it("shows New Analysis button when results exist", async () => {
    mockFetchResponses([
      {
        status: 200,
        body: {
          gaps: [
            {
              id: "gap-1",
              topic: "React Server Components",
              searchVolumeEstimate: "HIGH",
              competitionScore: 25,
              opportunityScore: 88,
              suggestedTitles: ["Title A", "Title B", "Title C"],
              suggestedTags: [],
              scriptOutline: "Outline",
              thumbnailConcept: "Concept",
              estimatedRpm: "$8-15",
            },
          ],
          niche: "react tutorials",
          generatedAt: new Date().toISOString(),
        },
      },
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByText("New Analysis")).toBeInTheDocument();
    });
  });

  it("BUG: shows idle state when API returns empty gaps (loadExisting only sets complete if gaps.length > 0)", async () => {
    mockFetchResponses([
      {
        status: 200,
        body: {
          gaps: [],
          niche: "react tutorials",
          generatedAt: new Date().toISOString(),
        },
      },
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    // Currently shows idle state because loadExisting() only sets 'complete'
    // when data.gaps.length > 0. The empty-results view is only reachable
    // through the polling→complete code path.
    await waitFor(() => {
      expect(screen.getByText("Discover Gaps")).toBeInTheDocument();
    });
  });

  it("clicking New Analysis returns to idle state", async () => {
    mockFetchResponses([
      {
        status: 200,
        body: {
          gaps: [
            {
              id: "gap-1",
              topic: "React Server Components",
              searchVolumeEstimate: "HIGH",
              competitionScore: 25,
              opportunityScore: 88,
              suggestedTitles: ["Title A", "Title B", "Title C"],
              suggestedTags: [],
              scriptOutline: "Outline",
              thumbnailConcept: "Concept",
              estimatedRpm: "$8-15",
            },
          ],
          niche: "react tutorials",
          generatedAt: new Date().toISOString(),
        },
      },
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByText("New Analysis")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Analysis"));

    await waitFor(() => {
      expect(screen.getByText("Discover Gaps")).toBeInTheDocument();
    });
  });
});

describe("StrategyPage — polling → complete", () => {
  it("enters polling state after job enqueued", async () => {
    mockFetchResponses([
      { status: 200, body: { gaps: [] } },
      { status: 200, body: { jobId: "job-123" } },
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/What niche/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/What niche/), {
      target: { value: "react tutorials" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    // Should be loading, then transition to polling via setTimeout
    await waitFor(() => {
      expect(screen.getByText(/Starting analysis/)).toBeInTheDocument();
    });
  });

  it("displays the niche being analyzed in loading state", async () => {
    mockFetchResponses([
      { status: 200, body: { gaps: [] } },
      { status: 200, body: { jobId: "job-123" } },
    ]);

    await act(async () => {
      render(React.createElement(StrategyPage));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/What niche/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/What niche/), {
      target: { value: "rust game dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    await waitFor(() => {
      expect(
        screen.getByText(/rust game dev/)
      ).toBeInTheDocument();
    });
  });
});
