import API_BASE from "@/lib/api";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Bell, ArrowLeft, ExternalLink } from "lucide-react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import axios from "axios";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  managerId?: number;
}

const MANAGER_LINK_TYPES = new Set(["manager_approved", "review_accepted", "manager_rejected"]);

export default function Notifications() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("selected"));

  useEffect(() => {
    if (!user) {
      navigate("/signin");
    }
  }, [user, navigate]);

  // When already on this page and user clicks a notification in the bell dropdown,
  // the URL updates but the component doesn't remount — sync selectedId from searchParams.
  useEffect(() => {
    const id = searchParams.get("selected");
    if (id) {
      setSelectedId(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n))
      );
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    axios
      .get(`${API_BASE}/api/notifications`)
      .then((res) => {
        const list: Notification[] = Array.isArray(res.data.data) ? res.data.data : [];
        setNotifications(list);
        const preSelected = searchParams.get("selected");
        if (preSelected) {
          const target = list.find((n) => n.id === preSelected);
          if (target && !target.read) {
            axios.put(`${API_BASE}/api/notifications/${preSelected}/read`).catch(() => {});
            setNotifications(list.map((n) => (n.id === preSelected ? { ...n, read: true } : n)));
          }
        }
      })
      .catch(() => toast.error("Failed to load notifications"))
      .finally(() => setLoading(false));
  }, [user]);

  const handleSelect = async (notification: Notification) => {
    setSelectedId(notification.id);
    if (!notification.read) {
      try {
        await axios.put(`${API_BASE}/api/notifications/${notification.id}/read`);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
        );
      } catch {
        // best-effort
      }
    }
  };

  const handleBack = () => setSelectedId(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const selected = notifications.find((n) => n.id === selectedId);

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const NotificationList = () => (
    <div className="divide-y divide-border">
      {notifications.map((n) => (
        <button
          key={n.id}
          onClick={() => handleSelect(n)}
          className={`w-full text-left p-4 transition-colors hover:bg-muted/50 ${
            selectedId === n.id
              ? "bg-[#d5cde0] border-l-4 border-[#2e0562]"
              : "border-l-4 border-transparent"
          }`}
        >
          <div className="flex items-start gap-3">
            {!n.read && (
              <div className="flex-shrink-0 mt-1">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
            )}
            <div className={`flex-1 min-w-0 ${n.read ? "pl-5" : ""}`}>
              <h3 className="font-medium text-foreground truncate text-sm">{n.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">{formatDate(n.createdAt)}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  const NotificationDetail = ({ notif }: { notif: Notification }) => (
    <div className="flex flex-col h-full">
      <div className="border-b border-border p-4 sm:p-6 bg-muted/20">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to list
        </button>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">{notif.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{formatDate(notif.createdAt)}</p>
      </div>
      <div className="flex-1 p-4 sm:p-6 flex flex-col gap-4">
        <p className="text-base text-foreground whitespace-pre-wrap leading-relaxed">
          {notif.message}
        </p>
        {notif.managerId && MANAGER_LINK_TYPES.has(notif.type) && (
          <div className="pt-2">
            <Link
              to={`/manager/${notif.managerId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2e0562] text-white text-sm font-medium hover:bg-[#2e0562]/90 transition-colors"
            >
              View Manager Profile
              <ExternalLink size={14} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Header */}
        <div className="border-b border-border px-4 sm:px-6 py-4 bg-background">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-4">
              <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">No notifications yet</p>
              <p className="text-sm text-muted-foreground">
                You'll be notified when managers are approved or other important events occur.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile: show list OR detail */}
            <div className="flex-1 overflow-hidden sm:hidden">
              {selectedId && selected ? (
                <div className="h-full overflow-y-auto bg-background">
                  <NotificationDetail notif={selected} />
                </div>
              ) : (
                <div className="h-full overflow-y-auto bg-muted/30">
                  <NotificationList />
                </div>
              )}
            </div>

            {/* Desktop: side-by-side */}
            <div className="flex-1 hidden sm:flex overflow-hidden">
              {/* Left: List */}
              <div className="w-80 border-r border-border overflow-y-auto bg-muted/30 flex-shrink-0">
                <NotificationList />
              </div>

              {/* Right: Detail */}
              <div className="flex-1 overflow-y-auto bg-background">
                {selected ? (
                  <NotificationDetail notif={selected} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <p>Select a notification to view details</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
