import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function CalculatedFieldModal({ field, availableFields, onSave, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    field_id: '',
    formula: '',
    format: 'currency',
    aggregation: 'avg'
  });

  useEffect(() => {
    if (field) {
      setFormData({
        name: field.name || '',
        field_id: field.field_id || field.name?.toLowerCase().replace(/\s/g, '_') || '',
        formula: field.formula || '',
        format: field.format || 'currency',
        aggregation: field.aggregation || 'avg'
      });
    } else {
      setFormData({
        name: '',
        field_id: '',
        formula: '',
        format: 'currency',
        aggregation: 'avg'
      });
    }
  }, [field]);

  const handleSave = () => {
    if (!formData.name || !formData.formula) {
      alert("Please fill in field name and formula");
      return;
    }

    const fieldId = formData.field_id || formData.name.toLowerCase().replace(/\s/g, '_');

    onSave({
      name: formData.name,
      field_id: fieldId,
      formula: formData.formula,
      formula_type: 'simple',
      format: formData.format,
      aggregation: formData.aggregation,
      visible: true
    });
  };

  const convertToJS = () => {
    // Simple conversion helper
    let jsFormula = formData.formula;
    jsFormula = jsFormula.replace(/\bCPL\b/gi, 'row.cpl');
    jsFormula = jsFormula.replace(/\bSold\b/gi, '"Sold"');
    jsFormula = jsFormula.replace(/===\s*'([^']+)'/g, '=== "$1"');
    setFormData({ ...formData, formula: jsFormula });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-[#1a1a3e] border border-white/10 rounded-lg w-full max-w-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Edit Calculated Field</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-white text-sm mb-1 block">Field Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., True CPL"
                className="glass-card border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-white text-sm mb-1 block">Field ID</Label>
              <Input
                value={formData.field_id}
                onChange={(e) => setFormData({ ...formData, field_id: e.target.value })}
                placeholder="e.g., true_cpl"
                className="glass-card border-white/10 text-white"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-white text-sm">Formula</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={convertToJS}
                className="text-xs glass-card border-white/10 text-white h-7"
              >
                Convert SQL to JS
              </Button>
            </div>
            <Textarea
              value={formData.formula}
              onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
              placeholder="Status === 'Sold' ? CPL : null"
              className="glass-card border-white/10 text-white font-mono h-32 bg-[#0f0f23] resize-none"
              style={{ fontFamily: 'Monaco, Consolas, monospace' }}
            />
            <p className="text-xs text-gray-400 mt-2">
              Use JavaScript expressions. Type to see available fields. Examples: CPL / Sold, Revenue - Cost, Status === "Active" ? 1 : 0
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Or use SQL syntax like "SUM(CPL)/Sold" and click "Convert SQL to JS" button.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-white text-sm mb-1 block">Type</Label>
              <Select value={formData.format} onValueChange={(v) => setFormData({ ...formData, format: v })}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10">
                  <SelectItem value="number" className="text-white">Number</SelectItem>
                  <SelectItem value="currency" className="text-white">Currency</SelectItem>
                  <SelectItem value="percentage" className="text-white">Percentage</SelectItem>
                  <SelectItem value="text" className="text-white">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white text-sm mb-1 block">Default Aggregation</Label>
              <Select value={formData.aggregation} onValueChange={(v) => setFormData({ ...formData, aggregation: v })}>
                <SelectTrigger className="glass-card border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card border-white/10">
                  <SelectItem value="avg" className="text-white">Average</SelectItem>
                  <SelectItem value="sum" className="text-white">Sum</SelectItem>
                  <SelectItem value="count" className="text-white">Count</SelectItem>
                  <SelectItem value="min" className="text-white">Min</SelectItem>
                  <SelectItem value="max" className="text-white">Max</SelectItem>
                  <SelectItem value="first" className="text-white">First</SelectItem>
                  <SelectItem value="last" className="text-white">Last</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            className="glass-card border-white/10 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-black text-white hover:bg-black/80"
          >
            Update
          </Button>
        </div>
      </div>
    </div>
  );
}