/**
 * About and contact page copy for every public website locale.
 *
 * Keeping the two trust pages in one typed module lets routes, footer links,
 * the operator statement, visible dates, and structured data share the same reviewed wording.
 */
import type { Locale } from '../i18n/ui'
import { OPERATOR_LEGAL_NAME, PRODUCT_NAME } from '../lib/site.mjs'

/** One semantic content section rendered on a company information page. */
export interface CompanyPageSection {
  /** Visible section heading. */
  title: string
  /** Explanatory paragraphs shown before an optional list. */
  paragraphs: string[]
  /** Optional scannable facts or instructions. */
  items?: string[]
}

/** Copy shared by the About and Contact page renderers. */
interface CompanyPageBaseContent {
  /** Footer link label. */
  navLabel: string
  /** Browser and search-result title. */
  seoTitle: string
  /** Search-result summary. */
  seoDescription: string
  /** Small label above the page heading. */
  eyebrow: string
  /** Visible H1. */
  title: string
  /** Introductory summary below the H1. */
  intro: string
  /** Label displayed beside the content date. */
  updatedLabel: string
  /** Human-readable content date for the locale. */
  updatedAt: string
  /** Page body sections. */
  sections: CompanyPageSection[]
}

/** About page copy and its page-specific actions. */
export interface AboutPageContent extends CompanyPageBaseContent {
  /** Link label leading to the Contact page. */
  contactLabel: string
  /** Link label leading to the official Chrome Web Store listing. */
  chromeStoreLabel: string
}

/** Contact page copy and its page-specific actions. */
export interface ContactPageContent extends CompanyPageBaseContent {
  /** Primary email action label. */
  emailLabel: string
  /** Link label leading back to the About page. */
  aboutLabel: string
}

/** Localized company navigation and page content. */
export interface CompanyContent {
  /** Footer heading for company links. */
  footerGroupLabel: string
  /** Label for the official X profile in the footer and Contact page. */
  officialXLabel: string
  /**
   * Names the legal entity behind the brand; shown in the footer and on About and Contact,
   * because Terms alone is not where buyers look for who runs a paid service.
   */
  operatorStatement: string
  /** Privacy Policy link label used by the footer and the About and Contact pages. */
  privacyLabel: string
  /** Terms of Service link label used by the footer and the About and Contact pages. */
  termsLabel: string
  /** Localized About page content. */
  about: AboutPageContent
  /** Localized Contact page content. */
  contact: ContactPageContent
}

/** ISO date on which the About and Contact page content was first published. */
export const COMPANY_PAGES_PUBLISHED_DATE = '2026-09-18'

/** English source copy. */
const enUS: CompanyContent = {
  footerGroupLabel: 'Company',
  officialXLabel: 'Official X Account',
  operatorStatement: `${PRODUCT_NAME} is operated by ${OPERATOR_LEGAL_NAME}.`,
  privacyLabel: 'Privacy Policy',
  termsLabel: 'Terms of Service',
  about: {
    navLabel: 'About',
    seoTitle: 'About Vimeo Downloader | Product, Privacy and Team',
    seoDescription: 'Learn what Vimeo Downloader does, how its website and browser extension work, and the privacy and access boundaries the team follows.',
    eyebrow: 'About Vimeo Downloader',
    title: 'A practical way to save public Vimeo videos you can already open',
    intro: 'Vimeo Downloader is a browser website and Chrome extension workflow for saving public Vimeo videos from links you can already open.',
    updatedLabel: 'Published and reviewed',
    updatedAt: 'September 18, 2026',
    sections: [
      {
        title: 'What we build',
        paragraphs: ['The website presents the Chrome extension and handles Unlimited plan purchases. Its home page also offers a free online download tool for supported public links, while the extension takes over large downloads that a browser tab cannot finish reliably on its own.']
      },
      {
        title: 'Where the boundary is',
        paragraphs: ['Vimeo Downloader does not unlock private or password-protected videos and does not grant ownership rights. You remain responsible for having permission to save and use each file.'],
        items: ['We do not ask for Vimeo passwords, Vimeo API credentials, or session files.', 'We do not unlock private, password-protected, or paywalled videos.', 'We do not claim rights over media downloaded through the service.']
      },
      {
        title: 'How we operate',
        paragraphs: ['The team focuses on clear product limits, privacy-conscious browser workflows, and support that can be reached through a public email address.']
      }
    ],
    contactLabel: 'Contact Support',
    chromeStoreLabel: 'View Chrome Extension'
  },
  contact: {
    navLabel: 'Contact',
    seoTitle: 'Contact Vimeo Downloader Support',
    seoDescription: 'Contact Vimeo Downloader about account access, downloads, the browser extension, the Unlimited plan, payments, or privacy requests.',
    eyebrow: 'Contact Vimeo Downloader',
    title: 'Tell us what happened and where',
    intro: 'Email support for help with Vimeo Downloader accounts, website downloads, the Chrome extension, billing, or privacy requests.',
    updatedLabel: 'Published and reviewed',
    updatedAt: 'September 18, 2026',
    sections: [
      {
        title: 'What we can help with',
        paragraphs: [],
        items: ['Account access and sign-in issues', 'Website or extension download problems', 'Unlimited plan, renewals, and payment questions', 'Privacy and account data requests']
      },
      {
        title: 'What to include',
        paragraphs: ['A precise report helps us identify the affected workflow without asking for sensitive account information.'],
        items: ['The page URL and the action you attempted', 'Your browser name and version', 'The exact error message and a screenshot when useful', 'An order number for billing questions, without payment card details']
      },
      {
        title: 'Keep sensitive information private',
        paragraphs: ['Never email Vimeo passwords, verification codes, API credentials, session files, access tokens, or complete payment card information. Vimeo Downloader support does not need them.']
      }
    ],
    emailLabel: 'Email Support',
    aboutLabel: 'About Vimeo Downloader'
  }
}

