import API_BASE from "@/lib/api";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Star, Edit2, LogOut, Trash2, X, User, Clock, ArrowLeft } from "lucide-react";
import { generateUsername } from "@/lib/validators";
import { toast } from "sonner";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";

const RATING_CATEGORIES = [
  "Communication Style",
  "Perceived Approachability",
  "Perceived Clarity of Expectations",
  "Feedback Style",
  "Perceived Supportiveness",
  "Decision Making Style",
  "Organization and Planning Style",
  "Delegation Style",
  "Perceived Professional Demeanor",
  "Overall Working Experience",
];

const toNumber = (v: any): number => {
  if (v == null) return 0;
  const n = typeof v === "object" ? parseFloat(v.toString()) : Number(v);
  return isNaN(n) ? 0 : n;
};

const fromApiRatings = (apiRatings: Record<string, any>): Record<string, number> => ({
  "Communication Style": toNumber(apiRatings["Communication Style"] ?? apiRatings["communication_style"]),
  "Perceived Approachability": toNumber(apiRatings["Perceived Approachability"] ?? apiRatings["perceived_approachability"]),
  "Perceived Clarity of Expectations": toNumber(apiRatings["Perceived Clarity of Expectations"] ?? apiRatings["perceived_clarity_of_expectations"]),
  "Feedback Style": toNumber(apiRatings["Feedback Style"] ?? apiRatings["feedback_style"]),
  "Perceived Supportiveness": toNumber(apiRatings["Perceived Supportiveness"] ?? apiRatings["perceived_supportiveness"]),
  "Decision Making Style": toNumber(apiRatings["Decision Making Style"] ?? apiRatings["decision_making_style"]),
  "Organization and Planning Style": toNumber(apiRatings["Organization and Planning Style"] ?? apiRatings["organization_and_planning_style"]),
  "Delegation Style": toNumber(apiRatings["Delegation Style"] ?? apiRatings["delegation_style"]),
  "Perceived Professional Demeanor": toNumber(apiRatings["Perceived Professional Demeanor"] ?? apiRatings["perceived_professional_demeanor"]),
  "Overall Working Experience": toNumber(apiRatings["Overall Working Experience"] ?? apiRatings["overall_working_experience"]),
});

const MONTHS = [
  { value: "01", label: "Jan" }, { value: "02", label: "Feb" },
  { value: "03", label: "Mar" }, { value: "04", label: "Apr" },
  { value: "05", label: "May" }, { value: "06", label: "Jun" },
  { value: "07", label: "Jul" }, { value: "08", label: "Aug" },
  { value: "09", label: "Sep" }, { value: "10", label: "Oct" },
  { value: "11", label: "Nov" }, { value: "12", label: "Dec" },
];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1; // 1-12
const YEARS = Array.from({ length: 21 }, (_, i) => String(currentYear - i));
// Always show all months — validation catches future dates
const availableMonths = (_selectedYear: string) => MONTHS;

const toYearMonth = (month: string, year: string) =>
  month && year ? `${year}-${month}` : null;

const ymToNum = (ym: string | null | undefined): number | null => {
  if (!ym) return null;
  const [year, month] = ym.split("-");
  if (!year || !month) return null;
  return parseInt(year) * 100 + parseInt(month);
};

