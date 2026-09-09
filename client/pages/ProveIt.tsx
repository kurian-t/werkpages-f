import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { AlertCircle, ArrowLeft, Clock, ShieldCheck } from "lucide-react";
import { Layout } from "@/components/Layout";
import { FormField } from "@/components/RatingInput";
import { MonthYear, recentYears } from "@/components/MonthYear";
import { useAuth } from "@/hooks/useAuth";
import API_BASE from "@/lib/api";

/**
 * The screen somebody reaches after rating a well-known figure.
 *
 * Two things it must never do. It must not lose their rating - that was saved before they got
 * here, and this page says so in its first line, because "one more step" reads very differently
 * when you fear the last two minutes are gone. And it must not pretend the wait is optional:
 * nothing on this page publishes anything, and saying otherwise would be a lie a person then has
 * to discover.
 */

/**
 * "Something else" is not filler. The reporting line is only one shape a working relationship
 * takes: contractors, secondees and people on a long joint project all genuinely worked with
 * somebody without appearing anywhere on their org chart, and making them pick the nearest wrong
 * answer hides the very thing that would explain the overlap.
 */
const RELATIONSHIPS = [
  { value: "direct_report", label: "They were my direct manager" },
  { value: "skip_level",    label: "They were above my direct manager" },
  { value: "other_team",    label: "I worked closely with them, but didn't report to them" },
  { value: "other",         label: "Something else" },
] as const;

