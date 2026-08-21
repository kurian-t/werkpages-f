import API_BASE from "@/lib/api";
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Shield, CheckCircle, XCircle, Ban, RotateCcw, Plus, X, Clock, GitMerge, Pencil, MessageSquare, ChevronDown, ChevronUp, Star } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

export default function Admin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"pending-managers" | "live-profiles" | "approvals" | "bans" | "merge" | "companies" | "ai-suggestions">("pending-managers");
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [aiSuggestionsTotal, setAiSuggestionsTotal] = useState(0);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  const [stats, setStats] = useState<{ realManagers: number; realReviews: number; weightedOpinions: number; seededManagers: number; scrapedManagers: number } | null>(null);
  const [countryStats, setCountryStats] = useState<{ managers: { country: string; count: number }[]; reviews: { country: string; count: number }[] } | null>(null);

  // Pending managers state
  const [pendingManagers, setPendingManagers] = useState<any[]>([]);
  const [pendingManagersLoading, setPendingManagersLoading] = useState(true);

  // Live profiles (ghost managers) state
  const [ghostManagers, setGhostManagers] = useState<any[]>([]);
  const [ghostManagersLoading, setGhostManagersLoading] = useState(false);

  // Pending edits state
  const [pendingEdits, setPendingEdits] = useState<any[]>([]);
  const [editsLoading, setEditsLoading] = useState(true);

  // Banned users state
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [bansLoading, setBansLoading] = useState(true);

  // Ban form state
  const [selectedUserId, setSelectedUserId] = useState("");
  const [banReason, setBanReason] = useState("");
  const [isBanning, setIsBanning] = useState(false);

  // Merge state
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeResults, setMergeResults] = useState<any[]>([]);
  const [mergeSearching, setMergeSearching] = useState(false);
  const [keepManager, setKeepManager] = useState<any>(null);
  const [mergeManager, setMergeManager] = useState<any>(null);
  const [isMerging, setIsMerging] = useState(false);

  // Company merge state
  const [coMergeSearch, setCoMergeSearch] = useState("");
  const [coMergeResults, setCoMergeResults] = useState<any[]>([]);
  const [coMergeSearching, setCoMergeSearching] = useState(false);
  const [coKeep, setCoKeep] = useState<any>(null);
  const [coMerge, setCoMerge] = useState<any>(null);
  const [coMerging, setCoMerging] = useState(false);

  // Pending manager inline edit state
  const [editingManagerId, setEditingManagerId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingCompany, setEditingCompany] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Reviews per pending manager (lazy-loaded)
  const [managerReviews, setManagerReviews] = useState<Record<number, { loading: boolean; reviews: any[] }>>({});
  const [expandedReviewsId, setExpandedReviewsId] = useState<number | null>(null);

  const toggleManagerReviews = async (managerId: number) => {
    if (expandedReviewsId === managerId) {
      setExpandedReviewsId(null);
      return;
    }
    setExpandedReviewsId(managerId);
    if (managerReviews[managerId]) return; // already loaded
    setManagerReviews(prev => ({ ...prev, [managerId]: { loading: true, reviews: [] } }));
    try {
      const res = await axios.get(`${API_BASE}/api/managers/${managerId}/reviews`, { params: { limit: 10 } });
      setManagerReviews(prev => ({ ...prev, [managerId]: { loading: false, reviews: res.data?.data ?? [] } }));
    } catch {
      setManagerReviews(prev => ({ ...prev, [managerId]: { loading: false, reviews: [] } }));
    }
  };

  // Confirm dialog state
  const [confirmAction, setConfirmAction] = useState<{
    type: "approve-manager" | "reject-manager" | "approve" | "reject" | "ban" | "unban" | "merge" | "merge-company" | "ai-merge";
    id?: string;
    label?: string;
    onConfirm?: () => Promise<void>;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Redirect non-admins
  if (!user || user.role !== "admin") {
    return (
      <Layout>
        <section className="py-16 text-center">
          <Shield size={48} className="mx-auto mb-4 text-red-500" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">You do not have permission to access the admin panel.</p>
          <button onClick={() => navigate("/")} className="rounded-lg border border-border px-6 py-2 text-sm font-medium text-foreground hover:bg-accent/10 transition-colors">
            Return to Home
          </button>
        </section>
      </Layout>
    );
  }

  const fetchPendingManagers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/admin/pending-managers`);
      setPendingManagers(Array.isArray(res.data.data) ? res.data.data : []);
    } catch {
      toast.error("Failed to load pending managers.");
    } finally {
      setPendingManagersLoading(false);
    }
  };

  const fetchPendingEdits = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/admin/pending-edits`);
      setPendingEdits(Array.isArray(res.data.data) ? res.data.data : []);
    } catch {
      toast.error("Failed to load pending edits.");
    } finally {
      setEditsLoading(false);
    }
  };

  const fetchBanData = async () => {
    try {
      const [bannedRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE}/api/admin/banned-users`),
        axios.get(`${API_BASE}/api/admin/users`, { params: { limit: 200 } }),
      ]);
      setBannedUsers(Array.isArray(bannedRes.data.data) ? bannedRes.data.data : []);
      setAllUsers(Array.isArray(usersRes.data.data) ? usersRes.data.data : []);
    } catch {
      toast.error("Failed to load user data.");
    } finally {
      setBansLoading(false);
    }
  };

  const fetchGhostManagers = async () => {
    setGhostManagersLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/admin/ghost-managers`);
      setGhostManagers(Array.isArray(res.data.data) ? res.data.data : []);
    } catch {
      toast.error("Failed to load live profiles.");
    } finally {
      setGhostManagersLoading(false);
    }
  };

  const handleMarkGhostReviewed = async (managerId: string | number) => {
    try {
      await axios.post(`${API_BASE}/api/admin/ghost-managers/${managerId}/mark-reviewed`);
      setGhostManagers((prev) => prev.filter((m) => String(m.id) !== String(managerId)));
      toast.success("Manager marked as reviewed.");
    } catch {
      toast.error("Failed to mark manager as reviewed.");
    }
  };

  useEffect(() => { fetchPendingManagers(); }, []);
  useEffect(() => { fetchPendingEdits(); }, []);
  useEffect(() => { if (activeTab === "live-profiles") fetchGhostManagers(); }, [activeTab]);
  useEffect(() => { if (activeTab === "bans") fetchBanData(); }, [activeTab]);
  useEffect(() => {
    if (activeTab !== "ai-suggestions") return;
    setAiSuggestionsLoading(true);
    axios.get(`${API_BASE}/api/admin/merge-suggestions`)
      .then(r => { setAiSuggestions(r.data.data ?? []); setAiSuggestionsTotal(r.data.total ?? 0); })
      .catch(() => {})
      .finally(() => setAiSuggestionsLoading(false));
  }, [activeTab]);
  useEffect(() => {
    axios.get(`${API_BASE}/api/stats`).then(r => {
      if (r.data && typeof r.data === "object" && "realManagers" in r.data) setStats(r.data);
    }).catch(() => {});
    axios.get(`${API_BASE}/api/admin/country-stats`).then(r => {
      if (r.data?.managers && r.data?.reviews) setCountryStats(r.data);
    }).catch(() => {});
  }, []);

  const handleApproveManager = async (managerId: string) => {
    try {
      await axios.post(`${API_BASE}/api/admin/pending-managers/${managerId}/approve`);
      setPendingManagers((prev) => prev.filter((m) => String(m.id) !== String(managerId)));
      toast.success("Manager approved and is now live.");
    } catch {
      toast.error("Failed to approve manager.");
    }
    setConfirmAction(null);
    setRejectReason("");
  };

  const handleRejectManager = async (managerId: string) => {
    try {
      await axios.post(`${API_BASE}/api/admin/pending-managers/${managerId}/reject`, {
        reason: rejectReason.trim() || undefined,
      });
      setPendingManagers((prev) => prev.filter((m) => String(m.id) !== String(managerId)));
      toast.success("Manager rejected.");
    } catch {
      toast.error("Failed to reject manager.");
    }
    setConfirmAction(null);
    setRejectReason("");
  };

  const handleEditManager = async (managerId: number) => {
    if (!editingName.trim() && !editingTitle.trim() && !editingCompany.trim()) return;
    setEditSaving(true);
    try {
      const res = await axios.put(`${API_BASE}/api/admin/managers/${managerId}`, {
        name: editingName.trim() || undefined,
        title: editingTitle.trim() || undefined,
        company: editingCompany.trim() || undefined,
      });
      setPendingManagers((prev) => prev.map((m) =>
        m.id === managerId
          ? { ...m, name: res.data.name ?? m.name, title: res.data.title ?? m.title, company: res.data.company ?? m.company }
          : m
      ));
      queryClient.invalidateQueries({ queryKey: ["company-profile-slug"] });
      queryClient.invalidateQueries({ queryKey: ["company-listing"] });
      toast.success("Manager updated.");
      setEditingManagerId(null);
    } catch {
      toast.error("Failed to update manager.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleApprove = async (editId: string) => {
    try {
      await axios.post(`${API_BASE}/api/admin/pending-edits/${editId}/approve`);
      setPendingEdits((prev) => prev.filter((e) => e.id !== editId));
      toast.success("Edit approved and applied.");
    } catch {
      toast.error("Failed to approve edit.");
    }
    setConfirmAction(null);
  };

  const handleReject = async (editId: string) => {
    try {
      await axios.post(`${API_BASE}/api/admin/pending-edits/${editId}/reject`);
      setPendingEdits((prev) => prev.filter((e) => e.id !== editId));
      toast.success("Edit rejected.");
    } catch {
      toast.error("Failed to reject edit.");
    }
    setConfirmAction(null);
  };

  const handleBanUser = async () => {
    if (!selectedUserId || !banReason.trim()) return;
    setIsBanning(true);
    try {
      await axios.post(`${API_BASE}/api/admin/users/${selectedUserId}/ban`, { reason: banReason.trim() });
      toast.success("User banned.");
      setSelectedUserId("");
      setBanReason("");
      fetchBanData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to ban user.");
    } finally {
      setIsBanning(false);
      setConfirmAction(null);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      await axios.delete(`${API_BASE}/api/admin/users/${userId}/ban`);
      setBannedUsers((prev) => prev.filter((b) => b.userId !== userId));
      setAllUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isBanned: false } : u));
      toast.success("User unbanned.");
    } catch {
      toast.error("Failed to unban user.");
    }
    setConfirmAction(null);
  };

  const handleMergeSearch = async (query: string) => {
    setMergeSearch(query);
    if (query.trim().length < 2) { setMergeResults([]); return; }
    setMergeSearching(true);
    try {
      const res = await axios.get(`${API_BASE}/api/managers/similar`, { params: { name: query.trim() } });
      setMergeResults(res.data?.data ?? []);
    } catch {
      setMergeResults([]);
    } finally {
      setMergeSearching(false);
    }
  };

  const handleMerge = async () => {
    if (!keepManager || !mergeManager) return;
    setIsMerging(true);
    try {
      await axios.post(`${API_BASE}/api/admin/managers/${keepManager.id}/merge/${mergeManager.id}`);
      toast.success(`Merged "${mergeManager.name}" into "${keepManager.name}".`);
      setKeepManager(null);
      setMergeManager(null);
      setMergeResults([]);
      setMergeSearch("");
      queryClient.invalidateQueries({ queryKey: ["company-profile-slug"] });
      queryClient.invalidateQueries({ queryKey: ["company-listing"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Merge failed.");
    } finally {
      setIsMerging(false);
      setConfirmAction(null);
    }
  };

  const handleCoMergeSearch = async (query: string) => {
    setCoMergeSearch(query);
    if (query.trim().length < 2) { setCoMergeResults([]); return; }
    setCoMergeSearching(true);
    try {
      const res = await axios.get(`${API_BASE}/api/admin/companies`);
      const all: any[] = res.data?.data ?? [];
      const q = query.trim().toLowerCase();
      setCoMergeResults(all.filter((c: any) => c.name.toLowerCase().includes(q)).slice(0, 8));
    } catch {
      setCoMergeResults([]);
    } finally {
      setCoMergeSearching(false);
    }
  };

  const handleMergeCompanies = async () => {
    if (!coKeep || !coMerge) return;
    setCoMerging(true);
    try {
      await axios.post(`${API_BASE}/api/admin/companies/${coKeep.id}/merge/${coMerge.id}`);
      toast.success(`Merged "${coMerge.name}" into "${coKeep.name}".`);
      setCoKeep(null);
      setCoMerge(null);
      setCoMergeSearch("");
      setCoMergeResults([]);
      queryClient.invalidateQueries({ queryKey: ["company-profile-slug"] });
      queryClient.invalidateQueries({ queryKey: ["company-listing"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Merge failed.");
    } finally {
      setCoMerging(false);
      setConfirmAction(null);
    }
  };

  const availableUsersForBan = allUsers.filter((u) => !u.isBanned);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">

          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <Shield size={32} className="text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Admin Panel</h1>
              <p className="text-muted-foreground">Review pending managers, edit requests, and user bans</p>
            </div>
          </div>

          {/* Site stats */}
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-semibold">{stats?.realManagers?.toLocaleString() ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">User Submitted</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-semibold">{stats?.realReviews?.toLocaleString() ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Opinions Shared</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-semibold">{stats?.weightedOpinions?.toLocaleString() ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Weighted Opinions</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-semibold">{stats?.scrapedManagers?.toLocaleString() ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Scraped Profiles</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${stats?.seededManagers != null && stats.seededManagers <= 10 ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border bg-card"}`}>
              <p className="text-2xl font-semibold">{stats?.seededManagers?.toLocaleString() ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Fake Profiles Left</p>
              {stats?.seededManagers != null && stats.seededManagers <= 10 && (
                <p className="text-xs text-amber-600 font-medium mt-1">Ready to retire</p>
              )}
            </div>
          </div>

          {/* Country breakdowns */}
          {countryStats && (
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold mb-3">Managers by Country</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="pb-1.5 font-medium">Country</th>
                      <th className="pb-1.5 font-medium text-right">Managers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countryStats.managers.map(row => (
                      <tr key={row.country} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5">{row.country}</td>
                        <td className="py-1.5 text-right font-medium">{row.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold mb-3">Ratings by Country</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="pb-1.5 font-medium">Country</th>
                      <th className="pb-1.5 font-medium text-right">Ratings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countryStats.reviews.map(row => (
                      <tr key={row.country} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5">{row.country}</td>
                        <td className="py-1.5 text-right font-medium">{row.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="mb-6 flex gap-2 border-b border-border overflow-x-auto">
            <button
              onClick={() => setActiveTab("pending-managers")}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === "pending-managers"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Pending Managers
              {pendingManagers.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  {pendingManagers.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("live-profiles")}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === "live-profiles"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Live Profiles
              {ghostManagers.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  {ghostManagers.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("approvals")}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === "approvals"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Edit Requests
              {pendingEdits.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  {pendingEdits.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("bans")}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === "bans"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Banned Users
              {bannedUsers.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {bannedUsers.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("merge")}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === "merge"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Merge Duplicates
            </button>
            <button
              onClick={() => setActiveTab("companies")}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === "companies"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Companies
            </button>
            <button
              onClick={() => setActiveTab("ai-suggestions")}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === "ai-suggestions"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              AI Suggestions
              {aiSuggestionsTotal > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-blue-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  {aiSuggestionsTotal}
                </span>
              )}
            </button>
          </div>

          {/* ── Pending Managers Tab ── */}
          {activeTab === "pending-managers" && (
            <div className="space-y-4">
              {pendingManagersLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : pendingManagers.length === 0 ? (
                <div className="rounded-2xl border border-border bg-background p-8 text-center">
                  <CheckCircle size={32} className="mx-auto mb-3 text-accent" />
                  <p className="text-muted-foreground">No pending manager submissions at this time.</p>
                </div>
              ) : (
                pendingManagers.map((manager) => (
                  <div key={manager.id} className="rounded-2xl border border-border bg-background p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="min-w-0 flex-1">
                        {editingManagerId === manager.id ? (
                          <div className="space-y-2">
                            <input
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              placeholder="Manager name"
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <input
                              value={editingTitle}
                              onChange={e => setEditingTitle(e.target.value)}
                              placeholder="Job title"
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <input
                              value={editingCompany}
                              onChange={e => setEditingCompany(e.target.value)}
                              placeholder="Company"
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => handleEditManager(manager.id)}
                                disabled={editSaving || (!editingName.trim() && !editingTitle.trim() && !editingCompany.trim())}
                                className="rounded-lg bg-[#2e0562] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2e0562]/90 disabled:opacity-50"
                              >
                                {editSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => setEditingManagerId(null)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/10"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-bold text-foreground">{manager.name}</h3>
                              <button
                                onClick={() => { setEditingManagerId(manager.id); setEditingName(manager.name); setEditingTitle(manager.title); setEditingCompany(manager.company); }}
                                aria-label="Edit manager"
                                className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
                              >
                                <Pencil size={14} />
                              </button>
                            </div>
                            <p className="text-sm text-muted-foreground">{manager.title} at {manager.company}</p>
                            <p className="text-sm text-muted-foreground mt-1">Submitted by: @{manager.submittedBy}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(manager.createdAt).toLocaleDateString()} at {new Date(manager.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 flex items-center gap-1">
                          <Clock size={12} />
                          Pending
                        </span>
                        {manager.isAutoCreated && (
                          <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                            auto-created
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Reviews section */}
                    <div className="mb-4">
                      <button
                        onClick={() => toggleManagerReviews(manager.id)}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <MessageSquare size={14} />
                        {expandedReviewsId === manager.id ? "Hide reviews" : "See reviews"}
                        {expandedReviewsId === manager.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      {expandedReviewsId === manager.id && (
                        <div className="mt-3 space-y-3">
                          {managerReviews[manager.id]?.loading ? (
                            <p className="text-xs text-muted-foreground">Loading reviews...</p>
                          ) : managerReviews[manager.id]?.reviews.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No reviews yet.</p>
                          ) : (
                            managerReviews[manager.id].reviews.map((review: any) => (
                              <div key={review.id} className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-foreground">{review.author}</span>
                                  <div className="flex items-center gap-0.5">
                                    {[1,2,3,4,5].map(i => (
                                      <Star key={i} size={11} className={i <= Math.round(review.overallRating) ? "fill-amber-400 text-amber-400" : "text-border"} />
                                    ))}
                                    <span className="text-xs text-muted-foreground ml-1">{Number(review.overallRating).toFixed(1)}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">{review.managerTitle} at {review.managerCompany}</p>
                                {review.text && <p className="text-xs text-foreground leading-relaxed">{review.text}</p>}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmAction({ type: "approve-manager", id: String(manager.id), label: manager.name })}
                        className="flex items-center gap-2 rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e0562]/90 transition-colors"
                      >
                        <CheckCircle size={16} />
                        Approve
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: "reject-manager", id: String(manager.id), label: manager.name })}
                        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/10 transition-colors"
                      >
                        <XCircle size={16} />
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Live Profiles (Ghost Managers) Tab ── */}
          {activeTab === "live-profiles" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                These profiles were auto-created when a user searched for a manager that didn't exist yet.
                They are already live and publicly visible. Review them for typos or profile issues, then mark as reviewed to clear them from this queue.
              </p>
              {ghostManagersLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : ghostManagers.length === 0 ? (
                <div className="rounded-2xl border border-border bg-background p-8 text-center">
                  <CheckCircle size={32} className="mx-auto mb-3 text-accent" />
                  <p className="text-muted-foreground">No live profiles to review.</p>
                </div>
              ) : (
                ghostManagers.map((manager) => (
                  <div key={manager.id} className="rounded-2xl border border-border bg-background p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        {editingManagerId === manager.id ? (
                          <div className="space-y-2">
                            <input
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              placeholder="Manager name"
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <input
                              value={editingTitle}
                              onChange={e => setEditingTitle(e.target.value)}
                              placeholder="Job title"
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <input
                              value={editingCompany}
                              onChange={e => setEditingCompany(e.target.value)}
                              placeholder="Company"
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => handleEditManager(manager.id)}
                                disabled={editSaving || (!editingName.trim() && !editingTitle.trim() && !editingCompany.trim())}
                                className="rounded-lg bg-[#2e0562] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2e0562]/90 disabled:opacity-50"
                              >
                                {editSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => setEditingManagerId(null)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/10"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-bold text-foreground">{manager.name}</h3>
                              <button
                                onClick={() => { setEditingManagerId(manager.id); setEditingName(manager.name); setEditingTitle(manager.title); setEditingCompany(manager.company); }}
                                aria-label="Edit manager"
                                className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
                              >
                                <Pencil size={14} />
                              </button>
                            </div>
                            <p className="text-sm text-muted-foreground">{manager.title} at {manager.company}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(manager.createdAt).toLocaleDateString()} at {new Date(manager.createdAt).toLocaleTimeString()}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-muted-foreground">{manager.reviewsCount ?? 0} review{manager.reviewsCount !== 1 ? "s" : ""}</span>
                              {manager.overallRating > 0 && (
                                <span className="text-xs text-muted-foreground">{Number(manager.overallRating).toFixed(1)} stars</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                          Live
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <Link
                        to={`/manager/${manager.id}`}
                        target="_blank"
                        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/10 transition-colors"
                      >
                        View Profile
                      </Link>
                      <button
                        onClick={() => handleMarkGhostReviewed(manager.id)}
                        className="flex items-center gap-2 rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e0562]/90 transition-colors"
                      >
                        <CheckCircle size={16} />
                        Mark as Reviewed
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Pending Edit Requests Tab ── */}
          {activeTab === "approvals" && (
            <div className="space-y-4">
              {editsLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : pendingEdits.length === 0 ? (
                <div className="rounded-2xl border border-border bg-background p-8 text-center">
                  <CheckCircle size={32} className="mx-auto mb-3 text-accent" />
                  <p className="text-muted-foreground">No pending edit requests at this time.</p>
                </div>
              ) : (
                pendingEdits.map((edit) => (
                  <div key={edit.id} className="rounded-2xl border border-border bg-background p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <Link to={`/manager/${edit.managerId}`} className="text-lg font-bold text-foreground hover:text-primary transition-colors">
                          {edit.managerName}
                        </Link>
                        <p className="text-sm text-muted-foreground">Requested by: @{edit.requestedBy}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(edit.createdAt).toLocaleDateString()} at {new Date(edit.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                        Pending
                      </span>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 mb-4">
                      <div className="rounded-lg bg-muted/40 p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Current</p>
                        <p className="text-sm"><span className="text-muted-foreground">Title:</span> <span className="font-medium text-foreground">{edit.currentTitle}</span></p>
                        <p className="text-sm mt-1"><span className="text-muted-foreground">Company:</span> <span className="font-medium text-foreground">{edit.currentCompany}</span></p>
                      </div>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <p className="text-xs font-semibold text-blue-700 uppercase mb-2">Proposed</p>
                        {edit.newTitle && (
                          <p className="text-sm"><span className="text-blue-600">Title:</span> <span className="font-medium text-blue-900">{edit.newTitle}</span></p>
                        )}
                        {edit.newCompany && (
                          <p className="text-sm mt-1"><span className="text-blue-600">Company:</span> <span className="font-medium text-blue-900">{edit.newCompany}</span></p>
                        )}
                        {edit.newCountry && (
                          <p className="text-sm mt-1"><span className="text-blue-600">Country:</span> <span className="font-medium text-blue-900">{edit.newCountry}</span></p>
                        )}
                        {edit.newStatus && (
                          <p className="text-sm mt-1"><span className="text-blue-600">Status:</span> <span className="font-medium text-blue-900">{edit.newStatus === "active" ? "Currently Active" : "Retired"}</span></p>
                        )}
                        {edit.newLinkedinUrl && (
                          <p className="text-sm mt-1"><span className="text-blue-600">LinkedIn:</span> <span className="font-medium text-blue-900">{edit.newLinkedinUrl}</span></p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmAction({ type: "approve", id: edit.id, label: edit.managerName })}
                        className="flex items-center gap-2 rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e0562]/90 transition-colors"
                      >
                        <CheckCircle size={16} />
                        Approve
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: "reject", id: edit.id, label: edit.managerName })}
                        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/10 transition-colors"
                      >
                        <XCircle size={16} />
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Banned Users Tab ── */}
          {activeTab === "bans" && (
            <div className="space-y-4">
              {/* Ban form */}
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Plus size={18} className="text-blue-700" />
                  <h3 className="text-base font-bold text-foreground">Ban a User</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Select a user and provide a reason for banning.</p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Select User</label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Choose a user...</option>
                      {availableUsersForBan.map((u) => (
                        <option key={u.id} value={u.id}>@{u.username} — {u.firstName} {u.lastName}</option>
                      ))}
                    </select>
                    {!bansLoading && availableUsersForBan.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">No users available to ban.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Reason</label>
                    <textarea
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      placeholder="e.g. Spam, harassment, inappropriate content..."
                      rows={3}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (!selectedUserId || !banReason.trim()) return;
                      const u = allUsers.find((u) => u.id === selectedUserId);
                      setConfirmAction({ type: "ban", id: selectedUserId, label: u?.username });
                    }}
                    disabled={!selectedUserId || !banReason.trim() || isBanning}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Ban size={16} />
                    Ban User
                  </button>
                </div>
              </div>

              {/* Banned users list */}
              {bansLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : bannedUsers.length === 0 ? (
                <div className="rounded-2xl border border-border bg-background p-8 text-center">
                  <p className="text-muted-foreground">No banned users at this time.</p>
                </div>
              ) : (
                <>
                  <h3 className="text-base font-semibold text-foreground">Currently Banned</h3>
                  {bannedUsers.map((ban) => (
                    <div key={ban.id} className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2">
                          <Ban size={18} className="text-red-600" />
                          <span className="font-semibold text-foreground">@{ban.username}</span>
                          <span className="rounded-full bg-red-100 border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700">Banned</span>
                        </div>
                      </div>
                      <div className="rounded-lg bg-white p-3 mb-3">
                        <p className="text-xs text-muted-foreground">Reason</p>
                        <p className="text-sm font-medium text-foreground">{ban.reason}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                        <div className="rounded-lg bg-white p-2">
                          <p className="text-muted-foreground uppercase font-semibold mb-1">Banned By</p>
                          <p className="text-foreground">@{ban.bannedBy}</p>
                        </div>
                        <div className="rounded-lg bg-white p-2">
                          <p className="text-muted-foreground uppercase font-semibold mb-1">Banned On</p>
                          <p className="text-foreground">{new Date(ban.bannedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setConfirmAction({ type: "unban", id: ban.userId, label: ban.username })}
                        className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
                      >
                        <RotateCcw size={14} />
                        Unban
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {/* ── Merge Duplicates Tab ── */}
          {activeTab === "merge" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <GitMerge size={18} className="text-primary" />
                  <h3 className="text-base font-bold text-foreground">Merge Duplicate Managers</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Search for a manager, then assign one as "Keep" and one as "Remove". All reviews from the removed manager will be moved to the kept one.
                </p>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-foreground mb-1">Search managers</label>
                  <input
                    type="text"
                    value={mergeSearch}
                    onChange={(e) => handleMergeSearch(e.target.value)}
                    placeholder="Type a name..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {mergeSearching && <p className="text-sm text-muted-foreground">Searching...</p>}

                {mergeResults.length > 0 && (
                  <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden mb-4">
                    {mergeResults.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-background hover:bg-accent/5">
                        <div className="min-w-0">
                          <Link to={`/manager/${m.id}`} target="_blank" className="font-medium text-foreground hover:text-primary text-sm">
                            {m.name}
                          </Link>
                          <p className="text-xs text-muted-foreground truncate">{m.title} at {m.company}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => setKeepManager(m)}
                            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${keepManager?.id === m.id ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent/10 text-foreground"}`}
                          >
                            Keep
                          </button>
                          <button
                            onClick={() => setMergeManager(m)}
                            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${mergeManager?.id === m.id ? "bg-red-600 text-white" : "border border-border hover:bg-accent/10 text-foreground"}`}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {(keepManager || mergeManager) && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 mb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Selected</p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">Keep</span>
                      <span className="text-foreground">{keepManager ? `${keepManager.name} — ${keepManager.company}` : <span className="text-muted-foreground">Not selected</span>}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="rounded-full bg-red-100 text-red-600 px-2 py-0.5 text-xs font-medium">Remove</span>
                      <span className="text-foreground">{mergeManager ? `${mergeManager.name} — ${mergeManager.company}` : <span className="text-muted-foreground">Not selected</span>}</span>
                    </div>
                  </div>
                )}

                <button
                  disabled={!keepManager || !mergeManager || keepManager.id === mergeManager.id || isMerging}
                  onClick={() => setConfirmAction({ type: "merge", id: keepManager.id, label: keepManager.name })}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <GitMerge size={16} />
                  Merge
                </button>
                {keepManager && mergeManager && keepManager.id === mergeManager.id && (
                  <p className="text-xs text-destructive mt-2">Keep and Remove cannot be the same manager.</p>
                )}
              </div>
            </div>
          )}

          {/* ── AI Suggestions Tab ── */}
          {activeTab === "ai-suggestions" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Claude evaluates manager pairs with similar names hourly and flags potential duplicates here. Review and merge or dismiss each suggestion.
              </p>
              {aiSuggestionsLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : aiSuggestions.length === 0 ? (
                <div className="rounded-2xl border border-border bg-background p-8 text-center">
                  <CheckCircle size={32} className="mx-auto mb-3 text-accent" />
                  <p className="text-sm font-medium text-foreground">No suggestions pending</p>
                  <p className="text-xs text-muted-foreground mt-1">Claude will populate this as it finds candidate pairs.</p>
                </div>
              ) : (
                aiSuggestions.map((s: any) => (
                  <div key={s.id} className="rounded-2xl border border-border bg-background p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        s.confidence === "SAME"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {s.confidence === "SAME" ? "Same person" : "Likely same person"}
                      </span>
                      <button
                        onClick={() => {
                          axios.post(`${API_BASE}/api/admin/merge-suggestions/${s.id}/dismiss`)
                            .then(() => setAiSuggestions(prev => prev.filter(x => x.id !== s.id)))
                            .catch(() => toast.error("Failed to dismiss"));
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground italic">"{s.reason}"</p>
                    <div className="grid grid-cols-2 gap-4">
                      {[s.managerA, s.managerB].map((m: any, i: number) => (
                        <div key={i} className="rounded-lg border border-border p-3 text-sm">
                          <p className="font-semibold text-foreground">{m.name}</p>
                          <p className="text-muted-foreground text-xs">{m.title} · {m.company}</p>
                          <p className="text-muted-foreground text-xs">{m.country}</p>
                          <p className="text-muted-foreground text-xs mt-1">{m.reviews} review{m.reviews !== 1 ? "s" : ""}</p>
                          <a href={`/manager/${m.id}`} target="_blank" rel="noreferrer"
                            className="text-xs text-primary underline mt-1 inline-block">
                            View profile
                          </a>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setConfirmAction({
                        type: "ai-merge",
                        label: `Merge "${s.managerB.name}" into "${s.managerA.name}"`,
                        onConfirm: async () => {
                          await axios.post(`${API_BASE}/api/admin/managers/${s.managerA.id}/merge/${s.managerB.id}`);
                          setAiSuggestions(prev => prev.filter((x: any) => x.id !== s.id));
                          toast.success("Managers merged successfully.");
                        }
                      })}
                      className="w-full rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e0562]/90 transition-colors"
                    >
                      Merge →
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Companies Tab ── */}
          {activeTab === "companies" && (
            <div className="space-y-6">
              {/* Company merge tool */}
              <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <GitMerge size={18} className="text-primary" />
                  <h3 className="text-base font-bold text-foreground">Merge Companies</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Select a company to keep and one to remove. All managers from the removed company will move to the kept one, then the duplicate is deleted.
                </p>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-foreground mb-1">Search companies</label>
                  <input
                    type="text"
                    value={coMergeSearch}
                    onChange={(e) => handleCoMergeSearch(e.target.value)}
                    placeholder="Type a company name..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {coMergeSearching && <p className="text-sm text-muted-foreground">Searching...</p>}

                {coMergeResults.length > 0 && (
                  <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden mb-4">
                    {coMergeResults.map((c: any) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-background hover:bg-accent/5">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground text-sm">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.managerCount ?? 0} manager{c.managerCount !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => setCoKeep(c)}
                            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${coKeep?.id === c.id ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent/10 text-foreground"}`}
                          >
                            Keep
                          </button>
                          <button
                            onClick={() => setCoMerge(c)}
                            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${coMerge?.id === c.id ? "bg-red-600 text-white" : "border border-border hover:bg-accent/10 text-foreground"}`}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {(coKeep || coMerge) && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 mb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Selected</p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">Keep</span>
                      <span className="text-foreground">{coKeep ? coKeep.name : <span className="text-muted-foreground">Not selected</span>}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="rounded-full bg-red-100 text-red-600 px-2 py-0.5 text-xs font-medium">Remove</span>
                      <span className="text-foreground">{coMerge ? coMerge.name : <span className="text-muted-foreground">Not selected</span>}</span>
                    </div>
                  </div>
                )}

                <button
                  disabled={!coKeep || !coMerge || coKeep?.id === coMerge?.id || coMerging}
                  onClick={() => setConfirmAction({ type: "merge-company", id: String(coKeep.id), label: coKeep.name })}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <GitMerge size={16} />
                  {coMerging ? "Merging..." : "Merge Companies"}
                </button>
                {coKeep && coMerge && coKeep.id === coMerge.id && (
                  <p className="text-xs text-destructive mt-2">Keep and Remove cannot be the same company.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => { setConfirmAction(null); setRejectReason(""); }}
          onKeyDown={e => { if (e.key === "Escape") { setConfirmAction(null); setRejectReason(""); } }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-background shadow-xl p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="confirm-dialog-title" className="text-base font-semibold text-foreground">
                {confirmAction.type === "approve-manager" && "Approve Manager?"}
                {confirmAction.type === "reject-manager" && "Reject Manager?"}
                {confirmAction.type === "approve" && "Approve Edit?"}
                {confirmAction.type === "reject" && "Reject Edit?"}
                {confirmAction.type === "ban" && "Ban User?"}
                {confirmAction.type === "unban" && "Unban User?"}
                {confirmAction.type === "merge" && "Merge Managers?"}
                {confirmAction.type === "merge-company" && "Merge Companies?"}
                {confirmAction.type === "ai-merge" && "Merge Managers?"}
              </h2>
              <button
                onClick={() => { setConfirmAction(null); setRejectReason(""); }}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 transition-colors"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {confirmAction.type === "approve-manager" && `${confirmAction.label} will be approved and made live on the platform.`}
              {confirmAction.type === "reject-manager" && `${confirmAction.label} will be rejected.`}
              {confirmAction.type === "approve" && `This will apply the proposed changes to ${confirmAction.label} and update their career history.`}
              {confirmAction.type === "reject" && `The proposed changes for ${confirmAction.label} will be discarded.`}
              {confirmAction.type === "ban" && `@${confirmAction.label} will be banned. Reason: ${banReason}`}
              {confirmAction.type === "unban" && `@${confirmAction.label} will be unbanned and able to use the platform again.`}
              {confirmAction.type === "merge" && mergeManager && `All reviews from "${mergeManager.name}" will be moved to "${keepManager?.name}" and the duplicate will be permanently deleted. This cannot be undone.`}
              {confirmAction.type === "merge-company" && coMerge && `All managers from "${coMerge.name}" will be moved to "${coKeep?.name}" and the duplicate company will be permanently deleted. This cannot be undone.`}
              {confirmAction.type === "ai-merge" && `${confirmAction.label} — all reviews will be moved to the kept profile and the duplicate will be permanently deleted. This cannot be undone.`}
            </p>

            {confirmAction.type === "reject-manager" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-1">Reason (optional)</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Provide a reason to notify the submitter..."
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmAction(null); setRejectReason(""); }}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmAction.type === "approve-manager") handleApproveManager(confirmAction.id!);
                  else if (confirmAction.type === "reject-manager") handleRejectManager(confirmAction.id!);
                  else if (confirmAction.type === "approve") handleApprove(confirmAction.id!);
                  else if (confirmAction.type === "reject") handleReject(confirmAction.id!);
                  else if (confirmAction.type === "ban") handleBanUser();
                  else if (confirmAction.type === "unban") handleUnbanUser(confirmAction.id!);
                  else if (confirmAction.type === "merge") handleMerge();
                  else if (confirmAction.type === "merge-company") handleMergeCompanies();
                  else if (confirmAction.type === "ai-merge" && confirmAction.onConfirm) { confirmAction.onConfirm().then(() => setConfirmAction(null)); }
                }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                  confirmAction.type === "approve-manager" || confirmAction.type === "approve"
                    ? "bg-[#2e0562] hover:bg-[#2e0562]/90"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {confirmAction.type === "approve-manager" && "Approve"}
                {confirmAction.type === "reject-manager" && "Reject"}
                {confirmAction.type === "approve" && "Approve"}
                {confirmAction.type === "reject" && "Reject"}
                {confirmAction.type === "ban" && "Ban User"}
                {confirmAction.type === "unban" && "Unban"}
                {confirmAction.type === "merge" && "Merge"}
                {confirmAction.type === "merge-company" && "Merge Companies"}
                {confirmAction.type === "ai-merge" && "Merge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
