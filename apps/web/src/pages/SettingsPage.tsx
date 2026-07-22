import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function SettingsPage() {
  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Settings</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blaster Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">Profile management coming in Phase 4.</p>
        </CardContent>
      </Card>
    </div>
  );
}