export default function ProveIt() {
  const { managerId } = useParams<{ managerId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const managerName = searchParams.get("name") ?? "this person";
  const companyName = searchParams.get("company") ?? "their company";

  const [workedFrom, setWorkedFrom]   = useState("");
  const [workedUntil, setWorkedUntil] = useState("");
  const [stillThere, setStillThere]   = useState(false);
  const [claimedTitle, setClaimedTitle] = useState("");
  const [claimedOrg, setClaimedOrg]     = useState("");
  const [relationship, setRelationship] = useState<string>("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["proof-challenge", managerId],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/managers/${managerId}/proof-challenge`, {
        withCredentials: true,
      });
      return res.data?.challenge ?? null;
    },
    enabled: !!managerId && !!user,
    retry: false,
  });

  const years = recentYears();

  const validate = () => {
    const found: Record<string, string | undefined> = {};
    // Error text names the field's own question, so the message and the label agree instead of
    // making somebody map one onto the other.
    if (!workedFrom) found.workedFrom = "Add when you started working together";
    if (!stillThere && !workedUntil) found.workedFrom = "Add when you stopped working together";
    if (!claimedTitle.trim()) found.claimedTitle = "Add the role you held at the time";
    if (!relationship) found.relationship = "Pick the option that fits best";
    return found;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    const found = validate();
    if (Object.keys(found).length > 0) { setErrors(found); return; }

    setSubmitting(true);
    try {
      await axios.post(
        `${API_BASE}/api/proof-challenges/${data.id}/evidence`,
        {
          workedFrom,
          workedUntil: stillThere ? null : workedUntil,
          claimedTitle: claimedTitle.trim(),
          claimedOrg: claimedOrg.trim() || null,
          relationship,
          evidenceNote: evidenceNote.trim() || null,
        },
        { withCredentials: true },
      );
      queryClient.invalidateQueries({ queryKey: ["proof-challenge", managerId] });
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : null;
      setSubmitError(msg ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <Layout><div className="mx-auto max-w-2xl px-4 py-16 text-sm text-muted-foreground">Loading…</div></Layout>;
  }

  // Nothing outstanding. Either they never had a challenge or it has been decided; both mean
  // there is nothing to do here, and stranding somebody on an empty form would be worse.
  if (!data) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldCheck className="mx-auto mb-3 text-[#2e0562]" size={32} aria-hidden="true" />
          <h1 className="mb-2 text-xl font-bold text-foreground">Nothing to confirm</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            There's no outstanding request on your rating of {managerName}.
          </p>
          <button onClick={() => navigate(-1)} className="text-sm font-semibold text-[#2e0562] hover:underline">
            Go back
          </button>
        </div>
      </Layout>
    );
  }

  const submitted = data.status === "admin_review";
  /*
    Only a high-profile hold has anything for its author to do. The others - a flagged author, a
    repeated name - are decided by a person, and showing them this form would ask for evidence
    that changes nothing.
  */
  const canSelfVerify = data.reason === "high_profile";

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={15} /> Back
        </button>

        {submitted || !canSelfVerify ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <Clock className="mb-3 text-[#2e0562]" size={28} aria-hidden="true" />
            <h1 className="mb-2 text-xl font-bold text-foreground">Someone is reviewing this</h1>
            <p className="text-sm text-muted-foreground">
              {submitted
                ? `Thanks - a person on our team is reading what you sent. We'll let you know either way, and your rating of ${managerName} stays saved in the meantime.`
                : `A person on our team is reviewing this one. There's nothing you need to do, and your rating of ${managerName} stays saved in the meantime.`}
            </p>
          </div>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-bold text-foreground">
              Help us verify your rating
            </h1>
            {/* First line on the page, because somebody who fears their work is gone will not
                fill in a form to get it back. */}
            <p className="mb-3 text-sm font-medium text-foreground">
              Your rating for {managerName} is saved.
            </p>
            <p className="mb-6 max-w-prose text-sm text-muted-foreground">
              Because this is a high-profile manager, we do a quick check before publishing
              ratings. Your answers are private and are only used to verify that you worked with
              them.
            </p>

            {/*
              The work-email path appears only when the challenge carries a domain to check
              against. Until then there is nothing to show but a dead control, and a disabled
              button that never explains itself is worse than no button.
            */}
            {data.emailDomain && (
              <div className="mb-6 rounded-xl border border-border bg-card p-5">
                <h2 className="mb-1 text-sm font-semibold text-foreground">
                  Confirm you worked at {companyName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  We'll send a six-digit code to your <strong>@{data.emailDomain}</strong> address.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-5">
              {submitError && (
                <div className="mb-5 flex gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                  <AlertCircle className="flex-shrink-0 text-destructive" size={18} aria-hidden="true" />
                  <p role="alert" className="text-sm text-destructive">{submitError}</p>
                </div>
              )}

              <div className="space-y-6">
                {/* Asked first: it frames every answer below it, and it is the one an admin reads
                    before anything else. */}
                <FormField label="What was your working relationship?" required error={errors.relationship}>
                  <div className="flex flex-col gap-2">
                    {RELATIONSHIPS.map((r) => (
                      <label key={r.value} className="flex items-start gap-2 text-sm text-foreground">
                        <input
                          type="radio"
                          name="relationship"
                          value={r.value}
                          checked={relationship === r.value}
                          onChange={() => { setRelationship(r.value); setErrors((p) => ({ ...p, relationship: undefined })); }}
                          className="mt-0.5 h-4 w-4 border-border"
                        />
                        <span>{r.label}</span>
                      </label>
                    ))}
                  </div>
                </FormField>

                {/* The load-bearing field. A claim to have worked with somebody in a year our
                    career history puts them elsewhere is a contradiction in our own data, which
                    is what makes this checkable rather than a matter of taste. */}
                <FormField label="When did you work together?" required error={errors.workedFrom}>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">From</span>
                      <MonthYear value={workedFrom} onChange={(v) => { setWorkedFrom(v); setErrors((p) => ({ ...p, workedFrom: undefined })); }} years={years} label="Start" />
                    </div>
                    {!stillThere && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">To</span>
                        <MonthYear value={workedUntil} onChange={(v) => { setWorkedUntil(v); setErrors((p) => ({ ...p, workedFrom: undefined })); }} years={years} label="End" />
                      </div>
                    )}
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={stillThere}
                      onChange={(e) => { setStillThere(e.target.checked); if (e.target.checked) setWorkedUntil(""); }}
                      className="h-4 w-4 rounded border-border"
                    />
                    I still work there
                  </label>
                </FormField>

                <FormField label="What was your role?" required error={errors.claimedTitle}>
                  <input
                    value={claimedTitle}
                    onChange={(e) => { setClaimedTitle(e.target.value); setErrors((p) => ({ ...p, claimedTitle: undefined })); }}
                    maxLength={100}
                    placeholder="Job title"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                  />
                </FormField>

                <FormField
                  label="What team or organization were you part of?"
                  hint="Optional, but helpful for verification."
                >
                  <input
                    value={claimedOrg}
                    onChange={(e) => setClaimedOrg(e.target.value)}
                    maxLength={100}
                    placeholder="Team, department, or organization"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                  />
                </FormField>

                <FormField label="Anything else that would help us verify this?">
                  <textarea
                    value={evidenceNote}
                    onChange={(e) => setEvidenceNote(e.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder="e.g. where you worked together, the projects or organization you overlapped in, or other context"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                  />
                </FormField>

                {/* Kept, but moved down here. As an opener it read as a warning about something
                    the reader had not been asked for yet; next to the box they just typed into,
                    it reads as the reassurance it is meant to be. */}
                <p className="text-xs text-muted-foreground">
                  This information is never published.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-xl bg-[#2e0562] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90 disabled:opacity-50"
                >
                  {submitting ? "Sending..." : "Submit for verification"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
