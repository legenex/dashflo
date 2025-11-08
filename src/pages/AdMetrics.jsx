import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown } from "lucide-react";

const COLORS = ['#00d4ff', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

export default function AdMetrics() {
  const { data: leads, isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.list(),
    initialData: [],
  });

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => base44.entities.Source.list(),
    initialData: [],
  });

  const getSourceMetrics = () => {
    const metrics = {};
    leads.forEach(lead => {
      const source = lead.source || 'Unknown';
      if (!metrics[source]) {
        metrics[source] = { name: source, leads: 0, revenue: 0, cost: 0, cpl: 0 };
      }
      metrics[source].leads += 1;
      metrics[source].revenue += lead.revenue || 0;
      metrics[source].cost += lead.cost || 0;
    });
    
    Object.values(metrics).forEach(m => {
      m.cpl = m.leads > 0 ? m.cost / m.leads : 0;
      m.roi = m.cost > 0 ? ((m.revenue - m.cost) / m.cost) * 100 : 0;
    });
    
    return Object.values(metrics);
  };

  const sourceMetrics = getSourceMetrics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Ad Metrics</h1>
        <p className="text-gray-400">Analyze advertising performance across channels</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-white">CPL by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sourceMetrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" />
                <YAxis stroke="rgba(255,255,255,0.5)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'white'
                  }}
                />
                <Legend />
                <Bar dataKey="cpl" fill="#00d4ff" name="CPL ($)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-white">ROI by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sourceMetrics}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, roi }) => `${name}: ${roi.toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="roi"
                >
                  {sourceMetrics.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'white'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Ad Spend vs Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-gray-400">Source</TableHead>
                  <TableHead className="text-gray-400">Leads</TableHead>
                  <TableHead className="text-gray-400">Ad Spend</TableHead>
                  <TableHead className="text-gray-400">Revenue</TableHead>
                  <TableHead className="text-gray-400">CPL</TableHead>
                  <TableHead className="text-gray-400">ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceMetrics.map((metric) => (
                  <TableRow key={metric.name} className="border-white/10 hover:bg-white/5">
                    <TableCell className="text-white font-medium">{metric.name}</TableCell>
                    <TableCell className="text-white">{metric.leads}</TableCell>
                    <TableCell className="text-red-400">${metric.cost.toLocaleString()}</TableCell>
                    <TableCell className="text-green-400">${metric.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-white">${metric.cpl.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {metric.roi > 0 ? (
                          <TrendingUp className="w-4 h-4 text-green-400" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-400" />
                        )}
                        <span className={metric.roi > 0 ? 'text-green-400' : 'text-red-400'}>
                          {metric.roi.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}