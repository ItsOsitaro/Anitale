// Tarhak @tarhak/number-ticker (https://tarhak.ir) — adapted to plain JSX
// Spring counter with fa-IR Persian digits by default; reduced-motion safe.
import { useEffect, useRef } from 'react';
import { useInView, useMotionValue, useSpring } from 'motion/react';
import { cn } from '@/lib/utils';

const formatNumber = (value, decimalPlaces, locale) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(Number(value.toFixed(decimalPlaces)));

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function NumberTicker({
  value,
  startValue = 0,
  direction = 'up',
  delay = 0,
  className,
  decimalPlaces = 0,
  locale = 'fa-IR',
  ...props
}) {
  const ref = useRef(null);
  const initial = direction === 'down' ? value : startValue;
  const target = direction === 'down' ? startValue : value;
  const motionValue = useMotionValue(initial);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: '0px' });

  useEffect(() => {
    let timer = null;
    if (!isInView) return;
    if (prefersReducedMotion()) {
      motionValue.set(target);
      if (ref.current) ref.current.textContent = formatNumber(target, decimalPlaces, locale);
      return;
    }
    timer = setTimeout(() => motionValue.set(target), delay * 1000);
    return () => { if (timer !== null) clearTimeout(timer); };
  }, [motionValue, isInView, delay, target, decimalPlaces, locale]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      if (!ref.current) return;
      ref.current.textContent = formatNumber(latest, decimalPlaces, locale);
    });
    return unsubscribe;
  }, [springValue, decimalPlaces, locale]);

  return (
    <span
      ref={ref}
      dir="ltr"
      className={cn('inline-block tabular-nums text-foreground tracking-normal', className)}
      {...props}
    >
      {formatNumber(initial, decimalPlaces, locale)}
    </span>
  );
}

export default NumberTicker;
