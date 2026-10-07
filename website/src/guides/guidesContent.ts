/**
 * Guides 页面族：文章读取、路由路径与外框文案。
 *
 * 文章正文在内容集合 `guides`（见 src/content.config.ts）。文章没有回退语言：
 * 某个语言至少有一篇文章，才生成该语言的 Guides 索引页、出现页脚入口；
 * 一篇文章只在有该语言正文的路由生成，hreflang 与语言切换器也只覆盖这些语言，避免重复内容和死链。
 */
import { getCollection, type CollectionEntry } from 'astro:content'
import { localePaths, locales, type Locale } from '../i18n/ui'
import { PRODUCT_NAME } from '../lib/site.mjs'

/** Guides 外框文案：索引页、面包屑、日期胶囊与页脚入口。 */
export interface GuidesContent {
  /** 栏目名：页脚入口、面包屑与结构化面包屑的第二级。 */
  sectionLabel: string
  /** 面包屑导航的无障碍名称。 */
  breadcrumbLabel: string
  /** 文章页头日期胶囊的标签。 */
  updatedLabel: string
  /** 索引页 `<title>`。 */
  indexSeoTitle: string
  /** 索引页 meta description。 */
  indexSeoDescription: string
  /** 索引页 H1。 */
  indexTitle: string
  /** 索引页 H1 下的引言。 */
  indexIntro: string
}

