import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import {
  LayoutDashboard,
  FileText,
  Users,
  DollarSign,
  BarChart3,
  Settings,
  ChevronDown,
  Search,
  Bell,
  Menu,
  X,
  LogOut,
  User,
  Building2,
  Palette,
  BellRing,
  Link as LinkIcon,
  Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const navigationSections = [
  {
    title: "Dashboards",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", path: "Dashboard" },
      { name: "Buyer Performance", path: "BuyerPerformance" },
      { name: "Supplier Performance", path: "SupplierPerformance" },
      { name: "Ad Metrics", path: "AdMetrics" },
      { name: "Active States", path: "ActiveStates" }
    ]
  },
  {
    title: "Leads",
    icon: FileText,
    items: [
      { name: "All Leads", path: "AllLeads" },
      { name: "Rejections", path: "Rejections" },
      { name: "Return Requests", path: "Returns" }
    ]
  },
  {
    title: "Management",
    icon: Users,
    items: [
      { name: "Verticals", path: "Verticals" },
      { name: "Buyers", path: "Buyers" },
      { name: "Suppliers", path: "Suppliers" },
      { name: "Sources", path: "Sources" },
      { name: "Brands", path: "Brands" },
      { name: "States", path: "ManageStates" }
    ]
  },
  {
    title: "Reports",
    icon: BarChart3,
    items: [
      { name: "Create Report", path: "CreateReport" },
      { name: "Saved Reports", path: "SavedReports" },
      { name: "Analytics", path: "Analytics" }
    ]
  },
  {
    title: "Billing",
    icon: DollarSign,
    path: "Billing"
  },
  {
    title: "Dashboard Config",
    icon: Settings,
    items: [
      { name: "Widget Builder", path: "WidgetBuilder" },
      { name: "Metrics Library", path: "MetricsLibrary" }
    ]
  },
  {
    title: "Admin Settings",
    icon: Settings,
    items: [
      { name: "Overview", path: "AdminSettings" },
      { name: "Data Sync Sources", path: "DataSyncSources" },
      { name: "Debug Data", path: "DebugData" }
    ]
  }
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState(() => {
    // Initialize from localStorage or default to "Dashboards"
    const saved = localStorage.getItem('expandedSection');
    return saved || "Dashboards";
  });
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    loadUser();
    loadNotifications();
  }, []);

  // Save expanded section to localStorage whenever it changes
  useEffect(() => {
    if (expandedSection) {
      localStorage.setItem('expandedSection', expandedSection);
    } else {
      localStorage.removeItem('expandedSection'); // Remove if section is collapsed
    }
  }, [expandedSection]);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const loadNotifications = async () => {
    try {
      const currentUser = await base44.auth.me();
      const notifs = await base44.entities.Notification.filter(
        { user_id: currentUser.id },
        "-created_date",
        10
      );
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  };

  const markAsRead = async (notifId) => {
    await base44.entities.Notification.update(notifId, { read: true });
    loadNotifications();
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const isActive = (path) => {
    return location.pathname === createPageUrl(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f23] via-[#1a1a3e] to-[#0f0f23]">
      <style>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }
        .glass-hover:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(0, 212, 255, 0.3);
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.2);
        }
        .neon-border {
          border: 1px solid rgba(168, 85, 247, 0.4);
          box-shadow: 0 0 10px rgba(168, 85, 247, 0.3);
        }
        .gradient-text {
          background: linear-gradient(135deg, #00d4ff 0%, #a855f7 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>

      {/* Top Navigation */}
      <div className="glass-card fixed top-0 left-0 right-0 h-16 z-50 flex items-center px-4 md:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (window.innerWidth < 768) {
              setMobileSidebarOpen(!mobileSidebarOpen);
            } else {
              setSidebarOpen(!sidebarOpen);
            }
          }}
          className="text-white hover:bg-white/10"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <div className="flex-1 flex items-center justify-between ml-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <div className="hidden md:block">
              <h1 className="text-xl font-bold gradient-text">
                Dashflo
              </h1>
              <p className="text-xs text-gray-400">Data Dashboard & Analytics</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:block w-64">
              <Input
                placeholder="Search..."
                className="glass-card border-white/10 text-white placeholder:text-gray-400"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative text-white hover:bg-white/10"
                  title="View notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white text-xs p-0">
                      {unreadCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-card border-white/10 w-80">
                <DropdownMenuLabel className="text-white">Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-gray-400">No notifications</div>
                ) : (
                  notifications.map((notif) => (
                    <DropdownMenuItem
                      key={notif.id}
                      onClick={() => markAsRead(notif.id)}
                      className="text-white hover:bg-white/10 cursor-pointer"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">{notif.title || notif.message}</div>
                        {!notif.read && (
                          <Badge className="bg-blue-500 text-white w-fit">New</Badge>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div
        className={`glass-card fixed left-0 top-16 bottom-0 z-40 transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-0 md:w-16"
        } ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} overflow-hidden flex flex-col`}
      >
        <div className="flex-1 p-4 space-y-2 overflow-y-auto">
          {sidebarOpen && (
            <div className="px-3 py-2 mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Navigation</p>
              <p className="text-xs text-gray-500 mt-1">Click sections to expand and view options</p>
            </div>
          )}
          {navigationSections.map((section) => (
            <div key={section.title}>
              {section.items ? (
                <div>
                  <button
                    onClick={() => toggleSection(section.title)}
                    className={`glass-hover w-full flex items-center justify-between px-3 py-2 rounded-lg text-white transition-all ${
                      !sidebarOpen && "md:justify-center"
                    }`}
                    title={!sidebarOpen ? section.title : `Expand ${section.title} menu`}
                  >
                    <div className="flex items-center gap-3">
                      <section.icon className="w-5 h-5" />
                      {sidebarOpen && <span>{section.title}</span>}
                    </div>
                    {sidebarOpen && (
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          expandedSection === section.title ? "rotate-180" : ""
                        }`}
                      />
                    )}
                  </button>
                  {expandedSection === section.title && sidebarOpen && (
                    <div className="ml-4 mt-1 space-y-1">
                      {section.items.map((item) => (
                        <Link
                          key={item.path}
                          to={createPageUrl(item.path)}
                          className={`block px-3 py-2 rounded-lg text-sm transition-all ${
                            isActive(item.path)
                              ? "neon-border text-[#00d4ff]"
                              : "text-gray-300 hover:bg-white/10"
                          }`}
                        >
                          {item.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to={createPageUrl(section.path)}
                  className={`glass-hover flex items-center gap-3 px-3 py-2 rounded-lg text-white transition-all ${
                    isActive(section.path) ? "neon-border" : ""
                  } ${!sidebarOpen && "md:justify-center"}`}
                  title={!sidebarOpen ? section.title : `Go to ${section.title}`}
                >
                  <section.icon className="w-5 h-5" />
                  {sidebarOpen && <span>{section.title}</span>}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* User Profile at Bottom of Sidebar */}
        <div className="border-t border-white/10 p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`glass-hover w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white transition-all hover:bg-white/10 ${!sidebarOpen && "md:justify-center"}`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center flex-shrink-0">
                  {user?.photo_url ? (
                    <img src={user.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>
                {sidebarOpen && (
                  <>
                    <div className="flex-1 text-left overflow-hidden">
                      <div className="text-sm font-medium truncate">{user?.full_name || "User"}</div>
                      <div className="text-xs text-gray-400 truncate">{user?.email}</div>
                    </div>
                    <Settings className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side={sidebarOpen ? "right" : "top"} className="glass-card border-white/10 w-56">
              <DropdownMenuLabel className="text-white">
                <div>{user?.full_name}</div>
                <div className="text-xs text-gray-400">{user?.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem asChild>
                <Link to={createPageUrl("Profile")} className="text-white hover:bg-white/10 cursor-pointer flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={createPageUrl("CompanySettings")} className="text-white hover:bg-white/10 cursor-pointer flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Company
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={createPageUrl("ThemeSettings")} className="text-white hover:bg-white/10 cursor-pointer flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Theme
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={createPageUrl("NotificationSettings")} className="text-white hover:bg-white/10 cursor-pointer flex items-center gap-2">
                  <BellRing className="w-4 h-4" />
                  Notifications
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={createPageUrl("IntegrationSettings")} className="text-white hover:bg-white/10 cursor-pointer flex items-center gap-2">
                  <LinkIcon className="w-4 h-4" />
                  Integrations
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={createPageUrl("SecuritySettings")} className="text-white hover:bg-white/10 cursor-pointer flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Security
                </Link>
              </DropdownMenuItem>
              {user?.role === "admin" && (
                <>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem asChild>
                    <Link to={createPageUrl("AdminSettings")} className="text-white hover:bg-white/10 cursor-pointer flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Admin Settings
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-400 hover:bg-red-500/20 cursor-pointer flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <div
        className={`transition-all duration-300 pt-16 ${
          sidebarOpen ? "md:ml-64" : "md:ml-16"
        }`}
      >
        <div className="p-4 md:p-8">{children}</div>
      </div>

      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
    </div>
  );
}