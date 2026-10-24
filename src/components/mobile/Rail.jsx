import { cn } from 'cn';

export default function Rail({ children, className }) {
  return <div className={cn('mobile-rail', className)}>{children}</div>;
}
