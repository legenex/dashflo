import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function Analytics() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Advanced Analytics</h1>
        <p className="text-gray-400">Deep insights and predictive analytics</p>
      </div>

      <Card className="glass-card border-white/10">
        <CardContent className="p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Analytics Dashboard</h3>
            <p className="text-gray-400">
              Advanced analytics with funnel visualization, cohort analysis, and AI-powered insights coming soon.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}