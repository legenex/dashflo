import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, Download, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SyncedDataViewer({ config, open, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 50;

  const { data: rawData, isLoading, error, refetch } = useQuery({
    queryKey: ['synced-data', config?.id],
    queryFn: async () => {
      if (!config) return [];
      
      // Fetch data using the fetchWidgetData function
      const { data } = await base44.functions.invoke('fetchWidgetData', {
        data_source: config.local_table_name || config.name,
        query_config: {
          limit: 1000
        }
      });
      
      return data || [];
    },
    enabled: open && !!config,
    initialData: [],
  });

  if (!config) return null;

  // Filter data based on search term
  const filteredData = rawData.filter(row => {
    if (!searchTerm) return true;
    return Object.values(row).some(val => 
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredData.length / recordsPerPage);
  const startIdx = (currentPage - 1) * recordsPerPage;
  const endIdx = startIdx + recordsPerPage;
  const paginatedData = filteredData.slice(startIdx, endIdx);

  // Get all column names
  const columns = rawData.length > 0 ? Object.keys(rawData[0]).filter(key => !key.startsWith('_metadata')) : [];

  const handleExport = () => {
    const csv = [
      columns.join(','),
      ...filteredData.map(row => 
        columns.map(col => {
          const val = row[col];
          const escaped = String(val || '').replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name}_data.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glass-card border-white/10 max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">Synced Data: {config.name}</div>
              <div className="text-sm text-gray-400 font-normal mt-1">
                Showing {filteredData.length.toLocaleString()} records
                {searchTerm && ` (filtered from ${rawData.length.toLocaleString()})`}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex gap-3 items-center py-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search across all fields..."
              className="glass-card border-white/10 text-white pl-10"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => refetch()}
            className="glass-card border-white/10 text-white"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            className="glass-card border-white/10 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto glass-card border-white/10 rounded-lg">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="w-8 h-8 text-[#00d4ff] animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <p className="text-red-400 mb-2">Error loading data</p>
                <p className="text-gray-400 text-sm">{error.message}</p>
              </div>
            </div>
          ) : rawData.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <p className="text-gray-400 mb-2">No data synced yet</p>
                <p className="text-gray-500 text-sm">Run a sync to see data here</p>
              </div>
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <p className="text-gray-400 mb-2">No results found</p>
                <p className="text-gray-500 text-sm">Try a different search term</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 glass-card z-10">
                <TableRow className="border-white/10">
                  {columns.map((col) => (
                    <TableHead key={col} className="text-gray-400 font-semibold">
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((row, idx) => (
                  <TableRow key={idx} className="border-white/10 hover:bg-white/5">
                    {columns.map((col) => {
                      const value = row[col];
                      const displayValue = value === null || value === undefined 
                        ? <span className="text-gray-500 italic">null</span>
                        : typeof value === 'boolean'
                        ? <Badge className={value ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                            {String(value)}
                          </Badge>
                        : typeof value === 'object'
                        ? <span className="text-gray-400 font-mono text-xs">{JSON.stringify(value)}</span>
                        : <span className="text-white">{String(value)}</span>;
                      
                      return (
                        <TableCell key={col} className="max-w-xs truncate">
                          {displayValue}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between py-4 border-t border-white/10">
            <div className="text-gray-400 text-sm">
              Showing {startIdx + 1}-{Math.min(endIdx, filteredData.length)} of {filteredData.length}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="glass-card border-white/10 text-white"
              >
                Previous
              </Button>
              <div className="flex gap-1">
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`glass-card border-white/10 ${
                        currentPage === pageNum 
                          ? 'bg-[#00d4ff]/20 text-[#00d4ff] border-[#00d4ff]/30' 
                          : 'text-white'
                      }`}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="glass-card border-white/10 text-white"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}