export default function AccountSettings() {
  const navigate = useNavigate();
  const { user, logout, deleteAccount } = useAuth();
  const isBanned = user?.isBanned === true;
  const queryClient = useQueryClient();

  const [myReviews, setMyReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsOffset, setReviewsOffset] = useState(0);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsLoadingMore, setReviewsLoadingMore] = useState(false);
  const reviewsSentinelRef = useRef<HTMLDivElement>(null);
  const REVIEWS_PAGE_SIZE = 50;
  const [submittedManagers, setSubmittedManagers] = useState<any[]>([]);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [isEditReviewModalOpen, setIsEditReviewModalOpen] = useState(false);
  const [editReviewStep, setEditReviewStep] = useState<null | "ratings" | "dates">(null);
  const [confirmDeleteReviewId, setConfirmDeleteReviewId] = useState<number | null>(null);
  const [editingEditRoleInline, setEditingEditRoleInline] = useState(false);
  const [editReturnTo, setEditReturnTo] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [editReviewData, setEditReviewData] = useState<Record<string, number>>({});
  const [editWorkedFrom, setEditWorkedFrom] = useState({ month: "", year: "" });
  const [editWorkedUntil, setEditWorkedUntil] = useState({ month: "", year: "" });
  const [editCurrentlyWorking, setEditCurrentlyWorking] = useState(false);
  const [editManagerCompany, setEditManagerCompany] = useState("");
  const [editManagerTitle, setEditManagerTitle] = useState("");

  const [isEditSubmissionModalOpen, setIsEditSubmissionModalOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [editSubmissionData, setEditSubmissionData] = useState({
    name: "", company: "", title: "", bio: "", linkedinUrl: "", status: "active",
  });

  // Fetch first page of reviews written by the current user
  useEffect(() => {
    if (!user) return;
    const fetchMyReviews = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/users/me/reviews`, {
          params: { limit: REVIEWS_PAGE_SIZE, offset: 0 },
        });
        const reviews = Array.isArray(res.data.data) ? res.data.data : [];
        setMyReviews(reviews);
        setReviewsTotal(res.data.total ?? reviews.length);
        setReviewsOffset(reviews.length);

        // If the user was redirected here after a duplicate conflict, pre-fill their new ratings
        const raw = localStorage.getItem("rmm_edit_prefill");
        if (raw) {
          localStorage.removeItem("rmm_edit_prefill");
          try {
            const prefill = JSON.parse(raw);
            const match = reviews.find((r: any) =>
              String(r.managerId) === String(prefill.managerId) &&
              r.managerTitle?.trim().toLowerCase() === prefill.managerTitle?.trim().toLowerCase() &&
              r.managerCompany?.trim().toLowerCase() === prefill.managerCompany?.trim().toLowerCase()
            );
            if (match) {
              handleOpenEditReview(match);
              setEditReturnTo(prefill.returnTo ?? `/manager/${match.managerId}`);
            }
          } catch {
            // ignore malformed prefill
          }
        }
      } catch (error) {
        console.error("Failed to fetch user reviews:", error);
        toast.error("Failed to load your reviews.");
      } finally {
        setReviewsLoading(false);
      }
    };
    fetchMyReviews();
  }, [user]);

  // Load next page when sentinel scrolls into view
  const loadMoreReviews = useCallback(async () => {
    if (reviewsLoadingMore || myReviews.length >= reviewsTotal) return;
    setReviewsLoadingMore(true);
    try {
      const res = await axios.get(`${API_BASE}/api/users/me/reviews`, {
        params: { limit: REVIEWS_PAGE_SIZE, offset: reviewsOffset },
      });
      const next = Array.isArray(res.data.data) ? res.data.data : [];
      setMyReviews((prev) => [...prev, ...next]);
      setReviewsOffset((prev) => prev + next.length);
      setReviewsTotal(res.data.total ?? reviewsTotal);
    } catch {
      // silently ignore — user can scroll up/down to retry naturally
    } finally {
      setReviewsLoadingMore(false);
    }
  }, [reviewsLoadingMore, myReviews.length, reviewsTotal, reviewsOffset]);

  useEffect(() => {
    const sentinel = reviewsSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreReviews(); },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreReviews]);

  useEffect(() => {
    if (!user) return;
    axios.get(`${API_BASE}/api/users/me/submitted-managers`)
      .then((res) => setSubmittedManagers(
        (Array.isArray(res.data.data) ? res.data.data : []).filter((m: any) => m.approvalStatus === "pending_approval")
      ))
      .catch(() => {});
  }, [user]);

  if (!user) {
    navigate("/signin");
    return null;
  }

  const getFormattedDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid date";
    return formatDistanceToNow(date) + " ago";
  };

  const handleOpenEditSubmission = (manager: any) => {
    setSelectedSubmission(manager);
    setEditSubmissionData({
      name: manager.name || "",
      company: manager.company || "",
      title: manager.title || "",
      bio: manager.bio || "",
      linkedinUrl: manager.linkedinUrl || "",
      status: manager.status === "retired" ? "retired" : "active",
    });
    setIsEditSubmissionModalOpen(true);
  };

  const handleSaveSubmission = async () => {
    if (!selectedSubmission) return;
    if (!editSubmissionData.name.trim() || !editSubmissionData.company.trim() || !editSubmissionData.title.trim()) {
      toast.error("Name, company, and title are required.");
      return;
    }
    try {
      await axios.put(`${API_BASE}/api/managers/${selectedSubmission.id}`, {
        name: editSubmissionData.name.trim(),
        company: editSubmissionData.company.trim(),
        title: editSubmissionData.title.trim(),
        bio: editSubmissionData.bio.trim() || null,
        linkedinUrl: editSubmissionData.linkedinUrl.trim() || null,
        image: editSubmissionData.name.trim().charAt(0).toUpperCase(),
        status: editSubmissionData.status,
      });
      setSubmittedManagers((prev) =>
        prev.map((m) =>
          m.id === selectedSubmission.id
            ? { ...m, ...editSubmissionData, image: editSubmissionData.name.trim().charAt(0).toUpperCase() }
            : m
        )
      );
      toast.success("Submission updated!");
      setIsEditSubmissionModalOpen(false);
      setSelectedSubmission(null);
    } catch {
      toast.error("Failed to update submission. Please try again.");
    }
  };

  const handleOpenEditReview = (review: any) => {
    setSelectedReview(review);
    setEditReviewData(fromApiRatings(review.ratings));
    setEditWorkedFrom(review.workedFrom ? { month: review.workedFrom.slice(5, 7), year: review.workedFrom.slice(0, 4) } : { month: "", year: "" });
    setEditWorkedUntil(review.workedUntil ? { month: review.workedUntil.slice(5, 7), year: review.workedUntil.slice(0, 4) } : { month: "", year: "" });
    setEditCurrentlyWorking(!!review.workedFrom && !review.workedUntil);
    setEditManagerCompany(review.managerCompany || "");
    setEditManagerTitle(review.managerTitle || "");
    setEditingEditRoleInline(false);
    setEditReviewStep("ratings");
  };

  const handleSaveReview = async () => {
    if (!selectedReview || Object.values(editReviewData).some((r) => r === 0)) {
      toast.error("Please rate all categories", {
        description: "All rating categories are required.",
      });
      return;
    }

    const fromFilled = !!editWorkedFrom.month && !!editWorkedFrom.year;
    const untilFilled = !!editWorkedUntil.month && !!editWorkedUntil.year;
    const fromAfterUntil = fromFilled && untilFilled &&
      (parseInt(editWorkedFrom.year) * 100 + parseInt(editWorkedFrom.month)) >
      (parseInt(editWorkedUntil.year) * 100 + parseInt(editWorkedUntil.month));
    if (fromAfterUntil) {
      toast.error("The 'from' date cannot be after the 'to' date.");
      return;
    }

    const overallRating = parseFloat(
      (Object.values(editReviewData).reduce((a, b) => a + b, 0) / Object.values(editReviewData).length).toFixed(1)
    );

    try {
      const updateRes = await axios.put(
        `${API_BASE}/api/managers/${selectedReview.managerId}/reviews/${selectedReview.id}`,
        {
          overallRating,
          ratings: editReviewData,
          managerCompany: editManagerCompany,
          managerTitle: editManagerTitle,
          workedFrom: toYearMonth(editWorkedFrom.month, editWorkedFrom.year),
          workedUntil: editCurrentlyWorking ? null : toYearMonth(editWorkedUntil.month, editWorkedUntil.year),
        }
      );

      // Update local state using the API response so updatedAt timestamp is accurate
      const updatedReview = updateRes.data;
      setMyReviews((prev) =>
        prev.map((r) =>
          r.id === selectedReview.id
            ? {
                ...r,
                overallRating: updatedReview.overallRating,
                ratings: updatedReview.ratings,
                managerCompany: updatedReview.managerCompany,
                managerTitle: updatedReview.managerTitle,
                updatedAt: updatedReview.updatedAt,
              }
            : r
        )
      );

      queryClient.removeQueries({ queryKey: ["managers-directory"] });
      queryClient.removeQueries({ queryKey: ["managers-top"] });
      queryClient.removeQueries({ queryKey: ["manager", String(selectedReview.managerId)] });

      toast.success("Review updated successfully!");
      const returnTo = editReturnTo;
      setEditReviewStep(null);
      setSelectedReview(null);
      setEditReturnTo(null);
      if (returnTo) navigate(returnTo);
    } catch {
      toast.error("Failed to update review. Please try again.");
    }
  };

  const handleDeleteReview = async () => {
    if (!selectedReview) return;

    try {
      await axios.delete(
        `${API_BASE}/api/managers/${selectedReview.managerId}/reviews/${selectedReview.id}`
      );

      setMyReviews((prev) => prev.filter((r) => r.id !== selectedReview.id));

      queryClient.removeQueries({ queryKey: ["managers-directory"] });
      queryClient.removeQueries({ queryKey: ["managers-top"] });
      queryClient.removeQueries({ queryKey: ["manager", String(selectedReview.managerId)] });
      queryClient.removeQueries({ queryKey: ["stats"] });

      toast.success("Review deleted.");
      setEditReviewStep(null);
      setSelectedReview(null);
    } catch {
      toast.error("Failed to delete review. Please try again.");
    }
  };

  const handleDeleteReviewById = async (review: any) => {
    try {
      await axios.delete(
        `${API_BASE}/api/managers/${review.managerId}/reviews/${review.id}`
      );
      setMyReviews((prev) => prev.filter((r) => r.id !== review.id));
      setConfirmDeleteReviewId(null);
      queryClient.removeQueries({ queryKey: ["managers-directory"] });
      queryClient.removeQueries({ queryKey: ["managers-top"] });
      queryClient.removeQueries({ queryKey: ["manager", String(review.managerId)] });
      queryClient.removeQueries({ queryKey: ["stats"] });
      toast.success("Review deleted.");
    } catch {
      toast.error("Failed to delete review. Please try again.");
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount();
      toast.success("Account deleted successfully", {
        description: "Your account and data have been permanently removed.",
      });
      navigate("/");
    } catch (error: any) {
      console.error("Failed to delete account:", error);
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        toast.error("Session expired", {
          description: "Please sign out and sign back in, then try again.",
        });
      } else {
        toast.error("Failed to delete account", {
          description: "Please try again later.",
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const isDeleteConfirmed = deleteConfirmation === "DELETE MY ACCOUNT";

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">

          {/* Page Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-foreground">Account Settings</h1>
            <p className="mt-2 text-muted-foreground">Manage your Rate My Managers account</p>
          </div>

          {/* Account Info Card */}
          <div className="mb-8 rounded-2xl border border-border bg-background p-8 shadow-sm">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                <User size={32} className="text-primary-foreground" />
              </div>
              <div>
                <p className="text-muted-foreground">@{user.username}</p>
              </div>
            </div>

            <div className="border-t border-border pt-6 mt-6">
              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase">Username</label>
                <p className="mt-2 text-lg font-semibold text-foreground">{user.username}</p>
              </div>
            </div>
          </div>

          {/* My Submitted Managers Section */}
          {submittedManagers.length > 0 && (
            <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/50 p-8 shadow-sm">
              <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                <Clock size={20} className="text-amber-500" />
                Submitted Managers ({submittedManagers.length})
              </h3>
              <div className="space-y-4">
                {submittedManagers.map((manager) => (
                  <div key={manager.id} className="rounded-lg border border-amber-200 bg-background p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xl">{manager.image}</span>
                          <Link
                            to={`/manager/${manager.id}`}
                            className="text-base font-semibold text-primary hover:underline"
                          >
                            {manager.name}
                          </Link>
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 whitespace-nowrap flex-shrink-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
                            Pending
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{manager.title} at {manager.company}</p>
                      </div>
                      <button
                        onClick={() => handleOpenEditSubmission(manager)}
                        disabled={isBanned}
                        className="rounded-lg bg-primary/10 px-3 py-2 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isBanned ? "Your account has been suspended" : ""}
                      >
                        <Edit2 size={14} />
                        <span className="text-xs font-medium hidden sm:inline">Edit</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My Reviews Section */}
          <div className="mb-8 rounded-2xl border border-border bg-background p-8 shadow-sm">
            <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
              <Star size={20} className="text-accent" />
              My Reviews ({reviewsTotal > 0 ? reviewsTotal : myReviews.length})
            </h3>

            {reviewsLoading ? (
              <p className="text-muted-foreground text-sm">Loading your reviews...</p>
            ) : myReviews.length > 0 ? (
              <>
              <div className="space-y-4">
                {myReviews.map((review) => (
                  <div
                    key={review.id}
                    className="rounded-lg border border-border bg-background/50 p-4 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xl">{review.managerImage}</span>
                          <Link
                            to={`/manager/${review.managerId}`}
                            className="text-base font-semibold text-primary hover:underline"
                          >
                            {review.managerName}
                          </Link>
                          {submittedManagers.some((m) => String(m.id) === String(review.managerId) && m.approvalStatus === "pending_approval") && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Pending
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
                          <p><span className="font-medium">This manager's role:</span> {review.managerTitle}</p>
                          <p><span className="font-medium">This manager's company:</span> {review.managerCompany}</p>
                          {(review.workedFrom || review.workedUntil) && (
                            <p>
                              <span className="font-medium">Worked together: </span>
                              {review.workedFrom ? new Date(review.workedFrom + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""}
                              {" – "}
                              {review.workedUntil
                                ? new Date(review.workedUntil + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
                                : "Current"}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={14}
                                className={i < toNumber(review.overallRating) ? "fill-amber-400 text-amber-400" : "text-border"}
                              />
                            ))}
                          </div>
                          <span className="text-xs font-medium text-foreground">
                            {toNumber(review.overallRating)}/5
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {getFormattedDate(review.updatedAt ?? review.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {confirmDeleteReviewId !== review.id && (
                          <>
                            <button
                              onClick={() => handleOpenEditReview(review)}
                              disabled={isBanned}
                              className="rounded-lg bg-primary/10 px-3 py-2 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={isBanned ? "Your account has been suspended" : "Edit review"}
                            >
                              <Edit2 size={14} />
                              <span className="text-xs font-medium hidden sm:inline">Edit</span>
                            </button>
                            <button
                              onClick={() => setConfirmDeleteReviewId(review.id)}
                              disabled={isBanned}
                              className="rounded-lg px-2.5 py-2 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete review"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {confirmDeleteReviewId === review.id && (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-4 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-red-900 dark:text-red-200">Delete this review?</p>
                          <p className="mt-1 text-sm text-red-800 dark:text-red-300">
                            If you delete this review, you won't be able to submit a new one for this manager for 30 days.
                          </p>
                          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                            Deleting a review removes it permanently from your profile.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmDeleteReviewId(null)}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/10 transition-colors"
                          >
                            Keep it
                          </button>
                          <button
                            onClick={() => handleDeleteReviewById(review)}
                            className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                          >
                            Yes, delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div ref={reviewsSentinelRef} />
              {reviewsLoadingMore && (
                <p className="text-center text-sm text-muted-foreground py-4">Loading more...</p>
              )}
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">You haven't written any reviews yet.</p>
                <Link
                  to="/directory"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-medium text-primary-foreground transition-all hover:bg-primary/90"
                >
                  Find a Manager to Review
                </Link>
              </div>
            )}
          </div>

          {/* Sign Out Section */}
          <div className="mb-8 rounded-2xl border border-border bg-background p-8 shadow-sm">
            <div className="flex items-start gap-4">
              <LogOut size={24} className="text-muted-foreground flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground">Sign Out</h3>
                <p className="mt-1 text-muted-foreground">Sign out of your Rate My Managers account on this device.</p>
                <button
                  onClick={async () => {
                    logout();
                    localStorage.removeItem("rmm_pending_review");
                    queryClient.removeQueries({ queryKey: ["my-submitted-managers"] });
                    queryClient.removeQueries({ queryKey: ["auth-me"] });
                    toast.success("Signed out successfully!", { description: "See you next time!" });
                    navigate("/");
                  }}
                  className="mt-4 rounded-lg bg-primary px-6 py-2 font-medium text-primary-foreground transition-all hover:bg-primary/90"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Delete Account Section */}
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 shadow-sm">
            <div className="flex items-start gap-4">
              <AlertCircle size={24} className="text-red-500 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-600">Delete Account</h3>
                <p className="mt-2 text-muted-foreground">
                  Permanently delete your Rate My Managers account and all associated data. This action cannot be undone.
                </p>
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-muted-foreground">When you delete your account:</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    <li>Your profile will be removed</li>
                    <li>Your reviews will be anonymized</li>
                    <li>Your account data will be permanently deleted</li>
                    <li>This action cannot be reversed</li>
                  </ul>
                </div>
                <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="mt-6 rounded-lg border border-red-500 bg-red-500/10 px-6 py-2 font-medium text-red-600 transition-all hover:bg-red-500/20"
                >
                  <Trash2 size={16} className="inline mr-2" />
                  Delete My Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Account Modal */}
      {isDeleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => { setIsDeleteModalOpen(false); setDeleteConfirmation(""); }}
          onKeyDown={e => { if (e.key === "Escape") { setIsDeleteModalOpen(false); setDeleteConfirmation(""); } }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-background shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-6">
              <div className="flex items-center gap-3">
                <Trash2 size={20} aria-hidden="true" className="text-red-500 flex-shrink-0" />
                <h2 id="delete-account-title" className="text-lg font-semibold text-foreground">Delete Account</h2>
              </div>
              <button
                onClick={() => { setIsDeleteModalOpen(false); setDeleteConfirmation(""); }}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 transition-colors"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
                <p className="text-sm font-semibold text-red-600">⚠️ This action cannot be undone</p>
              </div>
              <div>
                <p className="text-sm text-foreground">Are you absolutely sure you want to delete your account? This will:</p>
                <ul className="list-inside list-disc mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>Permanently delete your profile</li>
                  <li>Anonymize your reviews</li>
                  <li>Remove all account data</li>
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Type "DELETE MY ACCOUNT" to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="DELETE MY ACCOUNT"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => { setIsDeleteModalOpen(false); setDeleteConfirmation(""); }}
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 font-medium text-foreground transition-all hover:bg-muted/60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={!isDeleteConfirmed || isDeleting}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? "Deleting..." : "Delete Account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Review — Full-Screen Stepped Form */}
      {editReviewStep && selectedReview && (() => {
        const steps = ["ratings", "dates"] as const;
        const stepIdx = steps.indexOf(editReviewStep) + 1;
        const stepTitles = { ratings: "Update ratings", dates: "Work timeline" };
        const isLastStep = editReviewStep === "dates";
        const dateInvalid = (() => {
          const ff = !!editWorkedFrom.month && !!editWorkedFrom.year;
          const uf = !!editWorkedUntil.month && !!editWorkedUntil.year;
          return ff && uf && (parseInt(editWorkedFrom.year) * 100 + parseInt(editWorkedFrom.month)) > (parseInt(editWorkedUntil.year) * 100 + parseInt(editWorkedUntil.month));
        })();
        const isEditManagerRoleOverlap = (() => {
          const fromFilled = editWorkedFrom.month !== "" && editWorkedFrom.year !== "";
          if (!fromFilled) return false;
          const untilFilled = editWorkedUntil.month !== "" && editWorkedUntil.year !== "";
          const newFrom = parseInt(editWorkedFrom.year) * 100 + parseInt(editWorkedFrom.month);
          const newUntil = editCurrentlyWorking ? 999999 : (untilFilled ? parseInt(editWorkedUntil.year) * 100 + parseInt(editWorkedUntil.month) : null);
          if (newUntil === null) return false;
          return myReviews.some((r: any) => {
            if (String(r.id) === String(selectedReview.id)) return false;
            if (String(r.managerId) !== String(selectedReview.managerId)) return false;
            const existFrom = ymToNum(r.workedFrom);
            if (!existFrom) return false;
            const existUntil = r.workedUntil ? ymToNum(r.workedUntil) : 999999;
            return newFrom <= existUntil! && existFrom <= newUntil;
          });
        })();
        const datesValid = !!editWorkedFrom.month && !!editWorkedFrom.year && (editCurrentlyWorking || (!!editWorkedUntil.month && !!editWorkedUntil.year)) && !dateInvalid && !isEditManagerRoleOverlap;
        const allRated = Object.values(editReviewData).filter(r => r >= 1).length === RATING_CATEGORIES.length;
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              <button
                onClick={() => {
                  if (editReviewStep === "ratings") { setEditReviewStep(null); setSelectedReview(null); }
                  else if (editReviewStep === "dates") setEditReviewStep("ratings");
                }}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-w-[60px]"
              >
                {editReviewStep !== "ratings" && <ArrowLeft size={16} aria-hidden="true" />}
                {editReviewStep === "ratings" ? "Cancel" : "Back"}
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{stepTitles[editReviewStep]}</p>
                <p className="text-xs text-muted-foreground">Step {stepIdx} of 2 · {selectedReview.managerName}</p>
              </div>
              <button
                onClick={() => { setEditReviewStep(null); setSelectedReview(null); }}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground transition-colors p-1 min-w-[60px] flex justify-end"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-muted/60">
              <div className="h-1 bg-primary transition-all duration-300" style={{ width: `${stepIdx * 50}%` }} />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

                {/* Step 1: Ratings */}
                {editReviewStep === "ratings" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">Update your ratings</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Takes just a minute. Your honest experience helps other job seekers make smarter career decisions.</p>
                    </div>

                    {/* Manager role context — read-only with inline edit toggle */}
                    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                      {!editingEditRoleInline ? (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[17px] font-semibold text-foreground leading-snug">{selectedReview.managerName}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">{editManagerTitle}</p>
                            <p className="text-sm font-medium text-foreground mt-1">{editManagerCompany}</p>
                          </div>
                          <button type="button" onClick={() => setEditingEditRoleInline(true)}
                            className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                            <Edit2 size={12} aria-hidden="true" />
                            Edit details
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Their title <span className="text-red-500">*</span></label>
                              <input type="text" value={editManagerTitle} onChange={(e) => setEditManagerTitle(e.target.value)}
                                placeholder="e.g. Engineering Manager" maxLength={100} autoFocus
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Their company <span className="text-red-500">*</span></label>
                              <input type="text" value={editManagerCompany} onChange={(e) => setEditManagerCompany(e.target.value)}
                                placeholder="e.g. Acme Corp" maxLength={100}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                          </div>
                          <button type="button" onClick={() => setEditingEditRoleInline(false)} className="text-xs text-primary hover:underline">Done editing</button>
                        </div>
                      )}
                    </div>

                    {/* About your review */}
                    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">About your review</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Your rating reflects your personal experience. All feedback is structured and opinion-based.
                      </p>
                      <ul className="space-y-1">
                        {[
                          "One review per role / time period",
                          "Duplicate or overlapping reviews are automatically blocked",
                          "No written reviews, only structured ratings",
                        ].map(item => (
                          <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-3">
                      {RATING_CATEGORIES.map((category) => (
                        <div key={category} className="border-b border-border pb-4 last:border-b-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <label className="block text-sm font-semibold text-foreground">{category}</label>
                            <div className="flex gap-1">
                              {Array.from({ length: 5 }).map((_, i) => {
                                const v = i + 1;
                                const selected = v <= (editReviewData[category] || 0);
                                return (
                                  <button key={i} onClick={() => setEditReviewData(prev => ({ ...prev, [category]: v }))}
                                    aria-label={`Rate ${v} stars`}
                                    className={`transition-colors ${selected ? "text-amber-400" : "text-muted-foreground hover:text-amber-300"}`}>
                                    <Star size={28} aria-hidden="true" className={selected ? "fill-current" : ""} />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2: Dates */}
                {editReviewStep === "dates" && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">Work timeline</h2>
                      <p className="mt-1 text-sm text-muted-foreground">When did you work with this manager?</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">When did you work with this manager? <span className="text-red-500">*</span></p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">From <span className="text-red-500">*</span></p>
                          <div className="flex gap-2">
                            <select value={editWorkedFrom.month} onChange={(e) => setEditWorkedFrom(p => ({ ...p, month: e.target.value }))} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                              <option value="">Month</option>
                              {availableMonths(editWorkedFrom.year).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <select value={editWorkedFrom.year} onChange={(e) => { const v = e.target.value; const clearedMonth = v === String(currentYear) && parseInt(editWorkedFrom.month) > currentMonth ? "" : editWorkedFrom.month; setEditWorkedFrom({ month: clearedMonth, year: v }); }} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                              <option value="">Year</option>
                              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">To</p>
                          <div className="flex gap-2 items-center">
                            {!editCurrentlyWorking && (
                              <>
                                <select value={editWorkedUntil.month} onChange={(e) => setEditWorkedUntil(p => ({ ...p, month: e.target.value }))} disabled={!editWorkedFrom.month && !editWorkedFrom.year} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40 disabled:cursor-not-allowed">
                                  <option value="">Month</option>
                                  {availableMonths(editWorkedUntil.year).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                                <select value={editWorkedUntil.year} onChange={(e) => { const v = e.target.value; const clearedMonth = v === String(currentYear) && parseInt(editWorkedUntil.month) > currentMonth ? "" : editWorkedUntil.month; setEditWorkedUntil({ month: clearedMonth, year: v }); }} disabled={!editWorkedFrom.month && !editWorkedFrom.year} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40 disabled:cursor-not-allowed">
                                  <option value="">Year</option>
                                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                              </>
                            )}
                            <label className={`flex items-center gap-2 text-sm text-foreground cursor-pointer ${!editWorkedFrom.month && !editWorkedFrom.year ? "opacity-40 cursor-not-allowed" : ""}`}>
                              <input type="checkbox" checked={editCurrentlyWorking} onChange={(e) => setEditCurrentlyWorking(e.target.checked)} disabled={!editWorkedFrom.month && !editWorkedFrom.year} className="w-4 h-4" />
                              Current
                            </label>
                          </div>
                        </div>
                      </div>
                      {dateInvalid && <p className="mt-3 text-xs text-red-600">The 'from' date cannot be after the 'to' date.</p>}
                      {isEditManagerRoleOverlap && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                          <AlertCircle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
                          <p className="text-xs text-red-700">You already have a review that overlaps this period. Each review must cover a distinct time range.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-4 sm:px-6 bg-background">
              <div className="mx-auto max-w-2xl">
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (editReviewStep === "ratings") setEditReviewStep("dates");
                      else handleSaveReview();
                    }}
                    disabled={
                      (editReviewStep === "ratings" && !allRated) ||
                      (isLastStep && !datesValid)
                    }
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLastStep ? "Save Changes" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Edit Submission Modal */}
      {isEditSubmissionModalOpen && selectedSubmission && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => { setIsEditSubmissionModalOpen(false); setSelectedSubmission(null); }}
          onKeyDown={e => { if (e.key === "Escape") { setIsEditSubmissionModalOpen(false); setSelectedSubmission(null); } }}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-submission-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background p-6">
              <h2 id="edit-submission-title" className="text-lg font-semibold text-foreground">Edit Submission</h2>
              <button
                onClick={() => { setIsEditSubmissionModalOpen(false); setSelectedSubmission(null); }}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 transition-colors"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editSubmissionData.name}
                  onChange={(e) => setEditSubmissionData((p) => ({ ...p, name: e.target.value }))}
                  maxLength={100}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Title *</label>
                <input
                  type="text"
                  value={editSubmissionData.title}
                  onChange={(e) => setEditSubmissionData((p) => ({ ...p, title: e.target.value }))}
                  maxLength={100}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Company *</label>
                <input
                  type="text"
                  value={editSubmissionData.company}
                  onChange={(e) => setEditSubmissionData((p) => ({ ...p, company: e.target.value }))}
                  maxLength={100}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Employment Status</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditSubmissionData((p) => ({ ...p, status: "active" }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      editSubmissionData.status === "active"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${editSubmissionData.status === "active" ? "bg-primary" : "bg-muted-foreground"}`} />
                    Currently Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditSubmissionData((p) => ({ ...p, status: "retired" }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      editSubmissionData.status === "retired"
                        ? "border-border bg-muted text-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${editSubmissionData.status === "retired" ? "bg-muted-foreground" : "bg-muted-foreground/40"}`} />
                    Retired
                  </button>
                </div>
              </div>


              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setIsEditSubmissionModalOpen(false); setSelectedSubmission(null); }}
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground transition-all hover:bg-muted/60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSubmission}
                  disabled={!editSubmissionData.name.trim() || !editSubmissionData.company.trim() || !editSubmissionData.title.trim()}
                  className="flex-1 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}