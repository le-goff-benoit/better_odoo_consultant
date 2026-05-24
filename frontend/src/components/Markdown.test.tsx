import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Markdown, { MarkdownActionsProvider, parseMarkdownTable, splitMarkdownTableRow } from './Markdown'

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

  it('turns action list items into AI prompt buttons', () => {
    const onPromptAction = vi.fn()
    render(
      <MarkdownActionsProvider onPromptAction={onPromptAction}>
        <Markdown text={[
          '3 prochaines actions maximum',
          '1. Je vérifie le **bouton d’impression** côté Projet.',
          '2. Je liste les champs `x_studio` visibles.',
        ].join('\n')} />
      </MarkdownActionsProvider>,
    )

    const buttons = screen.getAllByLabelText("Demander à l'IA de réaliser cette action")
    expect(buttons).toHaveLength(2)

    fireEvent.click(buttons[0])
    expect(onPromptAction).toHaveBeenCalledWith(expect.stringContaining("Je vérifie le bouton d’impression côté Projet."))
  })

  it('does not add prompt buttons to ordinary numbered lists', () => {
    render(
      <MarkdownActionsProvider onPromptAction={() => undefined}>
        <Markdown text={[
          'Étapes réalisées',
          '1. Lecture du rapport.',
          '2. Synthèse.',
        ].join('\n')} />
      </MarkdownActionsProvider>,
    )

    expect(screen.queryByLabelText("Demander à l'IA de réaliser cette action")).toBeNull()
  })
})
