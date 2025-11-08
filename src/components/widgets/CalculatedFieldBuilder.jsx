import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export default function CalculatedFieldBuilder({ field, aggregations, onChange, onRemove }) {
  const [formulaParts, setFormulaParts] = useState([]);

  // Initialize formulaParts from field when component mounts or field changes
  useEffect(() => {
    if (field?.formula_parts) {
      setFormulaParts(field.formula_parts);
    }
  }, [field?.id]); // Only update when field id changes

  // Add safety check for field
  if (!field) {
    return null;
  }

  const availableFields = aggregations?.map(agg => agg.alias || `${agg.function}_${agg.field}`).filter(f => f) || [];
  
  const addFormulaPart = (type, value = '') => {
    const newParts = [...formulaParts, { type, value }];
    setFormulaParts(newParts);
    updateFormula(newParts);
  };

  const updateFormulaPart = (index, value) => {
    const newParts = [...formulaParts];
    newParts[index].value = value;
    setFormulaParts(newParts);
    updateFormula(newParts);
  };

  const removeFormulaPart = (index) => {
    const newParts = formulaParts.filter((_, i) => i !== index);
    setFormulaParts(newParts);
    updateFormula(newParts);
  };

  const updateFormula = (parts) => {
    const formulaString = parts.map(part => {
      if (part.type === 'field') {
        return `{${part.value}}`;
      } else if (part.type === 'operator') {
        return ` ${part.value} `;
      } else {
        return part.value;
      }
    }).join('');

    const updatedField = {
      ...field,
      formula_parts: parts,
      formula: formulaString.trim()
    };
    
    onChange(updatedField);
  };

  const handleFormatChange = (newFormat) => {
    const updatedField = {
      ...field,
      format: newFormat
    };
    onChange(updatedField);
  };

  const handleNameChange = (newName) => {
    const updatedField = {
      ...field,
      name: newName
    };
    onChange(updatedField);
  };

  const handleVisibleChange = (newVisible) => {
    const updatedField = {
      ...field,
      visible: newVisible
    };
    onChange(updatedField);
  };

  const renderFormula = () => {
    return formulaParts.map((part, index) => {
      if (part.type === 'field') {
        return (
          <div key={index} className="flex items-center gap-1">
            <Select value={part.value} onValueChange={(v) => updateFormulaPart(index, v)}>
              <SelectTrigger className="glass-card border-white/10 text-white w-32">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent className="glass-card border-white/10 text-white">
                {availableFields.map(f => (
                  <SelectItem key={f} value={f} className="text-white">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeFormulaPart(index)}
              className="h-8 w-8 text-red-400 hover:bg-red-500/20"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );
      } else if (part.type === 'operator') {
        return (
          <div key={index} className="flex items-center gap-1">
            <Badge className="bg-[#a855f7]/20 text-[#a855f7] border-[#a855f7]/30 text-lg px-3 py-1">
              {part.value}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeFormulaPart(index)}
              className="h-8 w-8 text-red-400 hover:bg-red-500/20"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );
      } else {
        return (
          <div key={index} className="flex items-center gap-1">
            <Input
              type="number"
              value={part.value}
              onChange={(e) => updateFormulaPart(index, e.target.value)}
              className="glass-card border-white/10 text-white w-20"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeFormulaPart(index)}
              className="h-8 w-8 text-red-400 hover:bg-red-500/20"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );
      }
    });
  };

  return (
    <div className="p-4 glass-card border-white/10 rounded-lg space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-white text-xs">Field Name *</Label>
          <Input
            placeholder="e.g., Profit Margin"
            value={field.name || ''}
            onChange={(e) => handleNameChange(e.target.value)}
            className="glass-card border-white/10 text-white"
          />
        </div>

        <div>
          <Label className="text-white text-xs">Display Format</Label>
          <Select 
            value={field.format || 'number'}
            onValueChange={handleFormatChange}
          >
            <SelectTrigger className="glass-card border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10 text-white">
              <SelectItem value="number" className="text-white">Number (1,234)</SelectItem>
              <SelectItem value="currency" className="text-white">Currency ($1,234.56)</SelectItem>
              <SelectItem value="percentage" className="text-white">Percentage (12.34%)</SelectItem>
              <SelectItem value="text" className="text-white">Plain Text</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1 flex items-center justify-between">
            <Label className="text-white text-xs">Show on Dashboard</Label>
            <Switch
              checked={field.visible !== false}
              onCheckedChange={handleVisibleChange}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="text-red-400 hover:bg-red-500/20"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-white text-sm mb-2 block">Build Formula</Label>
          <div className="flex flex-wrap items-center gap-2 p-3 glass-card border-white/10 rounded-lg min-h-[60px]">
            {formulaParts.length === 0 ? (
              <p className="text-gray-400 text-sm">Click buttons below to build your formula</p>
            ) : (
              renderFormula()
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addFormulaPart('field', '')}
            className="glass-card border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10"
          >
            <Plus className="w-3 h-3 mr-1" />
            Field
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addFormulaPart('number', '0')}
            className="glass-card border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/10"
          >
            <Plus className="w-3 h-3 mr-1" />
            Number
          </Button>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addFormulaPart('operator', '+')}
              className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
            >
              +
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addFormulaPart('operator', '-')}
              className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
            >
              −
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addFormulaPart('operator', '*')}
              className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
            >
              ×
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addFormulaPart('operator', '/')}
              className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
            >
              ÷
            </Button>
          </div>
        </div>

        {formulaParts.length > 0 && (
          <div className="p-2 bg-white/5 rounded text-xs">
            <span className="text-gray-400">Formula: </span>
            <code className="text-[#00d4ff]">
              {formulaParts.map(p => p.type === 'field' ? `{${p.value}}` : p.type === 'operator' ? ` ${p.value} ` : p.value).join('')}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}