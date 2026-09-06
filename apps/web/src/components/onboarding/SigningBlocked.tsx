// The HARD stop of profile completion: a licensed role with no license on
// file cannot sign a log or a shot. Shown in place of the signature controls.
import { Link } from 'react-router-dom';
import { IdCard } from 'lucide-react';

export function SigningBlocked({ what = 'this log' }: { what?: string }) {
  return (
    <div
      className="rounded-lg border border-orange-300 bg-orange-50 p-3 flex items-start gap-3"
      data-signing-blocked
    >
      <IdCard className="h-5 w-5 text-safety-orange shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-semibold text-gray-900">Add your blasting license before signing {what}</p>
        <p className="text-gray-600 mt-0.5">
          Sign-off carries your license number. It takes a minute on{' '}
          <Link to="/profile" className="text-safety-orange underline underline-offset-2 font-medium">
            My Profile
          </Link>{' '}
          and then follows you to every device.
        </p>
      </div>
    </div>
  );
}
