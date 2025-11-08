import React from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  stats_bar: BarChart3,
  line_chart: LineChartIcon,
  bar_chart: BarChart3,
  pie_chart: PieChart,
  area_chart: AreaChart
};

export default function WidgetTable({ widgets, onEdit, isLoading }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Widget.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-widgets'] });
      alert("Widget deleted successfully");
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array(5).fill(0).map((_, i) => (
          <Skeleton key={i} className="h-16 bg-white/5" />
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
    <Card className="glass-card border-white/10">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-white/5">
                <TableHead className="text-gray-400">Type</TableHead>
                <TableHead className="text-gray-400">Name</TableHead>
                <TableHead className="text-gray-400">Data Source</TableHead>
                <TableHead className="text-gray-400">Dashboard</TableHead>
                <TableHead className="text-gray-400">Width</TableHead>
                <TableHead className="text-gray-400">Status</TableHead>
                <TableHead className="text-gray-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {widgets.map((widget) => {
                const Icon = widgetIcons[widget.type] || TableIcon;

                return (
                  <TableRow key={widget.id} className="border-white/10 hover:bg-white/5">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-[#00d4ff]" />
                        <Badge className="bg-white/10 text-white border-white/20">
                          {widget.type.replace('_', ' ')}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-white font-medium">{widget.name}</TableCell>
                    <TableCell className="text-gray-400 text-sm">{widget.data_source}</TableCell>
                    <TableCell className="text-white">{widget.dashboard_page || 'Not assigned'}</TableCell>
                    <TableCell>
                      <Badge className="bg-white/10 text-white border-white/20">
                        {widget.display_config?.width || 'full'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={widget.enabled ? "bg-green-500/20 text-green-400 border-green-500/30 border" : "bg-gray-500/20 text-gray-400 border-gray-500/30 border"}>
                        {widget.enabled ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEdit(widget)}
                          className="glass-card border-white/10 text-white hover:bg-white/10"
                        >
                          <Edit className="w-4 h-4" />
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}