import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileJson } from "lucide-react";

export default function SchemaViewer({ config, open, onClose }) {
  if (!config) return null;

  const schema = config.detected_schema;
  const fields = schema?.fields || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glass-card border-white/10 max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileJson className="w-5 h-5 text-[#00d4ff]" />
            Schema: {config.name}
          </DialogTitle>
        </DialogHeader>

        {fields.length === 0 ? (
          <div className="text-center py-12">
            <FileJson className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-400">No schema detected yet</p>
            <p className="text-sm text-gray-500 mt-2">
              {config.sync_type === 'bigquery' 
                ? 'Click "Detect Schema" to analyze the BigQuery table'
                : 'Click "Parse Schema" to analyze the API response'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-400">
                {fields.length} field{fields.length !== 1 ? 's' : ''} detected
              </p>
              <Badge className="bg-[#00d4ff]/20 text-[#00d4ff] border-[#00d4ff]/30 border">
                {config.sync_type}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-white/5">
                    <TableHead className="text-gray-400">Field Name</TableHead>
                    <TableHead className="text-gray-400">Type</TableHead>
                    <TableHead className="text-gray-400">Mode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow key={index} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white font-mono text-sm">
                        {field.name}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 border">
                          {field.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {field.mode || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {config.sync_type === 'cloud_run' && schema.sample_record && (
              <div className="mt-6">
                <h4 className="text-white font-medium mb-2">Sample Record</h4>
                <pre className="glass-card border-white/10 p-4 rounded-lg overflow-x-auto text-sm text-gray-300">
                  {JSON.stringify(schema.sample_record, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}