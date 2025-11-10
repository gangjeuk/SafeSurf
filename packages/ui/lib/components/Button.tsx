import { cn } from '../utils';
import type { ComponentPropsWithoutRef } from 'react';

export type ButtonProps = {
  theme?: 'light' | 'dark';
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
} & ComponentPropsWithoutRef<'button'>;

export function Button({ theme, variant = 'primary', className, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'rounded px-4 py-1 shadow transition-all',
        {
          // Primary variant
          'bg-blue-500 text-white hover:scale-105 hover:bg-blue-600':
            variant === 'primary' && !disabled && theme !== 'dark',
          'bg-blue-600 text-white hover:scale-105 hover:bg-blue-700':
            variant === 'primary' && !disabled && theme === 'dark',
          'cursor-not-allowed bg-gray-400 text-gray-600': variant === 'primary' && disabled,

          // Secondary variant
          'bg-gray-300 text-gray-800 hover:scale-105 hover:bg-gray-400': variant === 'secondary' && !disabled,
          'cursor-not-allowed bg-gray-100 text-gray-400': variant === 'secondary' && disabled,

          // Danger variant
          // Note: bg-red-400 causes the button to appear black (RGB 0,0,0) for unknown reasons
          // Using bg-red-500 with opacity to achieve a softer look
          'bg-red-600 bg-opacity-80 text-white hover:scale-105 hover:bg-red-700 hover:bg-opacity-90':
            variant === 'danger' && !disabled && theme !== 'dark',
          'bg-red-500 bg-opacity-70 text-white hover:scale-105 hover:bg-red-700 hover:bg-opacity-90':
            variant === 'danger' && !disabled && theme === 'dark',
          'cursor-not-allowed bg-red-300 bg-opacity-80 text-red-100': variant === 'danger' && disabled,
        },
        className,
      )}
      disabled={disabled}
      {...props}>
      {children}
    </button>
  );
}