/** Simplified Chinese copy. */
const zhCN: CompanyContent = {
  footerGroupLabel: '关于我们',
  officialXLabel: '官方 X 账号',
  operatorStatement: `${PRODUCT_NAME} 由 ${OPERATOR_LEGAL_NAME} 运营。`,
  privacyLabel: '隐私政策',
  termsLabel: '服务条款',
  about: {
    navLabel: '关于',
    seoTitle: '关于 Vimeo Downloader｜产品、隐私与团队',
    seoDescription: '了解 Vimeo Downloader 的用途、网站与浏览器扩展的工作方式，以及团队遵循的隐私和访问边界。',
    eyebrow: '关于 Vimeo Downloader',
    title: '保存你能打开的公开 Vimeo 视频的实用工具',
    intro: 'Vimeo Downloader 由浏览器网站和 Chrome 扩展组成，用于保存你能打开的公开 Vimeo 视频链接。',
    updatedLabel: '发布并复核于',
    updatedAt: '2026年9月18日',
    sections: [
      { title: '我们做什么', paragraphs: ['网站负责展示 Chrome 扩展并处理 Unlimited 计划的购买；首页另提供免费的在线下载工具，用于受支持的公开链接。浏览器扩展接续处理浏览器标签页无法稳定完成的大文件下载。'] },
      { title: '能力边界', paragraphs: ['Vimeo Downloader 不会解锁私密或需要密码的视频，也不会授予内容所有权。你需要自行确认拥有保存和使用文件的权限。'], items: ['不会索要 Vimeo 密码、API 凭据或会话文件。', '不会解锁私密、需要密码或付费的 Vimeo 视频。', '不会主张通过本服务下载媒体的权利。'] },
      { title: '我们的工作方式', paragraphs: ['团队重视清晰的产品边界、注重隐私的浏览器流程和公开可联系的支持邮箱。'] }
    ],
    contactLabel: '联系支持', chromeStoreLabel: '查看 Chrome 扩展'
  },
  contact: {
    navLabel: '联系我们', seoTitle: '联系 Vimeo Downloader 支持', seoDescription: '就账号登录、下载、浏览器扩展、Unlimited 计划、支付或隐私请求联系 Vimeo Downloader。', eyebrow: '联系 Vimeo Downloader', title: '告诉我们问题发生在哪里', intro: '通过邮件获取 Vimeo Downloader 账号、网页下载、Chrome 扩展、账单或隐私请求支持。', updatedLabel: '发布并复核于', updatedAt: '2026年9月18日',
    sections: [
      { title: '我们可以协助', paragraphs: [], items: ['账号访问与登录问题', '网站或扩展下载问题', 'Unlimited 计划、续费和支付问题', '隐私及账号数据请求'] },
      { title: '邮件中请包含', paragraphs: ['准确的信息能帮助我们定位流程，同时不需要你提供敏感账号资料。'], items: ['页面 URL 和你执行的操作', '浏览器名称及版本', '完整错误信息，必要时附截图', '账单问题提供订单号，但不要提供银行卡资料'] },
      { title: '请保护敏感信息', paragraphs: ['不要通过邮件发送 Vimeo 密码、验证码、API 凭据、会话文件、访问令牌或完整银行卡信息。Vimeo Downloader 支持不需要这些内容。'] }
    ],
    emailLabel: '发送支持邮件', aboutLabel: '关于 Vimeo Downloader'
  }
}

/** Traditional Chinese copy. */
const zhTW: CompanyContent = {
  footerGroupLabel: '關於我們',
  officialXLabel: '官方 X 帳號',
  operatorStatement: `${PRODUCT_NAME} 由 ${OPERATOR_LEGAL_NAME} 營運。`,
  privacyLabel: '隱私權政策',
  termsLabel: '服務條款',
  about: {
    navLabel: '關於', seoTitle: '關於 Vimeo Downloader｜產品、隱私與團隊', seoDescription: '了解 Vimeo Downloader 的用途、網站與瀏覽器擴充功能的運作方式，以及團隊遵循的隱私和存取界線。', eyebrow: '關於 Vimeo Downloader', title: '儲存你能開啟的公開 Vimeo 影片的實用工具', intro: 'Vimeo Downloader 由瀏覽器網站和 Chrome 擴充功能組成，用於儲存你能開啟的公開 Vimeo 影片連結。', updatedLabel: '發布並檢視於', updatedAt: '2026年9月18日',
    sections: [
      { title: '我們做什麼', paragraphs: ['網站負責展示 Chrome 擴充功能並處理 Unlimited 方案的購買；首頁另提供免費的線上下載工具，適用於支援的公開連結。瀏覽器擴充功能接手處理瀏覽器分頁無法穩定完成的大型下載。'] },
      { title: '能力界線', paragraphs: ['Vimeo Downloader 不會解鎖私密或需要密碼的影片，也不會授予內容所有權。你必須自行確認有權儲存和使用每個檔案。'], items: ['不會索取 Vimeo 密碼、API 憑證或工作階段檔案。', '不會解鎖私密、需要密碼或付費的 Vimeo 影片。', '不會主張透過本服務下載媒體的權利。'] },
      { title: '我們的運作方式', paragraphs: ['團隊重視清楚的產品界線、注重隱私的瀏覽器流程，以及可透過公開電子郵件聯絡的支援。'] }
    ],
    contactLabel: '聯絡支援', chromeStoreLabel: '查看 Chrome 擴充功能'
  },
  contact: {
    navLabel: '聯絡我們', seoTitle: '聯絡 Vimeo Downloader 支援', seoDescription: '就帳號存取、下載、瀏覽器擴充功能、Unlimited 方案、付款或隱私要求聯絡 Vimeo Downloader。', eyebrow: '聯絡 Vimeo Downloader', title: '告訴我們問題發生的位置', intro: '透過電子郵件取得 Vimeo Downloader 帳號、網站下載、Chrome 擴充功能、帳務或隱私要求支援。', updatedLabel: '發布並檢視於', updatedAt: '2026年9月18日',
    sections: [
      { title: '我們可以協助', paragraphs: [], items: ['帳號存取與登入問題', '網站或擴充功能下載問題', 'Unlimited 方案、續訂和付款問題', '隱私與帳號資料要求'] },
      { title: '郵件中請包含', paragraphs: ['精確的資訊可協助我們定位流程，而無需你提供敏感帳號資料。'], items: ['頁面 URL 和你嘗試的操作', '瀏覽器名稱與版本', '完整錯誤訊息，必要時附上截圖', '帳務問題提供訂單編號，但不要提供付款卡資料'] },
      { title: '保護敏感資訊', paragraphs: ['切勿透過電子郵件傳送 Vimeo 密碼、驗證碼、API 憑證、工作階段檔案、存取權杖或完整付款卡資訊。Vimeo Downloader 支援不需要這些內容。'] }
    ],
    emailLabel: '傳送支援郵件', aboutLabel: '關於 Vimeo Downloader'
  }
}

