import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link as LinkIcon } from "lucide-react";

export default function IntegrationSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Integrations</h1>
        <p className="text-gray-400">Connect external services</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {['Google Calendar', 'Slack', 'Facebook Ads', 'WhatsApp'].map(integration => (
          <Card key={integration} className="glass-card border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <LinkIcon className="w-5 h-5" />
                {integration}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400 text-sm mb-4">
                Connect {integration} to sync data and automate workflows
              </p>
              <Button className="w-full bg-gradient-to-r from-[#00d4ff] to-[#a855f7]">
                Connect
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}