const guidesContentByLocale: Record<Locale, GuidesContent> = {
  'en-US': {
    sectionLabel: 'Guides',
    breadcrumbLabel: 'Breadcrumb',
    updatedLabel: 'Last updated',
    indexSeoTitle: `Vimeo Download Guides | ${PRODUCT_NAME}`,
    indexSeoDescription:
      "Guides to saving Vimeo videos: using Vimeo's Download button, saving a public video as an MP4, fixing download errors and understanding the rules.",
    indexTitle: 'Vimeo download guides',
    indexIntro:
      'Step-by-step help for saving Vimeo videos: when Vimeo offers its own Download button, how the online tool handles public videos, what its error messages mean and which rules apply.'
  },
  'zh-CN': {
    sectionLabel: '指南',
    breadcrumbLabel: '面包屑导航',
    updatedLabel: '最后更新',
    indexSeoTitle: `Vimeo 下载指南 | ${PRODUCT_NAME}`,
    indexSeoDescription:
      '保存 Vimeo 视频的指南：使用 Vimeo 自带的下载按钮、把公开视频保存为 MP4、排查下载报错，以及了解相关规则。',
    indexTitle: 'Vimeo 下载指南',
    indexIntro:
      '一步步说明如何保存 Vimeo 视频：Vimeo 何时提供自带的下载按钮、在线工具如何处理公开视频、各条报错是什么意思，以及适用哪些规则。'
  },
  'zh-TW': {
    sectionLabel: '指南',
    breadcrumbLabel: '麵包屑導覽',
    updatedLabel: '最後更新',
    indexSeoTitle: `Vimeo 下載指南 | ${PRODUCT_NAME}`,
    indexSeoDescription:
      '儲存 Vimeo 影片的指南：使用 Vimeo 內建的下載按鈕、將公開影片儲存為 MP4、排解下載錯誤，以及了解相關規則。',
    indexTitle: 'Vimeo 下載指南',
    indexIntro:
      '一步步說明如何儲存 Vimeo 影片：Vimeo 何時提供內建的下載按鈕、線上工具如何處理公開影片、各項錯誤訊息代表什麼，以及適用哪些規則。'
  },
  'ja-JP': {
    sectionLabel: 'ガイド',
    breadcrumbLabel: 'パンくずリスト',
    updatedLabel: '最終更新',
    indexSeoTitle: `Vimeo ダウンロードガイド | ${PRODUCT_NAME}`,
    indexSeoDescription:
      'Vimeo 動画を保存するためのガイド。Vimeo のダウンロードボタンの使い方、公開動画を MP4 で保存する方法、ダウンロードエラーの対処法、関係するルールを解説します。',
    indexTitle: 'Vimeo ダウンロードガイド',
    indexIntro:
      'Vimeo 動画の保存方法を順を追って解説します。Vimeo がダウンロードボタンを表示する条件、オンラインツールでの公開動画の扱い、エラーメッセージの意味、適用されるルールをまとめています。'
  },
  'ko-KR': {
    sectionLabel: '가이드',
    breadcrumbLabel: '이동 경로',
    updatedLabel: '최종 업데이트',
    indexSeoTitle: `Vimeo 다운로드 가이드 | ${PRODUCT_NAME}`,
    indexSeoDescription:
      'Vimeo 동영상 저장 가이드: Vimeo 다운로드 버튼 사용법, 공개 동영상을 MP4로 저장하는 방법, 다운로드 오류 해결 방법과 관련 규칙을 안내합니다.',
    indexTitle: 'Vimeo 다운로드 가이드',
    indexIntro:
      'Vimeo 동영상을 저장하는 방법을 단계별로 안내합니다. Vimeo가 자체 다운로드 버튼을 제공하는 경우, 온라인 도구가 공개 동영상을 처리하는 방식, 오류 메시지의 의미와 적용되는 규칙을 확인하세요.'
  },
  'es-ES': {
    sectionLabel: 'Guías',
    breadcrumbLabel: 'Ruta de navegación',
    updatedLabel: 'Última actualización',
    indexSeoTitle: `Guías de descarga de Vimeo | ${PRODUCT_NAME}`,
    indexSeoDescription:
      'Guías para guardar vídeos de Vimeo: el botón de descarga de Vimeo, cómo guardar un vídeo público en MP4, cómo resolver errores de descarga y qué normas se aplican.',
    indexTitle: 'Guías de descarga de Vimeo',
    indexIntro:
      'Ayuda paso a paso para guardar vídeos de Vimeo: cuándo ofrece Vimeo su propio botón de descarga, cómo trata la herramienta online los vídeos públicos, qué significan sus mensajes de error y qué normas se aplican.'
  },
  'pt-BR': {
    sectionLabel: 'Guias',
    breadcrumbLabel: 'Trilha de navegação',
    updatedLabel: 'Última atualização',
    indexSeoTitle: `Guias de download do Vimeo | ${PRODUCT_NAME}`,
    indexSeoDescription:
      'Guias para salvar vídeos do Vimeo: o botão de download do Vimeo, como salvar um vídeo público em MP4, como resolver erros de download e quais regras se aplicam.',
    indexTitle: 'Guias de download do Vimeo',
    indexIntro:
      'Ajuda passo a passo para salvar vídeos do Vimeo: quando o Vimeo oferece o próprio botão de download, como a ferramenta online trata vídeos públicos, o que significam as mensagens de erro e quais regras se aplicam.'
  },
  'de-DE': {
    sectionLabel: 'Anleitungen',
    breadcrumbLabel: 'Brotkrümelnavigation',
    updatedLabel: 'Zuletzt aktualisiert',
    indexSeoTitle: `Anleitungen zum Vimeo-Download | ${PRODUCT_NAME}`,
    indexSeoDescription:
      'Anleitungen zum Speichern von Vimeo-Videos: der Download-Button von Vimeo, öffentliche Videos als MP4 speichern, Download-Fehler beheben und welche Regeln gelten.',
    indexTitle: 'Anleitungen zum Vimeo-Download',
    indexIntro:
      'Schritt-für-Schritt-Hilfe zum Speichern von Vimeo-Videos: wann Vimeo einen eigenen Download-Button anbietet, wie das Online-Tool öffentliche Videos verarbeitet, was seine Fehlermeldungen bedeuten und welche Regeln gelten.'
  },
  'fr-FR': {
    sectionLabel: 'Guides',
    breadcrumbLabel: "Fil d'Ariane",
    updatedLabel: 'Dernière mise à jour',
    indexSeoTitle: `Guides de téléchargement Vimeo | ${PRODUCT_NAME}`,
    indexSeoDescription:
      "Guides pour enregistrer des vidéos Vimeo : le bouton de téléchargement de Vimeo, l'enregistrement d'une vidéo publique en MP4, les erreurs de téléchargement et les règles applicables.",
    indexTitle: 'Guides de téléchargement Vimeo',
    indexIntro:
      "Une aide pas à pas pour enregistrer des vidéos Vimeo : quand Vimeo propose son propre bouton de téléchargement, comment l'outil en ligne traite les vidéos publiques, ce que signifient ses messages d'erreur et quelles règles s'appliquent."
  },
  'ru-RU': {
    sectionLabel: 'Руководства',
    breadcrumbLabel: 'Навигационная цепочка',
    updatedLabel: 'Последнее обновление',
    indexSeoTitle: `Руководства по скачиванию с Vimeo | ${PRODUCT_NAME}`,
    indexSeoDescription:
      'Руководства по сохранению видео с Vimeo: кнопка скачивания Vimeo, сохранение публичного видео в MP4, устранение ошибок скачивания и применимые правила.',
    indexTitle: 'Руководства по скачиванию с Vimeo',
    indexIntro:
      'Пошаговая помощь по сохранению видео с Vimeo: когда Vimeo показывает собственную кнопку скачивания, как онлайн-инструмент работает с публичными видео, что означают его сообщения об ошибках и какие правила действуют.'
  },
  'it-IT': {
    sectionLabel: 'Guide',
    breadcrumbLabel: 'Percorso di navigazione',
    updatedLabel: 'Ultimo aggiornamento',
    indexSeoTitle: `Guide al download da Vimeo | ${PRODUCT_NAME}`,
    indexSeoDescription:
      'Guide per salvare i video di Vimeo: il pulsante di download di Vimeo, come salvare un video pubblico in MP4, come risolvere gli errori di download e quali regole valgono.',
    indexTitle: 'Guide al download da Vimeo',
    indexIntro:
      'Aiuto passo passo per salvare i video di Vimeo: quando Vimeo offre il proprio pulsante di download, come lo strumento online gestisce i video pubblici, cosa significano i suoi messaggi di errore e quali regole si applicano.'
  },
  'vi-VN': {
    sectionLabel: 'Hướng dẫn',
    breadcrumbLabel: 'Đường dẫn điều hướng',
    updatedLabel: 'Cập nhật lần cuối',
    indexSeoTitle: `Hướng dẫn tải video Vimeo | ${PRODUCT_NAME}`,
    indexSeoDescription:
      'Hướng dẫn lưu video Vimeo: dùng nút tải xuống của Vimeo, lưu video công khai dưới dạng MP4, khắc phục lỗi tải xuống và các quy định liên quan.',
    indexTitle: 'Hướng dẫn tải video Vimeo',
    indexIntro:
      'Hướng dẫn từng bước để lưu video Vimeo: khi nào Vimeo có nút tải xuống riêng, công cụ trực tuyến xử lý video công khai ra sao, các thông báo lỗi có nghĩa là gì và những quy định nào được áp dụng.'
  },
  'th-TH': {
    sectionLabel: 'คู่มือ',
    breadcrumbLabel: 'เส้นทางนำทาง',
    updatedLabel: 'อัปเดตล่าสุด',
    indexSeoTitle: `คู่มือดาวน์โหลด Vimeo | ${PRODUCT_NAME}`,
    indexSeoDescription:
      'คู่มือการบันทึกวิดีโอ Vimeo: ปุ่มดาวน์โหลดของ Vimeo การบันทึกวิดีโอสาธารณะเป็น MP4 การแก้ไขข้อผิดพลาดในการดาวน์โหลด และกฎที่เกี่ยวข้อง',
    indexTitle: 'คู่มือดาวน์โหลด Vimeo',
    indexIntro:
      'วิธีบันทึกวิดีโอ Vimeo ทีละขั้นตอน: Vimeo มีปุ่มดาวน์โหลดของตัวเองเมื่อใด เครื่องมือออนไลน์จัดการวิดีโอสาธารณะอย่างไร ข้อความแสดงข้อผิดพลาดหมายถึงอะไร และมีกฎใดบ้างที่ใช้บังคับ'
  },
  'id-ID': {
    sectionLabel: 'Panduan',
    breadcrumbLabel: 'Navigasi remah roti',
    updatedLabel: 'Terakhir diperbarui',
    indexSeoTitle: `Panduan Unduh Vimeo | ${PRODUCT_NAME}`,
    indexSeoDescription:
      'Panduan menyimpan video Vimeo: tombol unduh milik Vimeo, menyimpan video publik sebagai MP4, mengatasi galat unduhan, dan aturan yang berlaku.',
    indexTitle: 'Panduan unduh Vimeo',
    indexIntro:
      'Bantuan langkah demi langkah untuk menyimpan video Vimeo: kapan Vimeo menyediakan tombol unduhnya sendiri, bagaimana alat online menangani video publik, arti pesan galatnya, dan aturan apa saja yang berlaku.'
  }
}

