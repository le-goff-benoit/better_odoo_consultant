import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ActionProposals from './ActionProposals'
import Markdown, { extractActionItems, parseMarkdownTable, splitMarkdownTableRow } from './Markdown'

vi.mock('./MermaidBlock', () => ({
  default: ({ code }: { code: string }) => <div data-testid="mermaid-block">{code}</div>,
}))

describe('Markdown table parsing', () => {
  it('keeps empty cells and escaped pipes', () => {
    expect(splitMarkdownTableRow('| Module | Note | Empty |')).toEqual(['Module', 'Note', 'Empty'])
    expect(splitMarkdownTableRow('| sale | foo \\| bar |  |')).toEqual(['sale', 'foo | bar', ''])
  })

  it('parses alignment and normalizes row width', () => {
    const table = parseMarkdownTable([
      '| Module | Count | Ratio |',
      '| :--- | ---: | :---: |',
      '| sale | 12 | 60% |',
      '| account |  |',
    ])

    expect(table).toEqual({
      headers: ['Module', 'Count', 'Ratio'],
      aligns: ['left', 'right', 'center'],
      dataRows: [
        ['sale', '12', '60%'],
        ['account', '', ''],
      ],
    })
  })

  it('renders pipe-less markdown tables and inline markdown in cells', () => {
    const { container } = render(
      <Markdown text={[
        'Module | Statut | Note',
        '--- | :---: | ---',
        'sale | **OK** | `sale.order`',
      ].join('\n')} />,
    )

    expect(container.querySelectorAll('table')).toHaveLength(1)
    expect(container.querySelector('strong')?.textContent).toBe('OK')
    expect(container.querySelector('code')?.textContent).toBe('sale.order')
  })

  it('renders Mermaid fences with MermaidBlock', () => {
    render(
      <Markdown text={[
        '```mermaid',
        'flowchart TD',
        '  A --> B',
        '```',
      ].join('\n')} />,
    )

    expect(screen.getByTestId('mermaid-block').textContent).toContain('flowchart TD')
  })

  it('extracts action items from next-action and next-step headings', () => {
    expect(extractActionItems([
      '3 prochaines actions maximum',
      '1. Je vérifie le **bouton d’impression** côté Projet.',
      '2. Je liste les champs `x_studio` visibles.',
    ].join('\n'))).toEqual([
      'Je vérifie le bouton d’impression côté Projet.',
      'Je liste les champs x_studio visibles.',
    ])

    expect(extractActionItems([
      '## Prochaines étapes',
      '- Vérifier la configuration du profil.',
      '- Relancer le diagnostic.',
    ].join('\n'))).toEqual([
      'Vérifier la configuration du profil.',
      'Relancer le diagnostic.',
    ])

    expect(extractActionItems([
      '**Next steps**',
      '- Inspect the Odoo log.',
    ].join('\n'))).toEqual(['Inspect the Odoo log.'])
  })

  it('runs extracted action proposals as follow-up prompts', () => {
    const onPromptAction = vi.fn()
    render(
      <ActionProposals
        items={['Je vérifie le **bouton d’impression** côté Projet.', 'Je liste les champs x_studio visibles.']}
        onPromptAction={onPromptAction}
      />,
    )

    const buttons = screen.getAllByLabelText('Lancer cette action')
    expect(buttons).toHaveLength(2)

    fireEvent.click(buttons[0])
    expect(onPromptAction).toHaveBeenCalledWith(expect.stringContaining("Je vérifie le bouton d’impression côté Projet."))
    expect(onPromptAction).toHaveBeenCalledWith(expect.stringContaining("Utilise les outils nécessaires"))
  })

  it('does not extract ordinary numbered lists as actions', () => {
    expect(extractActionItems([
      'Étapes réalisées',
      '1. Lecture du rapport.',
      '2. Synthèse.',
    ].join('\n'))).toEqual([])
  })

  it('regression 0.99.3 — recognises indented sub-bullets as list items', () => {
    // Pre-fix, the LLM produced «   - Sub-item » (2 spaces +
    // hyphen) for nested bullets and the regex anchored at `^[-*]` missed
    // them. They fell into the <p> renderer and showed up as literal
    // "- Sub-item" text instead of bullets.
    const { container } = render(
      <Markdown
        text={[
          '- **Top item** :',
          '  - sub item 1',
          '  - sub item 2',
        ].join('\n')}
      />,
    )
    // Both top and sub items should be present in the rendered DOM as
    // bullets, not as literal "- " text inside <p>.
    expect(container.querySelectorAll('p').length).toBe(0)
    expect(container.textContent).toContain('Top item')
    expect(container.textContent).toContain('sub item 1')
    expect(container.textContent).toContain('sub item 2')
    // The literal "- " prefix must NOT appear in the rendered text.
    expect(container.textContent).not.toMatch(/-\s+sub item/)
  })

  it('regression 0.99.3 — 4-space-indented sub-bullets also render properly', () => {
    const { container } = render(
      <Markdown
        text={[
          '- Parent',
          '    - Deep child',
        ].join('\n')}
      />,
    )
    expect(container.querySelectorAll('p').length).toBe(0)
    expect(container.textContent).toContain('Deep child')
    expect(container.textContent).not.toMatch(/-\s+Deep child/)
  })
})
