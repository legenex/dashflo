const handleMetricReorder = (result) => {
    if (!result.destination) return;
    
    // Prevent reordering if dropped in the same position
    if (result.destination.index === result.source.index) return;
    
    const currentMetricIds = queryConfig.metric_ids || [];
    const items = Array.from(currentMetricIds);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Create a completely new queryConfig object to ensure re-render
    const newQueryConfig = {
      ...queryConfig,
      metric_ids: items
    };
    
    onChange(newQueryConfig);
  };