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
import { Plus, Pencil, Trash2 } from "lucide-react";

const supplierTypeColors = {
  internal_media_buyer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  internal_affiliate: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  external_affiliate: "bg-orange-500/20 text-orange-400 border-orange-500/30"
};

export default function Suppliers() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [formData, setFormData] = useState({
    supplier_id: '',
    name: '',
    type: 'internal_media_buyer',
    contact: '',
    commission_rate: 0,
    active: true
  });

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Supplier.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setDialog(false);
      resetForm();
      setSaveMessage("Supplier created successfully");
      setTimeout(() => setSaveMessage(''), 3000);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Supplier.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setDialog(false);
      resetForm();
      setSaveMessage("Supplier updated successfully");
      setTimeout(() => setSaveMessage(''), 3000);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setSaveMessage("Supplier deleted");
      setTimeout(() => setSaveMessage(''), 3000);
    }
  });

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      name: '',
      type: 'internal_media_buyer',
      contact: '',
      commission_rate: 0,
      active: true
    });
    setEditingSupplier(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      supplier_id: supplier.supplier_id || '',
      name: supplier.name,
      type: supplier.type,
      contact: supplier.contact || '',
      commission_rate: supplier.commission_rate || 0,
      active: supplier.active
    });
    setDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Suppliers</h1>
          <p className="text-gray-400">Manage supplier accounts and affiliates</p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setDialog(true);
          }}
          className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {saveMessage && (
        <div className="glass-card border-green-500/30 bg-green-500/10 p-4 rounded-lg">
          <p className="text-green-400">{saveMessage}</p>
        </div>
      )}

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
                  <TableHead className="text-gray-400">Contact</TableHead>
                  <TableHead className="text-gray-400">Commission</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                      No suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  suppliers.map((supplier) => (
                    <TableRow key={supplier.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white font-mono">{supplier.supplier_id || supplier.id}</TableCell>
                      <TableCell className="text-white font-medium">{supplier.name}</TableCell>
                      <TableCell>
                        <Badge className={`${supplierTypeColors[supplier.type]} border`}>
                          {supplier.type?.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400">{supplier.contact || '-'}</TableCell>
                      <TableCell className="text-white">{supplier.commission_rate || 0}%</TableCell>
                      <TableCell>
                        <Badge className={supplier.active ? "bg-green-500/20 text-green-400 border-green-500/30 border" : "bg-red-500/20 text-red-400 border-red-500/30 border"}>
                          {supplier.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(supplier)}
                            className="text-blue-400 hover:bg-blue-500/20"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(supplier.id)}
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
              {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-white">Supplier ID</Label>
                <Input
                  value={formData.supplier_id}
                  onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                  placeholder="SUP001"
                  className="glass-card border-white/10 text-white"
                />
              </div>
              <div>
                <Label className="text-white">Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger className="glass-card border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="internal_media_buyer">Internal Media Buyer</SelectItem>
                    <SelectItem value="internal_affiliate">Internal Affiliate</SelectItem>
                    <SelectItem value="external_affiliate">External Affiliate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-white">Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Supplier name"
                className="glass-card border-white/10 text-white"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-white">Contact</Label>
                <Input
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  placeholder="contact@example.com"
                  className="glass-card border-white/10 text-white"
                />
              </div>
              <div>
                <Label className="text-white">Commission Rate (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.commission_rate}
                  onChange={(e) => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) })}
                  className="glass-card border-white/10 text-white"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(false)} className="glass-card border-white/10 text-white">
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]">
                {editingSupplier ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}