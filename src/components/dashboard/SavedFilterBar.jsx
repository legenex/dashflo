import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

export default function SavedFilterBar({ savedFilters, filterValues, onChange, onReorder }) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(savedFilters);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update positions
    const updatedItems = items.map((item, index) => ({
      ...item,
      position: index
    }));
    
    if (onReorder) {
      onReorder(updatedItems);
    }
  };

  const renderFilter = (filter, isDragging) => {
    const value = filterValues[filter.field] || filter.default_value || '';

    switch (filter.filter_type) {
      case 'text':
        return (
          <Input
            placeholder={filter.description || `Enter ${filter.name.toLowerCase()}`}
            value={value}
            onChange={(e) => onChange(filter.field, e.target.value, filter.operator)}
            className="glass-card border-white/10 text-white text-sm h-9"
          />
        );

      case 'dropdown':
        return (
          <Select
            value={value}
            onValueChange={(v) => onChange(filter.field, v, filter.operator)}
          >
            <SelectTrigger className="glass-card border-white/10 text-white text-sm h-9">
              <SelectValue placeholder={`Select`} />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10 text-white">
              <SelectItem value={null} className="text-white">All</SelectItem>
              {filter.options?.map(option => (
                <SelectItem key={option} value={option} className="text-white">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'multi_select':
        const selectedValues = value ? value.split(',').filter(v => v) : [];
        
        return (
          <div className="glass-card border-white/10 rounded-lg p-2">
            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {selectedValues.map(val => (
                  <Badge 
                    key={val} 
                    className="bg-[#00d4ff]/20 text-[#00d4ff] border-[#00d4ff]/30 flex items-center gap-1 text-xs px-1.5 py-0.5"
                  >
                    <span className="max-w-[60px] truncate">{val}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const newValues = selectedValues.filter(v => v !== val);
                        onChange(filter.field, newValues.join(','), 'in');
                      }}
                      className="hover:bg-[#00d4ff]/30 rounded-full p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            
            <Select
              onValueChange={(v) => {
                if (v && !selectedValues.includes(v)) {
                  const newValues = [...selectedValues, v];
                  onChange(filter.field, newValues.join(','), 'in');
                }
              }}
            >
              <SelectTrigger className="glass-card border-white/10 text-white text-sm h-8">
                <SelectValue placeholder={selectedValues.length > 0 ? `+Add more` : `Select`} />
              </SelectTrigger>
              <SelectContent className="glass-card border-white/10 text-white max-h-64 overflow-y-auto">
                {filter.options
                  ?.filter(option => !selectedValues.includes(option))
                  .map(option => (
                    <SelectItem key={option} value={option} className="text-white">
                      {option}
                    </SelectItem>
                  ))}
                {filter.options?.every(option => selectedValues.includes(option)) && (
                  <div className="p-2 text-center text-gray-400 text-xs">
                    All selected
                  </div>
                )}
              </SelectContent>
            </Select>
            
            {selectedValues.length === 0 && (
              <p className="text-[10px] text-gray-400 mt-1">
                No selections
              </p>
            )}
          </div>
        );

      case 'date_range':
        const [startDate, endDate] = value ? value.split('|') : ['', ''];
        return (
          <div className="flex gap-1">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onChange(filter.field, `${e.target.value}|${endDate}`, 'range')}
              className="glass-card border-white/10 text-white text-xs h-9"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onChange(filter.field, `${startDate}|${e.target.value}`, 'range')}
              className="glass-card border-white/10 text-white text-xs h-9"
            />
          </div>
        );

      case 'number_range':
        const [minVal, maxVal] = value ? value.split('|') : ['', ''];
        return (
          <div className="flex gap-1">
            <Input
              type="number"
              placeholder="Min"
              value={minVal}
              onChange={(e) => onChange(filter.field, `${e.target.value}|${maxVal}`, 'range')}
              className="glass-card border-white/10 text-white text-xs h-9"
            />
            <Input
              type="number"
              placeholder="Max"
              value={maxVal}
              onChange={(e) => onChange(filter.field, `${minVal}|${e.target.value}`, 'range')}
              className="glass-card border-white/10 text-white text-xs h-9"
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="filters" direction="horizontal">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex flex-wrap gap-3"
          >
            {savedFilters.map((filter, index) => (
              <Draggable key={filter.id} draggableId={filter.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={`flex-1 min-w-[150px] ${snapshot.isDragging ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
                      </div>
                      <Label className="text-white text-xs">{filter.name}</Label>
                    </div>
                    {renderFilter(filter, snapshot.isDragging)}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}