/** Japanese copy. */
const jaJP: CompanyContent = {
  footerGroupLabel: '運営情報',
  officialXLabel: '公式Xアカウント',
  operatorStatement: `${PRODUCT_NAME}は${OPERATOR_LEGAL_NAME}が運営しています。`,
  privacyLabel: 'プライバシーポリシー',
  termsLabel: '利用規約',
  about: {
    navLabel: '概要', seoTitle: 'Vimeo Downloaderについて｜製品、プライバシー、運営', seoDescription: 'Vimeo Downloaderの機能、Webサイトとブラウザー拡張機能の仕組み、運営チームが守るプライバシーとアクセスの境界を説明します。', eyebrow: 'Vimeo Downloaderについて', title: '公開Vimeo動画を保存する実用的な方法', intro: 'Vimeo Downloaderは、公開Vimeo動画のリンクを保存するためのWebサイトとChrome拡張機能です。', updatedLabel: '公開・確認日', updatedAt: '2026年9月18日',
    sections: [
      { title: '提供しているもの', paragraphs: ['Webサイトでは Chrome 拡張機能を紹介し、Unlimited プランの購入を扱います。トップページには、対応する公開リンク向けの無料オンラインダウンロードツールもあります。拡張機能は、ブラウザーのタブだけでは安定して完了できない大容量ダウンロードを引き継ぎます。'] },
      { title: '機能の境界', paragraphs: ['Vimeo Downloaderは、非公開・パスワード付きの動画を解除することはなく、コンテンツの所有権も与えません。各ファイルを保存・利用する権限は利用者が確認してください。'], items: ['Vimeoのパスワード、API認証情報、セッションファイルを求めません。', '非公開・パスワード付き・有料のVimeo動画を解除しません。', '本サービスで保存したメディアの権利を主張しません。'] },
      { title: '運営方針', paragraphs: ['明確な製品境界、プライバシーを重視したブラウザー処理、公開メールで連絡できるサポートを重視しています。'] }
    ],
    contactLabel: 'サポートに連絡', chromeStoreLabel: 'Chrome拡張機能を見る'
  },
  contact: {
    navLabel: 'お問い合わせ', seoTitle: 'Vimeo Downloaderサポートへのお問い合わせ', seoDescription: 'アカウント、ダウンロード、ブラウザー拡張機能、Unlimited プラン、支払い、プライバシーについてお問い合わせください。', eyebrow: 'Vimeo Downloaderへのお問い合わせ', title: '何がどこで起きたかをお知らせください', intro: 'Vimeo Downloaderのアカウント、Webダウンロード、Chrome拡張機能、請求、プライバシーに関するサポートをメールで提供します。', updatedLabel: '公開・確認日', updatedAt: '2026年9月18日',
    sections: [
      { title: 'サポート対象', paragraphs: [], items: ['アカウントへのアクセスとログイン', 'Webサイトまたは拡張機能のダウンロード', 'Unlimited プラン、更新、支払い', 'プライバシーとアカウントデータの請求'] },
      { title: 'メールに含める情報', paragraphs: ['機密情報を送らなくても、正確な報告があれば対象の処理を特定できます。'], items: ['ページURLと実行した操作', 'ブラウザー名とバージョン', '正確なエラーメッセージと必要に応じた画像', '請求の場合は注文番号（カード情報は不要）'] },
      { title: '機密情報を送らないでください', paragraphs: ['Vimeoのパスワード、確認コード、API認証情報、セッションファイル、アクセストークン、完全なカード情報は送信しないでください。サポートには不要です。'] }
    ],
    emailLabel: 'サポートにメール', aboutLabel: 'Vimeo Downloaderについて'
  }
}

/** Korean copy. */
const koKR: CompanyContent = {
  footerGroupLabel: '회사 정보',
  officialXLabel: '공식 X 계정',
  operatorStatement: `${PRODUCT_NAME}는 ${OPERATOR_LEGAL_NAME}가 운영합니다.`,
  privacyLabel: '개인정보 처리방침',
  termsLabel: '이용약관',
  about: {
    navLabel: '소개', seoTitle: 'Vimeo Downloader 소개 | 제품, 개인정보 및 운영팀', seoDescription: 'Vimeo Downloader의 기능, 웹사이트와 브라우저 확장 프로그램의 작동 방식, 팀이 지키는 개인정보 및 접근 경계를 확인하세요.', eyebrow: 'Vimeo Downloader 소개', title: '공개 Vimeo 동영상을 저장하는 실용적인 방법', intro: 'Vimeo Downloader는 공개 Vimeo 동영상 링크를 저장하는 웹사이트 및 Chrome 확장 프로그램입니다.', updatedLabel: '게시 및 검토일', updatedAt: '2026년 9월 18일',
    sections: [
      { title: '우리가 만드는 것', paragraphs: ['웹사이트는 Chrome 확장 프로그램을 소개하고 Unlimited 플랜 구매를 처리합니다. 홈페이지에서는 지원되는 공개 링크를 위한 무료 온라인 다운로드 도구도 제공합니다. 확장 프로그램은 브라우저 탭만으로는 안정적으로 끝낼 수 없는 대용량 다운로드를 이어받습니다.'] },
      { title: '기능의 경계', paragraphs: ['Vimeo Downloader는 비공개 또는 비밀번호 동영상을 잠금 해제하지 않으며 콘텐츠 소유권도 부여하지 않습니다. 각 파일을 저장하고 사용할 권한은 사용자가 확인해야 합니다.'], items: ['Vimeo 비밀번호, API 자격 증명 또는 세션 파일을 요구하지 않습니다.', '비공개, 비밀번호 또는 유료 Vimeo 동영상을 잠금 해제하지 않습니다.', '서비스를 통해 저장한 미디어의 권리를 주장하지 않습니다.'] },
      { title: '운영 방식', paragraphs: ['팀은 명확한 제품 경계, 개인정보를 고려한 브라우저 절차, 공개 이메일로 연락 가능한 지원을 중요하게 생각합니다.'] }
    ],
    contactLabel: '지원 문의', chromeStoreLabel: 'Chrome 확장 프로그램 보기'
  },
  contact: {
    navLabel: '문의', seoTitle: 'Vimeo Downloader 지원 문의', seoDescription: '계정, 다운로드, 브라우저 확장 프로그램, Unlimited 플랜, 결제 또는 개인정보 요청에 대해 문의하세요.', eyebrow: 'Vimeo Downloader 문의', title: '어디에서 어떤 문제가 발생했는지 알려주세요', intro: 'Vimeo Downloader 계정, 웹 다운로드, Chrome 확장 프로그램, 결제 또는 개인정보 요청을 이메일로 지원합니다.', updatedLabel: '게시 및 검토일', updatedAt: '2026년 9월 18일',
    sections: [
      { title: '지원 범위', paragraphs: [], items: ['계정 접근 및 로그인 문제', '웹사이트 또는 확장 프로그램 다운로드 문제', 'Unlimited 플랜, 갱신 및 결제 문의', '개인정보 및 계정 데이터 요청'] },
      { title: '이메일에 포함할 내용', paragraphs: ['민감한 계정 정보 없이도 정확한 보고가 있으면 해당 절차를 찾을 수 있습니다.'], items: ['페이지 URL과 시도한 작업', '브라우저 이름과 버전', '정확한 오류 메시지와 필요한 경우 화면 캡처', '결제 문의용 주문 번호(카드 정보 제외)'] },
      { title: '민감한 정보를 보호하세요', paragraphs: ['Vimeo 비밀번호, 인증 코드, API 자격 증명, 세션 파일, 액세스 토큰 또는 전체 결제 카드 정보를 이메일로 보내지 마세요. 지원에 필요하지 않습니다.'] }
    ],
    emailLabel: '지원팀에 이메일', aboutLabel: 'Vimeo Downloader 소개'
  }
}

