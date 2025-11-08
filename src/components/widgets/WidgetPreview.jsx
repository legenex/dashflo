import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function WidgetPreview({ widgetConfig }) {
  return (
    <Card className="glass-card border-white/10">
      <CardHeader>
        <CardTitle className="text-white">Widget Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="glass-card border-white/10 rounded-lg p-8 text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-white font-medium mb-2">Preview Coming Soon</h3>
          <p className="text-gray-400 text-sm">
            Save the widget and view it on the {widgetConfig.dashboard_page} page
          </p>
        </div>
      </CardContent>
    </Card>
  );
}