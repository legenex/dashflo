// Get selected metrics in order
  const selectedMetrics = React.useMemo(() => {
    const metricIds = queryConfig.metric_ids || [];
    return metricIds
      .map(id => libraryMetrics.find(m => m.id === id))
      .filter(Boolean);
  }, [queryConfig.metric_ids, libraryMetrics]);