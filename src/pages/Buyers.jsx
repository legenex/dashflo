
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Search } from "lucide-react";

import WidgetRenderer from "../components/widgets/WidgetRenderer";

export default function Buyers() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'law_firm',
    email: '',
    phone: '',
    vertical_id: '',
    active: true
  });

  const { data: buyers, isLoading } = useQuery({
    queryKey: ['buyers'],
    queryFn: () => base44.entities.Buyer.list('-created_date'),
    initialData: [],
  });

  const { data: verticals } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.list(),
    initialData: [],
  });

  const { data: widgets } = useQuery({
    queryKey: ['buyers-widgets'],
    queryFn: async () => {
      const allWidgets = await base44.entities.Widget.filter({ enabled: true }, 'position');
      return allWidgets.filter(w =>
        (Array.isArray(w.dashboard_pages) && w.dashboard_pages.includes('Buyers')) ||
        w.dashboard_page === 'Buyers'
      );
    },
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Buyer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
      resetForm();
      setIsDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Buyer.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
      resetForm();
      setIsDialogOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Buyer.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'law_firm',
      email: '',
      phone: '',
      vertical_id: '',
      active: true
    });
    setEditingBuyer(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingBuyer) {
      updateMutation.mutate({ id: editingBuyer.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (buyer) => {
    setEditingBuyer(buyer);
    setFormData({
      name: buyer.name,
      type: buyer.type,
      email: buyer.email || '',
      phone: buyer.phone || '',
      vertical_id: buyer.vertical_id || '',
      active: buyer.active !== false // Ensure active is true unless explicitly false
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this buyer?')) {
      deleteMutation.mutate(id);
    }
  };

  const filteredBuyers = buyers.filter(buyer =>
    !searchTerm ||
    buyer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    buyer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Buyers</h1>
          <p className="text-gray-400">Manage buyer accounts and relationships</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => resetForm()}
              className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Buyer
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-white/10 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingBuyer ? 'Edit Buyer' : 'Add New Buyer'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Buyer name"
                    className="glass-card border-white/10 text-white"
                    required
                  />
                </div>
                <div>
                  <Label className="text-white">Type *</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                    <SelectTrigger className="glass-card border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      <SelectItem value="law_firm" className="text-white">Law Firm</SelectItem>
                      <SelectItem value="aggregator" className="text-white">Aggregator</SelectItem>
                      <SelectItem value="network" className="text-white">Network</SelectItem>
                      <SelectItem value="data_partner" className="text-white">Data Partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white">Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                    className="glass-card border-white/10 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white">Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="glass-card border-white/10 text-white"
                  />
                </div>
              </div>
              <div>
                <Label className="text-white">Vertical</Label>
                <Select value={formData.vertical_id} onValueChange={(v) => setFormData({ ...formData, vertical_id: v })}>
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue placeholder="Select vertical" />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    {verticals.map(v => (
                      <SelectItem key={v.id} value={v.vertical_id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="glass-card border-white/10 text-white">
                  Cancel
                </Button>
                <Button type="submit" className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]">
                  {editingBuyer ? 'Update' : 'Create'} Buyer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Widgets Section */}
      {widgets.length > 0 && (
        <div className="grid grid-cols-12 gap-6">
          {widgets.map((widget) => {
            const widthClass = {
              full: 'col-span-12',
              half: 'col-span-12 lg:col-span-6',
              third: 'col-span-12 sm:col-span-6 lg:col-span-4',
              quarter: 'col-span-12 lg:col-span-3',
              sixth: 'col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-2'
            }[widget.display_config?.width || 'full'];

            return (
              <div key={widget.id} className={widthClass}>
                <WidgetRenderer
                  widget={widget}
                  dateRange={{ start: '', end: '' }}
                  customFilters={[]}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Search */}
      <Card className="glass-card border-white/10">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search buyers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-card border-white/10 text-white pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Buyers Table */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">All Buyers ({filteredBuyers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading buyers...</div>
          ) : filteredBuyers.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No buyers found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-white/5">
                    <TableHead className="text-gray-400">Name</TableHead>
                    <TableHead className="text-gray-400">Type</TableHead>
                    <TableHead className="text-gray-400">Email</TableHead>
                    <TableHead className="text-gray-400">Phone</TableHead>
                    <TableHead className="text-gray-400">Status</TableHead>
                    <TableHead className="text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBuyers.map((buyer) => (
                    <TableRow key={buyer.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white font-medium">{buyer.name}</TableCell>
                      <TableCell>
                        <Badge className="bg-[#00d4ff]/20 text-[#00d4ff] border-[#00d4ff]/30 border">
                          {buyer.type?.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400">{buyer.email || '-'}</TableCell>
                      <TableCell className="text-gray-400">{buyer.phone || '-'}</TableCell>
                      <TableCell>
                        <Badge className={buyer.active ? "bg-green-500/20 text-green-400 border-green-500/30 border" : "bg-red-500/20 text-red-400 border-red-500/30 border"}>
                          {buyer.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(buyer)}
                            className="text-[#00d4ff] hover:bg-[#00d4ff]/20"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(buyer.id)}
                            className="text-red-400 hover:bg-red-500/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
