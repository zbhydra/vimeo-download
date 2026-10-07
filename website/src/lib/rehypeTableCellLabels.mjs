/**
 * Markdown 表格的单元格标签：把同列表头的文字写进每个正文单元格的 `data-label`。
 *
 * 手机上文章表格按行折成卡片，表头被隐藏，卡片里靠 `data-label` 显示列名；
 * 列名来自文章自己的表头，所以不需要另外的 i18n 文案。
 */

/** 返回节点内全部文字。 */
function textContent(node) {
  if (node.type === 'text') {
    return node.value
  }

  return (node.children ?? []).map(textContent).join('')
}

/** 取直接子元素中指定标签的元素。 */
function childElements(node, tagName) {
  return (node.children ?? []).filter(child => child.type === 'element' && child.tagName === tagName)
}

function labelTableCells(table) {
  const [headerRow] = childElements(childElements(table, 'thead')[0] ?? {}, 'tr')
  const labels = headerRow ? childElements(headerRow, 'th').map(cell => textContent(cell).trim()) : []

  for (const body of childElements(table, 'tbody')) {
    for (const row of childElements(body, 'tr')) {
      childElements(row, 'td').forEach((cell, index) => {
        if (labels[index]) {
          cell.properties = { ...cell.properties, dataLabel: labels[index] }
        }
      })
    }
  }
}

function visit(node) {
  if (node.type === 'element' && node.tagName === 'table') {
    labelTableCells(node)
  }

  for (const child of node.children ?? []) {
    visit(child)
  }
}

export default function rehypeTableCellLabels() {
  return tree => {
    visit(tree)
  }
}