/** 一篇文章在某个语言下的版本。 */
export interface Guide {
  /** 文章目录名，也是 URL 的最后一段。 */
  slug: string
  /** 正文语言。 */
  locale: Locale
  entry: CollectionEntry<'guides'>
}

/** 把内容集合 id `{slug}/{locale}` 解析成文章；路径不合规时构建失败。 */
function toGuide(entry: CollectionEntry<'guides'>): Guide {
  const [slug, localeName, ...rest] = entry.id.split('/')
  const locale = locales.find(candidate => candidate === localeName)
  if (!slug || !locale || rest.length > 0) {
    throw new Error(`[guides] 文章文件必须是 src/content/guides/{slug}/{locale}.md，id=${entry.id}`)
  }

  return { slug, locale, entry }
}

/** 全部文章的全部语言版本，按发布日期升序，同一天按标题排序。 */
export async function getGuides(): Promise<Guide[]> {
  const entries = await getCollection('guides')
  return entries
    .map(toGuide)
    .sort((left, right) =>
      left.entry.data.publishedAt.getTime() - right.entry.data.publishedAt.getTime() ||
      left.entry.data.title.localeCompare(right.entry.data.title, left.locale)
    )
}

/** 某个语言的全部文章。 */
export async function getLocaleGuides(locale: Locale): Promise<Guide[]> {
  return (await getGuides()).filter(guide => guide.locale === locale)
}

/** 至少有一篇文章的语言。 */
export async function getGuideLocales(): Promise<Locale[]> {
  const guideLocales = new Set((await getGuides()).map(guide => guide.locale))
  return locales.filter(locale => guideLocales.has(locale))
}

/** 索引页（不传 slug）或文章页的站内路径。 */
export function getGuidesPath(locale: Locale, slug?: string): string {
  const prefix = localePaths[locale] ? `/${localePaths[locale]}` : ''
  return slug ? `${prefix}/guides/${slug}/` : `${prefix}/guides/`
}

export function getGuidesContent(locale: Locale): GuidesContent {
  return guidesContentByLocale[locale]
}
