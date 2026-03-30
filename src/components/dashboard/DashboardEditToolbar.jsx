import React from "react";
import { Button } from "@/components/ui/button";
import { Calculator, Table, Settings } from "lucide-react";

export default function DashboardEditToolbar({ onAddMetric, onAddTable, onManageMetrics }) {
  return (
    <div className="rounded-lg p-3 flex flex-wrap items-center gap-2 border border-[#00d4ff]/30 bg-[#00d4ff]/5">
      <span className="text-[#00d4ff] text-xs font-bold uppercase tracking-wider mr-1">✏ Edit Mode</span>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onAddMetric}
          className="glass-card border-white/10 text-white hover:bg-white/10 h-8 text-xs"
        >
          <Calculator className="w-3 h-3 mr-1.5" />Add Metric
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onAddTable}
          className="glass-card border-white/10 text-white hover:bg-white/10 h-8 text-xs"
        >
          <Table className="w-3 h-3 mr-1.5" />Add Table
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onManageMetrics}
          className="border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10 h-8 text-xs"
        >
          <Settings className="w-3 h-3 mr-1.5" />Manage Metrics
        </Button>
      </div>
      <span className="text-gray-500 text-xs ml-auto hidden sm:block">
        Click "Edit Layout" to exit
      </span>
    </div>
  );
}