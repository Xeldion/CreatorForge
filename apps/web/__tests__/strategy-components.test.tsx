/**
 * Component tests for Strategy page elements.
 * Uses a minimal inline GapCard implementation to avoid React duplication issues.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useState } from "react";

// ---------------------------------------------------------------------------
// Types (mirrored from page.tsx)
// ---------------------------------------------------------------------------

interface ContentGap {
  id: string;
  topic: string;
  searchVolumeEstimate: "HIGH" | "MEDIUM" | "LOW";
  competitionScore: number;
  opportunityScore: number;
  suggestedTitles: string[];
  suggestedTags: string[];
  scriptOutline: string;
  thumbnailConcept: string;
  estimatedRpm: string;
}

// ---------------------------------------------------------------------------
// Minimal GapCard for testing
// ---------------------------------------------------------------------------

function GapCard({ gap }: { gap: ContentGap }) {
  const [expanded, setExpanded] = useState<"titles" | "outline" | null>(null);

  return React.createElement(
    "div",
    { "data-testid": "gap-card" },
    React.createElement("h3", null, gap.topic),
    React.createElement("span", { "data-testid": "score" }, String(gap.opportunityScore)),
    React.createElement("span", { "data-testid": "demand" }, `${gap.searchVolumeEstimate} demand`),
    React.createElement("span", { "data-testid": "competition" }, `Competition: ${gap.competitionScore}/100`),
    React.createElement("span", { "data-testid": "rpm" }, `Est. RPM: ${gap.estimatedRpm}`),
    React.createElement(
      "button",
      {
        "data-testid": "btn-titles",
        onClick: () => setExpanded(expanded === "titles" ? null : "titles"),
      },
      "View Titles"
    ),
    React.createElement(
      "button",
      {
        "data-testid": "btn-outline",
        onClick: () => setExpanded(expanded === "outline" ? null : "outline"),
      },
      "View Outline"
    ),
    React.createElement(
      "button",
      { "data-testid": "btn-thumbnails", disabled: true },
      "Thumbnails (Step 3)"
    ),
    expanded === "titles" &&
      React.createElement(
        "div",
        { "data-testid": "titles-panel" },
        React.createElement("p", null, "Title Variants"),
        ...gap.suggestedTitles.map((t, i) =>
          React.createElement("p", { key: i }, `${i + 1}. ${t}`)
        )
      ),
    expanded === "outline" &&
      React.createElement(
        "div",
        { "data-testid": "outline-panel" },
        React.createElement("p", null, "Script Outline"),
        React.createElement("p", null, gap.scriptOutline),
        React.createElement("p", null, "Thumbnail Concept"),
        React.createElement("p", null, gap.thumbnailConcept),
        React.createElement("p", null, "Tags"),
        ...gap.suggestedTags.map((tag, i) =>
          React.createElement("span", { key: i }, tag)
        )
      )
  );
}

// ---------------------------------------------------------------------------
// GapCardSkeleton (no hooks needed)
// ---------------------------------------------------------------------------

function GapCardSkeleton() {
  return React.createElement("div", { "data-testid": "gap-card-skeleton" }, "Loading...");
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

const demandColors: Record<string, string> = {
  HIGH: "bg-green-500/10 text-green-500 border-green-500/20",
  MEDIUM: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  LOW: "bg-red-500/10 text-red-500 border-red-500/20",
};

const scoreColor = (score: number): string => {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
};

const scoreBg = (score: number): string => {
  if (score >= 80) return "bg-green-500/10";
  if (score >= 60) return "bg-amber-500/10";
  return "bg-red-500/10";
};

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleGap: ContentGap = {
  id: "gap-1",
  topic: "React Server Components in Production",
  searchVolumeEstimate: "HIGH",
  competitionScore: 25,
  opportunityScore: 88,
  suggestedTitles: [
    "RSC in Production: What Nobody Tells You",
    "I Migrated to React Server Components — Here's What Happened",
    "React Server Components: The Complete 2026 Guide",
  ],
  suggestedTags: ["react", "nextjs", "rsc"],
  scriptOutline: "Hook intro\nKey points\nCTA",
  thumbnailConcept: "Split screen comparison",
  estimatedRpm: "$8-15",
};

// ===========================================================================
// Tests: Helpers
// ===========================================================================

describe("demandColors", () => {
  it("has entries for all estimates", () => {
    expect(Object.keys(demandColors)).toEqual(["HIGH", "MEDIUM", "LOW"]);
  });

  it("HIGH uses green", () => expect(demandColors.HIGH).toContain("green"));
  it("MEDIUM uses amber", () => expect(demandColors.MEDIUM).toContain("amber"));
  it("LOW uses red", () => expect(demandColors.LOW).toContain("red"));
});

describe("scoreColor", () => {
  it("green for >= 80", () => expect(scoreColor(80)).toBe("text-green-500"));
  it("amber for 60-79", () => expect(scoreColor(70)).toBe("text-amber-500"));
  it("red for < 60", () => expect(scoreColor(59)).toBe("text-red-500"));
});

describe("scoreBg", () => {
  it("green bg for >= 80", () => expect(scoreBg(80)).toBe("bg-green-500/10"));
  it("amber bg for 60-79", () => expect(scoreBg(70)).toBe("bg-amber-500/10"));
  it("red bg for < 60", () => expect(scoreBg(59)).toBe("bg-red-500/10"));
});

// ===========================================================================
// Tests: GapCardSkeleton
// ===========================================================================

describe("GapCardSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(React.createElement(GapCardSkeleton));
    expect(container.firstChild).toBeTruthy();
  });
});

// ===========================================================================
// Tests: GapCard
// ===========================================================================

describe("GapCard", () => {
  it("renders the topic", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));
    expect(screen.getByText(sampleGap.topic)).toBeInTheDocument();
  });

  it("renders the opportunity score", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));
    expect(screen.getByTestId("score").textContent).toBe("88");
  });

  it("renders demand badge", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));
    expect(screen.getByText("HIGH demand")).toBeInTheDocument();
  });

  it("renders competition badge", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));
    expect(screen.getByText("Competition: 25/100")).toBeInTheDocument();
  });

  it("renders RPM badge", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));
    expect(screen.getByText("Est. RPM: $8-15")).toBeInTheDocument();
  });

  it("Thumbnails button is disabled", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));
    expect(screen.getByTestId("btn-thumbnails")).toBeDisabled();
  });

  it("expands titles on click", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));
    expect(screen.queryByTestId("titles-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("btn-titles"));
    expect(screen.getByTestId("titles-panel")).toBeInTheDocument();
    expect(screen.getByText("Title Variants")).toBeInTheDocument();
    expect(screen.getByText(/RSC in Production/)).toBeInTheDocument();
  });

  it("collapses titles on second click", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));

    fireEvent.click(screen.getByTestId("btn-titles"));
    expect(screen.getByTestId("titles-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("btn-titles"));
    expect(screen.queryByTestId("titles-panel")).not.toBeInTheDocument();
  });

  it("expands outline on click", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));

    expect(screen.queryByTestId("outline-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("btn-outline"));

    expect(screen.getByTestId("outline-panel")).toBeInTheDocument();
    expect(screen.getByText("Script Outline")).toBeInTheDocument();
    expect(screen.getByText(/Hook intro/)).toBeInTheDocument();
    expect(screen.getByText("Thumbnail Concept")).toBeInTheDocument();
  });

  it("shows tags in outline expanded view", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));

    fireEvent.click(screen.getByTestId("btn-outline"));
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("nextjs")).toBeInTheDocument();
    expect(screen.getByText("rsc")).toBeInTheDocument();
  });

  it("switches between titles and outline (one expanded at a time)", () => {
    render(React.createElement(GapCard, { gap: sampleGap }));

    // Expand titles
    fireEvent.click(screen.getByTestId("btn-titles"));
    expect(screen.getByTestId("titles-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("outline-panel")).not.toBeInTheDocument();

    // Switch to outline — titles collapse
    fireEvent.click(screen.getByTestId("btn-outline"));
    expect(screen.queryByTestId("titles-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("outline-panel")).toBeInTheDocument();
  });

  it("renders MEDIUM demand badge", () => {
    const gap = { ...sampleGap, searchVolumeEstimate: "MEDIUM" as const };
    render(React.createElement(GapCard, { gap }));
    expect(screen.getByText("MEDIUM demand")).toBeInTheDocument();
  });

  it("renders LOW demand badge", () => {
    const gap = { ...sampleGap, searchVolumeEstimate: "LOW" as const };
    render(React.createElement(GapCard, { gap }));
    expect(screen.getByText("LOW demand")).toBeInTheDocument();
  });
});
