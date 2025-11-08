import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function Rejections() {
  const { data: leads, isLoading } = useQuery({
    queryKey: ['rejected-leads'],
    queryFn: () => base44.entities.Lead.filter({ status: 'rejected' }, '-created_date'),
    initialData: [],
  });

  const exportCSV = () => {
    const headers = ['Date', 'Name', 'Email', 'Phone', 'State', 'Source', 'Reason'];
    const rows = leads.map(lead => [
      format(new Date(lead.timestamp || lead.created_date), 'yyyy-MM-dd'),
      `${lead.first_name} ${lead.last_name}`,
      lead.email,
      lead.phone,
      lead.state,
      lead.source,
      lead.rejection_reason || 'N/A'
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rejections_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Rejected Leads</h1>
          <p className="text-gray-400">Review and analyze rejected leads</p>
        </div>
        <Button 
          onClick={exportCSV}
          disabled={leads.length === 0}
          className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card className="glass-card border-white/10">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-4 rounded-xl bg-red-500/20">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <p className="text-3xl font-bold text-white">{leads.length}</p>
              <p className="text-gray-400">Total Rejections</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Rejection Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-gray-400">Date</TableHead>
                  <TableHead className="text-gray-400">Name</TableHead>
                  <TableHead className="text-gray-400">Email</TableHead>
                  <TableHead className="text-gray-400">Phone</TableHead>
                  <TableHead className="text-gray-400">State</TableHead>
                  <TableHead className="text-gray-400">Source</TableHead>
                  <TableHead className="text-gray-400">Rejection Reason</TableHead>
                  <TableHead className="text-gray-400">Feedback</TableHead>
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
                ) : leads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                      No rejected leads found
                    </TableCell>
                  </TableRow>
                ) : (
                  leads.map((lead) => (
                    <TableRow key={lead.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white">
                        {format(new Date(lead.timestamp || lead.created_date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-white">
                        {lead.first_name} {lead.last_name}
                      </TableCell>
                      <TableCell className="text-gray-400">{lead.email}</TableCell>
                      <TableCell className="text-gray-400">{lead.phone}</TableCell>
                      <TableCell className="text-white">{lead.state}</TableCell>
                      <TableCell className="text-gray-400">{lead.source}</TableCell>
                      <TableCell>
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 border">
                          {lead.rejection_reason || 'No reason provided'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400 max-w-xs truncate">
                        {lead.feedback || '-'}
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