import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Markdown, { parseMarkdownTable, splitMarkdownTableRow } from './Markdown'

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
})
