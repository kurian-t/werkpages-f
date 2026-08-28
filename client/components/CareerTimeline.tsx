import { useMemo, useState, useRef, useLayoutEffect, Fragment } from "react"; // useLayoutEffect kept for scroll detection
import {
  Star, TrendingUp, TrendingDown, Minus, Activity,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, ChevronRight,
} from "lucide-react";
import { companyLogoDomain } from "@/lib/utils";
import {
  generateCareerInsights,
  computeConsistencyScore,
  type CareerSegment,
  type CareerInsightsResult,
  type ConsistencyResult,
  type ConsistencyProfile,
  type RiskLevel,
  type ConfidenceLevel,
  type TrendType,
} from "@/lib/careerInsights";


// ── Layout ────────────────────────────────────────────────────────────────────
export const CARD_W      = 255;
export const CARD_H      = 170;   // collapsed card height (used for Y positioning)
const CONN_W      = 180;
export const TOP_PAD     = 24;
export const VERT_RANGE  = 220;   // pixel span from 5.0 centre to 1.0 centre
const AXIS_W      = 38;

// X-axis sits one grid interval below the 1.0 line - same rhythm as all other intervals
export const GRID_INTERVAL   = VERT_RANGE / 4;                                          // 55px
export const X_AXIS_Y        = Math.round(TOP_PAD + VERT_RANGE + CARD_H / 2 + GRID_INTERVAL); // ~384

const TICK_AREA_H     = 60;               // room for tick line + label even for low-rated cards
const TRACK_H         = X_AXIS_Y + TICK_AREA_H;
const FLOW_BOTTOM_PAD = 28;

export function cardTopY(rating: number): number {
  const c = Math.max(1, Math.min(5, rating));
  return TOP_PAD + ((5 - c) / 4) * VERT_RANGE;
}
export function cardCenterY(rating: number): number {
  return cardTopY(rating) + CARD_H / 2;
}

// Tick Y position: hangs off the card bottom for low-rated cards that overlap
// the x-axis, otherwise falls on the x-axis line.
export function tickTopY(rating: number, cardHeight: number): number {
  return Math.max(X_AXIS_Y, cardTopY(rating) + cardHeight + 6);
}

// ── Semantic delta config ─────────────────────────────────────────────────────
type DeltaConfig = {
  stroke: string; textColor: string; bg: string; borderColor: string;
  primaryText: string; secondaryText: string | null; isNeutral: boolean;
};
function deltaConfig(delta: number): DeltaConfig {
  const abs  = Math.abs(delta);
  const sign = delta > 0 ? "+" : "";
  const formatted = abs < 0.05 ? "0.0" : `${sign}${delta.toFixed(1)}`;

  if (abs < 0.15) return {
    stroke: "#94a3b8", textColor: "#64748b", bg: "#f8fafc", borderColor: "#e2e8f0",
    primaryText: "± 0.0", secondaryText: "Consistent Performance", isNeutral: false,
  };
  if (delta > 0) return {
    stroke: "#15803d", textColor: "#15803d", bg: "#f0fdf4", borderColor: "#bbf7d0",
    primaryText: `↑ ${formatted}`, secondaryText: "Performance Increase", isNeutral: false,
  };
  return {
    stroke: "#b91c1c", textColor: "#b91c1c", bg: "#fef2f2", borderColor: "#fecaca",
    primaryText: `↓ ${formatted}`, secondaryText: "Performance Drop", isNeutral: false,
  };
}

