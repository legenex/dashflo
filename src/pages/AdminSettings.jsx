
import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Settings, 
  Users, 
  Bell, 
  Upload, 
  Download, 
  Brain, 
  Webhook,
  RefreshCw
} from "lucide-react";

const adminCards = [
  {
    icon: RefreshCw,
    title: "Data Sync Sources",
    description: "Configure BigQuery and Cloud Run syncs with auto-scheduling",
    path: "DataSyncSources",
    color: "from-[#00d4ff] to-[#0099cc]"
  },
  {
    icon: Settings,
    title: "Dashboard Config",
    description: "Manage widgets, metrics library, and dashboard settings",
    path: "DashboardConfig",
    color: "from-[#ef4444] to-[#dc2626]"
  },
  {
    icon: Webhook,
    title: "API & Webhooks",
    description: "Manage API keys and webhook configurations",
    path: "ApiWebhooks",
    color: "from-[#14b8a6] to-[#0d9488]"
  },
  {
    icon: Users,
    title: "User Management",
    description: "Manage roles, permissions, and user access",
    path: "UserManagement",
    color: "from-[#06b6d4] to-[#0891b2]"
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "Configure alert rules and notification channels",
    path: "Notifications", // Changed from null to "Notifications"
    color: "from-[#ec4899] to-[#db2777]"
  },
  {
    icon: Upload,
    title: "Import/Export",
    description: "Bulk data operations and CSV management",
    path: null,
    color: "from-[#8b5cf6] to-[#7c3aed]"
  },
  {
    icon: Brain,
    title: "AI Insights",
    description: "Configure predictive models and automation rules",
    path: null,
    color: "from-[#f97316] to-[#ea580c]"
  }
];

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Admin Settings</h1>
        <p className="text-gray-400">System-wide configuration and management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminCards.map((card) => {
          const Icon = card.icon;
          const content = (
            <Card className="glass-card border-white/10 hover:scale-105 transition-all duration-300 cursor-pointer group h-full">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`p-4 rounded-xl bg-gradient-to-br ${card.color} bg-opacity-20 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white mb-2">{card.title}</h3>
                    <p className="text-gray-400 text-sm">{card.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );

          if (card.path) {
            return (
              <Link key={card.title} to={createPageUrl(card.path)}>
                {content}
              </Link>
            );
          }

          return (
            <div key={card.title} className="opacity-60">
              {content}
              <div className="text-center mt-2">
                <span className="text-xs text-gray-500">Coming Soon</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
