import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
  id: string;
  variant?: ToastVariant;
  message: string;
  duration?: number; // Auto-dismiss duration in ms (0 = no auto-dismiss)
  onDismiss?: (id: string) => void;
}

const variants = {
  info: {
    bg: 'bg-blue-600/10',
    border: 'border-blue-600',
    icon: Info,
    iconColor: 'text-blue-500',
  },
  success: {
    bg: 'bg-status-success/10',
    border: 'border-status-success',
    icon: CheckCircle,
    iconColor: 'text-status-success',
  },
  warning: {
    bg: 'bg-status-warning/10',
    border: 'border-status-warning',
    icon: AlertCircle,
    iconColor: 'text-status-warning',
  },
  error: {
    bg: 'bg-status-danger/10',
    border: 'border-status-danger',
    icon: AlertCircle,
    iconColor: 'text-status-danger',
  },
};

export function Toast({
  id,
  variant = 'info',
  message,
  duration = 4000,
  onDismiss,
}: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const style = variants[variant];
  const Icon = style.icon;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => onDismiss?.(id), 300); // Wait for exit animation
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, id, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss?.(id), 300);
  };

  return (
    <div
      className={`
        ${style.bg} border ${style.border} rounded-sm shadow-lg
        px-4 py-3 flex items-start gap-3 min-w-[320px] max-w-[480px]
        transition-all duration-300 ease-in-out
        ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
    >
      <Icon size={18} className={`flex-shrink-0 mt-0.5 ${style.iconColor}`} />
      <div className="flex-1 text-sm text-fg-primary whitespace-pre-wrap">
        {message}
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-fg-secondary hover:text-fg-primary transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export interface ToastContainerProps {
  toasts: ToastProps[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast {...toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
