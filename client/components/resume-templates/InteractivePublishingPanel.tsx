import {
  CheckCircle2,
  Clock3,
  CloudUpload,
  ExternalLink,
  Gauge,
  Globe2,
  Link2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ResumeData, ResumeDesign } from "./types";
import {
  assessCustomDomainReadiness,
  createInteractivePublishSnapshot,
  defaultInteractiveSlug,
  describePublishSnapshot,
  getInteractiveDraftPublicationStatus,
  InteractivePublishBlockedError,
  normalizeCustomDomainHostname,
  recordInteractiveCustomDomainState,
  recordPreparedInteractiveSnapshot,
  setInteractivePublishSettings,
  validateInteractiveSlug,
} from "./resumeInteractivePublishing";
import {
  getInteractivePublishingState,
  type InteractivePublishAddressMode,
  type InteractivePublishVisibility,
} from "./resumeWebExperience";
import { analyzeInteractivePublish } from "./resumeInteractivePerformance";

function dateLabel(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export default function InteractivePublishingPanel({
  data,
  onDesignChange,
  onReviewReadiness,
}: {
  data: ResumeData;
  onDesignChange: (design: ResumeDesign) => void;
  onReviewReadiness?: () => void;
}) {
  const publishing = getInteractivePublishingState(data.design);
  const addressMode = publishing.settings.addressMode ?? "werkpages";
  const defaultSlug = defaultInteractiveSlug(data);
  const effectiveSlug = publishing.settings.slug || defaultSlug;

  const [slugDraft, setSlugDraft] = useState(effectiveSlug);
  const [domainDraft, setDomainDraft] = useState(
    publishing.settings.customDomain?.hostname ?? "",
  );
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    setSlugDraft(effectiveSlug);
  }, [effectiveSlug]);

  useEffect(() => {
    setDomainDraft(publishing.settings.customDomain?.hostname ?? "");
  }, [publishing.settings.customDomain?.hostname]);

  const slugValidation = useMemo(
    () => validateInteractiveSlug(slugDraft),
    [slugDraft],
  );

  const normalizedDomain = useMemo(
    () => normalizeCustomDomainHostname(domainDraft),
    [domainDraft],
  );

  const draftCustomDomain = useMemo(() => {
    if (!normalizedDomain) return undefined;

    if (
      publishing.settings.customDomain?.hostname === normalizedDomain
    ) {
      return publishing.settings.customDomain;
    }

    return {
      hostname: normalizedDomain,
      status: "pending-verification" as const,
    };
  }, [normalizedDomain, publishing.settings.customDomain]);

  const domainReadiness = assessCustomDomainReadiness(draftCustomDomain);
  const draftStatus = getInteractiveDraftPublicationStatus(data);
  const publishReport = analyzeInteractivePublish(data);

  const readinessLabel =
    publishReport.readiness === "ready"
      ? "Ready"
      : publishReport.readiness === "blocked"
        ? "Blocked"
        : "Review";
  const readinessClass =
    publishReport.readiness === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : publishReport.readiness === "blocked"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  const addressReady =
    addressMode === "werkpages"
      ? slugValidation.valid
      : domainReadiness.configured && domainReadiness.syntacticallyValid;

  const changeAddressMode = (nextMode: InteractivePublishAddressMode) => {
    onDesignChange(
      setInteractivePublishSettings(data.design, {
        addressMode: nextMode,
      }),
    );
  };

  const commitSlug = () => {
    const validation = validateInteractiveSlug(slugDraft);
    if (!validation.valid) return;

    setSlugDraft(validation.value);
    onDesignChange(
      setInteractivePublishSettings(data.design, {
        addressMode: "werkpages",
        slug: validation.value,
      }),
    );
  };

  const commitDomain = () => {
    onDesignChange(
      recordInteractiveCustomDomainState(
        setInteractivePublishSettings(data.design, {
          addressMode: "custom-domain",
        }),
        draftCustomDomain,
      ),
    );
  };

  const changeVisibility = (visibility: InteractivePublishVisibility) => {
    onDesignChange(
      setInteractivePublishSettings(data.design, { visibility }),
    );
  };

  const prepareSnapshot = async () => {
    if (preparing) return;

    if (addressMode === "werkpages" && !slugValidation.valid) {
      toast.error(
        slugValidation.error || "Choose a valid Werkpages resume address.",
      );
      return;
    }

    if (
      addressMode === "custom-domain" &&
      (!domainReadiness.configured || !domainReadiness.syntacticallyValid)
    ) {
      toast.error(
        domainReadiness.detail || "Enter a domain you already own.",
      );
      return;
    }

    setPreparing(true);

    try {
      const settingsDesign = setInteractivePublishSettings(data.design, {
        addressMode,
        slug:
          addressMode === "werkpages"
            ? slugValidation.value
            : publishing.settings.slug,
      });
      const domainDesign = recordInteractiveCustomDomainState(
        settingsDesign,
        addressMode === "custom-domain"
          ? draftCustomDomain
          : publishing.settings.customDomain,
      );

      const snapshot = await createInteractivePublishSnapshot(
        {
          ...data,
          design: domainDesign,
        },
        {
          addressMode,
          slug:
            addressMode === "werkpages"
              ? slugValidation.value
              : publishing.settings.slug,
          visibility: publishing.settings.visibility,
          customDomain:
            addressMode === "custom-domain" ? draftCustomDomain : undefined,
        },
      );

      const nextDesign = recordPreparedInteractiveSnapshot(
        domainDesign,
        snapshot.metadata,
      );

      onDesignChange(nextDesign);

      toast.success(
        addressMode === "werkpages"
          ? `Ready to publish at werkpages.com/resume/${snapshot.metadata.slug}.`
          : `Ready to publish using ${snapshot.metadata.customDomainHostname}.`,
      );
    } catch (error) {
      if (error instanceof InteractivePublishBlockedError) {
        toast.error(error.message);
      } else {
        console.error("Interactive publish snapshot failed", error);
        toast.error("Failed to prepare Interactive publishing.");
      }
    } finally {
      setPreparing(false);
    }
  };

  const statusLabel =
    draftStatus.status === "published-current"
      ? "Published"
      : draftStatus.status === "unpublished-changes"
        ? "Draft changed"
        : "Never published";

  const statusClass =
    draftStatus.status === "published-current"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : draftStatus.status === "unpublished-changes"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[#2e0562]/15 bg-[#2e0562]/5 text-[#2e0562]";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Address
            </div>
            <h3 className="mt-1 text-sm font-semibold text-foreground">
              Where should this resume live?
            </h3>
            <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">
              Use a free Werkpages address or connect a domain you already own.
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => changeAddressMode("werkpages")}
              aria-pressed={addressMode === "werkpages"}
              className={`rounded-xl border p-3.5 text-left transition-colors ${
                addressMode === "werkpages"
                  ? "border-[#2e0562]/35 bg-[#2e0562]/[0.04]"
                  : "border-border bg-background hover:bg-muted/25"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full border ${
                    addressMode === "werkpages"
                      ? "border-[#2e0562]"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {addressMode === "werkpages" && (
                    <span className="h-2 w-2 rounded-full bg-[#2e0562]" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-foreground">
                    Free Werkpages address
                  </div>
                  <div className="mt-1 text-[8.5px] leading-relaxed text-muted-foreground">
                    werkpages.com/resume/your-name
                  </div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => changeAddressMode("custom-domain")}
              aria-pressed={addressMode === "custom-domain"}
              className={`rounded-xl border p-3.5 text-left transition-colors ${
                addressMode === "custom-domain"
                  ? "border-[#2e0562]/35 bg-[#2e0562]/[0.04]"
                  : "border-border bg-background hover:bg-muted/25"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full border ${
                    addressMode === "custom-domain"
                      ? "border-[#2e0562]"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {addressMode === "custom-domain" && (
                    <span className="h-2 w-2 rounded-full bg-[#2e0562]" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-foreground">
                    Use a domain I already own
                  </div>
                  <div className="mt-1 text-[8.5px] leading-relaxed text-muted-foreground">
                    yourname.com or resume.yourname.com
                  </div>
                </div>
              </div>
            </button>
          </div>

          {addressMode === "werkpages" ? (
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[9px] font-semibold text-foreground">
                Your free Werkpages address
              </span>
              <div className="flex min-w-0 items-center overflow-hidden rounded-xl border border-border bg-background focus-within:border-[#2e0562]/35">
                <span className="flex h-10 flex-none items-center border-r border-border bg-muted/20 px-3 text-[9px] font-semibold text-muted-foreground">
                  werkpages.com/resume/
                </span>
                <input
                  value={slugDraft}
                  onChange={event => setSlugDraft(event.target.value)}
                  onBlur={commitSlug}
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[10px] font-semibold text-foreground outline-none"
                  spellCheck={false}
                  aria-invalid={!slugValidation.valid}
                />
              </div>

              {!slugValidation.valid ? (
                <div className="mt-1.5 flex items-start gap-1.5 text-[8px] leading-relaxed text-red-600">
                  <TriangleAlert size={10} className="mt-[1px] flex-none" />
                  <span>{slugValidation.error}</span>
                </div>
              ) : slugValidation.warning ? (
                <div className="mt-1.5 flex items-start gap-1.5 text-[8px] leading-relaxed text-amber-700">
                  <TriangleAlert size={10} className="mt-[1px] flex-none" />
                  <span>{slugValidation.warning}</span>
                </div>
              ) : (
                <div className="mt-1.5 flex items-start gap-1.5 text-[8px] leading-relaxed text-muted-foreground">
                  <Link2 size={10} className="mt-[1px] flex-none" />
                  <span>
                    Public route: <strong>werkpages.com/resume/{slugValidation.value}</strong>. Werkpages confirms availability when publishing.
                  </span>
                </div>
              )}
            </label>
          ) : (
            <label className="mt-4 block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold text-foreground">
                <Globe2 size={11} />
                Domain you already own
              </span>
              <input
                value={domainDraft}
                onChange={event => setDomainDraft(event.target.value)}
                onBlur={commitDomain}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                placeholder="yourname.com"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-[10px] text-foreground outline-none focus:border-[#2e0562]/35"
                spellCheck={false}
              />

              <div
                className={`mt-1.5 flex items-start gap-1.5 text-[8px] leading-relaxed ${
                  !domainReadiness.syntacticallyValid
                    ? "text-red-600"
                    : domainReadiness.ready
                      ? "text-emerald-700"
                      : "text-muted-foreground"
                }`}
              >
                {domainReadiness.ready ? (
                  <CheckCircle2 size={10} className="mt-[1px] flex-none" />
                ) : !domainReadiness.syntacticallyValid ? (
                  <TriangleAlert size={10} className="mt-[1px] flex-none" />
                ) : (
                  <ShieldCheck size={10} className="mt-[1px] flex-none" />
                )}
                <span>
                  {domainReadiness.configured
                    ? domainReadiness.detail
                    : "Enter a domain you own. Werkpages will provide DNS steps and verify it before activation."}
                </span>
              </div>
            </label>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Visibility
              </div>
              <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                Choose how discoverable the hosted resume should be.
              </p>
            </div>

            <div
              role="group"
              aria-label="Publish visibility"
              className="inline-flex rounded-xl border border-border bg-muted/20 p-1"
            >
              {(["public", "unlisted"] as InteractivePublishVisibility[]).map(
                visibility => {
                  const active = publishing.settings.visibility === visibility;
                  return (
                    <button
                      key={visibility}
                      type="button"
                      onClick={() => changeVisibility(visibility)}
                      aria-pressed={active}
                      className={`rounded-lg px-3 py-1.5 text-[9px] font-semibold capitalize transition-colors ${
                        active
                          ? "bg-background text-[#2e0562] shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {visibility}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        </section>

        <button
          type="button"
          disabled={preparing || !addressReady}
          onClick={prepareSnapshot}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e0562] px-4 py-3 text-[10px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CloudUpload size={14} />
          {preparing ? "Preparing publish…" : "Prepare publish"}
        </button>
      </div>

      <aside className="space-y-3">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </div>
              <h3 className="mt-1 text-[11px] font-semibold text-foreground">
                Publishing state
              </h3>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider ${statusClass}`}>
              {statusLabel}
            </span>
          </div>

          <p className="mt-2 text-[8.5px] leading-relaxed text-muted-foreground">
            {draftStatus.status === "published-current"
              ? "The current Interactive draft matches the latest published version."
              : draftStatus.status === "unpublished-changes"
                ? "Your Interactive draft has changes that are newer than the published version."
                : "This Interactive Experience has not been published yet."}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#2e0562]/8 text-[#2e0562]">
                <Gauge size={13} />
              </span>
              <div className="min-w-0">
                <div className="text-[9px] font-semibold text-foreground">
                  Publish readiness
                </div>
                <div className="mt-0.5 text-[7.5px] text-muted-foreground">
                  {publishReport.score}/100 · {publishReport.errorCount} blocking · {publishReport.warningCount} warnings
                </div>
              </div>
            </div>
            <span className={`rounded-full border px-2 py-1 text-[7px] font-bold uppercase tracking-wider ${readinessClass}`}>
              {readinessLabel}
            </span>
          </div>

          <p className="mt-2 text-[8px] leading-relaxed text-muted-foreground">
            {publishReport.readiness === "ready"
              ? "No current editor-side warnings. Final HTML size is checked during prepare."
              : publishReport.readiness === "blocked"
                ? "A hard guardrail needs attention. Prepare publish will run optimization and final validation again."
                : "A few performance or payload notes are worth reviewing before publishing."}
          </p>

          {onReviewReadiness && (
            <button
              type="button"
              onClick={onReviewReadiness}
              className="mt-2 inline-flex items-center gap-1.5 text-[8px] font-semibold text-[#2e0562] hover:underline"
            >
              <Gauge size={10} />
              Review readiness
            </button>
          )}
        </section>

        {publishing.latestPublished && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/45 p-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-emerald-700">
              <CheckCircle2 size={10} />
              Latest published
            </div>
            <div className="mt-2 break-all text-[9px] font-semibold text-foreground">
              {publishing.latestPublished.versionId}
            </div>
            <div className="mt-1 text-[8px] text-muted-foreground">
              {dateLabel(publishing.latestPublished.publishedAt)}
            </div>
            <a
              href={publishing.latestPublished.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-[8.5px] font-semibold text-[#2e0562] hover:underline"
            >
              <ExternalLink size={10} />
              Open published URL
            </a>
          </section>
        )}

        {publishing.lastPrepared && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <Clock3 size={10} />
              Last prepared version
            </div>
            <div className="mt-2 text-[9px] font-semibold leading-relaxed text-foreground">
              {describePublishSnapshot(publishing.lastPrepared)}
            </div>
            <div className="mt-1 text-[8px] text-muted-foreground">
              {dateLabel(publishing.lastPrepared.preparedAt)}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-dashed border-border bg-muted/10 p-4">
          <div className="text-[9px] font-semibold text-foreground">
            Hosted by Werkpages
          </div>
          <p className="mt-1 text-[8px] leading-relaxed text-muted-foreground">
            Werkpages keeps internal deployment metadata behind the scenes. Export HTML remains available separately when you want to self-host.
          </p>
        </section>
      </aside>
    </div>
  );
}