/** Spanish copy. */
const esES: CompanyContent = {
  footerGroupLabel: 'Empresa',
  officialXLabel: 'Cuenta oficial en X',
  operatorStatement: `${PRODUCT_NAME} es un servicio operado por ${OPERATOR_LEGAL_NAME}.`,
  privacyLabel: 'Política de privacidad',
  termsLabel: 'Términos del servicio',
  about: {
    navLabel: 'Acerca de', seoTitle: 'Acerca de Vimeo Downloader | Producto, privacidad y equipo', seoDescription: 'Conoce qué hace Vimeo Downloader, cómo funcionan el sitio y la extensión, y los límites de privacidad y acceso que sigue el equipo.', eyebrow: 'Acerca de Vimeo Downloader', title: 'Una forma práctica de guardar vídeos públicos de Vimeo que ya puedes abrir', intro: 'Vimeo Downloader combina un sitio web y una extensión de Chrome para guardar vídeos públicos de Vimeo desde enlaces que ya puedes abrir.', updatedLabel: 'Publicado y revisado', updatedAt: '18 de septiembre de 2026',
    sections: [
      { title: 'Qué creamos', paragraphs: ['El sitio presenta la extensión de Chrome y gestiona la compra del plan Unlimited. Su página de inicio incluye además una herramienta de descarga en línea gratuita para enlaces públicos compatibles. La extensión se encarga de las descargas grandes que una pestaña del navegador no puede terminar de forma fiable.'] },
      { title: 'Nuestros límites', paragraphs: ['Vimeo Downloader no desbloquea vídeos privados ni protegidos por contraseña y no concede derechos sobre el contenido. Debes tener permiso para guardar y utilizar cada archivo.'], items: ['No pedimos contraseñas de Vimeo, credenciales de API ni archivos de sesión.', 'No desbloqueamos vídeos privados, con contraseña o de pago.', 'No reclamamos derechos sobre el contenido descargado.'] },
      { title: 'Cómo trabajamos', paragraphs: ['Priorizamos límites claros, procesos de navegador que respetan la privacidad y soporte disponible mediante un correo público.'] }
    ],
    contactLabel: 'Contactar con soporte', chromeStoreLabel: 'Ver extensión de Chrome'
  },
  contact: {
    navLabel: 'Contacto', seoTitle: 'Contactar con el soporte de Vimeo Downloader', seoDescription: 'Contacta con Vimeo Downloader sobre cuentas, descargas, la extensión, el plan Unlimited, pagos o solicitudes de privacidad.', eyebrow: 'Contacto de Vimeo Downloader', title: 'Cuéntanos qué ocurrió y dónde', intro: 'Recibe ayuda por correo sobre cuentas, descargas web, la extensión de Chrome, facturación o privacidad.', updatedLabel: 'Publicado y revisado', updatedAt: '18 de septiembre de 2026',
    sections: [
      { title: 'En qué podemos ayudarte', paragraphs: [], items: ['Acceso a la cuenta e inicio de sesión', 'Problemas de descarga en el sitio o la extensión', 'Plan Unlimited, renovaciones y pagos', 'Solicitudes de privacidad y datos de cuenta'] },
      { title: 'Qué debes incluir', paragraphs: ['Un informe preciso nos permite localizar el proceso sin solicitar datos confidenciales.'], items: ['URL de la página y acción realizada', 'Nombre y versión del navegador', 'Mensaje de error exacto y captura si aporta contexto', 'Número de pedido para facturación, sin datos de tarjeta'] },
      { title: 'Protege la información confidencial', paragraphs: ['No envíes contraseñas de Vimeo, códigos, credenciales de API, archivos de sesión, tokens ni datos completos de tarjetas. El soporte no los necesita.'] }
    ],
    emailLabel: 'Enviar correo a soporte', aboutLabel: 'Acerca de Vimeo Downloader'
  }
}

/** Portuguese copy. */
const ptBR: CompanyContent = {
  footerGroupLabel: 'Empresa',
  officialXLabel: 'Conta oficial no X',
  operatorStatement: `O ${PRODUCT_NAME} é operado pela ${OPERATOR_LEGAL_NAME}.`,
  privacyLabel: 'Política de Privacidade',
  termsLabel: 'Termos de Serviço',
  about: {
    navLabel: 'Sobre', seoTitle: 'Sobre o Vimeo Downloader | Produto, privacidade e equipe', seoDescription: 'Saiba o que o Vimeo Downloader faz, como o site e a extensão funcionam e quais limites de privacidade e acesso a equipe segue.', eyebrow: 'Sobre o Vimeo Downloader', title: 'Uma forma prática de salvar vídeos públicos do Vimeo que você já pode abrir', intro: 'O Vimeo Downloader combina um site e uma extensão do Chrome para salvar vídeos públicos do Vimeo a partir de links que você já consegue abrir.', updatedLabel: 'Publicado e revisado em', updatedAt: '18 de setembro de 2026',
    sections: [
      { title: 'O que criamos', paragraphs: ['O site apresenta a extensão do Chrome e cuida da compra do plano Unlimited. A página inicial também oferece uma ferramenta de download online gratuita para links públicos compatíveis. A extensão assume os downloads grandes que uma aba do navegador não consegue concluir com segurança.'] },
      { title: 'Nossos limites', paragraphs: ['O Vimeo Downloader não desbloqueia vídeos privados nem protegidos por senha e não concede direitos sobre conteúdo. Você deve ter permissão para salvar e usar cada arquivo.'], items: ['Não pedimos senhas do Vimeo, credenciais de API ou arquivos de sessão.', 'Não desbloqueamos vídeos privados, com senha ou pagos.', 'Não reivindicamos direitos sobre a mídia baixada.'] },
      { title: 'Como operamos', paragraphs: ['Priorizamos limites claros, fluxos de navegador conscientes da privacidade e suporte acessível por um e-mail público.'] }
    ],
    contactLabel: 'Contatar suporte', chromeStoreLabel: 'Ver extensão do Chrome'
  },
  contact: {
    navLabel: 'Contato', seoTitle: 'Contate o suporte do Vimeo Downloader', seoDescription: 'Fale com o Vimeo Downloader sobre conta, downloads, extensão, plano Unlimited, pagamentos ou privacidade.', eyebrow: 'Contato do Vimeo Downloader', title: 'Conte o que aconteceu e onde', intro: 'Receba suporte por e-mail para conta, downloads no site, extensão do Chrome, cobrança ou privacidade.', updatedLabel: 'Publicado e revisado em', updatedAt: '18 de setembro de 2026',
    sections: [
      { title: 'Como podemos ajudar', paragraphs: [], items: ['Acesso à conta e login', 'Problemas de download no site ou extensão', 'Plano Unlimited, renovações e pagamentos', 'Solicitações de privacidade e dados da conta'] },
      { title: 'O que incluir', paragraphs: ['Um relato preciso permite localizar o fluxo sem pedir dados confidenciais.'], items: ['URL da página e ação tentada', 'Nome e versão do navegador', 'Mensagem de erro exata e captura quando útil', 'Número do pedido para cobrança, sem dados do cartão'] },
      { title: 'Proteja informações sensíveis', paragraphs: ['Não envie senhas do Vimeo, códigos, credenciais de API, arquivos de sessão, tokens ou dados completos de cartão. O suporte não precisa deles.'] }
    ],
    emailLabel: 'Enviar e-mail ao suporte', aboutLabel: 'Sobre o Vimeo Downloader'
  }
}

