import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";

export default function CompanySettings() {
  const [formData, setFormData] = useState({
    company_name: '',
    company_logo: ''
  });
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const user = await base44.auth.me();
    setFormData({
      company_name: user.company_name || '',
      company_logo: user.company_logo || ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await base44.auth.updateMe(formData);
    setSaveMessage('Company settings updated');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Company Settings</h1>
        <p className="text-gray-400">Manage your company information</p>
      </div>

      {saveMessage && (
        <div className="glass-card border-green-500/30 bg-green-500/10 p-4 rounded-lg">
          <p className="text-green-400">{saveMessage}</p>
        </div>
      )}

      <Card className="glass-card border-white/10 max-w-2xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Company Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-white">Company Name</Label>
              <Input
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="Your company name"
                className="glass-card border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-white">Company Logo URL</Label>
              <Input
                value={formData.company_logo}
                onChange={(e) => setFormData({ ...formData, company_logo: e.target.value })}
                placeholder="https://..."
                className="glass-card border-white/10 text-white"
              />
            </div>
            <Button type="submit" className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]">
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}