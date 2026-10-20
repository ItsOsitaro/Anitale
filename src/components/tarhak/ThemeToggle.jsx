// Tarhak @tarhak/theme-toggle (https://tarhak.ir) — physical rocker switch,
// adapted to be a controlled light/dark switch for the site header.
import { cn } from '@/lib/utils';

const ease = 'ease-[cubic-bezier(0.32,0.72,0,1)]';

export function ThemeToggle({ checked, onChange, className, ariaLabel }) {
  const wrapCheckedClass = checked ? 'from-[#23202b] to-[#343041]' : 'from-[#d5d5d5] to-[#e8e8e8]';
  const containerClass = checked
    ? 'bg-[#1c1420] shadow-[inset_0_0.0625em_0.125em_rgb(0_0_0/0.75)]'
    : 'bg-[#e8e8e8] shadow-[inset_0_0.0625em_0.125em_rgb(0_0_0/0.4)]';
  const buttonClass = checked
    ? 'bg-[#c9c2d4] shadow-[inset_0_-0.0625em_0.0625em_0.125em_rgb(0_0_0/0.16),inset_0_-0.125em_0.0625em_rgb(0_0_0/0.22),inset_0_0.1875em_0.0625em_rgb(255_255_255/0.5),0_0.125em_0.125em_rgb(0_0_0/0.45)]'
    : 'bg-[#e8e8e8] shadow-[inset_0_-0.0625em_0.0625em_0.125em_rgb(0_0_0/0.1),inset_0_-0.125em_0.0625em_rgb(0_0_0/0.2),inset_0_0.1875em_0.0625em_rgb(255_255_255/0.3),0_0.125em_0.125em_rgb(0_0_0/0.5)]';
  const circleClass = checked
    ? 'bg-[radial-gradient(circle_at_50%_0,#efe9f7,#6f6484)]'
    : 'bg-[radial-gradient(circle_at_50%_0,#f5f5f5,#c4c4c4)]';

  return (
    <span className={cn('relative inline-flex items-center justify-center', className)}>
      <span
        className={cn(
          'relative inline-flex items-center justify-center p-[0.125em] rounded-[0.5em] bg-gradient-to-b',
          wrapCheckedClass,
          checked ? 'shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_1px_1px_rgb(0_0_0/0.5)]' : 'shadow-[0_1px_1px_rgb(255_255_255/0.6)]',
        )}
        style={{ fontSize: '0.6875rem' }}
      >
        <input
          aria-label={ariaLabel}
          checked={checked}
          onChange={(event) => onChange?.(event.target.checked)}
          className="peer absolute inset-0 z-[1] h-full w-full cursor-pointer appearance-none rounded-[inherit] opacity-0"
          type="checkbox"
        />
        <span className={cn(`relative flex h-[1.5em] w-[3em] items-center rounded-[0.375em] transition-[background-color] duration-400 ${ease}`, containerClass)}>
          <span
            className={cn(`absolute left-[0.0625em] flex h-[1.375em] w-[1.375em] items-center justify-center rounded-[0.3125em] transition-transform duration-[220ms] motion-reduce:duration-[120ms] will-change-transform ${ease}`, buttonClass)}
            data-toggle-button
          >
            <span className="grid absolute mx-auto grid-cols-[repeat(3,min-content)] gap-[0.125em]">
              {Array.from({ length: 12 }).map((_, index) => (
                <span className={cn('h-[0.125em] w-[0.125em] rounded-full', circleClass)} key={index} />
              ))}
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}

export default ThemeToggle;