/** German copy. */
const deDE: CompanyContent = {
  footerGroupLabel: 'Unternehmen',
  officialXLabel: 'Offizieller X-Account',
  operatorStatement: `${PRODUCT_NAME} wird von der ${OPERATOR_LEGAL_NAME} betrieben.`,
  privacyLabel: 'Datenschutzerklärung',
  termsLabel: 'Nutzungsbedingungen',
  about: {
    navLabel: 'Über uns', seoTitle: 'Über Vimeo Downloader | Produkt, Datenschutz und Team', seoDescription: 'Erfahre, was Vimeo Downloader leistet, wie Website und Erweiterung arbeiten und welche Datenschutz- und Zugriffsgrenzen das Team einhält.', eyebrow: 'Über Vimeo Downloader', title: 'Eine praktische Lösung für öffentliche Vimeo-Videos, die du bereits öffnen kannst', intro: 'Vimeo Downloader verbindet eine Website mit einer Chrome-Erweiterung, um öffentliche Vimeo-Videos über Links zu speichern, die du bereits öffnen kannst.', updatedLabel: 'Veröffentlicht und geprüft', updatedAt: '18. September 2026',
    sections: [
      { title: 'Was wir entwickeln', paragraphs: ['Die Website stellt die Chrome-Erweiterung vor und wickelt den Kauf des Unlimited-Plans ab. Auf der Startseite gibt es außerdem ein kostenloses Online-Download-Tool für unterstützte öffentliche Links. Die Erweiterung übernimmt große Downloads, die ein Browser-Tab nicht zuverlässig abschließen kann.'] },
      { title: 'Unsere Grenzen', paragraphs: ['Vimeo Downloader entsperrt keine privaten oder passwortgeschützten Videos und gewährt keine Rechte an Inhalten. Du musst zum Speichern und Verwenden jeder Datei berechtigt sein.'], items: ['Wir fragen nicht nach Vimeo-Passwörtern, API-Zugangsdaten oder Sitzungsdateien.', 'Wir entsperren keine privaten, passwortgeschützten oder kostenpflichtigen Videos.', 'Wir beanspruchen keine Rechte an heruntergeladenen Medien.'] },
      { title: 'Wie wir arbeiten', paragraphs: ['Wir setzen auf klare Produktgrenzen, datenschutzbewusste Browserabläufe und Support über eine öffentliche E-Mail-Adresse.'] }
    ],
    contactLabel: 'Support kontaktieren', chromeStoreLabel: 'Chrome-Erweiterung ansehen'
  },
  contact: {
    navLabel: 'Kontakt', seoTitle: 'Vimeo Downloader Support kontaktieren', seoDescription: 'Kontaktiere Vimeo Downloader zu Konten, Downloads, der Erweiterung, dem Unlimited-Plan, Zahlungen oder Datenschutz.', eyebrow: 'Vimeo Downloader Kontakt', title: 'Beschreibe, was wo passiert ist', intro: 'Support per E-Mail für Konten, Web-Downloads, Chrome-Erweiterung, Abrechnung oder Datenschutz.', updatedLabel: 'Veröffentlicht und geprüft', updatedAt: '18. September 2026',
    sections: [
      { title: 'Wobei wir helfen', paragraphs: [], items: ['Kontozugriff und Anmeldung', 'Downloadprobleme auf Website oder Erweiterung', 'Unlimited-Plan, Verlängerungen und Zahlungen', 'Datenschutz- und Kontodatenanfragen'] },
      { title: 'Was du angeben solltest', paragraphs: ['Ein genauer Bericht hilft uns, den Ablauf ohne vertrauliche Daten zu finden.'], items: ['Seiten-URL und ausgeführte Aktion', 'Browsername und Version', 'Genaue Fehlermeldung und bei Bedarf Screenshot', 'Bestellnummer bei Abrechnung, ohne Kartendaten'] },
      { title: 'Schütze sensible Daten', paragraphs: ['Sende keine Vimeo-Passwörter, Codes, API-Zugangsdaten, Sitzungsdateien, Token oder vollständige Kartendaten. Der Support benötigt sie nicht.'] }
    ],
    emailLabel: 'Support per E-Mail', aboutLabel: 'Über Vimeo Downloader'
  }
}

/** French copy. */
const frFR: CompanyContent = {
  footerGroupLabel: 'Entreprise',
  officialXLabel: 'Compte X officiel',
  operatorStatement: `${PRODUCT_NAME} est exploité par ${OPERATOR_LEGAL_NAME}.`,
  privacyLabel: 'Politique de confidentialité',
  termsLabel: 'Conditions d’utilisation',
  about: {
    navLabel: 'À propos', seoTitle: 'À propos de Vimeo Downloader | Produit, confidentialité et équipe', seoDescription: 'Découvrez le rôle de Vimeo Downloader, le fonctionnement du site et de l’extension, ainsi que les limites de confidentialité et d’accès suivies par l’équipe.', eyebrow: 'À propos de Vimeo Downloader', title: 'Une solution pratique pour les vidéos Vimeo publiques que vous pouvez déjà ouvrir', intro: 'Vimeo Downloader associe un site web et une extension Chrome pour enregistrer les vidéos Vimeo publiques à partir de liens que vous pouvez déjà ouvrir.', updatedLabel: 'Publié et vérifié le', updatedAt: '18 septembre 2026',
    sections: [
      { title: 'Ce que nous développons', paragraphs: ['Le site présente l’extension Chrome et gère l’achat de la formule Unlimited. Sa page d’accueil propose aussi un outil de téléchargement en ligne gratuit pour les liens publics compatibles. L’extension prend en charge les téléchargements volumineux qu’un onglet ne peut pas terminer de façon fiable.'] },
      { title: 'Nos limites', paragraphs: ['Vimeo Downloader ne déverrouille aucune vidéo privée ou protégée par mot de passe et ne donne aucun droit sur le contenu. Vous devez être autorisé à enregistrer et utiliser chaque fichier.'], items: ['Nous ne demandons aucun mot de passe Vimeo, identifiant API ou fichier de session.', 'Nous ne déverrouillons aucune vidéo privée, protégée par mot de passe ou payante.', 'Nous ne revendiquons aucun droit sur les médias téléchargés.'] },
      { title: 'Notre fonctionnement', paragraphs: ['Nous privilégions des limites claires, des processus respectueux de la vie privée et une assistance joignable par une adresse publique.'] }
    ],
    contactLabel: 'Contacter l’assistance', chromeStoreLabel: 'Voir l’extension Chrome'
  },
  contact: {
    navLabel: 'Contact', seoTitle: 'Contacter l’assistance Vimeo Downloader', seoDescription: 'Contactez Vimeo Downloader pour les comptes, téléchargements, extension, formule Unlimited, paiements ou demandes de confidentialité.', eyebrow: 'Contact Vimeo Downloader', title: 'Indiquez-nous ce qui s’est passé et où', intro: 'Assistance par e-mail pour les comptes, téléchargements web, extension Chrome, facturation ou confidentialité.', updatedLabel: 'Publié et vérifié le', updatedAt: '18 septembre 2026',
    sections: [
      { title: 'Notre assistance', paragraphs: [], items: ['Accès au compte et connexion', 'Téléchargements sur le site ou l’extension', 'Formule Unlimited, renouvellements et paiements', 'Confidentialité et données du compte'] },
      { title: 'Informations à fournir', paragraphs: ['Un signalement précis permet de trouver le processus sans demander de données confidentielles.'], items: ['URL de la page et action effectuée', 'Nom et version du navigateur', 'Message d’erreur exact et capture si utile', 'Numéro de commande pour la facturation, sans données de carte'] },
      { title: 'Protégez vos informations sensibles', paragraphs: ['N’envoyez jamais de mots de passe Vimeo, codes, identifiants API, fichiers de session, jetons ou données complètes de carte. L’assistance n’en a pas besoin.'] }
    ],
    emailLabel: 'Envoyer un e-mail', aboutLabel: 'À propos de Vimeo Downloader'
  }
}

