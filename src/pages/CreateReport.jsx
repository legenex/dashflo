import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function CreateReport() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Create New Report</h1>
        <p className="text-gray-400">Build custom reports with drag-and-drop</p>
      </div>

      <Card className="glass-card border-white/10">
        <CardContent className="p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center">
              <Plus className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Report Builder</h3>
            <p className="text-gray-400 mb-6">
              Advanced report builder with drag-and-drop functionality coming soon. 
              You'll be able to select metrics, add filters, and create custom visualizations.
            </p>
            <Button className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]">
              Start Building
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}