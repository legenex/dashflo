import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const supplierTypeColors = {
  internal_media_buyer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  internal_affiliate: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  external_affiliate: "bg-orange-500/20 text-orange-400 border-orange-500/30"
};

export default function SupplierPerformance() {
  const [filterType, setFilterType] = useState("all");

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
    initialData: [],
  });

  const filteredSuppliers = filterType === "all"
    ? suppliers
    : suppliers.filter(s => s.type === filterType);

  const chartData = filteredSuppliers.slice(0, 8).map(supplier => ({
    name: supplier.name,
    delivered: supplier.leads_delivered || 0,
    rejectionRate: supplier.rejection_rate || 0,
    gpMargin: supplier.gp_margin || 0
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Supplier Performance</h1>
          <p className="text-gray-400">Monitor supplier metrics and rejection rates</p>
        </div>
        <Button className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Filter */}
      <Card className="glass-card border-white/10">
        <CardContent className="p-4">
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <Label className="text-white">Supplier Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="internal_media_buyer">Internal Media Buyer</SelectItem>
                  <SelectItem value="internal_affiliate">Internal Affiliate</SelectItem>
                  <SelectItem value="external_affiliate">External Affiliate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Trend Chart */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Performance Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={100} />
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
              <Line type="monotone" dataKey="delivered" stroke="#00d4ff" strokeWidth={2} name="Leads Delivered" />
              <Line type="monotone" dataKey="rejectionRate" stroke="#ef4444" strokeWidth={2} name="Rejection Rate (%)" />
              <Line type="monotone" dataKey="gpMargin" stroke="#10b981" strokeWidth={2} name="GP Margin (%)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Suppliers Table */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">All Suppliers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-gray-400">Supplier ID</TableHead>
                  <TableHead className="text-gray-400">Name</TableHead>
                  <TableHead className="text-gray-400">Type</TableHead>
                  <TableHead className="text-gray-400">Leads Delivered</TableHead>
                  <TableHead className="text-gray-400">Rejection Rate</TableHead>
                  <TableHead className="text-gray-400">Total Cost</TableHead>
                  <TableHead className="text-gray-400">GP Margin</TableHead>
                  <TableHead className="text-gray-400">Commission</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i} className="border-white/10">
                      <TableCell colSpan={9}>
                        <Skeleton className="h-12 w-full bg-white/5" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-gray-400 py-8">
                      No suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white font-mono">{supplier.supplier_id || supplier.id}</TableCell>
                      <TableCell className="text-white font-medium">{supplier.name}</TableCell>
                      <TableCell>
                        <Badge className={`${supplierTypeColors[supplier.type]} border`}>
                          {supplier.type?.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white">{supplier.leads_delivered || 0}</TableCell>
                      <TableCell className={`font-medium ${(supplier.rejection_rate || 0) > 10 ? 'text-red-400' : 'text-green-400'}`}>
                        {(supplier.rejection_rate || 0).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-red-400">${(supplier.total_cost || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-green-400 font-medium">
                        {(supplier.gp_margin || 0).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-white">{supplier.commission_rate || 0}%</TableCell>
                      <TableCell>
                        <Badge className={supplier.active ? "bg-green-500/20 text-green-400 border-green-500/30 border" : "bg-red-500/20 text-red-400 border-red-500/30 border"}>
                          {supplier.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}