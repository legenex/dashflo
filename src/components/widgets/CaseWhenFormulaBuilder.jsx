import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function CaseWhenFormulaBuilder({
  caseStatements = [],
  elseExpression = '',
  availableFields = [],
  onChange
}) {
  const addWhenClause = () => {
    const newStatements = [
      ...caseStatements,
      {
        when_condition: {
          field: '',
          operator: 'equals',
          value: ''
        },
        then_expression: ''
      }
    ];
    onChange({ caseStatements: newStatements, elseExpression });
  };

  const removeWhenClause = (index) => {
    const newStatements = caseStatements.filter((_, i) => i !== index);
    onChange({ caseStatements: newStatements, elseExpression });
  };

  const updateWhenCondition = (index, key, value) => {
    const newStatements = [...caseStatements];
    newStatements[index].when_condition[key] = value;
    onChange({ caseStatements: newStatements, elseExpression });
  };

  const updateThenExpression = (index, value) => {
    const newStatements = [...caseStatements];
    newStatements[index].then_expression = value;
    onChange({ caseStatements: newStatements, elseExpression });
  };

  const updateElseExpression = (value) => {
    onChange({ caseStatements, elseExpression: value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300">
          <p className="font-semibold mb-1">CASE WHEN Logic</p>
          <p className="text-xs text-blue-400">
            Define conditions that check your data and return different values. The first matching WHEN condition will be used. 
            If no condition matches, the ELSE expression is returned.
          </p>
        </div>
      </div>

      {/* WHEN Clauses */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-white">WHEN Conditions</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addWhenClause}
            className="glass-card border-white/10 text-white"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add WHEN
          </Button>
        </div>

        {caseStatements.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-white/10 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">No WHEN conditions yet</p>
            <p className="text-xs text-gray-500 mb-3">
              Add conditions to check against your data
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addWhenClause}
              className="glass-card border-white/10 text-white"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add First WHEN Clause
            </Button>
          </div>
        ) : (
          caseStatements.map((statement, index) => (
            <Card key={index} className="glass-card border-white/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                    WHEN #{index + 1}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeWhenClause(index)}
                    className="text-red-400 hover:bg-red-500/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Condition */}
                <div className="space-y-2">
                  <Label className="text-white text-xs">When this condition is true:</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <Select
                        value={statement.when_condition.field}
                        onValueChange={(v) => updateWhenCondition(index, 'field', v)}
                      >
                        <SelectTrigger className="glass-card border-white/10 text-white">
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent className="glass-card border-white/10 max-h-64">
                          {availableFields.map(field => (
                            <SelectItem key={field} value={field} className="text-white">
                              {field}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Select
                        value={statement.when_condition.operator}
                        onValueChange={(v) => updateWhenCondition(index, 'operator', v)}
                      >
                        <SelectTrigger className="glass-card border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="glass-card border-white/10">
                          <SelectItem value="equals" className="text-white">Equals (=)</SelectItem>
                          <SelectItem value="not_equals" className="text-white">Not Equals (≠)</SelectItem>
                          <SelectItem value="greater_than" className="text-white">Greater Than (&gt;)</SelectItem>
                          <SelectItem value="less_than" className="text-white">Less Than (&lt;)</SelectItem>
                          <SelectItem value="greater_or_equal" className="text-white">Greater or Equal (≥)</SelectItem>
                          <SelectItem value="less_or_equal" className="text-white">Less or Equal (≤)</SelectItem>
                          <SelectItem value="contains" className="text-white">Contains</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Input
                        placeholder="Value"
                        value={statement.when_condition.value}
                        onChange={(e) => updateWhenCondition(index, 'value', e.target.value)}
                        className="glass-card border-white/10 text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* THEN Expression */}
                <div className="space-y-2">
                  <Label className="text-white text-xs">Then return this value:</Label>
                  <Textarea
                    placeholder="e.g., Net Profit - Payout"
                    value={statement.then_expression}
                    onChange={(e) => updateThenExpression(index, e.target.value)}
                    className="glass-card border-white/10 text-white font-mono text-sm"
                    rows={2}
                  />
                  <p className="text-xs text-gray-400">
                    You can use field names and basic math: +, -, *, /, ( )
                  </p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ELSE Expression */}
      <div className="space-y-2">
        <Label className="text-white">ELSE (Default Value)</Label>
        <Textarea
          placeholder="e.g., Net Profit (returned when no WHEN condition matches)"
          value={elseExpression}
          onChange={(e) => updateElseExpression(e.target.value)}
          className="glass-card border-white/10 text-white font-mono text-sm"
          rows={2}
        />
        <p className="text-xs text-gray-400">
          This value is returned when none of the WHEN conditions are true
        </p>
      </div>

      {/* Preview */}
      {caseStatements.length > 0 && (
        <div className="p-3 glass-card border-[#00d4ff]/30 rounded-lg">
          <Label className="text-[#00d4ff] text-xs mb-2 block">Preview:</Label>
          <div className="font-mono text-xs text-white space-y-1">
            <div className="text-purple-400">CASE</div>
            {caseStatements.map((stmt, idx) => (
              <div key={idx} className="ml-4">
                <span className="text-purple-400">WHEN</span>{' '}
                <span className="text-green-400">{stmt.when_condition.field || '?'}</span>{' '}
                <span className="text-blue-400">{stmt.when_condition.operator || '='}</span>{' '}
                <span className="text-yellow-400">'{stmt.when_condition.value || '?'}'</span>{' '}
                <span className="text-purple-400">THEN</span>{' '}
                <span className="text-white">{stmt.then_expression || '?'}</span>
              </div>
            ))}
            <div className="ml-4">
              <span className="text-purple-400">ELSE</span>{' '}
              <span className="text-white">{elseExpression || '?'}</span>
            </div>
            <div className="text-purple-400">END</div>
          </div>
        </div>
      )}
    </div>
  );
}