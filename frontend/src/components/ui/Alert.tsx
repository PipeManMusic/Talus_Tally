import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  message: string;
  onClose?: () => void;
}

const variants = {
  info: {
    bg: 'bg-bg-dark',
    border: 'border-blue-600',
    icon: Info,
    iconColor: 'text-blue-500',
  },
  success: {
    bg: 'bg-bg-dark',
    border: 'border-status-success',
    icon: CheckCircle,
    iconColor: 'text-status-success',
  },
  warning: {
    bg: 'bg-bg-dark',
    border: 'border-status-warning',
    icon: AlertTriangle,
    iconColor: 'text-status-warning',
  },
  error: {
    bg: 'bg-bg-dark',
    border: 'border-status-danger',
    icon: AlertCircle,
    iconColor: 'text-status-danger',
  },
};

export function Alert({
  variant = 'info',
  title,
  message,
  onClose,
}: AlertProps) {
  const style = variants[variant];
  const Icon = style.icon;

  return (
    <div className={`${style.bg} border ${style.border} rounded-sm p-3 flex gap-3`}>
      <Icon size={20} className={`flex-shrink-0 mt-0.5 ${style.iconColor}`} />
      <div className="flex-1">
        {title && <div className="font-semibold text-fg-primary text-sm mb-1">{title}</div>}
        <div className="text-fg-secondary text-sm">{message}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-fg-secondary hover:text-fg-primary transition-colors flex-shrink-0"
          aria-label="Close alert"
        >
          ✕
        </button>
      )}
    </div>
  );
}
