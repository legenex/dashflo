
import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Filter, Download, Plus, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WidgetRenderer from "../components/widgets/WidgetRenderer";

const buyerTypeColors = {
  law_firm: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  aggregator: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  network: "bg-green-500/20 text-green-400 border-green-500/30",
  data_partner: "bg-orange-500/20 text-orange-400 border-orange-500/30"
};

export default function BuyerPerformance() {
  const [filterType, setFilterType] = useState("all");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [customFilters, setCustomFilters] = useState([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);

  const { data: buyers, isLoading } = useQuery({
    queryKey: ['buyers'],
    queryFn: () => base44.entities.Buyer.list(),
    initialData: [],
  });

  const { data: widgets } = useQuery({
    queryKey: ['buyer-widgets'],
    queryFn: () => base44.entities.Widget.filter({ 
      dashboard_page: 'BuyerPerformance',
      enabled: true 
    }, 'position'),
    initialData: [],
  });

  const addFilter = () => {
    setCustomFilters([...customFilters, { field: '', operator: 'equals', value: '' }]);
  };

  const updateFilter = (index, key, value) => {
    const newFilters = [...customFilters];
    newFilters[index][key] = value;
    setCustomFilters(newFilters);
  };

  const removeFilter = (index) => {
    setCustomFilters(customFilters.filter((_, i) => i !== index));
  };

  const clearAllFilters = () => {
    setCustomFilters([]);
  };

  const filteredBuyers = useMemo(() => {
    let currentFiltered = buyers;

    // Apply buyer type filter
    if (filterType !== "all") {
      currentFiltered = currentFiltered.filter(b => b.type === filterType);
    }

    // Apply date range filter (assuming a 'created_at' or similar field on buyer objects)
    if (dateRange.start && dateRange.end) {
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      currentFiltered = currentFiltered.filter(buyer => {
        // Adjust 'created_at' to the actual date field in your buyer objects if different
        // Example: buyer.date_joined, buyer.lead_assigned_date, etc.
        if (!buyer.created_at) return false; // Skip if date field is missing
        const buyerDate = new Date(buyer.created_at); 
        // Set time to start/end of day for inclusive comparison
        startDate.setHours(0,0,0,0);
        endDate.setHours(23,59,59,999);
        return buyerDate >= startDate && buyerDate <= endDate;
      });
    }

    // Apply custom filters
    currentFiltered = currentFiltered.filter(buyer => {
      return customFilters.every(filter => {
        const { field, operator, value } = filter;

        // If filter is incomplete, it doesn't prevent other filters from applying, nor does it filter this item out.
        if (!field || !value) {
          return true; 
        }

        const buyerValue = buyer[field];
        
        // If the buyer object doesn't have the field, it doesn't match this filter
        if (buyerValue === undefined || buyerValue === null) {
          return false;
        }

        // Type coercion for comparison
        let coercedBuyerValue = buyerValue;
        let coercedFilterValue = value;

        // Attempt numeric conversion for numeric operations
        const isNumeric = !isNaN(Number(coercedBuyerValue)) && !isNaN(Number(coercedFilterValue));
        if (isNumeric) {
          coercedBuyerValue = Number(coercedBuyerValue);
          coercedFilterValue = Number(coercedFilterValue);
        } else {
          // Fallback to string for comparisons if not numeric
          coercedBuyerValue = String(coercedBuyerValue).toLowerCase();
          coercedFilterValue = String(coercedFilterValue).toLowerCase();
        }

        switch (operator) {
          case 'equals':
            return coercedBuyerValue === coercedFilterValue;
          case 'not_equals':
            return coercedBuyerValue !== coercedFilterValue;
          case 'contains':
            // Contains only makes sense for strings
            return String(buyerValue).toLowerCase().includes(String(value).toLowerCase());
          case 'greater_than':
            return isNumeric && coercedBuyerValue > coercedFilterValue;
          case 'less_than':
            return isNumeric && coercedBuyerValue < coercedFilterValue;
          default:
            return true;
        }
      });
    });

    return currentFiltered;
  }, [buyers, filterType, dateRange, customFilters]);


  const chartData = filteredBuyers.slice(0, 10).map(buyer => ({
    name: buyer.name,
    revenue: buyer.total_revenue || 0,
    leads: buyer.total_leads || 0
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Buyer Performance</h1>
          <p className="text-gray-400">Track buyer metrics and conversion rates</p>
        </div>
        <Button className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Filters */}
      <Card className="glass-card border-white/10">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-white">Buyer Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="law_firm">Law Firm</SelectItem>
                  <SelectItem value="aggregator">Aggregator</SelectItem>
                  <SelectItem value="network">Network</SelectItem>
                  <SelectItem value="data_partner">Data Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-white">Start Date</Label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="glass-card border-white/10 text-white"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-white">End Date</Label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="glass-card border-white/10 text-white"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilterBuilder(!showFilterBuilder)}
              className="glass-card border-white/10 text-white"
            >
              <Filter className="w-4 h-4 mr-2" />
              {showFilterBuilder ? 'Hide' : 'Show'} Custom Filters
              {customFilters.length > 0 && (
                <Badge className="ml-2 bg-[#00d4ff] text-white">
                  {customFilters.length}
                </Badge>
              )}
            </Button>
          </div>

          {/* Custom Filters Builder */}
          {showFilterBuilder && (
            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-white font-medium">Custom Filters</Label>
                <div className="flex gap-2">
                  {customFilters.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearAllFilters}
                      className="glass-card border-white/10 text-red-400"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear All
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addFilter}
                    className="glass-card border-white/10 text-white"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Filter
                  </Button>
                </div>
              </div>

              {customFilters.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-white/10 rounded-lg">
                  No custom filters added. Click "Add Filter" to create one.
                </div>
              )}

              <div className="space-y-2">
                {customFilters.map((filter, index) => (
                  <div key={index} className="flex gap-2 items-start p-3 glass-card border-white/10 rounded-lg">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Input
                        placeholder="Field name (e.g., name, total_revenue)"
                        value={filter.field}
                        onChange={(e) => updateFilter(index, 'field', e.target.value)}
                        className="glass-card border-white/10 text-white"
                      />
                      
                      <Select 
                        value={filter.operator} 
                        onValueChange={(v) => updateFilter(index, 'operator', v)}
                      >
                        <SelectTrigger className="glass-card border-white/10 text-white">
                          <SelectValue placeholder="Operator" />
                        </SelectTrigger>
                        <SelectContent className="glass-card border-white/10 text-white">
                          <SelectItem value="equals" className="text-white">Equals</SelectItem>
                          <SelectItem value="not_equals" className="text-white">Not Equals</SelectItem>
                          <SelectItem value="contains" className="text-white">Contains</SelectItem>
                          <SelectItem value="greater_than" className="text-white">Greater Than</SelectItem>
                          <SelectItem value="less_than" className="text-white">Less Than</SelectItem>
                        </SelectContent>
                      </Select>

                      <Input
                        placeholder="Value"
                        value={filter.value}
                        onChange={(e) => updateFilter(index, 'value', e.target.value)}
                        className="glass-card border-white/10 text-white"
                      />
                    </div>
                    
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFilter(index)}
                      className="text-red-400 hover:bg-red-500/20"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue Chart */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Revenue by Buyer (Top 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
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
              <Bar dataKey="revenue" fill="#00d4ff" name="Revenue ($)" />
              <Bar dataKey="leads" fill="#a855f7" name="Leads" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Buyers Table */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">All Buyers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-gray-400">Buyer ID</TableHead>
                  <TableHead className="text-gray-400">Name</TableHead>
                  <TableHead className="text-gray-400">Type</TableHead>
                  <TableHead className="text-gray-400">Leads Assigned</TableHead>
                  <TableHead className="text-gray-400">Conversion Rate</TableHead>
                  <TableHead className="text-gray-400">Total Revenue</TableHead>
                  <TableHead className="text-gray-400">Avg CPL</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i} className="border-white/10">
                      <TableCell colSpan={8}>
                        <Skeleton className="h-12 w-full bg-white/5" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredBuyers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                      No buyers found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBuyers.map((buyer) => (
                    <TableRow key={buyer.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white font-mono">{buyer.buyer_id || buyer.id}</TableCell>
                      <TableCell className="text-white font-medium">{buyer.name}</TableCell>
                      <TableCell>
                        <Badge className={`${buyerTypeColors[buyer.type]} border`}>
                          {buyer.type?.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white">{buyer.total_leads || 0}</TableCell>
                      <TableCell className="text-green-400">
                        {(buyer.conversion_rate || 0).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-green-400 font-medium">
                        ${(buyer.total_revenue || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-white">
                        ${(buyer.avg_cpl || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge className={buyer.active ? "bg-green-500/20 text-green-400 border-green-500/30 border" : "bg-red-500/20 text-red-400 border-red-500/30 border"}>
                          {buyer.active ? "Active" : "Inactive"}
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

      {/* Custom Widgets */}
      {widgets.length > 0 && (
        <>
          <div className="border-t border-white/10 pt-6">
            <h2 className="text-2xl font-bold text-white mb-4">Custom Widgets</h2>
          </div>
          <div className="grid grid-cols-12 gap-6">
            {widgets.map(widget => (
              <WidgetRenderer 
                key={widget.id} 
                widget={widget}
                dateRange={dateRange}
                customFilters={customFilters}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
