import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function Verticals() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [editingVertical, setEditingVertical] = useState(null);
  const [formData, setFormData] = useState({
    vertical_id: '',
    name: '',
    description: '',
    active: true
  });

  const { data: verticals, isLoading } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.list(),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vertical.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verticals'] });
      setDialog(false);
      resetForm();
      alert("Vertical created successfully");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vertical.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verticals'] });
      setDialog(false);
      resetForm();
      alert("Vertical updated successfully");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Vertical.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verticals'] });
      alert("Vertical deleted");
    }
  });

  const resetForm = () => {
    setFormData({ vertical_id: '', name: '', description: '', active: true });
    setEditingVertical(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingVertical) {
      updateMutation.mutate({ id: editingVertical.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (vertical) => {
    setEditingVertical(vertical);
    setFormData({
      vertical_id: vertical.vertical_id,
      name: vertical.name,
      description: vertical.description || '',
      active: vertical.active
    });
    setDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Verticals</h1>
          <p className="text-gray-400">Manage vertical categories</p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setDialog(true);
          }}
          className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Vertical
        </Button>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">All Verticals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-gray-400">Vertical ID</TableHead>
                  <TableHead className="text-gray-400">Name</TableHead>
                  <TableHead className="text-gray-400">Description</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {verticals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                      No verticals found
                    </TableCell>
                  </TableRow>
                ) : (
                  verticals.map((vertical) => (
                    <TableRow key={vertical.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white font-mono">{vertical.vertical_id}</TableCell>
                      <TableCell className="text-white font-medium">{vertical.name}</TableCell>
                      <TableCell className="text-gray-400">{vertical.description || '-'}</TableCell>
                      <TableCell>
                        <Badge className={vertical.active ? "bg-green-500/20 text-green-400 border-green-500/30 border" : "bg-red-500/20 text-red-400 border-red-500/30 border"}>
                          {vertical.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(vertical)}
                            className="text-blue-400 hover:bg-blue-500/20"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this vertical?')) {
                                deleteMutation.mutate(vertical.id);
                              }
                            }}
                            className="text-red-400 hover:bg-red-500/20"
                          >
                            <Trash2 className="w-4 h-4" />
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

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="glass-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingVertical ? 'Edit Vertical' : 'Add New Vertical'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-white">Vertical ID</Label>
              <Input
                value={formData.vertical_id}
                onChange={(e) => setFormData({ ...formData, vertical_id: e.target.value })}
                placeholder="e.g., LF1, WC1"
                className="glass-card border-white/10 text-white"
                required
              />
            </div>
            <div>
              <Label className="text-white">Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Vertical name"
                className="glass-card border-white/10 text-white"
                required
              />
            </div>
            <div>
              <Label className="text-white">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Vertical description"
                className="glass-card border-white/10 text-white"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(false)} className="glass-card border-white/10 text-white">
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]">
                {editingVertical ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}