/** Russian copy. */
const ruRU: CompanyContent = {
  footerGroupLabel: 'Компания',
  officialXLabel: 'Официальный аккаунт X',
  operatorStatement: `Оператор сервиса ${PRODUCT_NAME} — компания ${OPERATOR_LEGAL_NAME}.`,
  privacyLabel: 'Политика конфиденциальности',
  termsLabel: 'Условия использования',
  about: {
    navLabel: 'О сервисе', seoTitle: 'О Vimeo Downloader | Продукт, конфиденциальность и команда', seoDescription: 'Узнайте, что делает Vimeo Downloader, как работают сайт и расширение и какие границы доступа и конфиденциальности соблюдает команда.', eyebrow: 'О Vimeo Downloader', title: 'Практичный способ сохранять публичные видео Vimeo, которые вы уже можете открыть', intro: 'Vimeo Downloader объединяет сайт и расширение Chrome для сохранения публичных видео Vimeo по ссылкам, которые вы уже можете открыть.', updatedLabel: 'Опубликовано и проверено', updatedAt: '18 сентября 2026 г.',
    sections: [
      { title: 'Что мы создаём', paragraphs: ['Сайт представляет расширение Chrome и оформляет покупку плана Unlimited. На главной странице также есть бесплатный онлайн-инструмент для скачивания по поддерживаемым публичным ссылкам. Расширение берёт на себя большие загрузки, которые вкладка браузера не может надёжно завершить.'] },
      { title: 'Границы возможностей', paragraphs: ['Vimeo Downloader не открывает приватные и защищённые паролем видео и не предоставляет права на контент. Вы должны иметь разрешение на сохранение и использование каждого файла.'], items: ['Мы не запрашиваем пароли Vimeo, данные API или файлы сеанса.', 'Мы не открываем приватные, защищённые паролем или платные видео Vimeo.', 'Мы не заявляем права на скачанные медиафайлы.'] },
      { title: 'Как мы работаем', paragraphs: ['Мы поддерживаем ясные границы продукта, конфиденциальные браузерные процессы и связь через публичный адрес поддержки.'] }
    ],
    contactLabel: 'Связаться с поддержкой', chromeStoreLabel: 'Открыть расширение Chrome'
  },
  contact: {
    navLabel: 'Контакты', seoTitle: 'Связаться с поддержкой Vimeo Downloader', seoDescription: 'Свяжитесь с Vimeo Downloader по вопросам аккаунта, скачивания, расширения, плана Unlimited, оплаты или конфиденциальности.', eyebrow: 'Контакты Vimeo Downloader', title: 'Расскажите, что и где произошло', intro: 'Поддержка по электронной почте для аккаунтов, веб-загрузок, расширения Chrome, оплаты и конфиденциальности.', updatedLabel: 'Опубликовано и проверено', updatedAt: '18 сентября 2026 г.',
    sections: [
      { title: 'Чем мы помогаем', paragraphs: [], items: ['Доступ к аккаунту и вход', 'Проблемы загрузки на сайте или в расширении', 'План Unlimited, продления и платежи', 'Запросы о конфиденциальности и данных аккаунта'] },
      { title: 'Что указать в письме', paragraphs: ['Точное описание помогает найти проблему без конфиденциальных данных.'], items: ['URL страницы и выполненное действие', 'Название и версия браузера', 'Точный текст ошибки и снимок экрана при необходимости', 'Номер заказа для оплаты без данных карты'] },
      { title: 'Защищайте чувствительные данные', paragraphs: ['Не отправляйте пароли Vimeo, коды, данные API, файлы сеанса, токены или полные данные карты. Поддержке они не нужны.'] }
    ],
    emailLabel: 'Написать в поддержку', aboutLabel: 'О Vimeo Downloader'
  }
}

/** Italian copy. */
const itIT: CompanyContent = {
  footerGroupLabel: 'Azienda',
  officialXLabel: 'Account X ufficiale',
  operatorStatement: `${PRODUCT_NAME} è gestito da ${OPERATOR_LEGAL_NAME}.`,
  privacyLabel: 'Informativa sulla privacy',
  termsLabel: 'Termini di servizio',
  about: {
    navLabel: 'Chi siamo', seoTitle: 'Informazioni su Vimeo Downloader | Prodotto, privacy e team', seoDescription: 'Scopri cosa fa Vimeo Downloader, come funzionano sito ed estensione e quali limiti di privacy e accesso segue il team.', eyebrow: 'Informazioni su Vimeo Downloader', title: 'Un modo pratico per salvare video Vimeo pubblici che puoi già aprire', intro: 'Vimeo Downloader unisce un sito web e un’estensione Chrome per salvare video Vimeo pubblici da link che puoi già aprire.', updatedLabel: 'Pubblicato e verificato il', updatedAt: '18 settembre 2026',
    sections: [
      { title: 'Cosa realizziamo', paragraphs: ['Il sito presenta l’estensione Chrome e gestisce l’acquisto del piano Unlimited. La home page offre anche uno strumento di download online gratuito per i link pubblici supportati. L’estensione si occupa dei download di grandi dimensioni che una scheda del browser non riesce a completare in modo affidabile.'] },
      { title: 'I nostri limiti', paragraphs: ['Vimeo Downloader non sblocca video privati o protetti da password e non concede diritti sui contenuti. Devi avere il permesso di salvare e usare ogni file.'], items: ['Non chiediamo password Vimeo, credenziali API o file di sessione.', 'Non sblocchiamo video privati, protetti da password o a pagamento.', 'Non rivendichiamo diritti sui contenuti scaricati.'] },
      { title: 'Come operiamo', paragraphs: ['Diamo priorità a limiti chiari, procedure rispettose della privacy e assistenza raggiungibile tramite un indirizzo pubblico.'] }
    ],
    contactLabel: 'Contatta l’assistenza', chromeStoreLabel: 'Vedi l’estensione Chrome'
  },
  contact: {
    navLabel: 'Contatti', seoTitle: 'Contatta l’assistenza Vimeo Downloader', seoDescription: 'Contatta Vimeo Downloader per account, download, estensione, piano Unlimited, pagamenti o privacy.', eyebrow: 'Contatti Vimeo Downloader', title: 'Descrivi cosa è successo e dove', intro: 'Assistenza via e-mail per account, download web, estensione Chrome, fatturazione o privacy.', updatedLabel: 'Pubblicato e verificato il', updatedAt: '18 settembre 2026',
    sections: [
      { title: 'Come possiamo aiutarti', paragraphs: [], items: ['Accesso all’account e login', 'Problemi di download sul sito o nell’estensione', 'Piano Unlimited, rinnovi e pagamenti', 'Richieste su privacy e dati account'] },
      { title: 'Cosa includere', paragraphs: ['Una segnalazione precisa individua il flusso senza richiedere dati riservati.'], items: ['URL della pagina e azione tentata', 'Nome e versione del browser', 'Messaggio di errore esatto e schermata se utile', 'Numero ordine per la fatturazione, senza dati carta'] },
      { title: 'Proteggi le informazioni sensibili', paragraphs: ['Non inviare password Vimeo, codici, credenziali API, file di sessione, token o dati completi della carta. L’assistenza non ne ha bisogno.'] }
    ],
    emailLabel: 'Invia e-mail all’assistenza', aboutLabel: 'Informazioni su Vimeo Downloader'
  }
}

