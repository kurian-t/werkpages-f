import {
  CheckCircle2,
  Clock3,
  CloudUpload,
  ExternalLink,
  Globe2,
  Link2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import type {
  ResumeData,
  ResumeDesign,
} from "./types";
import {
  createInteractivePublishSnapshot,
  defaultInteractiveSlug,
  describePublishSnapshot,
  downloadInteractivePublishSnapshot,
  getInteractiveDraftPublicationStatus,
  recordInteractiveCustomDomainState,
  recordPreparedInteractiveSnapshot,
  setInteractiveCustomDomainHostname,
  setInteractivePublishSettings,
  validateInteractiveSlug,
  assessCustomDomainReadiness,
  normalizeCustomDomainHostname,
  InteractivePublishBlockedError,
} from "./resumeInteractivePublishing";
import {
  getInteractivePublishingState,
  type InteractivePublishVisibility,
} from "./resumeWebExperience";

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
}: {
  data: ResumeData;
  onDesignChange: (design: ResumeDesign) => void;
}) {
  const publishing = getInteractivePublishingState(
    data.design,
  );
  const defaultSlug = defaultInteractiveSlug(data);
  const effectiveSlug =
    publishing.settings.slug || defaultSlug;

  const [slugDraft, setSlugDraft] =
    useState(effectiveSlug);
  const [domainDraft, setDomainDraft] = useState(
    publishing.settings.customDomain?.hostname ?? "",
  );
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    setSlugDraft(effectiveSlug);
  }, [effectiveSlug]);

  useEffect(() => {
    setDomainDraft(
      publishing.settings.customDomain?.hostname ?? "",
    );
  }, [publishing.settings.customDomain?.hostname]);

  const slugValidation = useMemo(
    () => validateInteractiveSlug(slugDraft),
    [slugDraft],
  );
  const draftStatus =
    getInteractiveDraftPublicationStatus(data);
  const domainReadiness =
    assessCustomDomainReadiness(
      publishing.settings.customDomain,
    );

  const commitSlug = () => {
    const validation =
      validateInteractiveSlug(slugDraft);
    if (!validation.valid) return;

    setSlugDraft(validation.value);
    onDesignChange(
      setInteractivePublishSettings(
        data.design,
        {
          slug: validation.value,
        },
      ),
    );
  };

  const commitDomain = () => {
    onDesignChange(
      setInteractiveCustomDomainHostname(
        data.design,
        domainDraft,
      ),
    );
  };

  const changeVisibility = (
    visibility: InteractivePublishVisibility,
  ) => {
    onDesignChange(
      setInteractivePublishSettings(
        data.design,
        { visibility },
      ),
    );
  };

  const prepareSnapshot = async () => {
    if (preparing) return;

    const validation =
      validateInteractiveSlug(slugDraft);

    if (!validation.valid) {
      toast.error(
        validation.error || "Choose a valid publish slug.",
      );
      return;
    }

    setPreparing(true);

    try {
      const normalizedDomain =
        normalizeCustomDomainHostname(domainDraft);
      const customDomain =
        normalizedDomain
          ? publishing.settings.customDomain?.hostname ===
            normalizedDomain
            ? publishing.settings.customDomain
            : {
                hostname: normalizedDomain,
                status:
                  "pending-verification" as const,
              }
          : undefined;

      const snapshot =
        await createInteractivePublishSnapshot(
          data,
          {
            slug: validation.value,
            visibility:
              publishing.settings.visibility,
            customDomain,
          },
        );

      const settingsDesign =
        setInteractivePublishSettings(
          data.design,
          {
            slug: validation.value,
          },
        );
      const domainDesign =
        recordInteractiveCustomDomainState(
          settingsDesign,
          customDomain,
        );
      const nextDesign =
        recordPreparedInteractiveSnapshot(
          domainDesign,
          snapshot.metadata,
        );

      onDesignChange(nextDesign);
      downloadInteractivePublishSnapshot(snapshot);

      toast.success(
        `Prepared immutable snapshot ${snapshot.metadata.versionId}.`,
      );
    } catch (error) {
      if (
        error instanceof InteractivePublishBlockedError
      ) {
        toast.error(error.message);
      } else {
        console.error(
          "Interactive publish snapshot failed",
          error,
        );
        toast.error(
          "Failed to prepare Interactive publish snapshot.",
        );
      }
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#2e0562]/15 bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-[#2e0562]">
            <CloudUpload size={9} />
            Publishing
          </div>
          <div className="mt-0.5 text-[6.5px] leading-relaxed text-muted-foreground">
            Draft stays editable. Publish snapshots are immutable.
          </div>
        </div>

        <span
          className={`rounded-full px-2 py-1 text-[6px] font-bold uppercase tracking-wider ${
            draftStatus.status === "published-current"
              ? "bg-emerald-50 text-emerald-700"
              : draftStatus.status === "unpublished-changes"
                ? "bg-amber-50 text-amber-700"
                : "bg-[#2e0562]/8 text-[#2e0562]"
          }`}
        >
          {draftStatus.status === "published-current"
            ? "Published"
            : draftStatus.status === "unpublished-changes"
              ? "Draft changed"
              : "Never published"}
        </span>
      </div>

      <label className="mt-2.5 block">
        <span className="mb-0.5 block text-[6.5px] font-semibold text-muted-foreground">
          Public slug
        </span>
        <div className="flex items-center overflow-hidden rounded-lg border border-border bg-background">
          <span className="flex h-7 items-center border-r border-border px-2 text-[6.5px] text-muted-foreground">
            /
          </span>
          <input
            value={slugDraft}
            onChange={event =>
              setSlugDraft(event.target.value)
            }
            onBlur={commitSlug}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className="h-7 min-w-0 flex-1 bg-transparent px-2 text-[7.5px] font-semibold text-foreground outline-none"
            spellCheck={false}
          />
        </div>
        {!slugValidation.valid ? (
          <div className="mt-1 text-[6px] text-red-600">
            {slugValidation.error}
          </div>
        ) : slugValidation.warning ? (
          <div className="mt-1 text-[6px] text-amber-700">
            {slugValidation.warning}
          </div>
        ) : (
          <div className="mt-1 text-[6px] text-muted-foreground">
            Deployment route: /{slugValidation.value}
          </div>
        )}
      </label>

      <label className="mt-2 block">
        <span className="mb-0.5 block text-[6.5px] font-semibold text-muted-foreground">
          Visibility
        </span>
        <select
          value={publishing.settings.visibility}
          onChange={event =>
            changeVisibility(
              event.target
                .value as InteractivePublishVisibility,
            )
          }
          className="h-7 w-full rounded-lg border border-border bg-background px-2 text-[7.5px] text-foreground outline-none"
        >
          <option value="public">Public</option>
          <option value="unlisted">
            Unlisted
          </option>
        </select>
      </label>

      <label className="mt-2 block">
        <span className="mb-0.5 flex items-center gap-1 text-[6.5px] font-semibold text-muted-foreground">
          <Globe2 size={7} />
          Custom domain
        </span>
        <input
          value={domainDraft}
          onChange={event =>
            setDomainDraft(event.target.value)
          }
          onBlur={commitDomain}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          placeholder="resume.example.com"
          className="h-7 w-full rounded-lg border border-border bg-background px-2 text-[7.5px] text-foreground outline-none"
          spellCheck={false}
        />

        <div
          className={`mt-1 flex items-start gap-1 text-[6px] leading-relaxed ${
            !domainReadiness.syntacticallyValid
              ? "text-red-600"
              : domainReadiness.ready
                ? "text-emerald-700"
                : "text-muted-foreground"
          }`}
        >
          {domainReadiness.ready ? (
            <CheckCircle2
              size={7}
              className="mt-[1px] flex-none"
            />
          ) : !domainReadiness.syntacticallyValid ? (
            <TriangleAlert
              size={7}
              className="mt-[1px] flex-none"
            />
          ) : (
            <ShieldCheck
              size={7}
              className="mt-[1px] flex-none"
            />
          )}
          <span>{domainReadiness.detail}</span>
        </div>
      </label>

      {publishing.latestPublished && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
          <div className="flex items-center gap-1 text-[6.3px] font-bold uppercase tracking-wider text-emerald-700">
            <CheckCircle2 size={7} />
            Latest published
          </div>
          <div className="mt-1 break-all text-[6.5px] font-semibold text-foreground">
            {publishing.latestPublished.versionId}
          </div>
          <div className="mt-0.5 text-[6px] text-muted-foreground">
            {dateLabel(
              publishing.latestPublished.publishedAt,
            )}
          </div>
          <a
            href={publishing.latestPublished.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[6.3px] font-semibold text-[#2e0562]"
          >
            <ExternalLink size={7} />
            Open published URL
          </a>
        </div>
      )}

      {publishing.lastPrepared && (
        <div className="mt-2 rounded-lg border border-border bg-background p-2">
          <div className="flex items-center gap-1 text-[6.2px] font-bold uppercase tracking-wider text-muted-foreground">
            <Clock3 size={7} />
            Last prepared snapshot
          </div>
          <div className="mt-1 text-[6.4px] font-semibold text-foreground">
            {describePublishSnapshot(
              publishing.lastPrepared,
            )}
          </div>
          <div className="mt-0.5 text-[5.8px] text-muted-foreground">
            {dateLabel(
              publishing.lastPrepared.preparedAt,
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={
          preparing || !slugValidation.valid
        }
        onClick={prepareSnapshot}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2e0562] px-2 py-2 text-[7px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <CloudUpload size={9} />
        {preparing
          ? "Preparing snapshot…"
          : "Prepare immutable snapshot"}
      </button>

      <div className="mt-2 rounded-lg border border-dashed border-border px-2 py-1.5 text-[5.9px] leading-relaxed text-muted-foreground">
        <div className="flex items-start gap-1">
          <Link2
            size={7}
            className="mt-[1px] flex-none"
          />
          <span>
            The downloaded HTML + manifest use the Phase 30 static/CDN
            contract: upload the versioned files first, verify them, then
            atomically switch the slug pointer. A backend deployment adapter
            can call the same contract and only mark a version Published after
            the host returns a public URL.
          </span>
        </div>
      </div>
    </div>
  );
}
