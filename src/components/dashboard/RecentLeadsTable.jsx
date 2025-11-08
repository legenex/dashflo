
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { MoreVertical, Pencil, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusColors = {
  new: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  assigned: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  sold: "bg-green-500/20 text-green-400 border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  returned: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  pending: "bg-purple-500/20 text-purple-400 border-purple-500/30"
};

export default function RecentLeadsTable({ leads, isLoading, onHide, onEdit }) {
  if (isLoading) {
    return (
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Recent Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array(5).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full bg-white/5" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-white/10 group">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white">Recent Leads</CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white hover:bg-white/10"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-card border-white/10">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit} className="text-white hover:bg-white/10 cursor-pointer">
                <Pencil className="w-4 h-4 mr-2" />
                Configure
              </DropdownMenuItem>
            )}
            {onHide && (
              <DropdownMenuItem onClick={onHide} className="text-orange-400 hover:bg-orange-500/20 cursor-pointer">
                <EyeOff className="w-4 h-4 mr-2" />
                Hide Widget
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-white/5">
                <TableHead className="text-gray-400">Timestamp</TableHead>
                <TableHead className="text-gray-400">Name</TableHead>
                <TableHead className="text-gray-400">Email</TableHead>
                <TableHead className="text-gray-400">Phone</TableHead>
                <TableHead className="text-gray-400">State</TableHead>
                <TableHead className="text-gray-400">Source</TableHead>
                <TableHead className="text-gray-400">Status</TableHead>
                <TableHead className="text-gray-400">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                    No leads found
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id} className="border-white/10 hover:bg-white/5">
                    <TableCell className="text-white">
                      {format(new Date(lead.timestamp || lead.created_date), 'MMM dd, HH:mm')}
                    </TableCell>
                    <TableCell className="text-white">
                      {lead.first_name} {lead.last_name}
                    </TableCell>
                    <TableCell className="text-gray-400">{lead.email}</TableCell>
                    <TableCell className="text-gray-400">{lead.phone}</TableCell>
                    <TableCell className="text-white">{lead.state}</TableCell>
                    <TableCell className="text-gray-400">{lead.source}</TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[lead.status]} border`}>
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-green-400 font-medium">
                      ${(lead.revenue || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