/** Vietnamese copy. */
const viVN: CompanyContent = {
  footerGroupLabel: 'Công ty',
  officialXLabel: 'Tài khoản X chính thức',
  operatorStatement: `${PRODUCT_NAME} do ${OPERATOR_LEGAL_NAME} vận hành.`,
  privacyLabel: 'Chính sách quyền riêng tư',
  termsLabel: 'Điều khoản dịch vụ',
  about: {
    navLabel: 'Giới thiệu', seoTitle: 'Giới thiệu Vimeo Downloader | Sản phẩm, quyền riêng tư và đội ngũ', seoDescription: 'Tìm hiểu Vimeo Downloader làm gì, cách trang web và tiện ích hoạt động, cùng giới hạn quyền riêng tư và truy cập mà đội ngũ tuân thủ.', eyebrow: 'Giới thiệu Vimeo Downloader', title: 'Cách thiết thực để lưu video Vimeo công khai mà bạn đã mở được', intro: 'Vimeo Downloader kết hợp trang web và tiện ích Chrome để lưu video Vimeo công khai từ những liên kết bạn đã mở được.', updatedLabel: 'Đăng và xem xét ngày', updatedAt: '18 tháng 9, 2026',
    sections: [
      { title: 'Sản phẩm của chúng tôi', paragraphs: ['Trang web giới thiệu tiện ích Chrome và xử lý việc mua gói Unlimited. Trang chủ cũng có công cụ tải xuống trực tuyến miễn phí cho các liên kết công khai được hỗ trợ. Tiện ích đảm nhận những lượt tải lớn mà một tab trình duyệt không thể hoàn tất ổn định.'] },
      { title: 'Giới hạn dịch vụ', paragraphs: ['Vimeo Downloader không mở khóa video riêng tư hay có mật khẩu và không cấp quyền sở hữu nội dung. Bạn phải có quyền lưu và sử dụng từng tệp.'], items: ['Không yêu cầu mật khẩu Vimeo, thông tin API hoặc tệp phiên.', 'Không mở khóa video Vimeo riêng tư, có mật khẩu hoặc trả phí.', 'Không tuyên bố quyền với nội dung đã tải xuống.'] },
      { title: 'Cách chúng tôi hoạt động', paragraphs: ['Chúng tôi ưu tiên giới hạn rõ ràng, quy trình trình duyệt chú trọng quyền riêng tư và hỗ trợ qua địa chỉ email công khai.'] }
    ],
    contactLabel: 'Liên hệ hỗ trợ', chromeStoreLabel: 'Xem tiện ích Chrome'
  },
  contact: {
    navLabel: 'Liên hệ', seoTitle: 'Liên hệ hỗ trợ Vimeo Downloader', seoDescription: 'Liên hệ Vimeo Downloader về tài khoản, tải xuống, tiện ích, gói Unlimited, thanh toán hoặc quyền riêng tư.', eyebrow: 'Liên hệ Vimeo Downloader', title: 'Cho chúng tôi biết chuyện gì xảy ra và ở đâu', intro: 'Hỗ trợ qua email cho tài khoản, tải xuống web, tiện ích Chrome, thanh toán hoặc quyền riêng tư.', updatedLabel: 'Đăng và xem xét ngày', updatedAt: '18 tháng 9, 2026',
    sections: [
      { title: 'Nội dung hỗ trợ', paragraphs: [], items: ['Truy cập tài khoản và đăng nhập', 'Lỗi tải xuống trên trang web hoặc tiện ích', 'Gói Unlimited, gia hạn và thanh toán', 'Yêu cầu quyền riêng tư và dữ liệu tài khoản'] },
      { title: 'Thông tin cần gửi', paragraphs: ['Báo cáo chính xác giúp xác định quy trình mà không cần dữ liệu nhạy cảm.'], items: ['URL trang và thao tác đã thử', 'Tên và phiên bản trình duyệt', 'Thông báo lỗi chính xác và ảnh chụp khi hữu ích', 'Mã đơn hàng cho thanh toán, không gửi dữ liệu thẻ'] },
      { title: 'Bảo vệ thông tin nhạy cảm', paragraphs: ['Không gửi mật khẩu Vimeo, mã xác minh, thông tin API, tệp phiên, token hoặc dữ liệu thẻ đầy đủ. Bộ phận hỗ trợ không cần chúng.'] }
    ],
    emailLabel: 'Gửi email hỗ trợ', aboutLabel: 'Giới thiệu Vimeo Downloader'
  }
}

/** Thai copy. */
const thTH: CompanyContent = {
  footerGroupLabel: 'บริษัท',
  officialXLabel: 'บัญชี X อย่างเป็นทางการ',
  operatorStatement: `${PRODUCT_NAME} ดำเนินการโดย ${OPERATOR_LEGAL_NAME}`,
  privacyLabel: 'นโยบายความเป็นส่วนตัว',
  termsLabel: 'ข้อกำหนดการใช้บริการ',
  about: {
    navLabel: 'เกี่ยวกับเรา', seoTitle: 'เกี่ยวกับ Vimeo Downloader | ผลิตภัณฑ์ ความเป็นส่วนตัว และทีมงาน', seoDescription: 'ดูว่า Vimeo Downloader ทำอะไร เว็บไซต์และส่วนขยายทำงานอย่างไร และขอบเขตความเป็นส่วนตัวกับการเข้าถึงที่ทีมงานยึดถือ', eyebrow: 'เกี่ยวกับ Vimeo Downloader', title: 'วิธีที่ใช้งานได้จริงในการบันทึกวิดีโอ Vimeo สาธารณะที่คุณเปิดได้อยู่แล้ว', intro: 'Vimeo Downloader รวมเว็บไซต์และส่วนขยาย Chrome เพื่อบันทึกวิดีโอ Vimeo สาธารณะจากลิงก์ที่คุณเปิดได้อยู่แล้ว', updatedLabel: 'เผยแพร่และตรวจสอบเมื่อ', updatedAt: '18 กันยายน 2026',
    sections: [
      { title: 'สิ่งที่เราพัฒนา', paragraphs: ['เว็บไซต์แนะนำส่วนขยาย Chrome และจัดการการซื้อแพ็กเกจ Unlimited หน้าแรกยังมีเครื่องมือดาวน์โหลดออนไลน์แบบฟรีสำหรับลิงก์สาธารณะที่รองรับ ส่วนขยายรับช่วงต่อการดาวน์โหลดขนาดใหญ่ที่แท็บเบราว์เซอร์ทำไม่เสถียร'] },
      { title: 'ขอบเขตของบริการ', paragraphs: ['Vimeo Downloader ไม่ปลดล็อกวิดีโอที่เป็นส่วนตัวหรือมีรหัสผ่าน และไม่ได้ให้สิทธิ์ในเนื้อหา คุณต้องมีสิทธิ์บันทึกและใช้แต่ละไฟล์'], items: ['เราไม่ขอรหัสผ่าน Vimeo ข้อมูล API หรือไฟล์เซสชัน', 'เราไม่ปลดล็อกวิดีโอ Vimeo ที่เป็นส่วนตัว มีรหัสผ่าน หรือต้องจ่ายเงิน', 'เราไม่อ้างสิทธิ์ในสื่อที่ดาวน์โหลด'] },
      { title: 'แนวทางการทำงาน', paragraphs: ['เราให้ความสำคัญกับขอบเขตที่ชัดเจน ขั้นตอนในเบราว์เซอร์ที่คำนึงถึงความเป็นส่วนตัว และการสนับสนุนผ่านอีเมลสาธารณะ'] }
    ],
    contactLabel: 'ติดต่อฝ่ายสนับสนุน', chromeStoreLabel: 'ดูส่วนขยาย Chrome'
  },
  contact: {
    navLabel: 'ติดต่อเรา', seoTitle: 'ติดต่อฝ่ายสนับสนุน Vimeo Downloader', seoDescription: 'ติดต่อ Vimeo Downloader เรื่องบัญชี การดาวน์โหลด ส่วนขยาย แพ็กเกจ Unlimited การชำระเงิน หรือความเป็นส่วนตัว', eyebrow: 'ติดต่อ Vimeo Downloader', title: 'บอกเราว่าเกิดอะไรขึ้นและที่ใด', intro: 'รับความช่วยเหลือทางอีเมลเกี่ยวกับบัญชี การดาวน์โหลดผ่านเว็บ ส่วนขยาย Chrome การเรียกเก็บเงิน หรือความเป็นส่วนตัว', updatedLabel: 'เผยแพร่และตรวจสอบเมื่อ', updatedAt: '18 กันยายน 2026',
    sections: [
      { title: 'สิ่งที่เราช่วยได้', paragraphs: [], items: ['การเข้าถึงบัญชีและการเข้าสู่ระบบ', 'ปัญหาดาวน์โหลดบนเว็บไซต์หรือส่วนขยาย', 'แพ็กเกจ Unlimited การต่ออายุ และการชำระเงิน', 'คำขอด้านความเป็นส่วนตัวและข้อมูลบัญชี'] },
      { title: 'ข้อมูลที่ควรส่ง', paragraphs: ['รายงานที่ชัดเจนช่วยให้เราหาขั้นตอนได้โดยไม่ต้องขอข้อมูลลับ'], items: ['URL หน้าและการทำงานที่ลอง', 'ชื่อและเวอร์ชันเบราว์เซอร์', 'ข้อความผิดพลาดที่แน่นอนและภาพหน้าจอเมื่อมีประโยชน์', 'หมายเลขคำสั่งซื้อสำหรับการชำระเงินโดยไม่ส่งข้อมูลบัตร'] },
      { title: 'ปกป้องข้อมูลสำคัญ', paragraphs: ['อย่าส่งรหัสผ่าน Vimeo รหัสยืนยัน ข้อมูล API ไฟล์เซสชัน โทเค็น หรือข้อมูลบัตรทั้งหมด ฝ่ายสนับสนุนไม่ต้องใช้ข้อมูลเหล่านี้'] }
    ],
    emailLabel: 'ส่งอีเมลถึงฝ่ายสนับสนุน', aboutLabel: 'เกี่ยวกับ Vimeo Downloader'
  }
}

