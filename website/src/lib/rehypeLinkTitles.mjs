/**
 * Markdown 正文链接的 `title`：默认取链接自己的文字，无文字（图链、空锚）时跳过。
 *
 * 站点模板里的 `<a>` 在各组件里手写 `title`；只有 Guides 文章正文经 Markdown 渲染，
 * 链接在此统一补齐，保证全站链接都有 `title`（AITDK 等审计工具会检查缺失）。
 */

/** 返回节点内全部文字。 */
function textContent(node) {
  if (node.type === 'text') {
    return node.value
  }

  return (node.children ?? []).map(textContent).join('')
}

function visit(node) {
  if (node.type === 'element' && node.tagName === 'a') {
    const label = textContent(node).trim()
    if (label) {
      node.properties = { ...node.properties, title: label }
    }
    return
  }

  for (const child of node.children ?? []) {
    visit(child)
  }
}

export default function rehypeLinkTitles() {
  return tree => {
    visit(tree)
  }
}
