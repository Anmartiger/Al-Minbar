import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

export function SearchField({
  value, onChange, placeholder, disabled, label = 'Search', ...rest
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div className="searchfield" aria-disabled={disabled || undefined}>
      <Search size={15} strokeWidth={1.5} aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        {...rest}
      />
      {value && !disabled && (
        <button type="button" className="icon-btn" style={{ width: 22, height: 22 }}
          aria-label="Clear search" onClick={() => onChange('')}>
          <X size={13} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
