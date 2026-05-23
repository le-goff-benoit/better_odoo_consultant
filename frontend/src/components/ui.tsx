import { Component, type ButtonHTMLAttributes, type ErrorInfo, type HTMLAttributes, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'muted'
type Size = 'sm' | 'md' | 'xs'

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}) {
  return (
    <button type={type} className={cx('ui-button', `ui-button-${variant}`, size !== 'md' && `ui-button-${size}`, className)} {...props}>
      {icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={cx('ui-icon-button', className)} aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}

export function Card({
  interactive,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div className={cx('ui-card', interactive && 'ui-card-interactive', className)} {...props}>
      {children}
    </div>
  )
}

export function Badge({
  tone = 'neutral',
  size = 'sm',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  size?: 'sm' | 'md'
}) {
  return (
    <span className={cx('ui-badge', `ui-badge-${tone}`, size === 'md' && 'ui-badge-md', className)} {...props}>
      {children}
    </span>
  )
}

export const Pill = Badge

export function StatusPill({
  tone,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone: 'ok' | 'warning' | 'error' | 'idle' | 'running'
}) {
  return (
    <span className={cx('ui-status-pill', `ui-status-${tone}`, className)} {...props}>
      <span className="ui-status-dot" />
      {children}
    </span>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      {children}
      {hint && <span className="ui-field-hint">{hint}</span>}
    </label>
  )
}

export function Modal({
  title,
  children,
  footer,
  onClose,
  width = 560,
  closeLabel = 'Fermer',
}: {
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  width?: number
  closeLabel?: string
}) {
  return (
    <div className="ui-modal-overlay" role="presentation">
      <div className="ui-modal" role="dialog" aria-modal="true" style={{ maxWidth: width }}>
        <div className="ui-modal-header">
          <h2>{title}</h2>
          <IconButton label={closeLabel} onClick={onClose}><X size={16} /></IconButton>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ id: T; label: ReactNode; icon?: ReactNode }>
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="ui-tabs" role="tablist">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={cx('ui-tab', value === item.id && 'is-active')}
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="ui-empty">
      {icon && <div className="ui-empty-icon">{icon}</div>}
      <div className="ui-empty-title">{title}</div>
      {description && <div className="ui-empty-description">{description}</div>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  )
}

export function Pending({ label }: { label?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
      padding: '40px 0', color: 'var(--th-muted)', fontSize: 13,
    }}>
      <Loader2 size={18} className="creator-spin" />
      {label}
    </div>
  )
}

interface ErrorBoundaryProps {
  fallback: (error: Error, reset: () => void) => ReactNode
  children: ReactNode
}

interface ErrorBoundaryState { error: Error | null }

/** Catches render errors in its subtree so a single bad component does not
 * crash the surrounding page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset)
    return this.props.children
  }
}
