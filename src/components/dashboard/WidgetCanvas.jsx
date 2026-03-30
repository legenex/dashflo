import React, { useMemo, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GripVertical, Pencil, X } from "lucide-react";
import MetricCardWidget from "./widgets/MetricCardWidget";
import StatBarWidget from "./widgets/StatBarWidget";
import TableWidget from "./widgets/TableWidget";
import ChartWidget from "./widgets/ChartWidget";
import { aggregateRows } from "../../utils/metricUtils";

const COL_SPAN_CLASS = { 1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4' };
const ROW_HEIGHT_PX = { compact: 160, default: 260, tall: 420 };
const ROW_HEIGHT_KEYS = ['compact', 'default', 'tall'];

function ResizeHandle({ widget, onResize }) {
  const startRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      colSpan: widget.col_span || 2,
      rowHeight: widget.row_height || 'default',
    };
    setDragging(true);

    const handleMouseUp = (e) => {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      // ~300px per column snap
      const colDelta = Math.round(dx / 250);
      const newCol = Math.min(4, Math.max(1, startRef.current.colSpan + colDelta));
      // height snaps
      const curHeightIdx = ROW_HEIGHT_KEYS.indexOf(startRef.current.rowHeight);
      const heightDelta = Math.round(dy / 120);
      const newHeightIdx = Math.min(2, Math.max(0, curHeightIdx + heightDelta));
      const newHeight = ROW_HEIGHT_KEYS[newHeightIdx];
      onResize(newCol, newHeight);
      setDragging(false);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`absolute bottom-1 right-1 z-30 w-5 h-5 cursor-se-resize flex items-center justify-center rounded ${
        dragging ? 'bg-[#00d4ff]/40' : 'bg-white/10 hover:bg-[#00d4ff]/40'
      } transition-colors`}
      title="Drag to resize"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1 7L7 1M4 7L7 4M7 7L7 7" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

function WidgetWrapper({ widget, editMode, onEdit, onRemove, onResize, children }) {
  return (
    <div className={`relative ${editMode ? 'outline-dashed outline-2 outline-white/20 rounded-xl' : ''}`}>
      {editMode && (
        <>
          <div className="absolute top-2 right-2 flex gap-1 z-20">
            <Button size="icon" variant="ghost" onClick={onEdit} className="h-6 w-6 text-[#00d4ff] hover:bg-[#00d4ff]/20"><Pencil className="w-3 h-3" /></Button>
            <Button size="icon" variant="ghost" onClick={onRemove} className="h-6 w-6 text-red-400 hover:bg-red-500/20"><X className="w-3 h-3" /></Button>
          </div>
          <ResizeHandle widget={widget} onResize={onResize} />
        </>
      )}
      {children}
    </div>
  );
}

export default function WidgetCanvas({
  widgets, metrics, layout, dataSource, dateRange, customFilters,
  currentDailyData, priorDailyData,
  editMode, onDragEnd, onEditWidget, onRemoveWidget, onResizeWidget
}) {
  const currentTotals = React.useMemo(() => aggregateRows(currentDailyData, metrics), [currentDailyData, metrics]);
  const priorTotals   = React.useMemo(() => aggregateRows(priorDailyData,   metrics), [priorDailyData,   metrics]);

  function renderWidgetContent(widget) {
    const type = widget.type;
    const heightPx = ROW_HEIGHT_PX[widget.row_height || 'default'];
    const heightStyle = { minHeight: `${heightPx}px` };
    const effectiveDataSource = widget.data_source || dataSource;

    if (type === 'stat_bar') {
      return <StatBarWidget widget={widget} metrics={metrics} totals={currentTotals} />;
    }

    if (type === 'metric_card') {
      const [fid] = widget.metric_ids || [];
      const metric = metrics.find(m => m.field_id === fid);
      return (
        <div style={heightStyle}>
          <MetricCardWidget
            widget={widget}
            metric={metric}
            currentValue={currentTotals[fid]}
            priorValue={priorTotals[fid]}
            dailyData={currentDailyData}
          />
        </div>
      );
    }

    if (type === 'table') {
      return (
        <Card className="glass-card border-white/10" style={heightStyle}>
          {widget.title && (
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-white text-sm font-bold uppercase tracking-wide">{widget.title}</CardTitle>
            </CardHeader>
          )}
          <CardContent className="p-0">
            <TableWidget
              widget={widget}
              metrics={metrics}
              dataSource={effectiveDataSource}
              dateRange={dateRange}
              customFilters={customFilters}
            />
          </CardContent>
        </Card>
      );
    }

    if (['line_chart', 'bar_chart', 'area_chart', 'combo_chart'].includes(type)) {
      return (
        <Card className="glass-card border-white/10" style={heightStyle}>
          {widget.title && (
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-white text-sm font-bold uppercase tracking-wide">{widget.title}</CardTitle>
            </CardHeader>
          )}
          <CardContent className="p-4">
            <ChartWidget
              widget={widget}
              metrics={metrics}
              dataSource={effectiveDataSource}
              dateRange={dateRange}
              customFilters={customFilters}
            />
          </CardContent>
        </Card>
      );
    }

    return <div className="glass-card border-white/10 rounded-lg p-4 text-gray-500 text-sm">Unknown widget type: {type}</div>;
  }

  if (!editMode) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {widgets.map(w => (
          <motion.div key={w.id} layout className={`${COL_SPAN_CLASS[w.col_span || 2]}`}>
            {renderWidgetContent(w)}
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="overview-canvas">
        {provided => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-4 gap-4">
            {widgets.map((w, idx) => (
              <Draggable key={w.id} draggableId={w.id} index={idx}>
                {(drag, snap) => (
                  <div
                    ref={drag.innerRef}
                    {...drag.draggableProps}
                    className={`${COL_SPAN_CLASS[w.col_span || 2]} ${snap.isDragging ? 'opacity-60 z-50' : ''}`}
                    style={drag.draggableProps.style}
                  >
                    <WidgetWrapper widget={w} editMode={editMode} onEdit={() => onEditWidget(w)} onRemove={() => onRemoveWidget(w.id)} onResize={(col, height) => onResizeWidget(w.id, col, height)}>
                      {/* Drag handle */}
                      <div
                        {...drag.dragHandleProps}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 opacity-0 group-hover:opacity-100 cursor-grab hidden"
                      />
                      <div
                        {...drag.dragHandleProps}
                        className="absolute bottom-2 left-2 z-20 text-gray-600 hover:text-gray-300 cursor-grab"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                      {renderWidgetContent(w)}
                    </WidgetWrapper>
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