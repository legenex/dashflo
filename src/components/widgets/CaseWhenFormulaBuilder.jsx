import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, AlertCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function CaseWhenFormulaBuilder({
  caseStatements = [],
  elseExpression = '',
  availableFields = [],
  onChange
}) {
  const [expandedThenBuilder, setExpandedThenBuilder] = useState({});
  const [showElseBuilder, setShowElseBuilder] = useState(false);

  const addWhenClause = () => {
    const newStatements = [
      ...caseStatements,
      {
        when_condition: {
          field: '',
          operator: 'equals',
          value: '',
          value_type: 'static'
        },
        then_expression: ''
      }
    ];
    onChange({ caseStatements: newStatements, elseExpression });
  };

  const removeWhenClause = (index) => {
    const newStatements = caseStatements.filter((_, i) => i !== index);
    const newExpanded = { ...expandedThenBuilder };
    delete newExpanded[index];
    setExpandedThenBuilder(newExpanded);
    onChange({ caseStatements: newStatements, elseExpression });
  };

  const updateWhenCondition = (index, key, value) => {
    const newStatements = [...caseStatements];
    newStatements[index].when_condition[key] = value;
    
    if (key === 'value_type') {
      newStatements[index].when_condition.value = '';
    }
    
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

  const appendToThenExpression = (index, text) => {
    const currentExpr = caseStatements[index].then_expression || '';
    updateThenExpression(index, currentExpr + text);
  };

  const appendToElseExpression = (text) => {
    const currentExpr = elseExpression || '';
    updateElseExpression(currentExpr + text);
  };

  const toggleThenBuilder = (index) => {
    setExpandedThenBuilder({
      ...expandedThenBuilder,
      [index]: !expandedThenBuilder[index]
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300">
          <p className="font-semibold mb-1">CASE WHEN Logic</p>
          <p className="text-xs text-blue-400">
            Define conditions that check your data and return different values. The first matching WHEN condition will be used. 
            If no condition matches, the ELSE expression is returned. You can compare against static values or other fields.
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
          caseStatements.map((statement, index) => {
            const valueType = statement.when_condition.value_type || 'static';
            const isThenBuilderExpanded = expandedThenBuilder[index];
            
            return (
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
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div>
                        <Select
                          value={statement.when_condition.field}
                          onValueChange={(v) => updateWhenCondition(index, 'field', v)}
                        >
                          <SelectTrigger className="glass-card border-white/10 text-white">
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent className="glass-card border-white/10 max-h-64">
                            {availableFields.length === 0 ? (
                              <div className="p-2 text-center text-gray-400 text-xs">
                                No fields available
                              </div>
                            ) : (
                              availableFields.map(field => (
                                <SelectItem key={field} value={field} className="text-white">
                                  {field}
                                </SelectItem>
                              ))
                            )}
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
                        <Select
                          value={valueType}
                          onValueChange={(v) => updateWhenCondition(index, 'value_type', v)}
                        >
                          <SelectTrigger className="glass-card border-white/10 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="glass-card border-white/10">
                            <SelectItem value="static" className="text-white">Static Value</SelectItem>
                            <SelectItem value="field" className="text-white">Field Reference</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        {valueType === 'field' ? (
                          <Select
                            value={statement.when_condition.value}
                            onValueChange={(v) => updateWhenCondition(index, 'value', v)}
                          >
                            <SelectTrigger className="glass-card border-white/10 text-white">
                              <SelectValue placeholder="Select field" />
                            </SelectTrigger>
                            <SelectContent className="glass-card border-white/10 max-h-64">
                              {availableFields.length === 0 ? (
                                <div className="p-2 text-center text-gray-400 text-xs">
                                  No fields available
                                </div>
                              ) : (
                                availableFields.map(field => (
                                  <SelectItem key={field} value={field} className="text-white">
                                    {field}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            placeholder="Value"
                            value={statement.when_condition.value}
                            onChange={(e) => updateWhenCondition(index, 'value', e.target.value)}
                            className="glass-card border-white/10 text-white"
                          />
                        )}
                      </div>
                    </div>
                    {valueType === 'field' && (
                      <p className="text-xs text-gray-400">
                        💡 Comparing field "{statement.when_condition.field}" with field "{statement.when_condition.value}"
                      </p>
                    )}
                  </div>

                  {/* THEN Expression */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-white text-xs">Then return this value:</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleThenBuilder(index)}
                        className="text-[#00d4ff] hover:bg-[#00d4ff]/10 text-xs h-7"
                      >
                        {isThenBuilderExpanded ? 'Hide' : 'Show'} Builder
                      </Button>
                    </div>
                    
                    <Textarea
                      placeholder="e.g., {Net Profit} - {Payout} or just a field name like {Revenue}"
                      value={statement.then_expression}
                      onChange={(e) => updateThenExpression(index, e.target.value)}
                      className="glass-card border-white/10 text-white font-mono text-sm"
                      rows={2}
                    />

                    {isThenBuilderExpanded && (
                      <div className="space-y-2 p-3 glass-card border-[#00d4ff]/30 rounded-lg">
                        <p className="text-xs text-gray-400">Click to add to formula:</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Show field selector
                              const field = prompt('Select or type field name:', availableFields[0] || '');
                              if (field) appendToThenExpression(index, `{${field}}`);
                            }}
                            className="glass-card border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Field
                          </Button>
                          
                          {/* Field Shortcuts */}
                          {availableFields.slice(0, 5).map(field => (
                            <Button
                              key={field}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => appendToThenExpression(index, `{${field}}`)}
                              className="glass-card border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10 text-xs"
                            >
                              {field}
                            </Button>
                          ))}
                          
                          {availableFields.length > 5 && (
                            <Select onValueChange={(v) => appendToThenExpression(index, `{${v}}`)}>
                              <SelectTrigger className="glass-card border-[#00d4ff]/30 text-[#00d4ff] w-32 h-8">
                                <SelectValue placeholder="More fields..." />
                              </SelectTrigger>
                              <SelectContent className="glass-card border-white/10 max-h-64">
                                {availableFields.slice(5).map(field => (
                                  <SelectItem key={field} value={field} className="text-white">
                                    {field}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => appendToThenExpression(index, ' + ')}
                            className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
                          >
                            +
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => appendToThenExpression(index, ' - ')}
                            className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
                          >
                            −
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => appendToThenExpression(index, ' * ')}
                            className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
                          >
                            ×
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => appendToThenExpression(index, ' / ')}
                            className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
                          >
                            ÷
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => appendToThenExpression(index, '(')}
                            className="glass-card border-white/10 text-white hover:bg-white/10 px-3"
                          >
                            (
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => appendToThenExpression(index, ')')}
                            className="glass-card border-white/10 text-white hover:bg-white/10 px-3"
                          >
                            )
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => updateThenExpression(index, '')}
                            className="glass-card border-red-500/30 text-red-400 hover:bg-red-500/20"
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    <p className="text-xs text-gray-400">
                      Use {`{Field Name}`} to reference fields, or combine with math: +, -, *, /, ( )
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ELSE Expression */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-white">ELSE (Default Value)</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowElseBuilder(!showElseBuilder)}
            className="text-[#00d4ff] hover:bg-[#00d4ff]/10 text-xs h-7"
          >
            {showElseBuilder ? 'Hide' : 'Show'} Builder
          </Button>
        </div>
        
        <Textarea
          placeholder="e.g., {Net Profit} (returned when no WHEN condition matches)"
          value={elseExpression}
          onChange={(e) => updateElseExpression(e.target.value)}
          className="glass-card border-white/10 text-white font-mono text-sm"
          rows={2}
        />

        {showElseBuilder && (
          <div className="space-y-2 p-3 glass-card border-[#00d4ff]/30 rounded-lg">
            <p className="text-xs text-gray-400">Click to add to formula:</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const field = prompt('Select or type field name:', availableFields[0] || '');
                  if (field) appendToElseExpression(`{${field}}`);
                }}
                className="glass-card border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10"
              >
                <Plus className="w-3 h-3 mr-1" />
                Field
              </Button>
              
              {availableFields.slice(0, 5).map(field => (
                <Button
                  key={field}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendToElseExpression(`{${field}}`)}
                  className="glass-card border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10 text-xs"
                >
                  {field}
                </Button>
              ))}
              
              {availableFields.length > 5 && (
                <Select onValueChange={(v) => appendToElseExpression(`{${v}}`)}>
                  <SelectTrigger className="glass-card border-[#00d4ff]/30 text-[#00d4ff] w-32 h-8">
                    <SelectValue placeholder="More fields..." />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10 max-h-64">
                    {availableFields.slice(5).map(field => (
                      <SelectItem key={field} value={field} className="text-white">
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendToElseExpression(' + ')}
                className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
              >
                +
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendToElseExpression(' - ')}
                className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
              >
                −
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendToElseExpression(' * ')}
                className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
              >
                ×
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendToElseExpression(' / ')}
                className="glass-card border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 px-3"
              >
                ÷
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendToElseExpression('(')}
                className="glass-card border-white/10 text-white hover:bg-white/10 px-3"
              >
                (
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendToElseExpression(')')}
                className="glass-card border-white/10 text-white hover:bg-white/10 px-3"
              >
                )
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateElseExpression('')}
                className="glass-card border-red-500/30 text-red-400 hover:bg-red-500/20"
              >
                Clear
              </Button>
            </div>
          </div>
        )}
        
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
            {caseStatements.map((stmt, idx) => {
              const valueType = stmt.when_condition.value_type || 'static';
              const displayValue = valueType === 'field' 
                ? `{${stmt.when_condition.value || '?'}}` 
                : `'${stmt.when_condition.value || '?'}'`;
              
              return (
                <div key={idx} className="ml-4">
                  <span className="text-purple-400">WHEN</span>{' '}
                  <span className="text-green-400">{stmt.when_condition.field || '?'}</span>{' '}
                  <span className="text-blue-400">{stmt.when_condition.operator || '='}</span>{' '}
                  <span className={valueType === 'field' ? 'text-green-400' : 'text-yellow-400'}>
                    {displayValue}
                  </span>{' '}
                  <span className="text-purple-400">THEN</span>{' '}
                  <span className="text-white">{stmt.then_expression || '?'}</span>
                </div>
              );
            })}
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