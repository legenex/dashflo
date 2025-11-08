import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Calculator, ArrowLeft } from "lucide-react";

const configCards = [
  {
    icon: LayoutGrid,
    title: "Widget Builder",
    description: "Create and manage custom dashboard widgets to visualize your data",
    path: "WidgetBuilder",
    color: "from-[#a855f7] to-[#7c3aed]"
  },
  {
    icon: Calculator,
    title: "Metrics Library",
    description: "Create reusable metrics and calculated fields for your widgets",
    path: "MetricsLibrary",
    color: "from-[#10b981] to-[#059669]"
  }
];

export default function DashboardConfig() {
  return (
    <div className="space-y-6">
      <div>
        <Link to={createPageUrl("AdminSettings")}>
          <Button variant="ghost" className="text-white hover:bg-white/10 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin Settings
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard Configuration</h1>
        <p className="text-gray-400">Manage widgets, metrics, and dashboard settings</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {configCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} to={createPageUrl(card.path)}>
              <Card className="glass-card border-white/10 hover:scale-105 transition-all duration-300 cursor-pointer group h-full">
                <CardContent className="p-8">
                  <div className="flex items-start gap-4">
                    <div className={`p-4 rounded-xl bg-gradient-to-br ${card.color} bg-opacity-20 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white mb-2">{card.title}</h3>
                      <p className="text-gray-400">{card.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="glass-card border-white/10">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-white mb-4">Dashboard Settings</h3>
          <div className="space-y-3 text-gray-400">
            <div className="flex items-center justify-between py-2 border-b border-white/10">
              <div>
                <p className="text-white font-medium">Default Date Range</p>
                <p className="text-sm">Set the default time period for dashboard data</p>
              </div>
              <span className="text-[#00d4ff]">Last 30 days</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/10">
              <div>
                <p className="text-white font-medium">Auto-refresh Interval</p>
                <p className="text-sm">Automatically refresh dashboard data</p>
              </div>
              <span className="text-[#00d4ff]">5 minutes</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-white font-medium">Default Dashboard</p>
                <p className="text-sm">Choose which dashboard to show on login</p>
              </div>
              <span className="text-[#00d4ff]">Overview</span>
            </div>
          </div>
          <div className="mt-6">
            <p className="text-sm text-gray-500 italic">⚙️ Advanced configuration options coming soon</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}