// ── Company logo ──────────────────────────────────────────────────────────────
function CompanyLogo({ company, logoUrl }: { company: string; logoUrl?: string }) {
  const [triedPrimary, setTriedPrimary] = useState(false);
  const [failed,       setFailed]       = useState(false);
  const initial   = company.trim().charAt(0).toUpperCase();
  const domain    = companyLogoDomain(company);
  const domainSrc = `https://img.logo.dev/${domain}?token=pk_MXSjJV-uTC6-L5D_FbXZUA`;

  // Two-tier fallback: stored URL → logo.dev domain URL → letter initial.
  // Stored URLs may be stale (e.g. Clearbit, which shut down its free API).
  const src = (!triedPrimary && logoUrl) ? logoUrl : domainSrc;

  const handleError = () => {
    if (!triedPrimary && logoUrl) {
      setTriedPrimary(true);
    } else {
      setFailed(true);
    }
  };

  if (failed) {
    return (
      <div className="flex-shrink-0 h-9 w-9 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[13px] font-semibold text-slate-500">
        {initial}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={company}
      className="flex-shrink-0 h-9 w-9 rounded-md object-contain bg-white border border-slate-200"
      onError={handleError}
    />
  );
}

// ── Stars ─────────────────────────────────────────────────────────────────────
function Stars({ rating, size = 11 }: { rating: number; size?: number }) {
  const full = Math.floor(rating);
  return (
    <div
      className="flex gap-0.5"
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i} size={size} aria-hidden="true"
          className={i < full ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"}
        />
      ))}
    </div>
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function segmentYearRange(seg: CareerSegment): string {
  if (!seg.startDate) return "";
  const sy = seg.startDate.slice(0, 4);
  if (seg.isCurrent) return `${sy} – Present`;
  if (seg.endDate) {
    const ey = seg.endDate.slice(0, 4);
    return sy === ey ? sy : `${sy} – ${ey}`;
  }
  return sy;
}

function dateRangeFromParts(
  startDate: string | undefined,
  endDate: string | undefined,
  isCurrent: boolean,
): string {
  if (!startDate) return "";
  const sy = startDate.slice(0, 4);
  if (isCurrent) return `${sy} – Present`;
  if (endDate) {
    const ey = endDate.slice(0, 4);
    return sy === ey ? sy : `${sy} – ${ey}`;
  }
  return sy;
}

// ── Node / edge types ─────────────────────────────────────────────────────────
type CompanyNode = {
  kind:         "company";
  isGhost:      boolean;
  company:      string;
  logoUrl?:     string;
  avg:          number;
  totalReviews: number;
  startDate?:   string;
  endDate?:     string;
  isCurrent:    boolean;
  roles: CareerSegment[];
};

type TimelineEdge = {
  fromY:  number;
  toY:    number;
  delta:  number;
};

function roleConfidence(reviewCount: number): string {
  if (reviewCount >= 5) return "High";
  if (reviewCount >= 2) return "Medium";
  return "Low";
}

