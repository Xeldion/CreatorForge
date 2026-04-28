"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Sparkles,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  AlertCircle,
  Lightbulb,
  Tag,
  FileText,
  Image,
  Target,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

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

interface AnalysisState {
  status: "idle" | "loading" | "polling" | "complete" | "error";
  jobId?: string;
  niche?: string;
  gaps: ContentGap[];
  generatedAt?: string;
  message?: string;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

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

// ============================================================================
// Components
// ============================================================================

function GapCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

function GapCard({ gap }: { gap: ContentGap }) {
  const [expanded, setExpanded] = useState<"titles" | "outline" | null>(null);

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3 flex-1">
            {/* Topic & Score */}
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center rounded-full w-10 h-10 text-sm font-bold ${scoreBg(
                  gap.opportunityScore
                )} ${scoreColor(gap.opportunityScore)}`}
              >
                {gap.opportunityScore}
              </div>
              <h3 className="text-lg font-semibold">{gap.topic}</h3>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={demandColors[gap.searchVolumeEstimate] ?? ""}
              >
                <TrendingUp className="h-3 w-3 mr-1" />
                {gap.searchVolumeEstimate} demand
              </Badge>
              <Badge variant="outline">
                <Users className="h-3 w-3 mr-1" />
                Competition: {gap.competitionScore}/100
              </Badge>
              <Badge variant="outline">
                <Target className="h-3 w-3 mr-1" />
                Est. RPM: {gap.estimatedRpm}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setExpanded(expanded === "titles" ? null : "titles")
                }
              >
                <Lightbulb className="h-4 w-4 mr-1" />
                View Titles
                {expanded === "titles" ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setExpanded(expanded === "outline" ? null : "outline")
                }
              >
                <FileText className="h-4 w-4 mr-1" />
                View Outline
                {expanded === "outline" ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>
              <Button variant="outline" size="sm" disabled>
                <Image className="h-4 w-4 mr-1" />
                Thumbnails (Step 3)
              </Button>
            </div>

            {/* Expandable: Title variants */}
            {expanded === "titles" && (
              <div className="mt-4 p-4 rounded-lg bg-muted/50 space-y-2 border-l-2 border-brand-500">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Title Variants
                </p>
                {gap.suggestedTitles.map((title, i) => (
                  <p key={i} className="text-sm font-medium">
                    {i + 1}. {title}
                  </p>
                ))}
              </div>
            )}

            {/* Expandable: Script outline */}
            {expanded === "outline" && (
              <div className="mt-4 p-4 rounded-lg bg-muted/50 space-y-3 border-l-2 border-brand-500">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Script Outline
                  </p>
                  <p className="text-sm mt-1 whitespace-pre-line">
                    {gap.scriptOutline}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-3">
                    Thumbnail Concept
                  </p>
                  <p className="text-sm mt-1">{gap.thumbnailConcept}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-3">
                    Tags
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {gap.suggestedTags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs"
                      >
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function StrategyPage() {
  const [niche, setNiche] = useState("");
  const [state, setState] = useState<AnalysisState>({
    status: "idle",
    gaps: [],
  });

  // On mount, check for existing analyses
  useEffect(() => {
    async function loadExisting() {
      try {
        const res = await fetch("/api/strategy/gaps");
        if (!res.ok) return;
        const data = await res.json();
        if (data.gaps && data.gaps.length > 0) {
          setState({
            status: "complete",
            gaps: data.gaps,
            niche: data.niche,
            generatedAt: data.generatedAt,
          });
          if (data.niche) setNiche(data.niche);
        }
      } catch {
        // No existing analysis — stay on input state
      }
    }
    loadExisting();
  }, []);

  // Poll for job completion
  const pollJob = useCallback(async (jobId: string, analysisNiche: string) => {
    setState((prev) => ({ ...prev, status: "polling" }));

    const poll = async () => {
      try {
        const res = await fetch(`/api/strategy/analyze?jobId=${jobId}`);
        const data = await res.json();

        if (data.status === "completed") {
          // Fetch the stored results for THIS niche, not the globally most recent
          const gapsRes = await fetch(
            `/api/strategy/gaps?niche=${encodeURIComponent(analysisNiche)}`
          );
          const gapsData = await gapsRes.json();
          setState({
            status: "complete",
            jobId,
            gaps: gapsData.gaps,
            niche: gapsData.niche,
            generatedAt: gapsData.generatedAt,
          });
          return;
        }

        if (data.status === "failed") {
          setState({
            status: "error",
            error: data.failedReason ?? "Analysis failed. Please try again.",
            gaps: [],
          });
          return;
        }

        // Still running — poll again in 3s
        setTimeout(poll, 3000);
      } catch (err) {
        setState({
          status: "error",
          error: err instanceof Error ? err.message : "Connection lost. Please refresh.",
          gaps: [],
        });
      }
    };

    poll();
  }, []);

  // Start analysis
  const handleAnalyze = async () => {
    if (!niche.trim() || niche.trim().length < 3) return;

    setState({ status: "loading", gaps: [] });

    try {
      const res = await fetch("/api/strategy/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: niche.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState({
          status: "error",
          error: data.error ?? "Failed to start analysis.",
          gaps: [],
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        jobId: data.jobId,
      }));

      // Start polling
      pollJob(data.jobId, niche.trim());
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to start analysis.",
        gaps: [],
      });
    }
  };

  // ==========================================================================
  // Render: Input state
  // ==========================================================================

  if (state.status === "idle" && state.gaps.length === 0) {
    return (
      <div className="max-w-3xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Strategy</h1>
          <p className="text-muted-foreground mt-2">
            Discover untapped content opportunities. Find topics your
            competitors aren&apos;t covering, with demand estimates and
            ready-to-use video ideas.
          </p>
        </div>

        <Card>
          <CardContent className="p-8 space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="niche"
                className="text-sm font-medium"
              >
                What niche do you create content in?
              </label>
              <p className="text-xs text-muted-foreground">
                Be specific. &ldquo;Productivity for software
                developers&rdquo; works better than just
                &ldquo;Productivity&rdquo;.
              </p>
              <div className="flex gap-3">
                <input
                  id="niche"
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  placeholder='e.g., "react.js tutorials"'
                  className="flex-1 rounded-lg border border-input bg-background px-4 py-2 text-sm text-gray-900 dark:text-gray-900 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <Button
                  onClick={handleAnalyze}
                  disabled={niche.trim().length < 3}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Analyze
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>This takes 45–60 seconds. Analysis is cached for 7 days.</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-1">
              <Search className="h-5 w-5 text-brand-500" />
              <p className="text-sm font-medium">Discover Gaps</p>
              <p className="text-xs text-muted-foreground">
                We scan top channels in your niche and find topics nobody is
                covering.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-1">
              <TrendingUp className="h-5 w-5 text-brand-500" />
              <p className="text-sm font-medium">Demand Estimates</p>
              <p className="text-xs text-muted-foreground">
                Each gap is scored by search demand, competition level, and
                trending status.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-1">
              <Sparkles className="h-5 w-5 text-brand-500" />
              <p className="text-sm font-medium">Ready-to-Use Ideas</p>
              <p className="text-xs text-muted-foreground">
                Get title variants, script outlines, and thumbnail concepts for
                every opportunity.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: Loading / Polling state
  // ==========================================================================

  if (state.status === "loading" || state.status === "polling") {
    return (
      <div className="max-w-4xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Strategy</h1>
          <p className="text-muted-foreground mt-2">
            Analyzing content gaps for &ldquo;{niche}&rdquo;...
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
            <RefreshCw className="h-5 w-5 text-brand-500 animate-spin" />
            <div>
              <p className="text-sm font-medium">
                {state.status === "loading"
                  ? "Starting analysis..."
                  : "Processing your results..."}
              </p>
              <p className="text-xs text-muted-foreground">
                This usually takes 45–60 seconds. We&apos;re discovering channels,
                analyzing videos, and generating video ideas.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GapCardSkeleton />
            <GapCardSkeleton />
            <GapCardSkeleton />
            <GapCardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: Error state
  // ==========================================================================

  if (state.status === "error") {
    return (
      <div className="max-w-3xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Strategy</h1>
        </div>

        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="font-medium text-red-500">Analysis failed</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {state.error ?? "Something went wrong. Please try again."}
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setState({ status: "idle", gaps: [] })
                }
              >
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==========================================================================
  // Render: Results state
  // ==========================================================================

  const timeAgo = state.generatedAt
    ? (() => {
        const ms = Date.now() - new Date(state.generatedAt).getTime();
        const mins = Math.floor(ms / 60000);
        const hours = Math.floor(mins / 60);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
      })()
    : "";

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Strategy</h1>
          {state.niche && (
            <p className="text-muted-foreground mt-1">
              Content Gaps for &ldquo;{state.niche}&rdquo;
              {" · "}
              <span className="text-xs">Updated {timeAgo}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setState({ status: "idle", gaps: [] })}
          >
            <Search className="h-4 w-4 mr-1" />
            New Analysis
          </Button>
        </div>
      </div>

      {state.gaps.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Lightbulb className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">
              No content gaps found for &ldquo;{state.niche}&rdquo;. Try a
              different niche or broader search terms.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState({ status: "idle", gaps: [] })}
            >
              Search a different niche
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {state.gaps.map((gap) => (
            <GapCard key={gap.id} gap={gap} />
          ))}
        </div>
      )}
    </div>
  );
}
