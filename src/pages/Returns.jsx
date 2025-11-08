import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function Returns() {
  const queryClient = useQueryClient();

  const { data: leads, isLoading } = useQuery({
    queryKey: ['return-requests'],
    queryFn: () => base44.entities.Lead.filter({ return_status: 'pending' }, '-created_date'),
    initialData: [],
  });

  const updateReturnMutation = useMutation({
    mutationFn: ({ id, status }) =>
      base44.entities.Lead.update(id, { return_status: status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['return-requests'] });
      alert(variables.status === 'approved' ? "Return approved" : "Return denied");
    }
  });

  const handleApprove = (leadId) => {
    updateReturnMutation.mutate({ id: leadId, status: 'approved' });
  };

  const handleDeny = (leadId) => {
    updateReturnMutation.mutate({ id: leadId, status: 'denied' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Return Requests</h1>
        <p className="text-gray-400">Review and process lead return requests</p>
      </div>

      <Card className="glass-card border-white/10">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-4 rounded-xl bg-orange-500/20">
              <XCircle className="w-8 h-8 text-orange-400" />
            </div>
            <div>
              <p className="text-3xl font-bold text-white">{leads.length}</p>
              <p className="text-gray-400">Pending Return Requests</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Pending Returns</CardTitle>
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
                  <TableHead className="text-gray-400">Supplier</TableHead>
                  <TableHead className="text-gray-400">Revenue</TableHead>
                  <TableHead className="text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                      No pending return requests
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
                      <TableCell className="text-gray-400">{lead.supplier_id || '-'}</TableCell>
                      <TableCell className="text-green-400">${(lead.revenue || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(lead.id)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeny(lead.id)}
                            className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Deny
                          </Button>
                        </div>
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