// ── Role item - independent collapsible card inside a company card ────────────
function RoleItem({ role, companyAvg }: { role: CareerSegment; companyAvg: number }) {
  const [expanded, setExpanded] = useState(false);
  const delta    = role.averageRating - companyAvg;
  const abs      = Math.abs(delta);
  const range    = segmentYearRange(role);
  const isUp     = delta > 0.15;
  const isDown   = delta < -0.15;
  const deltaStr = abs < 0.05 ? "±0.0" : (delta > 0 ? "+" : "") + delta.toFixed(1);
  const arrowColor = isUp ? "#15803d" : isDown ? "#b91c1c" : "#94a3b8";
  const categories = Object.entries(role.categoryAverages);

  return (
    <div
      style={{
        borderRadius: 6,
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-3 py-2.5"
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs font-semibold text-slate-800 leading-snug">
                {role.role}
              </span>
              <span className="text-xs text-slate-400">-</span>
              <span className="text-xs font-bold text-slate-700 tabular-nums">
                {role.averageRating.toFixed(1)}
              </span>
              <Stars rating={role.averageRating} size={9} />
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              {range && (
                <span className="text-[10.5px] text-slate-500 tabular-nums">{range}</span>
              )}
              <div className="flex items-center gap-0.5" style={{ color: arrowColor }}>
                {isUp
                  ? <ArrowUp size={10} />
                  : isDown
                  ? <ArrowDown size={10} />
                  : <Minus size={9} className="text-slate-400" />}
                <span className="text-[10.5px] font-bold tabular-nums">{deltaStr}</span>
              </div>
            </div>
          </div>
          {expanded
            ? <ChevronUp size={12} className="text-slate-400 flex-shrink-0 mt-0.5" />
            : <ChevronDown size={12} className="text-slate-400 flex-shrink-0 mt-0.5" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-2.5">
          {categories.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-slate-600 mb-1.5">Breakdown</p>
              <ul className="space-y-1">
                {categories.map(([cat, val]) => (
                  <li key={cat} className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 min-w-0 flex-1">{cat}</span>
                    <span className="text-[10px] font-semibold text-slate-700 tabular-nums flex-shrink-0">{val.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="border-t border-slate-100 mt-2.5 pt-2 space-y-0.5">
            <p className="text-[10px] text-slate-500 tabular-nums">
              Based on {role.reviewCount} {role.reviewCount === 1 ? "review" : "reviews"}
            </p>
            <p className="text-[10px] text-slate-500">
              Confidence: {roleConfidence(role.reviewCount)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Company card ──────────────────────────────────────────────────────────────
function CompanyCard({
  node, hasLeft, hasRight, onEditCareerEntry, onDeleteCareerEntry,
}: {
  node: CompanyNode; hasLeft: boolean; hasRight: boolean;
  onEditCareerEntry?: (entry: { entryId: number; company: string; role: string; startDate: string | null; endDate: string | null }) => void;
  onDeleteCareerEntry?: (entryId: number) => void;
}) {
  const top     = cardTopY(node.avg);
  const centerY = cardCenterY(node.avg);
  const range   = dateRangeFromParts(node.startDate, node.endDate, node.isCurrent);
  const year    = node.startDate?.slice(0, 4);

  // Track actual card height with a ResizeObserver so the tick always hangs off the
  // real card bottom - including after roles expand or collapse.
  const cardRef  = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(CARD_H);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tickTop = tickTopY(node.avg, cardHeight);

  return (
    <div className="relative flex-shrink-0" style={{ width: CARD_W }}>

      <div
        ref={cardRef}
        data-testid="company-card"
        className="overflow-hidden"
        style={{
          position: "relative",
          zIndex: 2,
          marginTop: top,
          minHeight: CARD_H,
          borderRadius: 8,
          background: node.isGhost ? "#f8fafc" : "#ffffff",
          border: "1px solid #e2e8f0",
          borderLeft: node.isGhost ? "3px solid #cbd5e1" : "3px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div className="px-4 pt-3 pb-5 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <CompanyLogo company={node.company} logoUrl={node.logoUrl} />
            <span className="text-[13px] font-semibold text-slate-900 leading-tight truncate">
              {node.company}
            </span>
          </div>

          <div className="h-3" />

          {node.isGhost ? (
            <div>
              <p className="text-[9.5px] font-semibold uppercase tracking-widest text-slate-400 mb-1 leading-none">
                No reviews yet
              </p>
              {range && <p className="text-[11px] text-slate-400 tabular-nums">{range}</p>}
            </div>
          ) : (
            <div>
              <p className="text-[9.5px] font-semibold uppercase tracking-widest text-slate-500 mb-0.5 leading-none">
                Avg at this company
              </p>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span
                  className="font-bold text-slate-900 leading-none tabular-nums"
                  style={{ fontSize: 26 }}
                >
                  {node.avg.toFixed(1)}
                </span>
                <Stars rating={node.avg} size={11} />
              </div>
              <p className="text-[11px] text-slate-500 tabular-nums">
                {node.totalReviews} {node.totalReviews === 1 ? "review" : "reviews"}
              </p>
              {range && <p className="text-[11px] text-slate-500 tabular-nums">{range}</p>}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {node.roles.map((role, j) => (
              node.isGhost
                ? (
                  <div
                    key={j}
                    style={{
                      borderRadius: 6,
                      border: "1px solid #e2e8f0",
                      background: "#f1f5f9",
                      padding: "10px 12px",
                    }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-xs font-semibold text-slate-500 leading-snug">{role.role}</span>
                      {(onEditCareerEntry || onDeleteCareerEntry) && role.careerHistoryId != null && (
                        <div className="flex items-center gap-2 flex-shrink-0 ml-1">
                          {onEditCareerEntry && (
                            <button
                              type="button"
                              onClick={() => onEditCareerEntry({ entryId: role.careerHistoryId!, company: role.company, role: role.role, startDate: role.startDate, endDate: role.endDate })}
                              className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors leading-none"
                            >
                              Edit
                            </button>
                          )}
                          {onDeleteCareerEntry && (
                            <button
                              type="button"
                              onClick={() => onDeleteCareerEntry(role.careerHistoryId!)}
                              className="text-[10px] text-red-400 hover:text-red-600 transition-colors leading-none"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {role.startDate && (
                      <p className="text-[10.5px] text-slate-400 tabular-nums mt-0.5">
                        {segmentYearRange(role)}
                      </p>
                    )}
                  </div>
                )
                : <RoleItem key={j} role={role} companyAvg={node.avg} />
            ))}
          </div>
        </div>
      </div>

      {hasLeft && (
        <div
          className="absolute w-3 h-3 rounded-full bg-slate-400 border-2 border-white z-10"
          style={{ top: centerY - 6, left: -6 }}
        />
      )}
      <div
        className="absolute w-3 h-3 rounded-full bg-slate-400 border-2 border-white z-10"
        style={{ top: centerY - 6, right: -6 }}
      />

      {/* Year tick - tracks real card bottom via ResizeObserver, follows expand/collapse */}
      {year && (
        <div
          style={{
            position: "absolute",
            top: tickTop,
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <div style={{ width: 1, height: 8, background: "#cbd5e1" }} />
          <span style={{ fontSize: 8, color: "#94a3b8", lineHeight: 1 }}>{year}</span>
        </div>
      )}
    </div>
  );
}

// ── Connector ─────────────────────────────────────────────────────────────────
function Connector({ edge, isLargest }: { edge: TimelineEdge; isLargest: boolean }) {
  const { fromY, toY, delta } = edge;
  const midY = (fromY + toY) / 2;
  const cfg  = deltaConfig(delta);

  return (
    <div className="relative flex-shrink-0" style={{ width: CONN_W, height: TRACK_H }}>
      <svg
        className="absolute inset-0 pointer-events-none"
        width={CONN_W}
        height={TRACK_H}
        style={{ overflow: "visible" }}
      >
        <path
          d={(() => {
            const amp = 32;
            const cp1Y = fromY + (toY - fromY) * 0.25 - amp;
            const cp2Y = fromY + (toY - fromY) * 0.75 + amp;
            return `M 0,${fromY} C ${CONN_W * 0.25},${cp1Y} ${CONN_W * 0.75},${cp2Y} ${CONN_W},${toY}`;
          })()}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={isLargest ? 1.8 : 1.4}
          opacity={0.5}
          strokeLinecap="round"
        />
      </svg>

      <div
        className="absolute left-1/2 z-10 pointer-events-none"
        style={{ top: midY, transform: "translate(-50%, -50%)" }}
      >
        <div
          className="flex flex-col items-center text-center whitespace-nowrap"
          style={{
            background:   cfg.bg,
            border:       `1px solid ${cfg.borderColor}`,
            borderRadius: 6,
            padding:      cfg.secondaryText ? "7px 12px 8px" : "5px 12px",
            minWidth:     80,
          }}
        >
          <span
            className={`${cfg.isNeutral ? "font-medium" : "font-bold"} leading-none`}
            style={{
              fontSize:  cfg.isNeutral ? 10 : 15,
              color:     cfg.textColor,
              opacity:   cfg.isNeutral ? 0.8 : 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {cfg.primaryText}
          </span>
          {cfg.secondaryText && (
            <span
              className="font-medium mt-1 leading-none"
              style={{ fontSize: 10, color: cfg.textColor, opacity: 0.8 }}
            >
              {cfg.secondaryText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const map: Record<ConfidenceLevel, { cls: string; label: string }> = {
    high:   { cls: "bg-green-50 text-green-700 border-green-200",    label: "High confidence" },
    medium: { cls: "bg-amber-50 text-amber-700 border-amber-200",    label: "Medium confidence" },
    low:    { cls: "bg-slate-50 text-slate-500 border-slate-200",    label: "Low confidence · limited data" },
  };
  const { cls, label } = map[level];
  return (
    <span className={`text-[10.5px] font-medium border rounded px-2.5 py-0.5 whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

// ── Trend icon ────────────────────────────────────────────────────────────────
function TrendIcon({ trend }: { trend: TrendType }) {
  if (trend === "upward")   return <TrendingUp size={15} className="text-green-600 flex-shrink-0" />;
  if (trend === "downward") return <TrendingDown size={15} className="text-red-600 flex-shrink-0" />;
  if (trend === "mixed")    return <Activity size={15} className="text-amber-600 flex-shrink-0" />;
  return <Minus size={15} className="text-slate-400 flex-shrink-0" />;
}

// ── Consistency panel ─────────────────────────────────────────────────────────

type RiskCfg = { label: string; color: string; bg: string; border: string; bar: string };

const RISK_CFG: Record<RiskLevel, RiskCfg> = {
  low:       { label: "Low Risk",       color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", bar: "#22c55e" },
  medium:    { label: "Medium Risk",    color: "#92400e", bg: "#fffbeb", border: "#fde68a", bar: "#f59e0b" },
  high:      { label: "High Risk",      color: "#991b1b", bg: "#fef2f2", border: "#fecaca", bar: "#ef4444" },
  declining: { label: "Declining Risk", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", bar: "#3b82f6" },
  increasing:{ label: "Increasing Risk",color: "#9a3412", bg: "#fff7ed", border: "#fed7aa", bar: "#f97316" },
};

const PROFILE_ICON: Record<ConsistencyProfile, string> = {
  stable_performer:   "◆",
  context_dependent:  "◈",
  volatile_performer: "◇",
  improver:           "▲",
  decliner:           "▼",
};


function ConsistencyPanel({
  result, segments,
}: {
  result: ConsistencyResult; segments: CareerSegment[];
}) {
  const cfg = RISK_CFG[result.riskLevel];
  const ratings = segments.map((s) => s.averageRating);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="text-[13px] flex-shrink-0"
            style={{ color: cfg.bar }}
            aria-hidden="true"
          >
            {PROFILE_ICON[result.profile]}
          </span>
          <span className="text-[14px] font-semibold text-slate-800 leading-snug">
            {result.headline}
          </span>
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/40 space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Rating Pattern
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {ratings.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className="text-[13px] font-bold tabular-nums"
                  style={{ color: cfg.bar }}
                >
                  {r.toFixed(1)}
                </span>
                {i < ratings.length - 1 && (
                  <span className="text-[11px] text-slate-300">→</span>
                )}
              </div>
            ))}
            <span className="text-[11px] text-slate-400 ml-1">
              (σ = ±{result.standardDeviation.toFixed(2)})
            </span>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            What This Means
          </p>
          <p className="text-[13px] text-slate-700 leading-snug">{result.description}</p>
        </div>
      </div>
    </div>
  );
}

// ── Ghost panels - shown when there is only one segment ───────────────────────
function GhostInsightPanel() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Minus size={15} className="text-slate-400 flex-shrink-0" />
          <span className="text-[14px] font-semibold text-slate-500">Career Trajectory Insight</span>
        </div>
      </div>
      <div className="border-t border-dashed border-slate-100 px-5 py-4 bg-slate-50/40">
        <p className="text-[13px] text-slate-500 leading-relaxed">
          Performance trends (upward, downward, stable, or mixed) will appear here once this manager has reviews across more than one role or company.
        </p>
      </div>
    </div>
  );
}

function GhostConsistencyPanel() {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[13px] text-slate-400" aria-hidden="true">◆</span>
          <span className="text-[14px] font-semibold text-slate-500">Manager Consistency Profile</span>
        </div>
      </div>
      <div className="border-t border-dashed border-slate-100 px-5 py-4 bg-slate-50/40">
        <p className="text-[13px] text-slate-500 leading-relaxed">
          A consistency profile (how stable this manager's performance has been across different roles and environments) will be calculated once more data is available.
        </p>
      </div>
    </div>
  );
}

// ── Insight panel ─────────────────────────────────────────────────────────────
function InsightPanel({ insights }: { insights: CareerInsightsResult }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <TrendIcon trend={insights.overallTrend} />
          <span className="text-[14px] font-semibold text-slate-800 leading-snug">
            {insights.headline}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ConfidenceBadge level={insights.confidence} />
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/40">
        <p className="text-[11.5px] text-slate-400 mb-4 leading-relaxed">
          {insights.confidenceReason}
        </p>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
              Rating Signals
            </p>
            <ul className="space-y-2.5">
              {insights.supportingSignals.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                  <span className="text-[13px] text-slate-700 leading-snug">{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
              Contextual Notes
            </p>
            {insights.possibleInterpretations.length > 0 ? (
              <ul className="space-y-2.5">
                {insights.possibleInterpretations.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                    <span className="text-[13px] text-slate-500 leading-snug">{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-slate-400">
                Not enough variation to identify specific patterns.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function CareerTimeline({
  segments,
  onEditCareerEntry,
  onDeleteCareerEntry,
}: {
  segments: CareerSegment[];
  onEditCareerEntry?: (entry: { entryId: number; company: string; role: string; startDate: string | null; endDate: string | null }) => void;
  onDeleteCareerEntry?: (entryId: number) => void;
}) {
  // Only include real reviewed segments in insight/consistency calculations - ghost segments (reviewCount 0) have no rating data
  const reviewedSegments = useMemo(() => segments.filter(s => s.reviewCount > 0), [segments]);
  const insights    = useMemo(() => generateCareerInsights(reviewedSegments), [reviewedSegments]);
  const consistency = useMemo(() => computeConsistencyScore(reviewedSegments), [reviewedSegments]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [scrollRatio, setScrollRatio] = useState(0); // 0 = at start, 1 = at end

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateScroll = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) { setScrollRatio(1); return; }
      const nearEnd = el.scrollLeft >= maxScroll - 2;
      const ratio = nearEnd ? 1 : el.scrollLeft / maxScroll;
      setScrollRatio(ratio);
      if (ratio > 0) setHintDismissed(true);
    };

    updateScroll();

    const ro = new ResizeObserver(updateScroll);
    ro.observe(el);

    return () => ro.disconnect();
  }, []);


  const { nodes, edges } = useMemo(() => {
    const nodes: CompanyNode[] = [];

    let i = 0;
    while (i < segments.length) {
      const companyKey = segments[i].company.toLowerCase();
      const groupStart = i;
      while (i < segments.length && segments[i].company.toLowerCase() === companyKey) i++;
      const group   = segments.slice(groupStart, i);
      const lastSeg = group[group.length - 1];

      const totalReviews = group.reduce((s, seg) => s + seg.reviewCount, 0);
      const weightedSum  = group.reduce((s, seg) => s + seg.averageRating * seg.reviewCount, 0);
      const isGhost      = totalReviews === 0;
      // Ghost nodes have no rating - position them at the previous company's rating so they
      // appear at the same level rather than jumping to a neutral midpoint.
      const prevAvg      = nodes.length > 0 ? (nodes[nodes.length - 1] as any).avg : 3.0;
      const avg          = isGhost ? prevAvg : Math.round((weightedSum / totalReviews) * 10) / 10;

      nodes.push({
        kind:         "company",
        isGhost,
        company:      group[0].company,
        logoUrl:      group[0].logoUrl,
        avg,
        totalReviews,
        startDate:    group[0].startDate,
        endDate:      lastSeg.endDate,
        isCurrent:    lastSeg.isCurrent,
        roles:        group,
      });
    }

    const edges: TimelineEdge[] = [];
    for (let j = 0; j < nodes.length - 1; j++) {
      edges.push({
        fromY: cardCenterY(nodes[j].avg),
        toY: cardCenterY(nodes[j + 1].avg),
        delta: nodes[j + 1].avg - nodes[j].avg,
      });
    }

    return { nodes, edges };
  }, [segments]);

  if (segments.length < 1) return null;

  const allGhost = nodes.every(n => n.isGhost);

  const maxEdgeIdx = edges.length > 1
    ? edges.reduce((best, e, i, arr) =>
        Math.abs(e.delta) > Math.abs(arr[best].delta) ? i : best, 0)
    : -1;

  const totalTimelineW = nodes.length * CARD_W + (nodes.length - 1) * CONN_W;
  const gridLines      = [1, 2, 3, 4, 5];

  return (
    <section className="border-b border-slate-200 py-6">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">
              Career Performance Trajectory
            </h2>
            <p className="text-[13px] text-slate-400 mt-0.5">
              {allGhost
                ? `Career history · ${segments.length} ${segments.length === 1 ? "role" : "roles"}`
                : `Rating progression across roles and companies · ${segments.length} ${segments.length === 1 ? "role" : "roles"}`}
            </p>
          </div>
          {scrollRatio < 1 && !hintDismissed && (
            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1 flex-shrink-0 select-none">
              <span>Scroll to explore</span>
              <ChevronRight size={12} className="animate-bounce" />
            </div>
          )}
        </div>

        <div className="relative">
          {/* Gradient overlay - only when content overflows */}
          {scrollRatio < 1 && (
            <div
              className="absolute inset-y-0 right-0 w-24 pointer-events-none"
              style={{
                zIndex: 50,
                opacity: 1 - scrollRatio,
                background: "linear-gradient(to right, transparent, white)",
                transition: "opacity 0.15s ease",
              }}
            />
          )}
        <div
          ref={scrollRef}
          className="overflow-x-auto pb-5"
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            const maxScroll = el.scrollWidth - el.clientWidth;
            if (maxScroll <= 0) { setScrollRatio(1); return; }
            const nearEnd = el.scrollLeft >= maxScroll - 2;
            const ratio = nearEnd ? 1 : el.scrollLeft / maxScroll;
            setScrollRatio(ratio);
            if (ratio > 0) setHintDismissed(true);
          }}
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#94a3b8 #e2e8f0",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              minWidth: AXIS_W + totalTimelineW + 32,
              minHeight: TRACK_H,
              paddingRight: 32,
            }}
          >
            {/* Background grid - fixed height, grid lines stay within TRACK_H */}
            <svg
              style={{ position: "absolute", top: 0, left: 0, width: "100%", pointerEvents: "none" }}
              height={TRACK_H}
            >
              {gridLines.map(r => {
                const y = cardCenterY(r);
                return (
                  <g key={r}>
                    <line
                      x1={AXIS_W}
                      y1={y}
                      x2="100%"
                      y2={y}
                      stroke="#e2e8f0"
                      strokeWidth={1}
                    />
                    <text
                      x={AXIS_W - 6}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={9}
                      fill="#94a3b8"
                    >
                      {r}.0
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* X-axis baseline */}
            <div
              style={{
                position: "absolute",
                top: X_AXIS_Y,
                left: AXIS_W,
                right: 0,
                height: 1,
                background: "#e2e8f0",
                pointerEvents: "none",
              }}
            />

            {/* Year ticks are rendered inside each CompanyCard, anchored to the measured collapsed height */}

            {/* Flow layer - grows naturally with expanded card content */}
            <div
              className="flex items-start"
              style={{
                position: "relative",
                zIndex: 1,
                paddingLeft: AXIS_W,
                paddingBottom: FLOW_BOTTOM_PAD,
                minHeight: TRACK_H,
              }}
            >
              {nodes.map((node, i) => (
                <Fragment key={i}>
                  <CompanyCard
                    node={node}
                    hasLeft={i > 0}
                    hasRight={true}
                    onEditCareerEntry={onEditCareerEntry}
                    onDeleteCareerEntry={onDeleteCareerEntry}
                  />
                  {i < nodes.length - 1 && (
                    <Connector
                      edge={edges[i]}
                      isLargest={i === maxEdgeIdx}
                    />
                  )}
                </Fragment>
              ))}
              {(() => {
                const lastNode = nodes[nodes.length - 1];
                const fromY = cardCenterY(lastNode.avg);
                const toY   = fromY;
                const amp   = 32;
                const cp1Y  = fromY + (toY - fromY) * 0.25 - amp;
                const cp2Y  = fromY + (toY - fromY) * 0.75 + amp;
                const ghostPath = `M 0,${fromY} C ${CONN_W * 0.25},${cp1Y} ${CONN_W * 0.75},${cp2Y} ${CONN_W},${toY}`;
                return (
                  <>
                    {/* Ghost connector */}
                    <div className="relative flex-shrink-0" style={{ width: CONN_W, height: TRACK_H }}>
                      <svg className="absolute inset-0 pointer-events-none" width={CONN_W} height={TRACK_H} style={{ overflow: "visible" }}>
                        <path d={ghostPath} fill="none" stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="5,4" strokeLinecap="round" opacity={0.85} />
                      </svg>
                    </div>
                    {/* Ghost card */}
                    <div className="relative flex-shrink-0" style={{ width: CARD_W }}>
                      <div
                        style={{
                          marginTop: cardTopY(lastNode.avg),
                          minHeight: CARD_H,
                          borderRadius: 8,
                          border: "1.5px dashed #94a3b8",
                          background: "#f1f5f9",
                          opacity: 0.85,
                        }}
                      >
                        <div className="px-4 pt-3 pb-5 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-shrink-0 h-9 w-9 rounded-md bg-slate-200 border border-slate-300 flex items-center justify-center">
                              <span className="text-[15px] text-slate-400">?</span>
                            </div>
                            <div className="h-3 w-24 rounded bg-slate-200" />
                          </div>
                          <div className="h-3" />
                          <div className="space-y-2">
                            <div className="h-2 w-20 rounded bg-slate-200" />
                            <div className="h-6 w-12 rounded bg-slate-200" />
                            <div className="h-2 w-16 rounded bg-slate-200" />
                          </div>
                          <div className="mt-4 pt-3 border-t border-slate-200">
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Performance trajectory is tracked as additional roles and companies are added.
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* Left dot */}
                      <div
                        className="absolute w-3 h-3 rounded-full bg-slate-300 border-2 border-white z-10"
                        style={{ top: cardCenterY(lastNode.avg) - 6, left: -6 }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
        </div>

        {!allGhost && (insights
          ? <InsightPanel insights={insights} />
          : <GhostInsightPanel />)}
        {!allGhost && (consistency
          ? <ConsistencyPanel result={consistency} segments={reviewedSegments} />
          : <GhostConsistencyPanel />)}
      </div>
    </section>
  );
}