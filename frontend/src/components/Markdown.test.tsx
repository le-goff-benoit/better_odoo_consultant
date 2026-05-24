import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ActionProposals from './ActionProposals'
import Markdown, { extractActionItems, parseMarkdownTable, splitMarkdownTableRow } from './Markdown'

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
})
