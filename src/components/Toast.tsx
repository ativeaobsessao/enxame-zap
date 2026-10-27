import React, { useEffect } from 'react';

interface ToastProps {
  message: string | null;
  onClear: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, onClear }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        onClear();
      }, 3200);
      return () => clearTimeout(timer);
    }
  }, [message, onClear]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1d1d1f] text-white px-5 py-2.5 rounded-full text-[13px] font-semibold shadow-2xl z-50 flex items-center gap-2 animate-fade-in border border-white/10">
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      <span>{message}</span>
    </div>
  );
};
