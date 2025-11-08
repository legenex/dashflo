
import React from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table as TableIcon, 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  Edit, 
  Trash2,
  AreaChart,
  LineChart as LineChartIcon
} from "lucide-react";

const widgetIcons = {
  table: TableIcon,
  kpi_card: TrendingUp,
  kpi_with_trend: BarChart3,
  stats_bar: BarChart3, // Added stats_bar
  line_chart: LineChartIcon,
  bar_chart: BarChart3,
  pie_chart: PieChart,
  area_chart: AreaChart
};

const widgetColors = {
  table: "from-blue-500 to-cyan-500",
  kpi_card: "from-purple-500 to-pink-500",
  kpi_with_trend: "from-red-500 to-pink-500",
  stats_bar: "from-cyan-500 to-teal-500", // Added stats_bar color
  line_chart: "from-green-500 to-emerald-500",
  bar_chart: "from-orange-500 to-amber-500",
  pie_chart: "from-red-500 to-rose-500",
  area_chart: "from-indigo-500 to-violet-500"
};

export default function WidgetList({ widgets, onEdit, isLoading }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Widget.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgets'] });
      alert("Widget deleted successfully");
    }
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array(6).fill(0).map((_, i) => (
          <Skeleton key={i} className="h-48 bg-white/5" />
        ))}
      </div>
    );
  }

  if (widgets.length === 0) {
    return (
      <Card className="glass-card border-white/10">
        <CardContent className="p-12 text-center">
          <TableIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No widgets yet</h3>
          <p className="text-gray-400">Create your first widget to visualize your synced data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {widgets.map((widget) => {
        const Icon = widgetIcons[widget.type] || TableIcon;
        const colorGradient = widgetColors[widget.type] || widgetColors.table;

        return (
          <Card key={widget.id} className="glass-card border-white/10 hover:scale-105 transition-transform">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${colorGradient} bg-opacity-20`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-white text-lg">{widget.name}</CardTitle>
                    <p className="text-xs text-gray-400 mt-1">{widget.data_source}</p>
                  </div>
                </div>
                <Badge className={widget.enabled ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>
                  {widget.enabled ? "Active" : "Disabled"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Type:</span>
                  <Badge className="bg-white/10 text-white border-white/20">
                    {widget.type.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Dashboard:</span>
                  <span className="text-white">{widget.dashboard_page || 'Not assigned'}</span>
                </div>
                {widget.display_config?.width && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Width:</span>
                    <span className="text-white">{widget.display_config.width}</span>
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(widget)}
                    className="flex-1 glass-card border-white/10 text-white hover:bg-white/10"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this widget?')) {
                        deleteMutation.mutate(widget.id);
                      }
                    }}
                    className="glass-card border-white/10 text-red-400 hover:bg-red-500/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
