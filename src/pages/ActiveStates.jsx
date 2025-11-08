import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Map, Pause, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ActiveStates() {
  const queryClient = useQueryClient();
  const [selectedState, setSelectedState] = useState(null);
  const [pauseDialog, setPauseDialog] = useState(false);

  const { data: states, isLoading } = useQuery({
    queryKey: ['active-states'],
    queryFn: () => base44.entities.ActiveState.list(),
    initialData: [],
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }) =>
      base44.entities.ActiveState.update(id, { 
        status,
        pause_date: status === 'paused' ? new Date().toISOString() : null
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-states'] });
      setPauseDialog(false);
      alert("State status updated successfully");
    },
    onError: (error) => {
      alert("Error updating state: " + error.message);
    }
  });

  const handleToggleState = (state) => {
    setSelectedState(state);
    setPauseDialog(true);
  };

  const confirmToggle = () => {
    const newStatus = selectedState.status === 'active' ? 'paused' : 'active';
    toggleStatusMutation.mutate({ id: selectedState.id, status: newStatus });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Active States</h1>
        <p className="text-gray-400">Manage state availability and performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm mb-1">Active States</p>
                <p className="text-3xl font-bold text-white">
                  {states.filter(s => s.status === 'active').length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-green-600 bg-opacity-20">
                <Map className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm mb-1">Paused States</p>
                <p className="text-3xl font-bold text-white">
                  {states.filter(s => s.status === 'paused').length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 bg-opacity-20">
                <Pause className="w-6 h-6 text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm mb-1">Total Leads</p>
                <p className="text-3xl font-bold text-white">
                  {states.reduce((sum, s) => sum + (s.total_leads || 0), 0).toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 bg-opacity-20">
                <Map className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">State Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-gray-400">State Code</TableHead>
                  <TableHead className="text-gray-400">State Name</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Total Leads</TableHead>
                  <TableHead className="text-gray-400">Conversion Rate</TableHead>
                  <TableHead className="text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {states.map((state) => (
                  <TableRow key={state.id} className="border-white/10 hover:bg-white/5">
                    <TableCell className="text-white font-mono">{state.state_code}</TableCell>
                    <TableCell className="text-white font-medium">{state.state_name}</TableCell>
                    <TableCell>
                      <Badge className={
                        state.status === 'active' 
                          ? "bg-green-500/20 text-green-400 border-green-500/30 border"
                          : state.status === 'paused'
                          ? "bg-orange-500/20 text-orange-400 border-orange-500/30 border"
                          : "bg-red-500/20 text-red-400 border-red-500/30 border"
                      }>
                        {state.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-white">{state.total_leads || 0}</TableCell>
                    <TableCell className="text-green-400">
                      {(state.conversion_rate || 0).toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleState(state)}
                        className={state.status === 'active' ? "text-orange-400 hover:bg-orange-500/20" : "text-green-400 hover:bg-green-500/20"}
                      >
                        {state.status === 'active' ? (
                          <>
                            <Pause className="w-4 h-4 mr-2" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Activate
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={pauseDialog} onOpenChange={setPauseDialog}>
        <DialogContent className="glass-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">
              {selectedState?.status === 'active' ? 'Pause' : 'Activate'} State
            </DialogTitle>
          </DialogHeader>
          <div className="text-gray-400">
            Are you sure you want to {selectedState?.status === 'active' ? 'pause' : 'activate'} {selectedState?.state_name}? 
            {selectedState?.status === 'active' && " Notifications will be sent to suppliers."}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseDialog(false)} className="glass-card border-white/10 text-white">
              Cancel
            </Button>
            <Button
              onClick={confirmToggle}
              className={selectedState?.status === 'active' ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700"}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}