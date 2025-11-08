import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, CheckCircle } from "lucide-react";

const statusColors = {
  connected: "bg-green-500/20 text-green-400 border-green-500/30",
  offline: "bg-red-500/20 text-red-400 border-red-500/30",
  error: "bg-orange-500/20 text-orange-400 border-orange-500/30"
};

export default function Sources() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'facebook',
    api_key: '',
    status: 'offline',
    active: true
  });

  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: () => base44.entities.Source.list(),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Source.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setDialog(false);
      resetForm();
      alert("Source created successfully");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Source.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setDialog(false);
      resetForm();
      alert("Source updated successfully");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Source.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      alert("Source deleted");
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'facebook',
      api_key: '',
      status: 'offline',
      active: true
    });
    setEditingSource(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingSource) {
      updateMutation.mutate({ id: editingSource.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (source) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      type: source.type,
      api_key: source.api_key || '',
      status: source.status,
      active: source.active
    });
    setDialog(true);
  };

  const testConnection = (source) => {
    alert("Testing connection... This would test the API connection in production");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Sources</h1>
          <p className="text-gray-400">Manage lead sources and integrations</p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setDialog(true);
          }}
          className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Source
        </Button>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">All Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-gray-400">Name</TableHead>
                  <TableHead className="text-gray-400">Type</TableHead>
                  <TableHead className="text-gray-400">API Key</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Active</TableHead>
                  <TableHead className="text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                      No sources found
                    </TableCell>
                  </TableRow>
                ) : (
                  sources.map((source) => (
                    <TableRow key={source.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white font-medium">{source.name}</TableCell>
                      <TableCell className="text-gray-400 capitalize">{source.type}</TableCell>
                      <TableCell className="text-gray-400 font-mono">
                        {source.api_key ? `${source.api_key.substring(0, 10)}...` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusColors[source.status]} border`}>
                          {source.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={source.active ? "bg-green-500/20 text-green-400 border-green-500/30 border" : "bg-red-500/20 text-red-400 border-red-500/30 border"}>
                          {source.active ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => testConnection(source)}
                            className="text-green-400 hover:bg-green-500/20"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(source)}
                            className="text-blue-400 hover:bg-blue-500/20"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this source?')) {
                                deleteMutation.mutate(source.id);
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
              {editingSource ? 'Edit Source' : 'Add New Source'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-white">Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Source name"
                className="glass-card border-white/10 text-white"
                required
              />
            </div>
            <div>
              <Label className="text-white">Type</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10">
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="organic">Organic</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white">API Key</Label>
              <Input
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                placeholder="Enter API key"
                className="glass-card border-white/10 text-white"
                type="password"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(false)} className="glass-card border-white/10 text-white">
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]">
                {editingSource ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}