/** Indonesian copy. */
const idID: CompanyContent = {
  footerGroupLabel: 'Perusahaan',
  officialXLabel: 'Akun X Resmi',
  operatorStatement: `${PRODUCT_NAME} dioperasikan oleh ${OPERATOR_LEGAL_NAME}.`,
  privacyLabel: 'Kebijakan Privasi',
  termsLabel: 'Ketentuan Layanan',
  about: {
    navLabel: 'Tentang', seoTitle: 'Tentang Vimeo Downloader | Produk, privasi, dan tim', seoDescription: 'Pelajari fungsi Vimeo Downloader, cara kerja situs dan ekstensi, serta batas privasi dan akses yang diikuti tim.', eyebrow: 'Tentang Vimeo Downloader', title: 'Cara praktis menyimpan video Vimeo publik yang sudah dapat Anda buka', intro: 'Vimeo Downloader menggabungkan situs web dan ekstensi Chrome untuk menyimpan video Vimeo publik dari tautan yang sudah bisa Anda buka.', updatedLabel: 'Diterbitkan dan ditinjau', updatedAt: '18 September 2026',
    sections: [
      { title: 'Yang kami bangun', paragraphs: ['Situs memperkenalkan ekstensi Chrome dan menangani pembelian paket Unlimited. Beranda juga menyediakan alat unduh online gratis untuk tautan publik yang didukung. Ekstensi mengambil alih unduhan besar yang tidak bisa diselesaikan tab browser dengan andal.'] },
      { title: 'Batas layanan', paragraphs: ['Vimeo Downloader tidak membuka video privat atau berpassword dan tidak memberikan hak atas konten. Anda harus memiliki izin untuk menyimpan dan menggunakan setiap file.'], items: ['Kami tidak meminta kata sandi Vimeo, kredensial API, atau file sesi.', 'Kami tidak membuka video Vimeo yang privat, berpassword, atau berbayar.', 'Kami tidak mengklaim hak atas media yang diunduh.'] },
      { title: 'Cara kami bekerja', paragraphs: ['Kami mengutamakan batas produk yang jelas, alur browser yang menjaga privasi, dan dukungan melalui alamat email publik.'] }
    ],
    contactLabel: 'Hubungi Dukungan', chromeStoreLabel: 'Lihat Ekstensi Chrome'
  },
  contact: {
    navLabel: 'Kontak', seoTitle: 'Hubungi Dukungan Vimeo Downloader', seoDescription: 'Hubungi Vimeo Downloader tentang akun, unduhan, ekstensi, paket Unlimited, pembayaran, atau privasi.', eyebrow: 'Kontak Vimeo Downloader', title: 'Beri tahu apa yang terjadi dan di mana', intro: 'Dukungan email untuk akun, unduhan web, ekstensi Chrome, penagihan, atau privasi.', updatedLabel: 'Diterbitkan dan ditinjau', updatedAt: '18 September 2026',
    sections: [
      { title: 'Yang dapat kami bantu', paragraphs: [], items: ['Akses akun dan masuk', 'Masalah unduhan situs atau ekstensi', 'Paket Unlimited, perpanjangan, dan pembayaran', 'Permintaan privasi dan data akun'] },
      { title: 'Yang perlu disertakan', paragraphs: ['Laporan yang tepat membantu menemukan alur tanpa meminta data rahasia.'], items: ['URL halaman dan tindakan yang dicoba', 'Nama dan versi browser', 'Pesan kesalahan lengkap dan tangkapan layar jika berguna', 'Nomor pesanan untuk penagihan tanpa data kartu'] },
      { title: 'Lindungi informasi sensitif', paragraphs: ['Jangan kirim kata sandi Vimeo, kode, kredensial API, file sesi, token, atau data kartu lengkap. Dukungan tidak memerlukannya.'] }
    ],
    emailLabel: 'Kirim Email Dukungan', aboutLabel: 'Tentang Vimeo Downloader'
  }
}

/** Localized content indexed by the same locale union used by website routing. */
const companyContent: Record<Locale, CompanyContent> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'ja-JP': jaJP,
  'ko-KR': koKR,
  'es-ES': esES,
  'pt-BR': ptBR,
  'de-DE': deDE,
  'fr-FR': frFR,
  'ru-RU': ruRU,
  'it-IT': itIT,
  'vi-VN': viVN,
  'th-TH': thTH,
  'id-ID': idID
}

/** Returns About, Contact, and footer copy for one website locale. */
export function getCompanyContent(locale: Locale): CompanyContent {
  return companyContent[locale]
}
