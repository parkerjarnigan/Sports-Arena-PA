import { Lock, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { checkAdminPassword } from '../utils/soundboardLogic';

interface AdminPasswordModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminPasswordModal({ open, onClose, onSuccess }: AdminPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setPassword('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Enter the admin password.');
      return;
    }
    if (!checkAdminPassword(password)) {
      setError('Incorrect password. Please try again.');
      return;
    }
    onSuccess();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0F13]/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
    >
      <div className="w-full max-w-sm bg-[#1D252D] border border-[#313D49] rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#862633]/35 border border-[#862633] flex items-center justify-center text-[#FFCD00]">
              <Lock className="w-4 h-4" />
            </div>
            <h2 id="admin-modal-title" className="font-display text-2xl font-bold text-white">
              Unlock Editing
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close password modal"
            className="min-h-[36px] min-w-[36px] rounded-lg text-[#9EA2A2] hover:text-white hover:bg-[#26303A] inline-flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-[#9EA2A2] mb-4 leading-relaxed">
          Enter the admin password to add, edit, or delete sound pads and categories for this browser session.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-password-input" className="block text-xs font-semibold text-[#E2E5E8] mb-1.5">
              Admin Password
            </label>
            <input
              ref={inputRef}
              id="admin-password-input"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter password"
              className="w-full h-11 px-3.5 rounded-lg bg-[#12171D] border border-[#313D49] text-white placeholder-[#9EA2A2]/60 text-sm focus:outline-none focus:border-[#FFCD00]"
            />
            {error && (
              <p className="mt-1.5 text-xs font-medium text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-lg bg-[#26303A] hover:bg-[#313D49] text-[#F5F6F7] text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-lg bg-[#862633] hover:bg-[#9E2D3C] text-white text-sm font-semibold cursor-pointer"
            >
              Unlock Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
