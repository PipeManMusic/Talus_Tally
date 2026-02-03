import { Loader } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  fullScreen?: boolean;
}

const sizes = {
  sm: 24,
  md: 40,
  lg: 60,
};

export function LoadingSpinner({
  size = 'md',
  label,
  fullScreen = false,
}: LoadingSpinnerProps) {
  const content = (
    <div className="flex flex-col items-center gap-3">
      <Loader
        size={sizes[size]}
        className="text-accent-primary animate-spin"
      />
      {label && (
        <p className="text-fg-secondary font-body text-sm">{label}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
        {content}
      </div>
    );
  }

  return content;
}
