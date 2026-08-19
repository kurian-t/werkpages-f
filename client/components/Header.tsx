import API_BASE from "@/lib/api";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, X, LogOut, User, Settings, Shield, Bell } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AuthFlowModal } from "@/components/AuthFlowModal";
import { BrandLogo } from "@/components/BrandLogo";
import type { AuthFlowStep } from "@/components/AuthFlowModal";
import axios from "axios";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [authFlowStep, setAuthFlowStep] = useState<AuthFlowStep | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const isBanned = user?.isBanned === true;
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const POLL_INTERVAL_MS = 30_000;

  const fetchNotifications = useCallback(() => {
    axios
      .get(`${API_BASE}/api/notifications`)
      .then((res) => setNotifications(Array.isArray(res.data.data) ? res.data.data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setNotifications([]); return; }
    fetchNotifications();
  }, [user, fetchNotifications]);

  useEffect(() => {
    if (!user || isNotificationsOpen) return;
    const interval = setInterval(() => {
      axios
        .get(`${API_BASE}/api/notifications/unread-count`)
        .then((res) => {
          if ((res.data.unreadCount ?? 0) > 0) fetchNotifications();
        })
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, isNotificationsOpen, fetchNotifications]);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    if (isUserMenuOpen || isNotificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isUserMenuOpen, isNotificationsOpen]);

  const handleLogout = () => {
    logout();
    localStorage.removeItem("rmm_pending_review");
    setIsUserMenuOpen(false);
    navigate("/");
  };

  const handleNotificationClick = (notifId: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
    axios.put(`${API_BASE}/api/notifications/${notifId}/read`).catch(() => {});
    setIsNotificationsOpen(false);
    navigate(`/notifications?selected=${notifId}`);
  };

  const handleViewAll = () => {
    setIsNotificationsOpen(false);
  };

  const onNotificationsPage = pathname === "/notifications";
  const unreadCount = onNotificationsPage ? 0 : notifications.filter((n) => !n.read).length;
  const recentNotifications = notifications.slice(0, 5);

  return (
    <>
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <BrandLogo />

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-8 md:flex">
            {!user && (
              <Link
                to="/"
                className={`text-sm font-medium transition-colors hover:text-[#6d5091] ${pathname === "/" ? "text-[#6d5091]" : "text-foreground"}`}
              >
                Home
              </Link>
            )}
            <Link
              to="/find"
              className={`text-sm font-medium transition-colors hover:text-[#6d5091] ${pathname === "/find" ? "text-[#6d5091]" : "text-foreground"}`}
            >
              Search
            </Link>
            <Link
              to="/companies"
              className={`text-sm font-medium transition-colors hover:text-[#6d5091] ${pathname.startsWith("/companies") ? "text-[#6d5091]" : "text-foreground"}`}
            >
              Companies
            </Link>
            <Link
              to="/directory"
              className={`text-sm font-medium transition-colors hover:text-[#6d5091] ${pathname.startsWith("/directory") ? "text-[#6d5091]" : "text-foreground"}`}
            >
              Managers
            </Link>
            {user && (
              <Link
                to="/resume"
                className={`text-sm font-medium transition-colors hover:text-[#6d5091] ${pathname === "/resume" ? "text-[#6d5091]" : "text-foreground"}`}
              >
                Resume
              </Link>
            )}
            {user && (
              <Link
                to={isBanned ? "#" : "/add"}
                onClick={(e) => isBanned && e.preventDefault()}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  isBanned
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-[#2e0562] text-white hover:bg-[#2e0562]/90"
                }`}
                title={isBanned ? "Your account has been suspended" : ""}
              >
                Add Manager
              </Link>
            )}
          </nav>

          {/* Auth Section */}
          <div className="flex items-center gap-4">
            {user && (
              /* Notifications Bell */
              <div className="relative" ref={notificationsRef}>
                <button
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-accent/10 rounded-lg transition-colors"
                  title="Notifications"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-500 text-white text-xs font-bold">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <div className="absolute right-0 mt-2 w-96 max-h-96 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                    <div className="sticky top-0 border-b border-border p-3 bg-background">
                      <h3 className="font-semibold text-foreground">Notifications</h3>
                      {unreadCount > 0 && (
                        <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
                      )}
                    </div>

                    {recentNotifications.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Bell size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No notifications yet</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {recentNotifications.map((n) => (
                          <div
                            key={n.id}
                            className="p-3 hover:bg-accent/5 transition-colors cursor-pointer"
                            onClick={() => handleNotificationClick(n.id)}
                          >
                            <div className="flex items-start gap-2.5">
                              {!n.read && (
                                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                              )}
                              {n.read && <div className="w-2 flex-shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-medium text-foreground truncate">
                                  {n.title}
                                </h4>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {n.message}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Link
                      to="/notifications"
                      onClick={handleViewAll}
                      className="block w-full p-3 text-center text-sm text-primary hover:bg-accent/10 border-t border-border font-medium transition-colors"
                    >
                      View All Notifications
                    </Link>
                  </div>
                )}
              </div>
            )}

            {user ? (
              // User Menu (Logged In)
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/10 transition-all whitespace-nowrap"
                >
                  <User size={16} className="flex-shrink-0" />
                  <span className="hidden sm:inline">{user.username}</span>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-background shadow-lg">
                    <div className="border-b border-border p-3">
                      <p className="text-xs text-muted-foreground">Logged in as</p>
                      <p className="font-semibold text-foreground">@{user.username}</p>
                      {isBanned && (
                        <span className="inline-block mt-2 px-2 py-1 bg-red-100 text-red-700 text-xs rounded font-medium">
                          Suspended
                        </span>
                      )}
                      {user.role === "admin" && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                          Admin
                        </span>
                      )}
                    </div>
                    {user.role === "admin" && (
                      <Link
                        to="/admin"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors border-b border-border"
                      >
                        <Shield size={16} />
                        Admin Panel
                      </Link>
                    )}
                    <Link
                      to="/settings"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors"
                    >
                      <Settings size={16} />
                      Account Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors border-t border-border"
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // Auth Buttons (Not Logged In)
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={() => setAuthFlowStep("signin")}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => setAuthFlowStep("signup")}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#6d5091]"
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <button
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex md:hidden items-center justify-center rounded-md p-2 text-foreground hover:bg-accent/10"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="border-t border-border bg-background py-4 md:hidden">
            <div className="flex flex-col gap-3">
              {!user && (
                <Link
                  to="/"
                  className={`rounded px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 ${pathname === "/" ? "text-[#6d5091] bg-[#6d5091]/10" : "text-foreground"}`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Home
                </Link>
              )}
              <Link
                to="/find"
                className={`rounded px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 ${pathname === "/find" ? "text-[#6d5091] bg-[#6d5091]/10" : "text-foreground"}`}
                onClick={() => setIsMenuOpen(false)}
              >
                Search
              </Link>
              <Link
                to="/companies"
                className={`rounded px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 ${pathname.startsWith("/companies") ? "text-[#6d5091] bg-[#6d5091]/10" : "text-foreground"}`}
                onClick={() => setIsMenuOpen(false)}
              >
                Companies
              </Link>
              <Link
                to="/directory"
                className={`rounded px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 ${pathname.startsWith("/directory") ? "text-[#6d5091] bg-[#6d5091]/10" : "text-foreground"}`}
                onClick={() => setIsMenuOpen(false)}
              >
                Managers
              </Link>
              {user && (
                <Link
                  to="/resume"
                  className={`rounded px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 ${pathname === "/resume" ? "text-[#6d5091] bg-[#6d5091]/10" : "text-foreground"}`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Resume
                </Link>
              )}
              {user && (
                <Link
                  to={isBanned ? "#" : "/add"}
                  onClick={(e) => {
                    if (isBanned) e.preventDefault();
                    else setIsMenuOpen(false);
                  }}
                  className={`rounded px-4 py-2 text-sm font-medium transition-all ${
                    isBanned
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-[#2e0562] text-white hover:bg-[#2e0562]/90"
                  }`}
                  title={isBanned ? "Your account has been suspended" : ""}
                >
                  Add Manager
                </Link>
              )}

              {/* Mobile Auth */}
              {!user && (
                <>
                  <div className="border-t border-border pt-3 mt-3">
                    <button
                      onClick={() => { setIsMenuOpen(false); setAuthFlowStep("signin"); }}
                      className="block w-full text-left rounded px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/10"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => { setIsMenuOpen(false); setAuthFlowStep("signup"); }}
                      className="block w-full text-left rounded bg-black px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#6d5091] mt-2"
                    >
                      Sign Up
                    </button>
                  </div>
                </>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>

    {authFlowStep && (
      <AuthFlowModal
        initialStep={authFlowStep}
        autoSubmit={false}
        onAuthenticated={() => {
          setAuthFlowStep(null);
          if (pathname === "/" || pathname === "/signin" || pathname === "/signup") navigate("/find");
        }}
        onClose={() => setAuthFlowStep(null)}
        returnTo={["/", "/signin", "/signup"].includes(pathname) ? "/find" : undefined}
      />
    )}
    </>
  );
}
