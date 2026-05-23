import type { ReactNode } from 'react'

/** Shared outer layout for Creator / Assistant / Migration.
 *
 * Slot-based: pages keep ownership of their own header (env/version selectors,
 * preflight banners, etc.) and their own composer JSX, but the outer grid,
 * spacing and class names are unified here so future style tweaks land in one
 * place.
 *
 * The shell renders:
 *
 *   <workspace-shell>
 *     {header}
 *     <workspace-main>
 *       <workspace-chat-panel>
 *         {children}      ← message list area
 *         {composer}
 *       </workspace-chat-panel>
 *       {contextPanel}    ← right sidebar (ConversationContextPanel)
 *       {historyPanel}    ← optional history side panel
 *     </workspace-main>
 *   </workspace-shell>
 *
 * CSS lives in theme.css under `.workspace-shell` (aliases the existing
 * `.assistant-main` / `.assistant-chat-panel` for visual parity). */
export interface WorkspaceShellProps {
  /** Top bar: env / version / company selectors, preflight banner, etc.
   * Rendered ABOVE the flex row, inside the outer flex column. */
  header?: ReactNode
  /** Message list / streaming output. */
  children: ReactNode
  /** Composer (textarea + send button + suggestions). Optional — Creator,
   * for example, has no traditional bottom composer (its interactions live in
   * modals + structured forms inside `children`). */
  composer?: ReactNode
  /** Right-hand conversation context panel. */
  contextPanel?: ReactNode
  /** Conditional history side panel (rendered after the context panel). */
  historyPanel?: ReactNode

  /** Page-specific class to merge into the outer shell wrapper. Lets the page
   * keep its bespoke styling (e.g. `migration-shell is-scrolled`) on top of
   * the shared `workspace-shell` skeleton. */
  className?: string
  /** Page-specific class to merge into the flex-row wrapper. Defaults to none —
   * pass `assistant-main` / `migration-content-row` etc. to keep existing CSS. */
  mainClassName?: string
  /** Page-specific class to merge into the chat panel wrapper. Pass the
   * existing per-page class (e.g. `creator-main-column`) to preserve layout. */
  chatClassName?: string
}

/**
 * Slot-based layout shared by Creator / Assistant / Migration. Pages keep
 * ownership of their bespoke styling via the *ClassName overrides — the shell
 * just provides the JSX skeleton + the shared `workspace-*` base classes.
 */
export default function WorkspaceShell({
  header, children, composer, contextPanel, historyPanel,
  className, mainClassName, chatClassName,
}: WorkspaceShellProps) {
  return (
    <div className={joinClasses('workspace-shell', className)}>
      {header}
      <div className={joinClasses('workspace-main', mainClassName)}>
        <div className={joinClasses('workspace-chat-panel', chatClassName)}>
          {children}
          {composer}
        </div>
        {contextPanel}
        {historyPanel}
      </div>
    </div>
  )
}

function joinClasses(...names: (string | undefined | null | false)[]): string {
  return names.filter(Boolean).join(' ')
}
