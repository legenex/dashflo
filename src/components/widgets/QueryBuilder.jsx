<DragDropContext onDragEnd={handleMetricReorder}>
              <Droppable droppableId="metrics" type="METRIC">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2"
                  >
                    {selectedMetrics.map((metric, index) => (
                      <Draggable 
                        key={`metric-${metric.id}`} 
                        draggableId={`metric-${metric.id}`} 
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-3 p-3 rounded glass-card border-purple-500/30 ${
                              snapshot.isDragging ? 'opacity-50 shadow-lg' : ''
                            }`}
                          >
                            <div
                              {...provided.dragHandleProps}
                              className="cursor-grab active:cursor-grabbing flex-shrink-0"
                            >
                              <GripVertical className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium truncate">{metric.name}</span>
                                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 flex-shrink-0">
                                  {metric.type}
                                </Badge>
                              </div>
                              {metric.description && (
                                <p className="text-gray-400 text-xs mt-1 truncate">{metric.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditMetric(metric.id);
                                }}
                                className="text-[#00d4ff] hover:bg-[#00d4ff]/20"
                                title="Edit metric"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeMetric(metric.id);
                                }}
                                className="text-red-400 hover:bg-red-500/20"
                                title="Remove metric"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>