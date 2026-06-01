'use client';

import { useEffect } from 'react';
import { AlertCircle, CheckCircle, InfoIcon, X } from 'lucide-react';

interface AlertModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  type?: 'error' | 'warning' | 'info' | 'success';
}

export function AlertModal({ isOpen, title, message, onClose, type = 'error' }: AlertModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const typeStyles = {
    error: {
      icon: AlertCircle,
      iconColor: 'text-red-600',
      titleColor: 'text-red-900',
      borderColor: 'border-red-200',
      buttonColor: 'bg-red-600 hover:bg-red-700 focus:ring-red-300',
      accentBg: 'bg-red-50/80',
    },
    warning: {
      icon: AlertCircle,
      iconColor: 'text-yellow-600',
      titleColor: 'text-yellow-900',
      borderColor: 'border-yellow-200',
      buttonColor: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-300',
      accentBg: 'bg-yellow-50/80',
    },
    info: {
      icon: InfoIcon,
      iconColor: 'text-blue-600',
      titleColor: 'text-blue-900',
      borderColor: 'border-blue-200',
      buttonColor: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-300',
      accentBg: 'bg-blue-50/80',
    },
    success: {
      icon: CheckCircle,
      iconColor: 'text-green-600',
      titleColor: 'text-green-900',
      borderColor: 'border-green-200',
      buttonColor: 'bg-green-600 hover:bg-green-700 focus:ring-green-300',
      accentBg: 'bg-green-50/80',
    },
  };

  const styles = typeStyles[type];
  const IconComponent = styles.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: 'rgba(0, 0, 0, 0.25)' }}>
      <div
        className={`w-full max-w-sm rounded-2xl border shadow-2xl transition-all ${styles.borderColor} ${styles.accentBg}`}
        style={{
          background: `linear-gradient(135deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-alt) 84%, var(--app-accent) 16%) 100%)`,
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 ${styles.iconColor}`}>
              <IconComponent className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              {title && (
                <h2 className={`${styles.titleColor} text-lg font-bold mb-2`}>
                  {title}
                </h2>
              )}
              <p className={`${styles.titleColor} text-sm opacity-85 leading-relaxed`}>
                {message}
              </p>
            </div>
            <button
              onClick={onClose}
              className={`${styles.iconColor} flex-shrink-0 ml-4 hover:opacity-70 transition-opacity focus:outline-none`}
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6">
            <button
              onClick={onClose}
              className={`${styles.buttonColor} w-full rounded-lg px-4 py-2.5 font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
