/** Pricing 商品文案及按路由装配的页面内容。 */
import type { PricingPageContent } from './schema'

/** 生成 Pricing 页面的首屏与 SEO 内容，与订阅文案同源。 */
export function getPricingPageCopy(copy: PricingPageContent) {
  const { title, pageDescription, eyebrow } = copy.subscription
  return {
    ...copy,
    seo: { title: `${title} | Vimeo Video Downloader`, description: pageDescription },
    hero: { eyebrow, title, description: pageDescription }
  }
}

/** 单个语言的订阅管理入口文案。 */
type PricingSubscriptionManagement = PricingPageContent['subscriptionManagement']

/** Pricing 订阅管理入口的多语言文案。 */
const subscriptionManagementCopy = {
  enUS: {
    buttonLabel: 'Manage subscription',
    loadFailed: 'Could not open subscription management. Please try again.'
  },
  zhCN: {
    buttonLabel: '管理订阅',
    loadFailed: '无法打开订阅管理，请重试。'
  },
  zhTW: {
    buttonLabel: '管理訂閱',
    loadFailed: '無法開啟訂閱管理，請重試。'
  },
  jaJP: {
    buttonLabel: 'サブスクリプションを管理',
    loadFailed: 'サブスクリプション管理を開けませんでした。もう一度お試しください。'
  },
  koKR: {
    buttonLabel: '구독 관리',
    loadFailed: '구독 관리를 열 수 없습니다. 다시 시도하세요.'
  },
  esES: {
    buttonLabel: 'Gestionar suscripción',
    loadFailed: 'No se pudo abrir la gestión de la suscripción. Inténtalo de nuevo.'
  },
  ptBR: {
    buttonLabel: 'Gerenciar assinatura',
    loadFailed: 'Não foi possível abrir o gerenciamento da assinatura. Tente novamente.'
  },
  deDE: {
    buttonLabel: 'Abo verwalten',
    loadFailed: 'Die Aboverwaltung konnte nicht geöffnet werden. Versuche es erneut.'
  },
  frFR: {
    buttonLabel: "Gérer l'abonnement",
    loadFailed: 'Impossible d’ouvrir la gestion de l’abonnement. Réessayez.'
  },
  ruRU: {
    buttonLabel: 'Управлять подпиской',
    loadFailed: 'Не удалось открыть управление подпиской. Повторите попытку.'
  },
  itIT: {
    buttonLabel: 'Gestisci abbonamento',
    loadFailed: 'Impossibile aprire la gestione dell’abbonamento. Riprova.'
  },
  viVN: {
    buttonLabel: 'Quản lý đăng ký',
    loadFailed: 'Không thể mở phần quản lý đăng ký. Hãy thử lại.'
  },
  thTH: {
    buttonLabel: 'จัดการการสมัครสมาชิก',
    loadFailed: 'ไม่สามารถเปิดการจัดการการสมัครสมาชิกได้ โปรดลองอีกครั้ง'
  },
  idID: {
    buttonLabel: 'Kelola langganan',
    loadFailed: 'Tidak dapat membuka pengelolaan langganan. Coba lagi.'
  }
} satisfies Record<string, PricingSubscriptionManagement>

/** 好评赠送流程文案，按 Pricing 现有 locale 完整提供。 */
const reviewRewardCopies = {
  enUS: {
    offerMessage: 'If you can leave the extension a review, I will give you 7 days of plugin subscription.',
    reviewButton: 'Leave a review',
    checkingTitle: 'Checking your review',
    checkingMessage: 'Return here after leaving your review. Do not close or refresh this window while we check. If you have already submitted your review, please wait while we detect it.',
    countdown: 'Checking in {seconds} seconds',
    claimingTitle: 'Claiming your reward',
    claimingMessage: 'We are adding the 7-day plugin subscription to your account.',
    successTitle: '7 days added',
    successMessage: 'Your plugin subscription has been extended by 7 days.',
    alreadyClaimedTitle: 'Reward already claimed',
    alreadyClaimedMessage: 'This account has already claimed the review reward.',
    failedTitle: 'Reward not claimed',
    failedMessage: 'The reward could not be claimed. Retry now.',
    busyMessage: 'The server is busy. Retry shortly.',
    retry: 'Retry claim',
    close: 'Close'
  },
  zhCN: {
    offerMessage: '如果您能给插件一个好评，我会给你赠送 7 天的插件订阅',
    reviewButton: '去好评',
    checkingTitle: '正在检测好评',
    checkingMessage: '完成好评后返回此页面，我们会自动检测并领取赠送。检测期间请不要关闭或刷新窗口。如果您已经评论，不要着急，请等待我们的检测。',
    countdown: '{seconds} 秒后检测',
    claimingTitle: '正在领取赠送',
    claimingMessage: '正在为您的账号添加 7 天插件订阅。',
    successTitle: '已赠送 7 天',
    successMessage: '您的插件订阅已增加 7 天。',
    alreadyClaimedTitle: '已经领取过',
    alreadyClaimedMessage: '该账号已经领取过好评赠送。',
    failedTitle: '领取失败',
    failedMessage: '暂时无法领取赠送，请直接重试。',
    busyMessage: '服务器繁忙，请稍后重试',
    retry: '重试领取',
    close: '关闭'
  },
  zhTW: {
    offerMessage: '如果您能給外掛一個好評，我會贈送您 7 天的外掛訂閱。',
    reviewButton: '前往好評',
    checkingTitle: '正在檢測好評',
    checkingMessage: '完成好評後返回此頁面，我們會自動檢測並領取贈送。檢測期間請不要關閉或重新整理視窗。如果您已經評論，請不要著急，耐心等待我們的檢測。',
    countdown: '{seconds} 秒後檢測',
    claimingTitle: '正在領取贈送',
    claimingMessage: '正在為您的帳號加入 7 天外掛訂閱。',
    successTitle: '已贈送 7 天',
    successMessage: '您的外掛訂閱已增加 7 天。',
    alreadyClaimedTitle: '已經領取過',
    alreadyClaimedMessage: '此帳號已經領取過好評贈送。',
    failedTitle: '領取失敗',
    failedMessage: '暫時無法領取贈送，請直接重試。',
    busyMessage: '伺服器繁忙，請稍後重試。',
    retry: '重試領取',
    close: '關閉'
  },
  jaJP: {
    offerMessage: '拡張機能を評価していただける場合、プラグイン購読を7日間プレゼントします。',
    reviewButton: 'レビューする',
    checkingTitle: 'レビューを確認中',
    checkingMessage: 'レビュー後にこのページへ戻ると、特典を自動で確認します。確認中はこのウィンドウを閉じたり更新したりしないでください。すでにレビューを投稿した場合は、検出されるまでそのままお待ちください。',
    countdown: '{seconds}秒後に確認',
    claimingTitle: '特典を受け取り中',
    claimingMessage: 'アカウントに7日間のプラグイン購読を追加しています。',
    successTitle: '7日間を追加しました',
    successMessage: 'プラグイン購読を7日間延長しました。',
    alreadyClaimedTitle: '受け取り済みです',
    alreadyClaimedMessage: 'このアカウントはレビュー特典を受け取り済みです。',
    failedTitle: '特典を受け取れませんでした',
    failedMessage: '特典を受け取れませんでした。今すぐ再試行してください。',
    busyMessage: 'サーバーが混み合っています。しばらくしてから再試行してください。',
    retry: '受け取りを再試行',
    close: '閉じる'
  },
  koKR: {
    offerMessage: '확장 프로그램에 좋은 리뷰를 남겨 주시면 플러그인 구독 7일을 드립니다.',
    reviewButton: '리뷰 남기기',
    checkingTitle: '리뷰 확인 중',
    checkingMessage: '리뷰를 남긴 뒤 이 페이지로 돌아오면 혜택을 자동으로 확인합니다. 확인 중에는 이 창을 닫거나 새로고침하지 마세요. 이미 리뷰를 남겼다면 감지가 완료될 때까지 잠시 기다려 주세요.',
    countdown: '{seconds}초 후 확인',
    claimingTitle: '혜택 받는 중',
    claimingMessage: '계정에 플러그인 구독 7일을 추가하고 있습니다.',
    successTitle: '7일 추가됨',
    successMessage: '플러그인 구독이 7일 연장되었습니다.',
    alreadyClaimedTitle: '이미 받은 혜택',
    alreadyClaimedMessage: '이 계정은 이미 리뷰 혜택을 받았습니다.',
    failedTitle: '혜택을 받지 못함',
    failedMessage: '혜택을 받을 수 없습니다. 지금 다시 시도하세요.',
    busyMessage: '서버가 사용 중입니다. 잠시 후 다시 시도하세요.',
    retry: '받기 재시도',
    close: '닫기'
  },
  esES: {
    offerMessage: 'Si dejas una reseña de la extensión, te daré 7 días de suscripción al complemento.',
    reviewButton: 'Dejar una reseña',
    checkingTitle: 'Comprobando tu reseña',
    checkingMessage: 'Vuelve aquí después de dejar la reseña. No cierres ni actualices esta ventana durante la comprobación. Si ya publicaste tu reseña, espera mientras la detectamos.',
    countdown: 'Comprobación en {seconds} segundos',
    claimingTitle: 'Reclamando la recompensa',
    claimingMessage: 'Estamos añadiendo 7 días de suscripción al complemento a tu cuenta.',
    successTitle: '7 días añadidos',
    successMessage: 'Tu suscripción al complemento se ha ampliado 7 días.',
    alreadyClaimedTitle: 'Recompensa ya reclamada',
    alreadyClaimedMessage: 'Esta cuenta ya ha reclamado la recompensa por reseña.',
    failedTitle: 'No se reclamó la recompensa',
    failedMessage: 'No se pudo reclamar la recompensa. Inténtalo de nuevo ahora.',
    busyMessage: 'El servidor está ocupado. Inténtalo de nuevo en breve.',
    retry: 'Reintentar reclamación',
    close: 'Cerrar'
  },
  ptBR: {
    offerMessage: 'Se você avaliar a extensão, darei 7 dias de assinatura do plugin.',
    reviewButton: 'Fazer uma avaliação',
    checkingTitle: 'Verificando sua avaliação',
    checkingMessage: 'Volte aqui depois de avaliar. Não feche nem atualize esta janela durante a verificação. Se você já publicou sua avaliação, aguarde enquanto fazemos a detecção.',
    countdown: 'Verificação em {seconds} segundos',
    claimingTitle: 'Resgatando a recompensa',
    claimingMessage: 'Estamos adicionando 7 dias de assinatura do plugin à sua conta.',
    successTitle: '7 dias adicionados',
    successMessage: 'Sua assinatura do plugin foi estendida por 7 dias.',
    alreadyClaimedTitle: 'Recompensa já resgatada',
    alreadyClaimedMessage: 'Esta conta já resgatou a recompensa pela avaliação.',
    failedTitle: 'Recompensa não resgatada',
    failedMessage: 'Não foi possível resgatar a recompensa. Tente novamente agora.',
    busyMessage: 'O servidor está ocupado. Tente novamente em instantes.',
    retry: 'Tentar resgate novamente',
    close: 'Fechar'
  },
  deDE: {
    offerMessage: 'Wenn du die Erweiterung bewertest, schenke ich dir 7 Tage Plugin-Abonnement.',
    reviewButton: 'Bewertung abgeben',
    checkingTitle: 'Bewertung wird geprüft',
    checkingMessage: 'Kehre nach der Bewertung hierher zurück. Schließe oder aktualisiere dieses Fenster während der Prüfung nicht. Wenn du deine Bewertung bereits veröffentlicht hast, warte bitte, bis wir sie erkannt haben.',
    countdown: 'Prüfung in {seconds} Sekunden',
    claimingTitle: 'Belohnung wird eingelöst',
    claimingMessage: 'Wir fügen deinem Konto 7 Tage Plugin-Abonnement hinzu.',
    successTitle: '7 Tage hinzugefügt',
    successMessage: 'Dein Plugin-Abonnement wurde um 7 Tage verlängert.',
    alreadyClaimedTitle: 'Belohnung bereits eingelöst',
    alreadyClaimedMessage: 'Dieses Konto hat die Bewertungsbelohnung bereits eingelöst.',
    failedTitle: 'Belohnung nicht eingelöst',
    failedMessage: 'Die Belohnung konnte nicht eingelöst werden. Versuche es jetzt erneut.',
    busyMessage: 'Der Server ist ausgelastet. Versuche es gleich noch einmal.',
    retry: 'Einlösen wiederholen',
    close: 'Schließen'
  },
  frFR: {
    offerMessage: 'Si vous laissez un avis sur l’extension, je vous offre 7 jours d’abonnement au plugin.',
    reviewButton: 'Laisser un avis',
    checkingTitle: 'Vérification de votre avis',
    checkingMessage: 'Revenez ici après avoir laissé votre avis. Ne fermez pas et n’actualisez pas cette fenêtre pendant la vérification. Si votre avis est déjà publié, veuillez patienter pendant sa détection.',
    countdown: 'Vérification dans {seconds} secondes',
    claimingTitle: 'Récupération de la récompense',
    claimingMessage: 'Nous ajoutons 7 jours d’abonnement au plugin à votre compte.',
    successTitle: '7 jours ajoutés',
    successMessage: 'Votre abonnement au plugin a été prolongé de 7 jours.',
    alreadyClaimedTitle: 'Récompense déjà récupérée',
    alreadyClaimedMessage: 'Ce compte a déjà récupéré la récompense pour avis.',
    failedTitle: 'Récompense non récupérée',
    failedMessage: 'La récompense n’a pas pu être récupérée. Réessayez maintenant.',
    busyMessage: 'Le serveur est occupé. Réessayez dans un instant.',
    retry: 'Réessayer',
    close: 'Fermer'
  },
  ruRU: {
    offerMessage: 'Если вы оставите отзыв о расширении, я подарю вам 7 дней подписки на плагин.',
    reviewButton: 'Оставить отзыв',
    checkingTitle: 'Проверяем отзыв',
    checkingMessage: 'Вернитесь сюда после публикации отзыва. Не закрывайте и не обновляйте это окно во время проверки. Если отзыв уже опубликован, подождите, пока мы его обнаружим.',
    countdown: 'Проверка через {seconds} секунд',
    claimingTitle: 'Получаем награду',
    claimingMessage: 'Добавляем к аккаунту 7 дней подписки на плагин.',
    successTitle: 'Добавлено 7 дней',
    successMessage: 'Подписка на плагин продлена на 7 дней.',
    alreadyClaimedTitle: 'Награда уже получена',
    alreadyClaimedMessage: 'Этот аккаунт уже получил награду за отзыв.',
    failedTitle: 'Награда не получена',
    failedMessage: 'Не удалось получить награду. Повторите попытку сейчас.',
    busyMessage: 'Сервер занят. Повторите попытку чуть позже.',
    retry: 'Повторить получение',
    close: 'Закрыть'
  },
  itIT: {
    offerMessage: 'Se lasci una recensione all’estensione, ti regalo 7 giorni di abbonamento al plugin.',
    reviewButton: 'Lascia una recensione',
    checkingTitle: 'Verifica della recensione',
    checkingMessage: 'Torna qui dopo aver lasciato la recensione. Non chiudere né aggiornare questa finestra durante la verifica. Se hai già pubblicato la recensione, attendi mentre la rileviamo.',
    countdown: 'Verifica tra {seconds} secondi',
    claimingTitle: 'Riscatto del premio',
    claimingMessage: 'Stiamo aggiungendo 7 giorni di abbonamento al plugin al tuo account.',
    successTitle: '7 giorni aggiunti',
    successMessage: 'Il tuo abbonamento al plugin è stato esteso di 7 giorni.',
    alreadyClaimedTitle: 'Premio già riscattato',
    alreadyClaimedMessage: 'Questo account ha già riscattato il premio per la recensione.',
    failedTitle: 'Premio non riscattato',
    failedMessage: 'Impossibile riscattare il premio. Riprova ora.',
    busyMessage: 'Il server è occupato. Riprova tra poco.',
    retry: 'Riprova il riscatto',
    close: 'Chiudi'
  },
  viVN: {
    offerMessage: 'Nếu bạn đánh giá tiện ích, tôi sẽ tặng bạn 7 ngày đăng ký plugin.',
    reviewButton: 'Viết đánh giá',
    checkingTitle: 'Đang kiểm tra đánh giá',
    checkingMessage: 'Quay lại đây sau khi đánh giá. Không đóng hoặc tải lại cửa sổ này trong khi kiểm tra. Nếu bạn đã đăng đánh giá, vui lòng chờ chúng tôi phát hiện đánh giá đó.',
    countdown: 'Kiểm tra sau {seconds} giây',
    claimingTitle: 'Đang nhận phần thưởng',
    claimingMessage: 'Chúng tôi đang thêm 7 ngày đăng ký plugin vào tài khoản của bạn.',
    successTitle: 'Đã thêm 7 ngày',
    successMessage: 'Đăng ký plugin của bạn đã được gia hạn 7 ngày.',
    alreadyClaimedTitle: 'Đã nhận phần thưởng',
    alreadyClaimedMessage: 'Tài khoản này đã nhận phần thưởng đánh giá.',
    failedTitle: 'Chưa nhận được phần thưởng',
    failedMessage: 'Không thể nhận phần thưởng. Hãy thử lại ngay.',
    busyMessage: 'Máy chủ đang bận. Hãy thử lại sau ít phút.',
    retry: 'Thử nhận lại',
    close: 'Đóng'
  },
  thTH: {
    offerMessage: 'หากคุณรีวิวส่วนขยาย เราจะมอบการสมัครสมาชิกปลั๊กอินให้ 7 วัน',
    reviewButton: 'เขียนรีวิว',
    checkingTitle: 'กำลังตรวจสอบรีวิว',
    checkingMessage: 'กลับมาที่นี่หลังจากรีวิว อย่าปิดหรือรีเฟรชหน้าต่างนี้ระหว่างการตรวจสอบ หากคุณส่งรีวิวแล้ว โปรดรอให้เราตรวจพบรีวิวของคุณ',
    countdown: 'ตรวจสอบในอีก {seconds} วินาที',
    claimingTitle: 'กำลังรับรางวัล',
    claimingMessage: 'กำลังเพิ่มการสมัครสมาชิกปลั๊กอิน 7 วันให้บัญชีของคุณ',
    successTitle: 'เพิ่มแล้ว 7 วัน',
    successMessage: 'การสมัครสมาชิกปลั๊กอินของคุณเพิ่มขึ้น 7 วันแล้ว',
    alreadyClaimedTitle: 'รับรางวัลแล้ว',
    alreadyClaimedMessage: 'บัญชีนี้รับรางวัลจากการรีวิวแล้ว',
    failedTitle: 'ยังไม่ได้รับรางวัล',
    failedMessage: 'ไม่สามารถรับรางวัลได้ ลองอีกครั้งตอนนี้',
    busyMessage: 'เซิร์ฟเวอร์ไม่ว่าง โปรดลองอีกครั้งในอีกสักครู่',
    retry: 'ลองรับอีกครั้ง',
    close: 'ปิด'
  },
  idID: {
    offerMessage: 'Jika Anda memberi ulasan untuk ekstensi, saya akan memberikan langganan plugin selama 7 hari.',
    reviewButton: 'Beri ulasan',
    checkingTitle: 'Memeriksa ulasan Anda',
    checkingMessage: 'Kembali ke sini setelah memberi ulasan. Jangan tutup atau muat ulang jendela ini selama pemeriksaan. Jika ulasan sudah dikirim, tunggu hingga kami mendeteksinya.',
    countdown: 'Pemeriksaan dalam {seconds} detik',
    claimingTitle: 'Mengambil hadiah',
    claimingMessage: 'Kami sedang menambahkan langganan plugin 7 hari ke akun Anda.',
    successTitle: '7 hari ditambahkan',
    successMessage: 'Langganan plugin Anda telah diperpanjang 7 hari.',
    alreadyClaimedTitle: 'Hadiah sudah diambil',
    alreadyClaimedMessage: 'Akun ini sudah mengambil hadiah ulasan.',
    failedTitle: 'Hadiah belum diambil',
    failedMessage: 'Hadiah tidak dapat diambil. Coba lagi sekarang.',
    busyMessage: 'Server sedang sibuk. Coba lagi sebentar lagi.',
    retry: 'Coba ambil lagi',
    close: 'Tutup'
  }
} satisfies Record<string, PricingPageContent['subscription']['reviewReward']>

/** Pricing 页面英文文案。 */
export const pricingContent: PricingPageContent = {
  popularLabel: 'Most Popular',
  account: {
    title: 'Account',
    loading: 'Loading account...',
    signedOutTitle: 'Sign in before buying',
    signedOutDescription: 'Sign in to continue with checkout.',
    signInCta: 'Sign in',
    signedInLabel: 'Signed in',
    subscriptionLabel: 'Plan',
    expiresLabel: 'Expires',
    statusLabel: 'Status',
    dailyUsageLabel: 'Daily usage',
    resetLabel: 'Reset',
    autoRenewLabel: 'Billing',
    active: 'Active',
    expired: 'Inactive',
    noExpiry: 'No expiry',
    freePlan: 'Free',
    unlimited: 'Unlimited',
    loadFailed: 'Failed to load account. Sign in again or retry.'
  },
  accountMenu: {
    accountButtonLabel: 'Open account menu',
    accountMenuLabel: 'Account menu'
  },
  auth: {
    title: 'Sign in to continue',
    eyebrow: 'Website Access',
    continueWithGoogle: 'Continue with Google',
    googleLoading: 'Opening Google...',
    or: 'or',
    emailLabel: 'Email',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'Continue with email',
    sendingCode: 'Sending...',
    sendCodeSuccess: 'Verification code sent.',
    sendAgain: 'Send again',
    codeLabel: 'Verification code',
    codePlaceholder: '123456',
    signIn: 'Sign in',
    termsNotice: 'By signing in, you agree to the',
    termsLink: 'Terms',
    privacyLink: 'Privacy Policy',
    logout: 'Log out',
    errors: {
      enterEmailFirst: 'Please enter your email address first.',
      enterEmailAndCode: 'Please enter both email and verification code.',
      sendCodeFailed: 'Failed to send verification code.',
      googleSignInFailed: 'Google sign-in failed.',
      googleClientMissing: 'Google sign-in is not configured.',
      signInFailed: 'Failed to sign in.'
    }
  },
  checkout: {
    paymentMethodLabel: 'Choose payment method',
    paymentTitle: 'Choose payment method',
    selectedPackageLabel: 'Selected package',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: 'Continue to payment',
    backToProducts: 'Back',
    agreementText: 'I agree to the purchase terms, Terms, and Privacy Policy.',
    failed: 'Payment is not complete. You can retry or close this window.'
  },
  subscriptionManagement: subscriptionManagementCopy.enUS,
  subscription: {
    pageDescription: 'One subscription for unlimited downloads in the Vimeo Video Downloader extension — no daily quota.',
    title: 'Extension Unlimited',
    eyebrow: 'Extension access',
    benefits: [
      'Unlimited downloads in the extension',
      'No daily quota to manage',
      'Extension only — works with Vimeo on desktop'
    ],
    trustNote: 'Secure checkout',
    monthlyLabel: 'per month',
    yearlyLabel: 'per year',
    lifetimeLabel: 'Lifetime',
    quarterlySavingsLabel: 'Save 36%',
    dailyLimitLabel: 'Daily limit',
    autoRenewOn: 'Auto-renews',
    autoRenewOff: 'Pay once · No auto-renewal',
    usageNotice: 'Extension only',
    loading: 'Loading Unlimited plan...',
    loadFailed: 'Failed to load Unlimited plan. Retry later.',
    noPlan: 'Unlimited is not available right now.',
    noChannels: 'No payment method is available for this plan.',
    buyNow: 'Buy Now',
    loginToBuy: 'Sign in to buy',
    alreadyActive: 'You already have an active subscription. You cannot buy another one.',
    creatingOrder: 'Creating order...',
    pendingPaymentTitle: 'Waiting for payment',
    pendingPayment: 'Complete payment in the new tab. This page will refresh the result automatically.',
    successTitle: 'Unlimited activated',
    successDescription: 'Your subscription is active. Account status has been refreshed.',
    failedTitle: 'Payment incomplete',
    close: 'Close',
    cancelPayment: 'Cancel payment',
    supportMailPrefix: 'Report an issue: ',
    createFailed: 'Failed to create order. Retry later.',
    invalidPaymentData: 'Payment link is invalid. Retry later.',
    priceUpdated: 'Price changed. Review the latest price and buy again.',
    gatewayFailed: 'Payment entry is temporarily unavailable. Retry later.',
    orderNotFound: 'Order is no longer available. Create a new order.',
    orderExpired: 'Order expired. Buy again.',
    paymentCanceled: 'Payment was canceled. Choose a payment method and try again.',
    fulfillmentFailed: 'Payment was received but activation is not complete yet. Retry later.',
    pollFailed: 'Failed to refresh payment status. Retry later.',
    pollTimeout: 'Automatic refresh timed out. Check your account after payment.',
    authExpired: 'Sign-in expired. Sign in again to continue.',
    installConfirmTitle: 'Confirm extension subscription',
    installConfirmMessage:
      'Subscriptions can only be used in the desktop browser extension. Confirm that you have installed the extension. {link}',
    installConfirmLinkLabel: 'Install now',
    installConfirmCancel: 'Cancel',
    installConfirmContinue: 'Continue',
    reviewReward: reviewRewardCopies.enUS
  },
  extensionSource: {
    primaryCta: 'Upgrade to Unlimited',
    signedOutCta: 'Sign in to Upgrade',
    reviewRewardTitle: 'Get 7 days of Unlimited',
    reviewRewardDescription:
      'Leave a review in the Chrome Web Store, then return here to verify and claim your reward.',
  },
  faq: {
    title: 'Questions before you buy?',
    items: [
      {
        question: 'Which plan should I choose — monthly or yearly?',
        answer: 'Monthly is the flexible way to start. Yearly is the better deal if you already know you’ll keep downloading — it works out clearly cheaper per month than paying month to month.'
      },
      {
        question: 'Will my subscription renew automatically?',
        answer: 'Plans currently don’t charge you automatically — buy again whenever you want to extend your access. If a plan supports auto-renewal, it’s clearly badged on the card before checkout.'
      },
      {
        question: 'When does my purchase take effect?',
        answer: 'Immediately. Once payment completes, Unlimited is added to your account automatically — no activation code or manual step needed.'
      },
      {
        question: 'What payment methods can I use?',
        answer: 'PayPal and major credit and debit cards.'
      }
    ]
  }
}
/** Pricing 页面简体中文文案。 */
export const zhCNPricingContent: PricingPageContent = {
  popularLabel: '最受欢迎',
  account: {
    title: '账户',
    loading: '正在加载账户...',
    signedOutTitle: '登录后购买',
    signedOutDescription: '购买会绑定到你的 Vimeo Video Downloader 账户。',
    signInCta: '登录',
    signedInLabel: '已登录',
    subscriptionLabel: '订阅',
    expiresLabel: '到期',
    statusLabel: '状态',
    dailyUsageLabel: '每日用量',
    resetLabel: '重置',
    autoRenewLabel: '计费方式',
    active: '有效',
    expired: '未激活',
    noExpiry: '无到期时间',
    freePlan: '免费版',
    unlimited: '无限制',
    loadFailed: '账户加载失败，请重新登录或稍后重试。'
  },
  accountMenu: {
    accountButtonLabel: '打开账户菜单',
    accountMenuLabel: '账户菜单'
  },
  auth: {
    title: '登录后继续',
    eyebrow: '网页登录',
    continueWithGoogle: '使用 Google 继续',
    googleLoading: '正在打开 Google...',
    or: '或',
    emailLabel: '邮箱',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: '使用邮箱继续',
    sendingCode: '发送中...',
    sendCodeSuccess: '验证码已发送。',
    sendAgain: '重新发送',
    codeLabel: '验证码',
    codePlaceholder: '123456',
    signIn: '登录',
    termsNotice: '登录即表示你同意',
    termsLink: '服务条款',
    privacyLink: '隐私政策',
    logout: '退出登录',
    errors: {
      enterEmailFirst: '请先输入邮箱地址。',
      enterEmailAndCode: '请输入邮箱和验证码。',
      sendCodeFailed: '发送验证码失败。',
      googleSignInFailed: 'Google 登录失败。',
      googleClientMissing: 'Google 登录尚未配置。',
      signInFailed: '登录失败。'
    }
  },
  checkout: {
    paymentMethodLabel: '选择支付方式',
    paymentTitle: '选择支付方式',
    selectedPackageLabel: '已选商品',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: '继续支付',
    backToProducts: '返回',
    agreementText: '我已阅读并同意购买条款、服务条款和隐私政策。',
    failed: '支付尚未完成，你可以重试或关闭弹窗。'
  },
  subscriptionManagement: subscriptionManagementCopy.zhCN,
  subscription: {
    pageDescription: '一次订阅，Vimeo Video Downloader 插件内无限下载——没有每日额度。',
    title: '无限下载',
    eyebrow: '插件订阅',
    benefits: ['插件内无限下载', '没有每日额度限制', '仅限插件——适用于电脑端 Vimeo'],
    trustNote: '安全支付',
    monthlyLabel: '每月',
    yearlyLabel: '每年',
    lifetimeLabel: '终生',
    quarterlySavingsLabel: '立省 36%',
    dailyLimitLabel: '每日额度',
    autoRenewOn: '自动续费',
    autoRenewOff: '一次性付款 · 不自动续费',
    usageNotice: '仅限插件内使用',
    loading: '正在加载无限下载...',
    loadFailed: '加载无限下载失败，请稍后重试。',
    noPlan: '无限下载当前不可购买。',
    noChannels: '该订阅暂无可用支付方式。',
    buyNow: '立即购买',
    loginToBuy: '登录后购买',
    alreadyActive: '你已有有效订阅，暂不能重复购买。',
    creatingOrder: '正在创建订单...',
    pendingPaymentTitle: '等待支付',
    pendingPayment: '请在新标签页完成支付，本页面会自动刷新结果。',
    successTitle: 'Unlimited 已激活',
    successDescription: '订阅已生效，账户状态已刷新。',
    failedTitle: '支付未完成',
    close: '关闭',
    cancelPayment: '取消支付',
    supportMailPrefix: '遇到问题请联系：',
    createFailed: '创建订单失败，请稍后重试。',
    invalidPaymentData: '支付链接无效，请稍后重试。',
    priceUpdated: '价格已更新，请确认最新价格后重新购买。',
    gatewayFailed: '支付入口暂不可用，请稍后重试。',
    orderNotFound: '订单已不可用，请重新创建订单。',
    orderExpired: '订单已过期，请重新购买。',
    paymentCanceled: '支付已取消，请重新选择支付方式。',
    fulfillmentFailed: '已收到支付，但订阅暂未完成激活，请稍后重试。',
    pollFailed: '刷新支付状态失败，请稍后重试。',
    pollTimeout: '自动刷新超时，支付完成后请稍后查看账户状态。',
    authExpired: '登录已过期，请重新登录。',
    installConfirmTitle: '确认订阅使用范围',
    installConfirmMessage: '订阅只能在电脑端的插件使用，订阅前请确认你已经安装了插件。{link}',
    installConfirmLinkLabel: '立刻安装',
    installConfirmCancel: '取消',
    installConfirmContinue: '继续',
    reviewReward: reviewRewardCopies.zhCN
  },
  extensionSource: {
    primaryCta: '升级 Unlimited',
    signedOutCta: '登录后升级',
    reviewRewardTitle: '好评赠送 7 天 Unlimited',
    reviewRewardDescription: '前往 Chrome 应用商店留下好评，返回此页面后自动验证并领取。',
  },
  faq: {
    title: '购买前的常见问题',
    items: [
      {
        question: '月卡和年卡怎么选？',
        answer: '想先试试就选月卡；如果确定会长期使用，年卡更划算——折算下来每月明显比按月购买便宜。'
      },
      {
        question: '订阅会自动续费吗？',
        answer: '当前套餐不会自动扣款，到期后想继续再手动购买即可。若某套餐支持自动续费，购买前卡片上会有明确标注。'
      },
      {
        question: '购买后多久生效？',
        answer: '立即生效。支付完成后，Unlimited 会自动添加到你的账户，无需激活码或手动操作。'
      },
      {
        question: '支持哪些支付方式？',
        answer: 'PayPal、主流信用卡／借记卡。'
      }
    ]
  }
}
/** Pricing 页面繁体中文文案。 */
export const zhTWPricingContent: PricingPageContent = {
  ...zhCNPricingContent,
  popularLabel: '最受歡迎',
  account: {
    ...zhCNPricingContent.account,
    title: '帳戶',
    loading: '正在載入帳戶...',
    signedOutTitle: '登入後購買',
    signedOutDescription: '購買會綁定到你的 Vimeo Video Downloader 帳戶。',
    signInCta: '登入',
    signedInLabel: '已登入',
    subscriptionLabel: '訂閱',
    expiresLabel: '到期',
    statusLabel: '狀態',
    dailyUsageLabel: '每日用量',
    resetLabel: '重置',
    autoRenewLabel: '計費方式',
    active: '有效',
    expired: '未啟用',
    noExpiry: '無到期時間',
    freePlan: '免費版',
    unlimited: '無限制',
    loadFailed: '帳戶載入失敗，請重新登入或稍後重試。'
  },
  accountMenu: {
    accountButtonLabel: '開啟帳戶選單',
    accountMenuLabel: '帳戶選單'
  },
  auth: {
    title: '登入後繼續',
    eyebrow: '網頁登入',
    continueWithGoogle: '使用 Google 繼續',
    googleLoading: '正在開啟 Google...',
    or: '或',
    emailLabel: '電子郵件',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: '使用電子郵件繼續',
    sendingCode: '發送中...',
    sendCodeSuccess: '驗證碼已發送。',
    sendAgain: '重新發送',
    codeLabel: '驗證碼',
    codePlaceholder: '123456',
    signIn: '登入',
    termsNotice: '登入即表示你同意',
    termsLink: '服務條款',
    privacyLink: '隱私權政策',
    logout: '登出',
    errors: {
      enterEmailFirst: '請先輸入電子郵件地址。',
      enterEmailAndCode: '請輸入電子郵件與驗證碼。',
      sendCodeFailed: '發送驗證碼失敗。',
      googleSignInFailed: 'Google 登入失敗。',
      googleClientMissing: 'Google 登入尚未設定。',
      signInFailed: '登入失敗。'
    }
  },
  checkout: {
    paymentMethodLabel: '選擇付款方式',
    paymentTitle: '選擇付款方式',
    selectedPackageLabel: '已選商品',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: '繼續付款',
    backToProducts: '返回',
    agreementText: '我已閱讀並同意購買條款、服務條款和隱私政策。',
    failed: '付款尚未完成，你可以重試或關閉彈窗。'
  },
  subscriptionManagement: subscriptionManagementCopy.zhTW,
  subscription: {
    ...zhCNPricingContent.subscription,
    pageDescription: '一次訂閱，Vimeo Video Downloader 外掛內無限下載——沒有每日額度。',
    title: '無限下載',
    eyebrow: '外掛訂閱',
    benefits: ['外掛內無限下載', '沒有每日額度限制', '僅限外掛——適用於電腦端 Vimeo'],
    trustNote: '安全支付',
    monthlyLabel: '每月',
    yearlyLabel: '每年',
    lifetimeLabel: '終生',
    quarterlySavingsLabel: '立省 36%',
    dailyLimitLabel: '每日額度',
    autoRenewOn: '自動續費',
    autoRenewOff: '一次性付款 · 不自動續費',
    usageNotice: '僅限外掛內使用',
    loading: '正在載入無限下載...',
    loadFailed: '載入無限下載失敗，請稍後重試。',
    noPlan: '無限下載目前不可購買。',
    noChannels: '此訂閱暫無可用付款方式。',
    buyNow: '立即購買',
    loginToBuy: '登入後購買',
    alreadyActive: '你已有有效訂閱，暫不能重複購買。',
    creatingOrder: '正在建立訂單...',
    pendingPaymentTitle: '等待付款',
    pendingPayment: '請在新分頁完成付款，本頁面會自動刷新結果。',
    successTitle: 'Unlimited 已啟用',
    successDescription: '訂閱已生效，帳戶狀態已刷新。',
    failedTitle: '付款未完成',
    close: '關閉',
    cancelPayment: '取消付款',
    supportMailPrefix: '遇到問題請聯絡：',
    createFailed: '建立訂單失敗，請稍後重試。',
    invalidPaymentData: '付款連結無效，請稍後重試。',
    priceUpdated: '價格已更新，請確認最新價格後重新購買。',
    gatewayFailed: '付款入口暫不可用，請稍後重試。',
    orderNotFound: '訂單已不可用，請重新建立訂單。',
    orderExpired: '訂單已過期，請重新購買。',
    paymentCanceled: '付款已取消，請重新選擇付款方式。',
    fulfillmentFailed: '已收到付款，但訂閱暫未完成啟用，請稍後重試。',
    pollFailed: '刷新付款狀態失敗，請稍後重試。',
    pollTimeout: '自動刷新逾時，付款完成後請稍後查看帳戶狀態。',
    authExpired: '登入已過期，請重新登入。',
    installConfirmTitle: '確認訂閱使用範圍',
    installConfirmMessage: '訂閱只能在電腦端外掛使用，訂閱前請確認你已經安裝了外掛。{link}',
    installConfirmLinkLabel: '立刻安裝',
    installConfirmCancel: '取消',
    installConfirmContinue: '繼續',
    reviewReward: reviewRewardCopies.zhTW
  },
  extensionSource: {
    ...zhCNPricingContent.extensionSource,
    primaryCta: '升級 Unlimited',
    signedOutCta: '登入後升級',
    reviewRewardTitle: '好評贈送 7 天 Unlimited',
    reviewRewardDescription: '前往 Chrome 線上應用程式商店留下好評，返回此頁面後自動驗證並領取。',
  },
  faq: {
    title: '購買前的常見問題',
    items: [
      {
        question: '月卡和年卡怎麼選？',
        answer: '想先試用就選月卡；如果確定會長期使用，年卡比較划算——換算下來每個月明顯比按月購買便宜。'
      },
      {
        question: '訂閱會自動續訂嗎？',
        answer: '目前方案不會自動扣款，到期後想繼續再手動購買即可。若某方案支援自動續訂，購買前卡片上會清楚標示。'
      },
      {
        question: '購買後多久生效？',
        answer: '立即生效。付款完成後，Unlimited 會自動加入你的帳戶，不需要啟用碼或手動操作。'
      },
      {
        question: '支援哪些付款方式？',
        answer: 'PayPal、主要信用卡／簽帳卡。'
      }
    ]
  }
}
/** Pricing 页面日语文案。 */
export const jaJPPricingContent: PricingPageContent = {
  popularLabel: '一番人気',
  account: {
    title: 'アカウント',
    loading: 'アカウントを読み込み中...',
    signedOutTitle: '購入前にログイン',
    signedOutDescription: 'チェックアウトを続けるにはログインしてください。',
    signInCta: 'ログイン',
    signedInLabel: 'ログイン済み',
    subscriptionLabel: 'プラン',
    expiresLabel: '有効期限',
    statusLabel: 'ステータス',
    dailyUsageLabel: '1日の使用量',
    resetLabel: 'リセット',
    autoRenewLabel: 'お支払い',
    active: '有効',
    expired: '無効',
    noExpiry: '期限なし',
    freePlan: '無料',
    unlimited: '無制限',
    loadFailed: 'アカウントの読み込みに失敗しました。再ログインするか、もう一度お試しください。'
  },
  accountMenu: {
    accountButtonLabel: 'アカウントメニューを開く',
    accountMenuLabel: 'アカウントメニュー'
  },
  auth: {
    title: 'ログインして続行',
    eyebrow: 'Web ログイン',
    continueWithGoogle: 'Google で続行',
    googleLoading: 'Google を開いています...',
    or: 'または',
    emailLabel: 'メールアドレス',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'メールで続行',
    sendingCode: '送信中...',
    sendCodeSuccess: '認証コードを送信しました。',
    sendAgain: '再送信',
    codeLabel: '認証コード',
    codePlaceholder: '123456',
    signIn: 'ログイン',
    termsNotice: 'ログインすると、以下に同意したものとみなされます',
    termsLink: '利用規約',
    privacyLink: 'プライバシーポリシー',
    logout: 'ログアウト',
    errors: {
      enterEmailFirst: '先にメールアドレスを入力してください。',
      enterEmailAndCode: 'メールアドレスと認証コードを入力してください。',
      sendCodeFailed: '認証コードの送信に失敗しました。',
      googleSignInFailed: 'Google ログインに失敗しました。',
      googleClientMissing: 'Google ログインが設定されていません。',
      signInFailed: 'ログインに失敗しました。'
    }
  },
  checkout: {
    paymentMethodLabel: '支払い方法を選択',
    paymentTitle: '支払い方法を選択',
    selectedPackageLabel: '選択した商品',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: '支払いへ進む',
    backToProducts: '戻る',
    agreementText: '購入条件、利用規約、プライバシーポリシーに同意します。',
    failed: '支払いはまだ完了していません。再試行するか、このウィンドウを閉じられます。'
  },
  subscriptionManagement: subscriptionManagementCopy.jaJP,
  subscription: {
    pageDescription: '1つのサブスクリプションで Vimeo Video Downloader 拡張機能内のダウンロードが無制限 — 1日の上限もありません。',
    title: '拡張機能 Unlimited',
    eyebrow: '拡張機能サブスクリプション',
    benefits: [
      '拡張機能内で無制限にダウンロード',
      '1日の上限を気にする必要なし',
      '拡張機能専用 — デスクトップの Vimeo で利用可能'
    ],
    trustNote: '安全な決済',
    monthlyLabel: '月額',
    yearlyLabel: '年額',
    lifetimeLabel: '永続',
    quarterlySavingsLabel: '36%お得',
    dailyLimitLabel: '1日の上限',
    autoRenewOn: '自動更新',
    autoRenewOff: '1回払い · 自動更新なし',
    usageNotice: '拡張機能のみ',
    loading: 'Unlimited プランを読み込み中...',
    loadFailed: 'Unlimited プランの読み込みに失敗しました。後でもう一度お試しください。',
    noPlan: '現在 Unlimited は購入できません。',
    noChannels: 'このプランで利用できる支払い方法がありません。',
    buyNow: '今すぐ購入',
    loginToBuy: 'ログインして購入',
    alreadyActive: '有効なサブスクリプションがすでにあります。追加購入はできません。',
    creatingOrder: '注文を作成中...',
    pendingPaymentTitle: '支払い待ち',
    pendingPayment: '新しいタブで支払いを完了してください。このページは結果を自動更新します。',
    successTitle: 'Unlimited が有効になりました',
    successDescription: 'サブスクリプションが有効です。アカウント状態を更新しました。',
    failedTitle: '支払い未完了',
    close: '閉じる',
    cancelPayment: '支払いをキャンセル',
    supportMailPrefix: '問題を報告: ',
    createFailed: '注文作成に失敗しました。後でもう一度お試しください。',
    invalidPaymentData: '支払いリンクが無効です。後でもう一度お試しください。',
    priceUpdated: '価格が変更されました。最新価格を確認して再購入してください。',
    gatewayFailed: '支払い入口を一時的に利用できません。後でもう一度お試しください。',
    orderNotFound: '注文は利用できなくなりました。新しい注文を作成してください。',
    orderExpired: '注文の期限が切れました。再購入してください。',
    paymentCanceled: '支払いがキャンセルされました。支払い方法を選んでもう一度お試しください。',
    fulfillmentFailed: '支払いは受領済みですが、有効化がまだ完了していません。後でもう一度お試しください。',
    pollFailed: '支払い状態の更新に失敗しました。後でもう一度お試しください。',
    pollTimeout: '自動更新がタイムアウトしました。支払い後にアカウントをご確認ください。',
    authExpired: 'ログイン期限が切れました。再ログインしてください。',
    installConfirmTitle: '拡張機能サブスクリプションの確認',
    installConfirmMessage:
      'サブスクリプションはデスクトップ版ブラウザ拡張機能でのみ利用できます。拡張機能をインストール済みであることを確認してください。{link}',
    installConfirmLinkLabel: '今すぐインストール',
    installConfirmCancel: 'キャンセル',
    installConfirmContinue: '続行',
    reviewReward: reviewRewardCopies.jaJP
  },
  extensionSource: {
    primaryCta: 'Unlimited にアップグレード',
    signedOutCta: 'ログインしてアップグレード',
    reviewRewardTitle: 'レビューで Unlimited を7日間プレゼント',
    reviewRewardDescription:
      'Chrome ウェブストアでレビューを投稿し、このページに戻ると自動で確認して受け取れます。',
  },
  faq: {
    title: '購入前のよくある質問',
    items: [
      {
        question: '月額プランと年額プラン、どちらを選ぶべき？',
        answer: 'まず試すなら月額が柔軟です。継続して使うと分かっているなら年額がお得で、月々の支払いより明確に割安になります。'
      },
      {
        question: 'サブスクリプションは自動更新されますか？',
        answer: '現在のプランは自動請求されません。延長したいときに再度購入してください。自動更新に対応するプランは、購入前にカード上に明確に表示されます。'
      },
      {
        question: '購入はいつ有効になりますか？',
        answer: '即時です。支払いが完了すると、Unlimited は自動でアカウントに追加されます。アクティベーションコードや手動操作は不要です。'
      },
      {
        question: '利用できる支払い方法は？',
        answer: 'PayPal、主要なクレジットカード／デビットカードに対応しています。'
      }
    ]
  }
}
/** Pricing 页面韩语文案。 */
export const koKRPricingContent: PricingPageContent = {
  popularLabel: '가장 인기',
  account: {
    title: '계정',
    loading: '계정을 불러오는 중...',
    signedOutTitle: '구매 전 로그인',
    signedOutDescription: '결제를 계속하려면 로그인하세요.',
    signInCta: '로그인',
    signedInLabel: '로그인됨',
    subscriptionLabel: '플랜',
    expiresLabel: '만료',
    statusLabel: '상태',
    dailyUsageLabel: '일일 사용량',
    resetLabel: '초기화',
    autoRenewLabel: '결제 방식',
    active: '활성',
    expired: '비활성',
    noExpiry: '만료 없음',
    freePlan: '무료',
    unlimited: '무제한',
    loadFailed: '계정을 불러오지 못했습니다. 다시 로그인하거나 재시도하세요.'
  },
  accountMenu: {
    accountButtonLabel: '계정 메뉴 열기',
    accountMenuLabel: '계정 메뉴'
  },
  auth: {
    title: '로그인하여 계속',
    eyebrow: '웹 로그인',
    continueWithGoogle: 'Google로 계속',
    googleLoading: 'Google 여는 중...',
    or: '또는',
    emailLabel: '이메일',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: '이메일로 계속',
    sendingCode: '전송 중...',
    sendCodeSuccess: '인증 코드를 보냈습니다.',
    sendAgain: '다시 보내기',
    codeLabel: '인증 코드',
    codePlaceholder: '123456',
    signIn: '로그인',
    termsNotice: '로그인하면 다음에 동의하게 됩니다',
    termsLink: '이용약관',
    privacyLink: '개인정보 처리방침',
    logout: '로그아웃',
    errors: {
      enterEmailFirst: '먼저 이메일 주소를 입력하세요.',
      enterEmailAndCode: '이메일과 인증 코드를 모두 입력하세요.',
      sendCodeFailed: '인증 코드 전송에 실패했습니다.',
      googleSignInFailed: 'Google 로그인에 실패했습니다.',
      googleClientMissing: 'Google 로그인이 설정되어 있지 않습니다.',
      signInFailed: '로그인에 실패했습니다.'
    }
  },
  checkout: {
    paymentMethodLabel: '결제 수단 선택',
    paymentTitle: '결제 수단 선택',
    selectedPackageLabel: '선택한 상품',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: '결제 계속',
    backToProducts: '뒤로',
    agreementText: '구매 조건, 이용 약관 및 개인정보 처리방침에 동의합니다.',
    failed: '결제가 아직 완료되지 않았습니다. 다시 시도하거나 이 창을 닫을 수 있습니다.'
  },
  subscriptionManagement: subscriptionManagementCopy.koKR,
  subscription: {
    pageDescription: '하나의 구독으로 Vimeo Video Downloader 확장 프로그램에서 무제한 다운로드 — 일일 한도가 없습니다.',
    title: '확장 프로그램 Unlimited',
    eyebrow: '확장 프로그램 구독',
    benefits: [
      '확장 프로그램에서 무제한 다운로드',
      '일일 한도 걱정 없음',
      '확장 프로그램 전용 — 데스크톱 Vimeo에서 사용 가능'
    ],
    trustNote: '안전한 결제',
    monthlyLabel: '월별',
    yearlyLabel: '연간',
    lifetimeLabel: '평생',
    quarterlySavingsLabel: '36% 절약',
    dailyLimitLabel: '일일 한도',
    autoRenewOn: '자동 갱신',
    autoRenewOff: '한 번 결제 · 자동 갱신 없음',
    usageNotice: '확장 프로그램 전용',
    loading: 'Unlimited 플랜을 불러오는 중...',
    loadFailed: 'Unlimited 플랜을 불러오지 못했습니다. 나중에 다시 시도하세요.',
    noPlan: '현재 Unlimited를 구매할 수 없습니다.',
    noChannels: '이 플랜에 사용할 수 있는 결제 수단이 없습니다.',
    buyNow: '지금 구매',
    loginToBuy: '로그인 후 구매',
    alreadyActive: '이미 활성 구독이 있어 추가로 구매할 수 없습니다.',
    creatingOrder: '주문을 생성하는 중...',
    pendingPaymentTitle: '결제 대기 중',
    pendingPayment: '새 탭에서 결제를 완료하세요. 이 페이지에서 결과를 자동으로 새로고침합니다.',
    successTitle: 'Unlimited가 활성화되었습니다',
    successDescription: '구독이 활성 상태입니다. 계정 상태를 새로고침했습니다.',
    failedTitle: '결제가 완료되지 않음',
    close: '닫기',
    cancelPayment: '결제 취소',
    supportMailPrefix: '문제 신고: ',
    createFailed: '주문 생성에 실패했습니다. 나중에 다시 시도하세요.',
    invalidPaymentData: '결제 링크가 올바르지 않습니다. 나중에 다시 시도하세요.',
    priceUpdated: '가격이 변경되었습니다. 최신 가격을 확인하고 다시 구매하세요.',
    gatewayFailed: '결제 진입점을 일시적으로 사용할 수 없습니다. 나중에 다시 시도하세요.',
    orderNotFound: '주문을 더 이상 사용할 수 없습니다. 새 주문을 생성하세요.',
    orderExpired: '주문이 만료되었습니다. 다시 구매하세요.',
    paymentCanceled: '결제가 취소되었습니다. 결제 수단을 선택하고 다시 시도하세요.',
    fulfillmentFailed: '결제는 수신되었지만 활성화가 아직 완료되지 않았습니다. 나중에 다시 시도하세요.',
    pollFailed: '결제 상태를 새로고침하지 못했습니다. 나중에 다시 시도하세요.',
    pollTimeout: '자동 새로고침 시간이 초과되었습니다. 결제 후 계정을 확인하세요.',
    authExpired: '로그인이 만료되었습니다. 다시 로그인하세요.',
    installConfirmTitle: '확장 프로그램 구독 확인',
    installConfirmMessage:
      '구독은 데스크톱 브라우저 확장 프로그램에서만 사용할 수 있습니다. 확장 프로그램을 설치했는지 확인하세요. {link}',
    installConfirmLinkLabel: '지금 설치',
    installConfirmCancel: '취소',
    installConfirmContinue: '계속',
    reviewReward: reviewRewardCopies.koKR
  },
  extensionSource: {
    primaryCta: 'Unlimited로 업그레이드',
    signedOutCta: '로그인 후 업그레이드',
    reviewRewardTitle: '리뷰 작성 시 Unlimited 7일 증정',
    reviewRewardDescription:
      'Chrome 웹 스토어에 리뷰를 남긴 후 이 페이지로 돌아오면 자동으로 확인하고 지급합니다.',
  },
  faq: {
    title: '구매 전 궁금한 점이 있으신가요?',
    items: [
      {
        question: '월간 플랜과 연간 플랜 중 무엇을 골라야 하나요?',
        answer: '먼저 사용해 보려면 월간이 유연합니다. 계속 이용할 것을 안다면 연간이 더 유리하고, 월 단위로 환산하면 매달 결제하는 것보다 명확하게 저렴합니다.'
      },
      {
        question: '구독이 자동 갱신되나요?',
        answer: '현재 플랜은 자동으로 결제하지 않습니다. 이용을 연장하고 싶을 때 다시 구매하세요. 자동 갱신을 지원하는 플랜은 결제 전 카드에 명확하게 표시됩니다.'
      },
      {
        question: '구매는 언제 적용되나요?',
        answer: '즉시입니다. 결제가 완료되면 Unlimited가 계정에 자동으로 추가됩니다. 활성화 코드나 수동 절차가 필요 없습니다.'
      },
      {
        question: '사용할 수 있는 결제 수단은 무엇인가요?',
        answer: 'PayPal, 주요 신용·체크카드를 지원합니다.'
      }
    ]
  }
}
/** Pricing 页面西班牙语文案。 */
export const esESPricingContent: PricingPageContent = {
  popularLabel: 'Más popular',
  account: {
    title: 'Cuenta',
    loading: 'Cargando cuenta...',
    signedOutTitle: 'Inicia sesión antes de comprar',
    signedOutDescription: 'Inicia sesión para continuar con el pago.',
    signInCta: 'Iniciar sesión',
    signedInLabel: 'Sesión iniciada',
    subscriptionLabel: 'Plan',
    expiresLabel: 'Caduca',
    statusLabel: 'Estado',
    dailyUsageLabel: 'Uso diario',
    resetLabel: 'Restablecer',
    autoRenewLabel: 'Facturación',
    active: 'Activo',
    expired: 'Inactivo',
    noExpiry: 'Sin caducidad',
    freePlan: 'Gratis',
    unlimited: 'Ilimitado',
    loadFailed: 'No se pudo cargar la cuenta. Inicia sesión de nuevo o reintenta.'
  },
  accountMenu: {
    accountButtonLabel: 'Abrir menú de cuenta',
    accountMenuLabel: 'Menú de cuenta'
  },
  auth: {
    title: 'Inicia sesión para continuar',
    eyebrow: 'Acceso web',
    continueWithGoogle: 'Continuar con Google',
    googleLoading: 'Abriendo Google...',
    or: 'o',
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'Continuar con email',
    sendingCode: 'Enviando...',
    sendCodeSuccess: 'Código de verificación enviado.',
    sendAgain: 'Enviar de nuevo',
    codeLabel: 'Código de verificación',
    codePlaceholder: '123456',
    signIn: 'Iniciar sesión',
    termsNotice: 'Al iniciar sesión aceptas los',
    termsLink: 'Términos',
    privacyLink: 'Política de privacidad',
    logout: 'Cerrar sesión',
    errors: {
      enterEmailFirst: 'Primero introduce tu correo electrónico.',
      enterEmailAndCode: 'Introduce el correo electrónico y el código de verificación.',
      sendCodeFailed: 'No se pudo enviar el código de verificación.',
      googleSignInFailed: 'No se pudo iniciar sesión con Google.',
      googleClientMissing: 'El inicio de sesión con Google no está configurado.',
      signInFailed: 'No se pudo iniciar sesión.'
    }
  },
  checkout: {
    paymentMethodLabel: 'Elige método de pago',
    paymentTitle: 'Elige método de pago',
    selectedPackageLabel: 'Producto seleccionado',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: 'Continuar al pago',
    backToProducts: 'Volver',
    agreementText: 'Acepto los términos de compra, los Términos y la Política de privacidad.',
    failed: 'El pago no está completo. Puedes reintentar o cerrar esta ventana.'
  },
  subscriptionManagement: subscriptionManagementCopy.esES,
  subscription: {
    pageDescription: 'Una sola suscripción para descargas ilimitadas en la extensión Vimeo Video Downloader — sin límite diario.',
    title: 'Unlimited para extensión',
    eyebrow: 'Suscripción para la extensión',
    benefits: [
      'Descargas ilimitadas en la extensión',
      'Sin límite diario que gestionar',
      'Solo extensión — funciona con Vimeo en escritorio'
    ],
    trustNote: 'Pago seguro',
    monthlyLabel: 'al mes',
    yearlyLabel: 'al año',
    lifetimeLabel: 'De por vida',
    quarterlySavingsLabel: 'Ahorra 36%',
    dailyLimitLabel: 'Límite diario',
    autoRenewOn: 'Renovación automática',
    autoRenewOff: 'Pago único · Sin renovación automática',
    usageNotice: 'Solo extensión',
    loading: 'Cargando plan Unlimited...',
    loadFailed: 'No se pudo cargar el plan Unlimited. Reintenta más tarde.',
    noPlan: 'Unlimited no está disponible ahora.',
    noChannels: 'No hay métodos de pago disponibles para este plan.',
    buyNow: 'Comprar ahora',
    loginToBuy: 'Inicia sesión para comprar',
    alreadyActive: 'Ya tienes una suscripción activa. No puedes comprar otra.',
    creatingOrder: 'Creando pedido...',
    pendingPaymentTitle: 'Esperando pago',
    pendingPayment: 'Completa el pago en la nueva pestaña. Esta página actualizará el resultado automáticamente.',
    successTitle: 'Unlimited activado',
    successDescription: 'Tu suscripción está activa. El estado de la cuenta se actualizó.',
    failedTitle: 'Pago incompleto',
    close: 'Cerrar',
    cancelPayment: 'Cancelar pago',
    supportMailPrefix: 'Reportar un problema: ',
    createFailed: 'No se pudo crear el pedido. Reintenta más tarde.',
    invalidPaymentData: 'El enlace de pago no es válido. Reintenta más tarde.',
    priceUpdated: 'El precio cambió. Revisa el precio actualizado y vuelve a comprar.',
    gatewayFailed: 'La entrada de pago no está disponible temporalmente. Reintenta más tarde.',
    orderNotFound: 'El pedido ya no está disponible. Crea uno nuevo.',
    orderExpired: 'El pedido caducó. Compra de nuevo.',
    paymentCanceled: 'El pago fue cancelado. Elige un método de pago e inténtalo otra vez.',
    fulfillmentFailed: 'Recibimos el pago, pero la activación aún no se completó. Reintenta más tarde.',
    pollFailed: 'No se pudo actualizar el estado del pago. Reintenta más tarde.',
    pollTimeout: 'La actualización automática agotó el tiempo. Revisa tu cuenta después del pago.',
    authExpired: 'La sesión caducó. Inicia sesión de nuevo para continuar.',
    installConfirmTitle: 'Confirma la suscripción de extensión',
    installConfirmMessage:
      'La suscripción solo se puede usar en la extensión de escritorio del navegador. Confirma que ya instalaste la extensión. {link}',
    installConfirmLinkLabel: 'Instalar ahora',
    installConfirmCancel: 'Cancelar',
    installConfirmContinue: 'Continuar',
    reviewReward: reviewRewardCopies.esES
  },
  extensionSource: {
    primaryCta: 'Actualizar a Unlimited',
    signedOutCta: 'Inicia sesión para actualizar',
    reviewRewardTitle: 'Recibe 7 días de Unlimited',
    reviewRewardDescription:
      'Deja una reseña en Chrome Web Store y vuelve aquí para verificarla y reclamar la recompensa.',
  },
  faq: {
    title: '¿Dudas antes de comprar?',
    items: [
      {
        question: '¿Qué plan elijo: mensual o anual?',
        answer: 'El mensual es la forma flexible de empezar. El anual conviene más si ya sabes que seguirás descargando: sale claramente más barato por mes que pagar mes a mes.'
      },
      {
        question: '¿Mi suscripción se renueva automáticamente?',
        answer: 'Actualmente los planes no te cobran automáticamente: vuelve a comprar cuando quieras ampliar el acceso. Si un plan admite renovación automática, se indica claramente en la tarjeta antes de pagar.'
      },
      {
        question: '¿Cuándo surte efecto mi compra?',
        answer: 'Inmediatamente. Una vez completado el pago, Unlimited se añade automáticamente a tu cuenta; no necesitas código de activación ni pasos manuales.'
      },
      {
        question: '¿Qué métodos de pago puedo usar?',
        answer: 'PayPal y las principales tarjetas de crédito o débito.'
      }
    ]
  }
}
/** Pricing 页面葡萄牙语文案。 */
export const ptBRPricingContent: PricingPageContent = {
  popularLabel: 'Mais popular',
  account: {
    title: 'Conta',
    loading: 'Carregando conta...',
    signedOutTitle: 'Entre antes de comprar',
    signedOutDescription: 'Entre para continuar com o checkout.',
    signInCta: 'Entrar',
    signedInLabel: 'Conectado',
    subscriptionLabel: 'Plano',
    expiresLabel: 'Expira',
    statusLabel: 'Status',
    dailyUsageLabel: 'Uso diário',
    resetLabel: 'Redefinir',
    autoRenewLabel: 'Cobrança',
    active: 'Ativo',
    expired: 'Inativo',
    noExpiry: 'Sem expiração',
    freePlan: 'Grátis',
    unlimited: 'Ilimitado',
    loadFailed: 'Não foi possível carregar a conta. Entre novamente ou tente de novo.'
  },
  accountMenu: {
    accountButtonLabel: 'Abrir menu da conta',
    accountMenuLabel: 'Menu da conta'
  },
  auth: {
    title: 'Entre para continuar',
    eyebrow: 'Acesso web',
    continueWithGoogle: 'Continuar com Google',
    googleLoading: 'Abrindo o Google...',
    or: 'ou',
    emailLabel: 'E-mail',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'Continuar com e-mail',
    sendingCode: 'Enviando...',
    sendCodeSuccess: 'Código de verificação enviado.',
    sendAgain: 'Enviar novamente',
    codeLabel: 'Código de verificação',
    codePlaceholder: '123456',
    signIn: 'Entrar',
    termsNotice: 'Ao entrar, você aceita os',
    termsLink: 'Termos',
    privacyLink: 'Política de Privacidade',
    logout: 'Sair',
    errors: {
      enterEmailFirst: 'Digite seu e-mail primeiro.',
      enterEmailAndCode: 'Digite o e-mail e o código de verificação.',
      sendCodeFailed: 'Não foi possível enviar o código de verificação.',
      googleSignInFailed: 'Não foi possível entrar com o Google.',
      googleClientMissing: 'O login com Google não está configurado.',
      signInFailed: 'Não foi possível entrar.'
    }
  },
  checkout: {
    paymentMethodLabel: 'Escolha o método de pagamento',
    paymentTitle: 'Escolha o método de pagamento',
    selectedPackageLabel: 'Produto selecionado',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: 'Continuar para pagamento',
    backToProducts: 'Voltar',
    agreementText: 'Aceito os termos de compra, os Termos e a Política de Privacidade.',
    failed: 'O pagamento não foi concluído. Você pode tentar novamente ou fechar esta janela.'
  },
  subscriptionManagement: subscriptionManagementCopy.ptBR,
  subscription: {
    pageDescription: 'Uma assinatura para downloads ilimitados na extensão Vimeo Video Downloader — sem cota diária.',
    title: 'Unlimited para extensão',
    eyebrow: 'Assinatura para a extensão',
    benefits: [
      'Downloads ilimitados na extensão',
      'Sem cota diária para gerenciar',
      'Somente extensão — funciona com o Vimeo no desktop'
    ],
    trustNote: 'Checkout seguro',
    monthlyLabel: 'por mês',
    yearlyLabel: 'por ano',
    lifetimeLabel: 'Vitalício',
    quarterlySavingsLabel: 'Economize 36%',
    dailyLimitLabel: 'Limite diário',
    autoRenewOn: 'Renovação automática',
    autoRenewOff: 'Pagamento único · Sem renovação automática',
    usageNotice: 'Somente extensão',
    loading: 'Carregando plano Unlimited...',
    loadFailed: 'Não foi possível carregar o plano Unlimited. Tente mais tarde.',
    noPlan: 'Unlimited não está disponível agora.',
    noChannels: 'Nenhum método de pagamento está disponível para este plano.',
    buyNow: 'Comprar agora',
    loginToBuy: 'Entre para comprar',
    alreadyActive: 'Você já tem uma assinatura ativa. Não é possível comprar outra.',
    creatingOrder: 'Criando pedido...',
    pendingPaymentTitle: 'Aguardando pagamento',
    pendingPayment: 'Conclua o pagamento na nova aba. Esta página atualizará o resultado automaticamente.',
    successTitle: 'Unlimited ativado',
    successDescription: 'Sua assinatura está ativa. O status da conta foi atualizado.',
    failedTitle: 'Pagamento incompleto',
    close: 'Fechar',
    cancelPayment: 'Cancelar pagamento',
    supportMailPrefix: 'Relatar um problema: ',
    createFailed: 'Não foi possível criar o pedido. Tente mais tarde.',
    invalidPaymentData: 'O link de pagamento é inválido. Tente mais tarde.',
    priceUpdated: 'O preço mudou. Confira o preço atualizado e compre novamente.',
    gatewayFailed: 'A entrada de pagamento está temporariamente indisponível. Tente mais tarde.',
    orderNotFound: 'O pedido não está mais disponível. Crie um novo pedido.',
    orderExpired: 'O pedido expirou. Compre novamente.',
    paymentCanceled: 'O pagamento foi cancelado. Escolha um método de pagamento e tente novamente.',
    fulfillmentFailed: 'O pagamento foi recebido, mas a ativação ainda não foi concluída. Tente mais tarde.',
    pollFailed: 'Não foi possível atualizar o status do pagamento. Tente mais tarde.',
    pollTimeout: 'A atualização automática expirou. Verifique sua conta após o pagamento.',
    authExpired: 'A sessão expirou. Entre novamente para continuar.',
    installConfirmTitle: 'Confirme a assinatura da extensão',
    installConfirmMessage:
      'A assinatura só pode ser usada na extensão de navegador no desktop. Confirme que você já instalou a extensão. {link}',
    installConfirmLinkLabel: 'Instalar agora',
    installConfirmCancel: 'Cancelar',
    installConfirmContinue: 'Continuar',
    reviewReward: reviewRewardCopies.ptBR
  },
  extensionSource: {
    primaryCta: 'Fazer upgrade para Unlimited',
    signedOutCta: 'Entre para fazer upgrade',
    reviewRewardTitle: 'Ganhe 7 dias de Unlimited',
    reviewRewardDescription:
      'Deixe uma avaliação na Chrome Web Store e volte aqui para verificarmos e liberar a recompensa.',
  },
  faq: {
    title: 'Dúvidas antes de comprar?',
    items: [
      {
        question: 'Qual plano escolher: mensual ou anual?',
        answer: 'O mensal é a forma flexível de começar. O anual vale mais a pena se você já sabe que vai continuar baixando — sai claramente mais barato por mês do que pagar mês a mês.'
      },
      {
        question: 'Minha assinatura renova automaticamente?',
        answer: 'Atualmente os planos não cobram automaticamente — compre de novo quando quiser estender o acesso. Se um plano tiver renovação automática, isso fica indicado no cartão antes do checkout.'
      },
      {
        question: 'Quando minha compra entra em vigor?',
        answer: 'Imediatamente. Assim que o pagamento é concluído, o Unlimited é adicionado à sua conta automaticamente — sem código de ativação ou etapa manual.'
      },
      {
        question: 'Quais métodos de pagamento posso usar?',
        answer: 'PayPal e os principais cartões de crédito ou débito.'
      }
    ]
  }
}
/** Pricing 页面德语文案。 */
export const deDEPricingContent: PricingPageContent = {
  popularLabel: 'Am beliebtesten',
  account: {
    title: 'Konto',
    loading: 'Konto wird geladen...',
    signedOutTitle: 'Vor dem Kauf anmelden',
    signedOutDescription: 'Melde dich an, um mit dem Checkout fortzufahren.',
    signInCta: 'Anmelden',
    signedInLabel: 'Angemeldet',
    subscriptionLabel: 'Plan',
    expiresLabel: 'Läuft ab',
    statusLabel: 'Status',
    dailyUsageLabel: 'Tägliche Nutzung',
    resetLabel: 'Zurücksetzen',
    autoRenewLabel: 'Abrechnung',
    active: 'Aktiv',
    expired: 'Inaktiv',
    noExpiry: 'Kein Ablaufdatum',
    freePlan: 'Kostenlos',
    unlimited: 'Unbegrenzt',
    loadFailed: 'Konto konnte nicht geladen werden. Melde dich erneut an oder versuche es noch einmal.'
  },
  accountMenu: {
    accountButtonLabel: 'Kontomenü öffnen',
    accountMenuLabel: 'Kontomenü'
  },
  auth: {
    title: 'Anmelden, um fortzufahren',
    eyebrow: 'Web-Zugang',
    continueWithGoogle: 'Mit Google fortfahren',
    googleLoading: 'Google wird geöffnet...',
    or: 'oder',
    emailLabel: 'E-Mail',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'Mit E-Mail fortfahren',
    sendingCode: 'Wird gesendet...',
    sendCodeSuccess: 'Bestätigungscode wurde gesendet.',
    sendAgain: 'Erneut senden',
    codeLabel: 'Bestätigungscode',
    codePlaceholder: '123456',
    signIn: 'Anmelden',
    termsNotice: 'Mit der Anmeldung akzeptierst du die',
    termsLink: 'Bedingungen',
    privacyLink: 'Datenschutzerklärung',
    logout: 'Abmelden',
    errors: {
      enterEmailFirst: 'Bitte gib zuerst deine E-Mail-Adresse ein.',
      enterEmailAndCode: 'Bitte gib E-Mail-Adresse und Bestätigungscode ein.',
      sendCodeFailed: 'Der Bestätigungscode konnte nicht gesendet werden.',
      googleSignInFailed: 'Google-Anmeldung fehlgeschlagen.',
      googleClientMissing: 'Google-Anmeldung ist nicht konfiguriert.',
      signInFailed: 'Anmeldung fehlgeschlagen.'
    }
  },
  checkout: {
    paymentMethodLabel: 'Zahlungsmethode wählen',
    paymentTitle: 'Zahlungsmethode wählen',
    selectedPackageLabel: 'Ausgewähltes Produkt',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: 'Weiter zur Zahlung',
    backToProducts: 'Zurück',
    agreementText: 'Ich stimme den Kaufbedingungen, den Nutzungsbedingungen und der Datenschutzrichtlinie zu.',
    failed: 'Die Zahlung ist nicht abgeschlossen. Du kannst es erneut versuchen oder dieses Fenster schließen.'
  },
  subscriptionManagement: subscriptionManagementCopy.deDE,
  subscription: {
    pageDescription: 'Ein Abo für unbegrenzte Downloads in der Vimeo Video Downloader Erweiterung — kein Tageslimit.',
    title: 'Erweiterung Unlimited',
    eyebrow: 'Erweiterungs-Abo',
    benefits: [
      'Unbegrenzte Downloads in der Erweiterung',
      'Kein Tageslimit zu verwalten',
      'Nur Erweiterung — funktioniert mit Vimeo auf dem Desktop'
    ],
    trustNote: 'Sicherer Checkout',
    monthlyLabel: 'pro Monat',
    yearlyLabel: 'pro Jahr',
    lifetimeLabel: 'Lebenslang',
    quarterlySavingsLabel: '36 % sparen',
    dailyLimitLabel: 'Tageslimit',
    autoRenewOn: 'Automatische Verlängerung',
    autoRenewOff: 'Einmal zahlen · Keine automatische Verlängerung',
    usageNotice: 'Nur Erweiterung',
    loading: 'Unlimited-Plan wird geladen...',
    loadFailed: 'Unlimited-Plan konnte nicht geladen werden. Versuche es später erneut.',
    noPlan: 'Unlimited ist derzeit nicht verfügbar.',
    noChannels: 'Für diesen Plan ist keine Zahlungsmethode verfügbar.',
    buyNow: 'Jetzt kaufen',
    loginToBuy: 'Zum Kaufen anmelden',
    alreadyActive: 'Du hast bereits ein aktives Abo. Du kannst kein weiteres kaufen.',
    creatingOrder: 'Bestellung wird erstellt...',
    pendingPaymentTitle: 'Warten auf Zahlung',
    pendingPayment: 'Schließe die Zahlung im neuen Tab ab. Diese Seite aktualisiert das Ergebnis automatisch.',
    successTitle: 'Unlimited aktiviert',
    successDescription: 'Dein Abonnement ist aktiv. Der Kontostatus wurde aktualisiert.',
    failedTitle: 'Zahlung unvollständig',
    close: 'Schließen',
    cancelPayment: 'Zahlung abbrechen',
    supportMailPrefix: 'Problem melden: ',
    createFailed: 'Bestellung konnte nicht erstellt werden. Versuche es später erneut.',
    invalidPaymentData: 'Der Zahlungslink ist ungültig. Versuche es später erneut.',
    priceUpdated: 'Der Preis hat sich geändert. Prüfe den aktuellen Preis und kaufe erneut.',
    gatewayFailed: 'Der Zahlungseinstieg ist vorübergehend nicht verfügbar. Versuche es später erneut.',
    orderNotFound: 'Die Bestellung ist nicht mehr verfügbar. Erstelle eine neue Bestellung.',
    orderExpired: 'Die Bestellung ist abgelaufen. Kaufe erneut.',
    paymentCanceled: 'Die Zahlung wurde abgebrochen. Wähle eine Zahlungsmethode und versuche es erneut.',
    fulfillmentFailed: 'Die Zahlung wurde empfangen, aber die Aktivierung ist noch nicht abgeschlossen. Versuche es später erneut.',
    pollFailed: 'Zahlungsstatus konnte nicht aktualisiert werden. Versuche es später erneut.',
    pollTimeout: 'Die automatische Aktualisierung ist abgelaufen. Prüfe dein Konto nach der Zahlung.',
    authExpired: 'Die Anmeldung ist abgelaufen. Melde dich erneut an, um fortzufahren.',
    installConfirmTitle: 'Erweiterungs-Abo bestätigen',
    installConfirmMessage:
      'Das Abo kann nur in der Desktop-Browsererweiterung verwendet werden. Bitte bestätige, dass du die Erweiterung installiert hast. {link}',
    installConfirmLinkLabel: 'Jetzt installieren',
    installConfirmCancel: 'Abbrechen',
    installConfirmContinue: 'Weiter',
    reviewReward: reviewRewardCopies.deDE
  },
  extensionSource: {
    primaryCta: 'Auf Unlimited upgraden',
    signedOutCta: 'Zum Upgrade anmelden',
    reviewRewardTitle: '7 Tage Unlimited erhalten',
    reviewRewardDescription:
      'Gib eine Bewertung im Chrome Web Store ab und kehre hierher zurück, um sie prüfen zu lassen und die Belohnung zu erhalten.',
  },
  faq: {
    title: 'Fragen vor dem Kauf?',
    items: [
      {
        question: 'Welchen Plan soll ich wählen — monatlich oder jährlich?',
        answer: 'Monatlich ist der flexible Einstieg. Jährlich lohnt sich, wenn du weißt, dass du weiterladen wirst — pro Monat ist das deutlich günstiger als Monat für Monat zu zahlen.'
      },
      {
        question: 'Verlängert sich mein Abo automatisch?',
        answer: 'Aktuelle Pläne belasten dich nicht automatisch — kaufe einfach erneut, um deinen Zugang zu verlängern. Unterstützt ein Plan die automatische Verlängerung, ist das vor dem Kauf klar auf der Karte gekennzeichnet.'
      },
      {
        question: 'Wann wird mein Kauf wirksam?',
        answer: 'Sofort. Nach Abschluss der Zahlung wird Unlimited automatisch deinem Konto hinzugefügt — kein Aktivierungscode, kein manueller Schritt.'
      },
      {
        question: 'Welche Zahlungsmethoden kann ich verwenden?',
        answer: 'PayPal sowie gängige Kredit- und Debitkarten.'
      }
    ]
  }
}
/** Pricing 页面法语文案。 */
export const frFRPricingContent: PricingPageContent = {
  popularLabel: 'Le plus populaire',
  account: {
    title: 'Compte',
    loading: 'Chargement du compte...',
    signedOutTitle: 'Connectez-vous avant d’acheter',
    signedOutDescription: 'Connectez-vous pour continuer le paiement.',
    signInCta: 'Se connecter',
    signedInLabel: 'Connecté',
    subscriptionLabel: 'Forfait',
    expiresLabel: 'Expire',
    statusLabel: 'État',
    dailyUsageLabel: 'Utilisation quotidienne',
    resetLabel: 'Réinitialisation',
    autoRenewLabel: 'Facturation',
    active: 'Actif',
    expired: 'Inactif',
    noExpiry: 'Aucune expiration',
    freePlan: 'Gratuit',
    unlimited: 'Illimité',
    loadFailed: 'Impossible de charger le compte. Reconnectez-vous ou réessayez.'
  },
  accountMenu: {
    accountButtonLabel: 'Ouvrir le menu du compte',
    accountMenuLabel: 'Menu du compte'
  },
  auth: {
    title: 'Connectez-vous pour continuer',
    eyebrow: 'Accès web',
    continueWithGoogle: 'Continuer avec Google',
    googleLoading: 'Ouverture de Google...',
    or: 'ou',
    emailLabel: 'E-mail',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'Continuer avec l’e-mail',
    sendingCode: 'Envoi...',
    sendCodeSuccess: 'Code de vérification envoyé.',
    sendAgain: 'Renvoyer',
    codeLabel: 'Code de vérification',
    codePlaceholder: '123456',
    signIn: 'Se connecter',
    termsNotice: 'En vous connectant, vous acceptez les',
    termsLink: 'Conditions',
    privacyLink: 'Politique de confidentialité',
    logout: 'Se déconnecter',
    errors: {
      enterEmailFirst: 'Veuillez d’abord saisir votre adresse e-mail.',
      enterEmailAndCode: 'Veuillez saisir l’e-mail et le code de vérification.',
      sendCodeFailed: 'Impossible d’envoyer le code de vérification.',
      googleSignInFailed: 'Connexion Google impossible.',
      googleClientMissing: 'La connexion Google n’est pas configurée.',
      signInFailed: 'Impossible de se connecter.'
    }
  },
  checkout: {
    paymentMethodLabel: 'Choisir le moyen de paiement',
    paymentTitle: 'Choisir le moyen de paiement',
    selectedPackageLabel: 'Produit sélectionné',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: 'Continuer vers le paiement',
    backToProducts: 'Retour',
    agreementText: 'J’accepte les conditions d’achat, les Conditions et la Politique de confidentialité.',
    failed: 'Le paiement n’est pas terminé. Vous pouvez réessayer ou fermer cette fenêtre.'
  },
  subscriptionManagement: subscriptionManagementCopy.frFR,
  subscription: {
    pageDescription: 'Un seul abonnement pour des téléchargements illimités dans l’extension Vimeo Video Downloader — sans quota quotidien.',
    title: 'Unlimited pour extension',
    eyebrow: 'Abonnement pour l’extension',
    benefits: [
      'Téléchargements illimités dans l’extension',
      'Aucun quota quotidien à gérer',
      'Extension uniquement — fonctionne avec Vimeo sur ordinateur'
    ],
    trustNote: 'Paiement sécurisé',
    monthlyLabel: 'par mois',
    yearlyLabel: 'par an',
    lifetimeLabel: 'À vie',
    quarterlySavingsLabel: 'Économisez 36 %',
    dailyLimitLabel: 'Limite quotidienne',
    autoRenewOn: 'Renouvellement automatique',
    autoRenewOff: 'Paiement unique · Sans renouvellement automatique',
    usageNotice: 'Extension uniquement',
    loading: 'Chargement du forfait Unlimited...',
    loadFailed: 'Impossible de charger le forfait Unlimited. Réessayez plus tard.',
    noPlan: 'Unlimited n’est pas disponible pour le moment.',
    noChannels: 'Aucun moyen de paiement n’est disponible pour ce forfait.',
    buyNow: 'Acheter maintenant',
    loginToBuy: 'Connectez-vous pour acheter',
    alreadyActive: 'Vous avez déjà un abonnement actif. Vous ne pouvez pas en acheter un autre.',
    creatingOrder: 'Création de la commande...',
    pendingPaymentTitle: 'En attente du paiement',
    pendingPayment: 'Terminez le paiement dans le nouvel onglet. Cette page actualisera le résultat automatiquement.',
    successTitle: 'Unlimited activé',
    successDescription: 'Votre abonnement est actif. L’état du compte a été actualisé.',
    failedTitle: 'Paiement incomplet',
    close: 'Fermer',
    cancelPayment: 'Annuler le paiement',
    supportMailPrefix: 'Signaler un problème : ',
    createFailed: 'Impossible de créer la commande. Réessayez plus tard.',
    invalidPaymentData: 'Le lien de paiement est invalide. Réessayez plus tard.',
    priceUpdated: 'Le prix a changé. Vérifiez le nouveau prix puis rachetez.',
    gatewayFailed: 'L’accès au paiement est temporairement indisponible. Réessayez plus tard.',
    orderNotFound: 'La commande n’est plus disponible. Créez une nouvelle commande.',
    orderExpired: 'La commande a expiré. Achetez à nouveau.',
    paymentCanceled: 'Le paiement a été annulé. Choisissez un moyen de paiement et réessayez.',
    fulfillmentFailed: 'Le paiement a été reçu, mais l’activation n’est pas encore terminée. Réessayez plus tard.',
    pollFailed: 'Impossible d’actualiser l’état du paiement. Réessayez plus tard.',
    pollTimeout: 'L’actualisation automatique a expiré. Vérifiez votre compte après le paiement.',
    authExpired: 'La connexion a expiré. Reconnectez-vous pour continuer.',
    installConfirmTitle: 'Confirmer l’abonnement extension',
    installConfirmMessage:
      'L’abonnement ne peut être utilisé que dans l’extension de navigateur sur ordinateur. Confirmez que vous avez installé l’extension. {link}',
    installConfirmLinkLabel: 'Installer maintenant',
    installConfirmCancel: 'Annuler',
    installConfirmContinue: 'Continuer',
    reviewReward: reviewRewardCopies.frFR
  },
  extensionSource: {
    primaryCta: 'Passer à Unlimited',
    signedOutCta: 'Connectez-vous pour passer à Unlimited',
    reviewRewardTitle: 'Recevez 7 jours Unlimited',
    reviewRewardDescription:
      'Laissez un avis sur le Chrome Web Store, puis revenez ici pour le faire vérifier et recevoir la récompense.',
  },
  faq: {
    title: 'Des questions avant d’acheter ?',
    items: [
      {
        question: 'Quel forfait choisir — mensuel ou annuel ?',
        answer: 'Le mensuel est la façon flexible de commencer. L’annuel est plus avantageux si vous savez déjà que vous continuerez à télécharger — il revient clairement moins cher par mois que le paiement au mois.'
      },
      {
        question: 'Mon abonnement se renouvelle-t-il automatiquement ?',
        answer: 'Actuellement, les forfaits ne prélèvent rien automatiquement — rachetez quand vous voulez pour prolonger l’accès. Si un forfait prend en charge le renouvellement automatique, c’est clairement indiqué sur la carte avant le paiement.'
      },
      {
        question: 'Quand mon achat prend-il effet ?',
        answer: 'Immédiatement. Une fois le paiement finalisé, Unlimited est ajouté automatiquement à votre compte — sans code d’activation ni étape manuelle.'
      },
      {
        question: 'Quels moyens de paiement puis-je utiliser ?',
        answer: 'PayPal et les principales cartes de crédit ou de débit.'
      }
    ]
  }
}
/** Pricing 页面俄语文案。 */
export const ruRUPricingContent: PricingPageContent = {
  popularLabel: 'Самый популярный',
  account: {
    title: 'Аккаунт',
    loading: 'Загрузка аккаунта...',
    signedOutTitle: 'Войдите перед покупкой',
    signedOutDescription: 'Войдите, чтобы продолжить оформление заказа.',
    signInCta: 'Войти',
    signedInLabel: 'Вы вошли',
    subscriptionLabel: 'План',
    expiresLabel: 'Истекает',
    statusLabel: 'Статус',
    dailyUsageLabel: 'Использование за день',
    resetLabel: 'Сброс',
    autoRenewLabel: 'Оплата',
    active: 'Активно',
    expired: 'Неактивно',
    noExpiry: 'Без срока',
    freePlan: 'Бесплатно',
    unlimited: 'Безлимит',
    loadFailed: 'Не удалось загрузить аккаунт. Войдите снова или повторите попытку.'
  },
  accountMenu: {
    accountButtonLabel: 'Открыть меню аккаунта',
    accountMenuLabel: 'Меню аккаунта'
  },
  auth: {
    title: 'Войдите, чтобы продолжить',
    eyebrow: 'Веб-доступ',
    continueWithGoogle: 'Продолжить с Google',
    googleLoading: 'Открываем Google...',
    or: 'или',
    emailLabel: 'Email',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'Продолжить с email',
    sendingCode: 'Отправка...',
    sendCodeSuccess: 'Код подтверждения отправлен.',
    sendAgain: 'Отправить снова',
    codeLabel: 'Код подтверждения',
    codePlaceholder: '123456',
    signIn: 'Войти',
    termsNotice: 'Входя, вы соглашаетесь с',
    termsLink: 'Условиями',
    privacyLink: 'Политикой конфиденциальности',
    logout: 'Выйти',
    errors: {
      enterEmailFirst: 'Сначала введите адрес электронной почты.',
      enterEmailAndCode: 'Введите email и код подтверждения.',
      sendCodeFailed: 'Не удалось отправить код подтверждения.',
      googleSignInFailed: 'Не удалось войти через Google.',
      googleClientMissing: 'Вход через Google не настроен.',
      signInFailed: 'Не удалось войти.'
    }
  },
  checkout: {
    paymentMethodLabel: 'Выберите способ оплаты',
    paymentTitle: 'Выберите способ оплаты',
    selectedPackageLabel: 'Выбранный товар',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: 'Перейти к оплате',
    backToProducts: 'Назад',
    agreementText: 'Я принимаю условия покупки, Условия использования и Политику конфиденциальности.',
    failed: 'Оплата не завершена. Можно повторить попытку или закрыть это окно.'
  },
  subscriptionManagement: subscriptionManagementCopy.ruRU,
  subscription: {
    pageDescription: 'Одна подписка — безлимитные загрузки в расширении Vimeo Video Downloader: без дневного лимита.',
    title: 'Unlimited для расширения',
    eyebrow: 'Подписка для расширения',
    benefits: [
      'Безлимитные загрузки в расширении',
      'Никакого дневного лимита',
      'Только расширение — работает с Vimeo на компьютере'
    ],
    trustNote: 'Безопасная оплата',
    monthlyLabel: 'в месяц',
    yearlyLabel: 'в год',
    lifetimeLabel: 'Навсегда',
    quarterlySavingsLabel: 'Экономия 36%',
    dailyLimitLabel: 'Дневной лимит',
    autoRenewOn: 'Автопродление',
    autoRenewOff: 'Разовый платёж · Без автопродления',
    usageNotice: 'Только расширение',
    loading: 'Загрузка плана Unlimited...',
    loadFailed: 'Не удалось загрузить план Unlimited. Повторите попытку позже.',
    noPlan: 'Unlimited сейчас недоступен.',
    noChannels: 'Для этого плана нет доступного способа оплаты.',
    buyNow: 'Купить сейчас',
    loginToBuy: 'Войдите, чтобы купить',
    alreadyActive: 'У вас уже есть активная подписка. Нельзя купить ещё одну.',
    creatingOrder: 'Создание заказа...',
    pendingPaymentTitle: 'Ожидание оплаты',
    pendingPayment: 'Завершите оплату в новой вкладке. Эта страница обновит результат автоматически.',
    successTitle: 'Unlimited активирован',
    successDescription: 'Подписка активна. Статус аккаунта обновлен.',
    failedTitle: 'Оплата не завершена',
    close: 'Закрыть',
    cancelPayment: 'Отменить оплату',
    supportMailPrefix: 'Сообщить о проблеме: ',
    createFailed: 'Не удалось создать заказ. Повторите попытку позже.',
    invalidPaymentData: 'Ссылка оплаты недействительна. Повторите попытку позже.',
    priceUpdated: 'Цена изменилась. Проверьте актуальную цену и купите снова.',
    gatewayFailed: 'Оплата временно недоступна. Повторите попытку позже.',
    orderNotFound: 'Заказ больше недоступен. Создайте новый заказ.',
    orderExpired: 'Заказ истек. Купите снова.',
    paymentCanceled: 'Оплата отменена. Выберите способ оплаты и повторите попытку.',
    fulfillmentFailed: 'Оплата получена, но активация еще не завершена. Повторите попытку позже.',
    pollFailed: 'Не удалось обновить статус оплаты. Повторите попытку позже.',
    pollTimeout: 'Автообновление истекло. Проверьте аккаунт после оплаты.',
    authExpired: 'Срок входа истек. Войдите снова, чтобы продолжить.',
    installConfirmTitle: 'Подтвердите подписку для расширения',
    installConfirmMessage:
      'Подписку можно использовать только в браузерном расширении на компьютере. Подтвердите, что расширение уже установлено. {link}',
    installConfirmLinkLabel: 'Установить сейчас',
    installConfirmCancel: 'Отмена',
    installConfirmContinue: 'Продолжить',
    reviewReward: reviewRewardCopies.ruRU
  },
  extensionSource: {
    primaryCta: 'Перейти на Unlimited',
    signedOutCta: 'Войдите для перехода',
    reviewRewardTitle: 'Получите 7 дней Unlimited',
    reviewRewardDescription:
      'Оставьте отзыв в Интернет-магазине Chrome, затем вернитесь сюда для проверки и получения награды.',
  },
  faq: {
    title: 'Вопросы перед покупкой?',
    items: [
      {
        question: 'Какой тариф выбрать — месячный или годовой?',
        answer: 'Месячный — гибкий старт. Годовой выгоднее, если вы уже знаете, что будете скачивать дальше: в пересчёте на месяц он заметно дешевле помесячной оплаты.'
      },
      {
        question: 'Продлевается ли подписка автоматически?',
        answer: 'Сейчас тарифы не списывают деньги автоматически — продлевайте доступ повторной покупкой, когда захотите. Если у тарифа есть автопродление, это явно отмечено на карточке до оплаты.'
      },
      {
        question: 'Когда покупка вступает в силу?',
        answer: 'Сразу. После завершения оплаты Unlimited добавляется на аккаунт автоматически — без кодов активации и ручных шагов.'
      },
      {
        question: 'Какие способы оплаты доступны?',
        answer: 'PayPal, а также основные кредитные и дебетовые карты.'
      }
    ]
  }
}
/** Pricing 页面意大利语文案。 */
export const itITPricingContent: PricingPageContent = {
  popularLabel: 'Il più popolare',
  account: {
    title: 'Account',
    loading: 'Caricamento account...',
    signedOutTitle: 'Accedi prima di acquistare',
    signedOutDescription: 'Accedi per continuare con il checkout.',
    signInCta: 'Accedi',
    signedInLabel: 'Accesso effettuato',
    subscriptionLabel: 'Piano',
    expiresLabel: 'Scade',
    statusLabel: 'Stato',
    dailyUsageLabel: 'Uso giornaliero',
    resetLabel: 'Reset',
    autoRenewLabel: 'Fatturazione',
    active: 'Attivo',
    expired: 'Inattivo',
    noExpiry: 'Nessuna scadenza',
    freePlan: 'Gratis',
    unlimited: 'Illimitato',
    loadFailed: 'Impossibile caricare l’account. Accedi di nuovo o riprova.'
  },
  accountMenu: {
    accountButtonLabel: 'Apri menu account',
    accountMenuLabel: 'Menu account'
  },
  auth: {
    title: 'Accedi per continuare',
    eyebrow: 'Accesso web',
    continueWithGoogle: 'Continua con Google',
    googleLoading: 'Apertura di Google...',
    or: 'oppure',
    emailLabel: 'Email',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'Continua con email',
    sendingCode: 'Invio in corso...',
    sendCodeSuccess: 'Codice di verifica inviato.',
    sendAgain: 'Invia di nuovo',
    codeLabel: 'Codice di verifica',
    codePlaceholder: '123456',
    signIn: 'Accedi',
    termsNotice: 'Accedendo accetti i',
    termsLink: 'Termini',
    privacyLink: 'Informativa sulla privacy',
    logout: 'Esci',
    errors: {
      enterEmailFirst: 'Inserisci prima il tuo indirizzo email.',
      enterEmailAndCode: 'Inserisci email e codice di verifica.',
      sendCodeFailed: 'Impossibile inviare il codice di verifica.',
      googleSignInFailed: 'Accesso con Google non riuscito.',
      googleClientMissing: 'Accesso con Google non configurato.',
      signInFailed: 'Accesso non riuscito.'
    }
  },
  checkout: {
    paymentMethodLabel: 'Scegli metodo di pagamento',
    paymentTitle: 'Scegli metodo di pagamento',
    selectedPackageLabel: 'Prodotto selezionato',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: 'Continua al pagamento',
    backToProducts: 'Indietro',
    agreementText: 'Accetto le condizioni di acquisto, i Termini e l’Informativa sulla privacy.',
    failed: 'Il pagamento non è completo. Puoi riprovare o chiudere questa finestra.'
  },
  subscriptionManagement: subscriptionManagementCopy.itIT,
  subscription: {
    pageDescription: 'Un solo abbonamento per download illimitati nell’estensione Vimeo Video Downloader — senza limite giornaliero.',
    title: 'Unlimited per estensione',
    eyebrow: 'Abbonamento per l’estensione',
    benefits: [
      'Download illimitati nell’estensione',
      'Nessun limite giornaliero da gestire',
      'Solo estensione — funziona con Vimeo su desktop'
    ],
    trustNote: 'Pagamento sicuro',
    monthlyLabel: 'al mese',
    yearlyLabel: 'all’anno',
    lifetimeLabel: 'A vita',
    quarterlySavingsLabel: 'Risparmia il 36%',
    dailyLimitLabel: 'Limite giornaliero',
    autoRenewOn: 'Rinnovo automatico',
    autoRenewOff: 'Pagamento unico · Nessun rinnovo automatico',
    usageNotice: 'Solo estensione',
    loading: 'Caricamento piano Unlimited...',
    loadFailed: 'Impossibile caricare il piano Unlimited. Riprova più tardi.',
    noPlan: 'Unlimited non è disponibile al momento.',
    noChannels: 'Nessun metodo di pagamento è disponibile per questo piano.',
    buyNow: 'Acquista ora',
    loginToBuy: 'Accedi per acquistare',
    alreadyActive: 'Hai già un abbonamento attivo. Non puoi acquistarne un altro.',
    creatingOrder: 'Creazione ordine...',
    pendingPaymentTitle: 'In attesa del pagamento',
    pendingPayment: 'Completa il pagamento nella nuova scheda. Questa pagina aggiornerà automaticamente il risultato.',
    successTitle: 'Unlimited attivato',
    successDescription: 'Il tuo abbonamento è attivo. Lo stato dell’account è stato aggiornato.',
    failedTitle: 'Pagamento incompleto',
    close: 'Chiudi',
    cancelPayment: 'Annulla pagamento',
    supportMailPrefix: 'Segnala un problema: ',
    createFailed: 'Impossibile creare l’ordine. Riprova più tardi.',
    invalidPaymentData: 'Il link di pagamento non è valido. Riprova più tardi.',
    priceUpdated: 'Il prezzo è cambiato. Controlla il prezzo aggiornato e acquista di nuovo.',
    gatewayFailed: 'L’accesso al pagamento è temporaneamente non disponibile. Riprova più tardi.',
    orderNotFound: 'L’ordine non è più disponibile. Crea un nuovo ordine.',
    orderExpired: 'L’ordine è scaduto. Acquista di nuovo.',
    paymentCanceled: 'Il pagamento è stato annullato. Scegli un metodo di pagamento e riprova.',
    fulfillmentFailed: 'Il pagamento è stato ricevuto, ma l’attivazione non è ancora completa. Riprova più tardi.',
    pollFailed: 'Impossibile aggiornare lo stato del pagamento. Riprova più tardi.',
    pollTimeout: 'L’aggiornamento automatico è scaduto. Controlla l’account dopo il pagamento.',
    authExpired: 'Accesso scaduto. Accedi di nuovo per continuare.',
    installConfirmTitle: 'Conferma abbonamento estensione',
    installConfirmMessage:
      'L’abbonamento può essere usato solo nell’estensione browser su desktop. Conferma di aver già installato l’estensione. {link}',
    installConfirmLinkLabel: 'Installa ora',
    installConfirmCancel: 'Annulla',
    installConfirmContinue: 'Continua',
    reviewReward: reviewRewardCopies.itIT
  },
  extensionSource: {
    primaryCta: 'Passa a Unlimited',
    signedOutCta: 'Accedi per passare a Unlimited',
    reviewRewardTitle: 'Ottieni 7 giorni di Unlimited',
    reviewRewardDescription:
      'Lascia una recensione sul Chrome Web Store, poi torna qui per verificarla e ricevere il premio.',
  },
  faq: {
    title: 'Domande prima dell’acquisto?',
    items: [
      {
        question: 'Quale piano scelgo — mensile o annuale?',
        answer: 'Il mensile è il modo flessibile di iniziare. L’annuale conviene se sai già che continuerai a scaricare: sul mese costa chiaramente meno del pagamento mese per mese.'
      },
      {
        question: 'Il mio abbonamento si rinnova automaticamente?',
        answer: 'Al momento i piani non addebitano nulla in automatico — compra di nuovo quando vuoi estendere l’accesso. Se un piano supporta il rinnovo automatico, è indicato chiaramente sulla scheda prima del checkout.'
      },
      {
        question: 'Quando diventa effettivo il mio acquisto?',
        answer: 'Subito. Una volta completato il pagamento, Unlimited viene aggiunto automaticamente al tuo account — senza codici di attivazione o passaggi manuali.'
      },
      {
        question: 'Quali metodi di pagamento posso usare?',
        answer: 'PayPal e le principali carte di credito o debito.'
      }
    ]
  }
}
/** Pricing 页面越南语文案。 */
export const viVNPricingContent: PricingPageContent = {
  popularLabel: 'Phổ biến nhất',
  account: {
    title: 'Tài khoản',
    loading: 'Đang tải tài khoản...',
    signedOutTitle: 'Đăng nhập trước khi mua',
    signedOutDescription: 'Đăng nhập để tiếp tục thanh toán.',
    signInCta: 'Đăng nhập',
    signedInLabel: 'Đã đăng nhập',
    subscriptionLabel: 'Gói',
    expiresLabel: 'Hết hạn',
    statusLabel: 'Trạng thái',
    dailyUsageLabel: 'Mức dùng hằng ngày',
    resetLabel: 'Đặt lại',
    autoRenewLabel: 'Thanh toán',
    active: 'Đang hoạt động',
    expired: 'Không hoạt động',
    noExpiry: 'Không hết hạn',
    freePlan: 'Miễn phí',
    unlimited: 'Không giới hạn',
    loadFailed: 'Không thể tải tài khoản. Đăng nhập lại hoặc thử lại.'
  },
  accountMenu: {
    accountButtonLabel: 'Mở menu tài khoản',
    accountMenuLabel: 'Menu tài khoản'
  },
  auth: {
    title: 'Đăng nhập để tiếp tục',
    eyebrow: 'Truy cập web',
    continueWithGoogle: 'Tiếp tục với Google',
    googleLoading: 'Đang mở Google...',
    or: 'hoặc',
    emailLabel: 'Email',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'Tiếp tục với email',
    sendingCode: 'Đang gửi...',
    sendCodeSuccess: 'Đã gửi mã xác minh.',
    sendAgain: 'Gửi lại',
    codeLabel: 'Mã xác minh',
    codePlaceholder: '123456',
    signIn: 'Đăng nhập',
    termsNotice: 'Khi đăng nhập, bạn đồng ý với',
    termsLink: 'Điều khoản',
    privacyLink: 'Chính sách quyền riêng tư',
    logout: 'Đăng xuất',
    errors: {
      enterEmailFirst: 'Vui lòng nhập địa chỉ email trước.',
      enterEmailAndCode: 'Vui lòng nhập email và mã xác minh.',
      sendCodeFailed: 'Không thể gửi mã xác minh.',
      googleSignInFailed: 'Không thể đăng nhập bằng Google.',
      googleClientMissing: 'Chưa cấu hình đăng nhập Google.',
      signInFailed: 'Không thể đăng nhập.'
    }
  },
  checkout: {
    paymentMethodLabel: 'Chọn phương thức thanh toán',
    paymentTitle: 'Chọn phương thức thanh toán',
    selectedPackageLabel: 'Sản phẩm đã chọn',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: 'Tiếp tục thanh toán',
    backToProducts: 'Quay lại',
    agreementText: 'Tôi đồng ý với điều khoản mua hàng, Điều khoản và Chính sách quyền riêng tư.',
    failed: 'Thanh toán chưa hoàn tất. Bạn có thể thử lại hoặc đóng cửa sổ này.'
  },
  subscriptionManagement: subscriptionManagementCopy.viVN,
  subscription: {
    pageDescription: 'Một gói đăng ký để tải không giới hạn trong tiện ích Vimeo Video Downloader — không giới hạn hằng ngày.',
    title: 'Unlimited cho tiện ích',
    eyebrow: 'Gói đăng ký tiện ích mở rộng',
    benefits: [
      'Tải không giới hạn trong tiện ích',
      'Không giới hạn hằng ngày',
      'Chỉ dùng trong tiện ích — hoạt động với Vimeo trên máy tính'
    ],
    trustNote: 'Thanh toán an toàn',
    monthlyLabel: 'mỗi tháng',
    yearlyLabel: 'mỗi năm',
    lifetimeLabel: 'Trọn đời',
    quarterlySavingsLabel: 'Tiết kiệm 36%',
    dailyLimitLabel: 'Giới hạn hằng ngày',
    autoRenewOn: 'Tự động gia hạn',
    autoRenewOff: 'Trả một lần · Không tự động gia hạn',
    usageNotice: 'Chỉ dùng trong tiện ích',
    loading: 'Đang tải gói Unlimited...',
    loadFailed: 'Không thể tải gói Unlimited. Hãy thử lại sau.',
    noPlan: 'Unlimited hiện chưa khả dụng.',
    noChannels: 'Không có phương thức thanh toán nào cho gói này.',
    buyNow: 'Mua ngay',
    loginToBuy: 'Đăng nhập để mua',
    alreadyActive: 'Bạn đã có gói đăng ký đang hoạt động. Không thể mua thêm.',
    creatingOrder: 'Đang tạo đơn hàng...',
    pendingPaymentTitle: 'Đang chờ thanh toán',
    pendingPayment: 'Hoàn tất thanh toán trong tab mới. Trang này sẽ tự động cập nhật kết quả.',
    successTitle: 'Unlimited đã kích hoạt',
    successDescription: 'Gói của bạn đang hoạt động. Trạng thái tài khoản đã được cập nhật.',
    failedTitle: 'Thanh toán chưa hoàn tất',
    close: 'Đóng',
    cancelPayment: 'Hủy thanh toán',
    supportMailPrefix: 'Báo cáo sự cố: ',
    createFailed: 'Không thể tạo đơn hàng. Hãy thử lại sau.',
    invalidPaymentData: 'Liên kết thanh toán không hợp lệ. Hãy thử lại sau.',
    priceUpdated: 'Giá đã thay đổi. Kiểm tra giá mới nhất rồi mua lại.',
    gatewayFailed: 'Cổng thanh toán tạm thời không khả dụng. Hãy thử lại sau.',
    orderNotFound: 'Đơn hàng không còn khả dụng. Hãy tạo đơn mới.',
    orderExpired: 'Đơn hàng đã hết hạn. Hãy mua lại.',
    paymentCanceled: 'Thanh toán đã bị hủy. Chọn phương thức thanh toán và thử lại.',
    fulfillmentFailed: 'Đã nhận thanh toán nhưng kích hoạt chưa hoàn tất. Hãy thử lại sau.',
    pollFailed: 'Không thể cập nhật trạng thái thanh toán. Hãy thử lại sau.',
    pollTimeout: 'Tự động cập nhật đã hết thời gian. Kiểm tra tài khoản sau khi thanh toán.',
    authExpired: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
    installConfirmTitle: 'Xác nhận gói tiện ích',
    installConfirmMessage:
      'Gói đăng ký chỉ dùng được trong tiện ích trình duyệt trên máy tính. Hãy xác nhận bạn đã cài tiện ích. {link}',
    installConfirmLinkLabel: 'Cài đặt ngay',
    installConfirmCancel: 'Hủy',
    installConfirmContinue: 'Tiếp tục',
    reviewReward: reviewRewardCopies.viVN
  },
  extensionSource: {
    primaryCta: 'Nâng cấp Unlimited',
    signedOutCta: 'Đăng nhập để nâng cấp',
    reviewRewardTitle: 'Nhận 7 ngày Unlimited',
    reviewRewardDescription:
      'Hãy đánh giá trên Cửa hàng Chrome trực tuyến, rồi quay lại đây để xác minh và nhận thưởng.',
  },
  faq: {
    title: 'Thắc mắc trước khi mua?',
    items: [
      {
        question: 'Nên chọn gói theo tháng hay theo năm?',
        answer: 'Gói tháng linh hoạt để bắt đầu. Gói năm đáng hơn nếu bạn đã biết sẽ tiếp tục tải — tính theo tháng rẻ hơn rõ rệt so với trả từng tháng.'
      },
      {
        question: 'Gói đăng ký có tự động gia hạn không?',
        answer: 'Hiện tại các gói không tự trừ tiền — mua lại bất cứ khi nào bạn muốn gia hạn. Nếu gói nào hỗ trợ tự động gia hạn, điều đó được ghi rõ trên thẻ trước khi thanh toán.'
      },
      {
        question: 'Giao dịch của tôi bao giờ có hiệu lực?',
        answer: 'Ngay lập tức. Sau khi thanh toán xong, Unlimited sẽ được thêm vào tài khoản tự động — không cần mã kích hoạt hay thao tác thủ công.'
      },
      {
        question: 'Tôi có thể dùng phương thức thanh toán nào?',
        answer: 'PayPal và các thẻ tín dụng hoặc ghi nợ phổ biến.'
      }
    ]
  }
}
/** Pricing 页面泰语文案。 */
export const thTHPricingContent: PricingPageContent = {
  popularLabel: 'ยอดนิยม',
  account: {
    title: 'บัญชี',
    loading: 'กำลังโหลดบัญชี...',
    signedOutTitle: 'เข้าสู่ระบบก่อนซื้อ',
    signedOutDescription: 'เข้าสู่ระบบเพื่อดำเนินการชำระเงินต่อ',
    signInCta: 'เข้าสู่ระบบ',
    signedInLabel: 'เข้าสู่ระบบแล้ว',
    subscriptionLabel: 'แผน',
    expiresLabel: 'หมดอายุ',
    statusLabel: 'สถานะ',
    dailyUsageLabel: 'การใช้งานรายวัน',
    resetLabel: 'รีเซ็ต',
    autoRenewLabel: 'การเรียกเก็บเงิน',
    active: 'ใช้งานอยู่',
    expired: 'ไม่ได้ใช้งาน',
    noExpiry: 'ไม่มีวันหมดอายุ',
    freePlan: 'ฟรี',
    unlimited: 'ไม่จำกัด',
    loadFailed: 'โหลดบัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่หรือลองอีกครั้ง'
  },
  accountMenu: {
    accountButtonLabel: 'เปิดเมนูบัญชี',
    accountMenuLabel: 'เมนูบัญชี'
  },
  auth: {
    title: 'เข้าสู่ระบบเพื่อดำเนินการต่อ',
    eyebrow: 'การเข้าใช้เว็บ',
    continueWithGoogle: 'ดำเนินการต่อด้วย Google',
    googleLoading: 'กำลังเปิด Google...',
    or: 'หรือ',
    emailLabel: 'อีเมล',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'ดำเนินการต่อด้วยอีเมล',
    sendingCode: 'กำลังส่ง...',
    sendCodeSuccess: 'ส่งรหัสยืนยันแล้ว',
    sendAgain: 'ส่งอีกครั้ง',
    codeLabel: 'รหัสยืนยัน',
    codePlaceholder: '123456',
    signIn: 'เข้าสู่ระบบ',
    termsNotice: 'เมื่อเข้าสู่ระบบ ถือว่าคุณยอมรับ',
    termsLink: 'ข้อกำหนด',
    privacyLink: 'นโยบายความเป็นส่วนตัว',
    logout: 'ออกจากระบบ',
    errors: {
      enterEmailFirst: 'กรุณากรอกอีเมลก่อน',
      enterEmailAndCode: 'กรุณากรอกอีเมลและรหัสยืนยัน',
      sendCodeFailed: 'ส่งรหัสยืนยันไม่สำเร็จ',
      googleSignInFailed: 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ',
      googleClientMissing: 'ยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย Google',
      signInFailed: 'เข้าสู่ระบบไม่สำเร็จ'
    }
  },
  checkout: {
    paymentMethodLabel: 'เลือกวิธีชำระเงิน',
    paymentTitle: 'เลือกวิธีชำระเงิน',
    selectedPackageLabel: 'สินค้าที่เลือก',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: 'ไปชำระเงินต่อ',
    backToProducts: 'กลับ',
    agreementText: 'ฉันยอมรับเงื่อนไขการซื้อ ข้อกำหนด และนโยบายความเป็นส่วนตัว',
    failed: 'การชำระเงินยังไม่เสร็จ คุณสามารถลองใหม่หรือปิดหน้าต่างนี้ได้'
  },
  subscriptionManagement: subscriptionManagementCopy.thTH,
  subscription: {
    pageDescription: 'สมัครเพียงครั้งเดียวเพื่อดาวน์โหลดไม่จำกัดในส่วนขยาย Vimeo Video Downloader — ไม่มีขีดจำกัดรายวัน',
    title: 'Unlimited สำหรับส่วนขยาย',
    eyebrow: 'การสมัครสมาชิกส่วนขยาย',
    benefits: [
      'ดาวน์โหลดไม่จำกัดในส่วนขยาย',
      'ไม่มีขีดจำกัดรายวัน',
      'ใช้ได้เฉพาะส่วนขยาย — ใช้งานร่วมกับ Vimeo บนคอมพิวเตอร์'
    ],
    trustNote: 'ชำระเงินปลอดภัย',
    monthlyLabel: 'ต่อเดือน',
    yearlyLabel: 'ต่อปี',
    lifetimeLabel: 'ตลอดชีพ',
    quarterlySavingsLabel: 'ประหยัด 36%',
    dailyLimitLabel: 'ขีดจำกัดรายวัน',
    autoRenewOn: 'ต่ออายุอัตโนมัติ',
    autoRenewOff: 'จ่ายครั้งเดียว · ไม่ต่ออายุอัตโนมัติ',
    usageNotice: 'ใช้ได้เฉพาะส่วนขยาย',
    loading: 'กำลังโหลดแผน Unlimited...',
    loadFailed: 'โหลดแผน Unlimited ไม่สำเร็จ โปรดลองใหม่ภายหลัง',
    noPlan: 'Unlimited ยังไม่พร้อมให้ซื้อในขณะนี้',
    noChannels: 'ไม่มีวิธีชำระเงินสำหรับแผนนี้',
    buyNow: 'ซื้อเลย',
    loginToBuy: 'เข้าสู่ระบบเพื่อซื้อ',
    alreadyActive: 'คุณมีการสมัครสมาชิกที่ใช้งานอยู่แล้ว จึงซื้อซ้ำไม่ได้',
    creatingOrder: 'กำลังสร้างคำสั่งซื้อ...',
    pendingPaymentTitle: 'รอการชำระเงิน',
    pendingPayment: 'ชำระเงินให้เสร็จในแท็บใหม่ หน้านี้จะอัปเดตผลลัพธ์ให้อัตโนมัติ',
    successTitle: 'เปิดใช้งาน Unlimited แล้ว',
    successDescription: 'แผนของคุณใช้งานอยู่ สถานะบัญชีได้รับการอัปเดตแล้ว',
    failedTitle: 'ชำระเงินยังไม่เสร็จ',
    close: 'ปิด',
    cancelPayment: 'ยกเลิกการชำระเงิน',
    supportMailPrefix: 'รายงานปัญหา: ',
    createFailed: 'สร้างคำสั่งซื้อไม่สำเร็จ โปรดลองใหม่ภายหลัง',
    invalidPaymentData: 'ลิงก์ชำระเงินไม่ถูกต้อง โปรดลองใหม่ภายหลัง',
    priceUpdated: 'ราคาเปลี่ยนแล้ว โปรดตรวจสอบราคาล่าสุดแล้วซื้ออีกครั้ง',
    gatewayFailed: 'ช่องทางชำระเงินไม่พร้อมใช้งานชั่วคราว โปรดลองใหม่ภายหลัง',
    orderNotFound: 'คำสั่งซื้อนี้ไม่พร้อมใช้งานแล้ว โปรดสร้างคำสั่งซื้อใหม่',
    orderExpired: 'คำสั่งซื้อหมดอายุแล้ว โปรดซื้ออีกครั้ง',
    paymentCanceled: 'การชำระเงินถูกยกเลิก เลือกวิธีชำระเงินแล้วลองอีกครั้ง',
    fulfillmentFailed: 'ได้รับการชำระเงินแล้ว แต่การเปิดใช้งานยังไม่เสร็จ โปรดลองใหม่ภายหลัง',
    pollFailed: 'อัปเดตสถานะการชำระเงินไม่สำเร็จ โปรดลองใหม่ภายหลัง',
    pollTimeout: 'การอัปเดตอัตโนมัติหมดเวลา ตรวจสอบบัญชีหลังชำระเงิน',
    authExpired: 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่เพื่อดำเนินการต่อ',
    installConfirmTitle: 'ยืนยันการสมัครสมาชิกส่วนขยาย',
    installConfirmMessage:
      'การสมัครสมาชิกใช้ได้เฉพาะในส่วนขยายเบราว์เซอร์บนคอมพิวเตอร์เท่านั้น โปรดยืนยันว่าคุณติดตั้งส่วนขยายแล้ว {link}',
    installConfirmLinkLabel: 'ติดตั้งตอนนี้',
    installConfirmCancel: 'ยกเลิก',
    installConfirmContinue: 'ดำเนินการต่อ',
    reviewReward: reviewRewardCopies.thTH
  },
  extensionSource: {
    primaryCta: 'อัปเกรดเป็น Unlimited',
    signedOutCta: 'เข้าสู่ระบบเพื่ออัปเกรด',
    reviewRewardTitle: 'รับ Unlimited 7 วัน',
    reviewRewardDescription:
      'เขียนรีวิวใน Chrome Web Store แล้วกลับมาที่หน้านี้เพื่อยืนยันและรับรางวัล',
  },
  faq: {
    title: 'มีคำถามก่อนซื้อไหม?',
    items: [
      {
        question: 'ควรเลือกแพ็กเกจรายเดือนหรือรายปี?',
        answer: 'รายเดือนเหมาะสำหรับเริ่มต้นอย่างยืดหยุ่น ส่วนรายปีคุ้มกว่าถ้ารู้ว่าจะใช้ต่อ — คิดเป็นรายเดือนแล้วถูกกว่าจ่ายรายเดือนชัดเจน'
      },
      {
        question: 'สมาชิกจะต่ออายุอัตโนมัติหรือไม่?',
        answer: 'ปัจจุบันแพ็กเกจจะไม่ตัดเงินอัตโนมัติ ซื้อใหม่เมื่อไรก็ได้ที่ต้องการต่ออายุ หากแพ็กเกจใดรองรับการต่ออายุอัตโนมัติ จะมีป้ายกำกับชัดเจนบนการ์ดก่อนชำระเงิน'
      },
      {
        question: 'การซื้อของฉันมีผลเมื่อไร?',
        answer: 'ทันที เมื่อชำระเงินเสร็จ Unlimited จะเข้าบัญชีของคุณโดยอัตโนมัติ ไม่ต้องใช้รหัสเปิดใช้งานหรือทำขั้นตอนเอง'
      },
      {
        question: 'ใช้วิธีชำระเงินแบบใดได้บ้าง?',
        answer: 'PayPal และบัตรเครดิตหรือเดบิตทั่วไป'
      }
    ]
  }
}
/** Pricing 页面印尼语文案。 */
export const idIDPricingContent: PricingPageContent = {
  popularLabel: 'Paling Populer',
  account: {
    title: 'Akun',
    loading: 'Memuat akun...',
    signedOutTitle: 'Masuk sebelum membeli',
    signedOutDescription: 'Masuk untuk melanjutkan checkout.',
    signInCta: 'Masuk',
    signedInLabel: 'Sudah masuk',
    subscriptionLabel: 'Paket',
    expiresLabel: 'Berakhir',
    statusLabel: 'Status',
    dailyUsageLabel: 'Penggunaan harian',
    resetLabel: 'Reset',
    autoRenewLabel: 'Penagihan',
    active: 'Aktif',
    expired: 'Tidak aktif',
    noExpiry: 'Tidak kedaluwarsa',
    freePlan: 'Gratis',
    unlimited: 'Tanpa batas',
    loadFailed: 'Gagal memuat akun. Masuk kembali atau coba lagi.'
  },
  accountMenu: {
    accountButtonLabel: 'Buka menu akun',
    accountMenuLabel: 'Menu akun'
  },
  auth: {
    title: 'Masuk untuk melanjutkan',
    eyebrow: 'Akses web',
    continueWithGoogle: 'Lanjutkan dengan Google',
    googleLoading: 'Membuka Google...',
    or: 'atau',
    emailLabel: 'Email',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'Lanjutkan dengan email',
    sendingCode: 'Mengirim...',
    sendCodeSuccess: 'Kode verifikasi telah dikirim.',
    sendAgain: 'Kirim lagi',
    codeLabel: 'Kode verifikasi',
    codePlaceholder: '123456',
    signIn: 'Masuk',
    termsNotice: 'Dengan masuk, Anda menyetujui',
    termsLink: 'Ketentuan',
    privacyLink: 'Kebijakan Privasi',
    logout: 'Keluar',
    errors: {
      enterEmailFirst: 'Masukkan alamat email Anda terlebih dahulu.',
      enterEmailAndCode: 'Masukkan email dan kode verifikasi.',
      sendCodeFailed: 'Gagal mengirim kode verifikasi.',
      googleSignInFailed: 'Gagal masuk dengan Google.',
      googleClientMissing: 'Login Google belum dikonfigurasi.',
      signInFailed: 'Gagal masuk.'
    }
  },
  checkout: {
    paymentMethodLabel: 'Pilih metode pembayaran',
    paymentTitle: 'Pilih metode pembayaran',
    selectedPackageLabel: 'Produk terpilih',
    clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
    confirmPurchase: 'Lanjut ke pembayaran',
    backToProducts: 'Kembali',
    agreementText: 'Saya menyetujui ketentuan pembelian, Ketentuan, dan Kebijakan Privasi.',
    failed: 'Pembayaran belum selesai. Anda dapat mencoba lagi atau menutup jendela ini.'
  },
  subscriptionManagement: subscriptionManagementCopy.idID,
  subscription: {
    pageDescription: 'Satu langganan untuk unduhan tanpa batas di ekstensi Vimeo Video Downloader — tanpa kuota harian.',
    title: 'Unlimited untuk ekstensi',
    eyebrow: 'Langganan ekstensi',
    benefits: [
      'Unduhan tanpa batas di ekstensi',
      'Tanpa kuota harian yang harus dikelola',
      'Hanya ekstensi — bekerja dengan Vimeo di desktop'
    ],
    trustNote: 'Checkout aman',
    monthlyLabel: 'per bulan',
    yearlyLabel: 'per tahun',
    lifetimeLabel: 'Selamanya',
    quarterlySavingsLabel: 'Hemat 36%',
    dailyLimitLabel: 'Batas harian',
    autoRenewOn: 'Diperpanjang otomatis',
    autoRenewOff: 'Bayar sekali · Tanpa perpanjangan otomatis',
    usageNotice: 'Hanya ekstensi',
    loading: 'Memuat paket Unlimited...',
    loadFailed: 'Gagal memuat paket Unlimited. Coba lagi nanti.',
    noPlan: 'Unlimited belum tersedia saat ini.',
    noChannels: 'Tidak ada metode pembayaran untuk paket ini.',
    buyNow: 'Beli sekarang',
    loginToBuy: 'Masuk untuk membeli',
    alreadyActive: 'Anda sudah memiliki langganan aktif. Anda tidak dapat membeli lagi.',
    creatingOrder: 'Membuat pesanan...',
    pendingPaymentTitle: 'Menunggu pembayaran',
    pendingPayment: 'Selesaikan pembayaran di tab baru. Halaman ini akan memperbarui hasil secara otomatis.',
    successTitle: 'Unlimited aktif',
    successDescription: 'Langganan Anda aktif. Status akun sudah diperbarui.',
    failedTitle: 'Pembayaran belum selesai',
    close: 'Tutup',
    cancelPayment: 'Batalkan pembayaran',
    supportMailPrefix: 'Laporkan masalah: ',
    createFailed: 'Gagal membuat pesanan. Coba lagi nanti.',
    invalidPaymentData: 'Tautan pembayaran tidak valid. Coba lagi nanti.',
    priceUpdated: 'Harga berubah. Periksa harga terbaru lalu beli lagi.',
    gatewayFailed: 'Akses pembayaran sementara tidak tersedia. Coba lagi nanti.',
    orderNotFound: 'Pesanan tidak tersedia lagi. Buat pesanan baru.',
    orderExpired: 'Pesanan kedaluwarsa. Beli lagi.',
    paymentCanceled: 'Pembayaran dibatalkan. Pilih metode pembayaran dan coba lagi.',
    fulfillmentFailed: 'Pembayaran diterima, tetapi aktivasi belum selesai. Coba lagi nanti.',
    pollFailed: 'Gagal memperbarui status pembayaran. Coba lagi nanti.',
    pollTimeout: 'Pembaruan otomatis habis waktu. Periksa akun setelah pembayaran.',
    authExpired: 'Sesi masuk kedaluwarsa. Masuk lagi untuk melanjutkan.',
    installConfirmTitle: 'Konfirmasi langganan ekstensi',
    installConfirmMessage:
      'Langganan hanya bisa digunakan di ekstensi browser desktop. Pastikan Anda sudah memasang ekstensi. {link}',
    installConfirmLinkLabel: 'Instal sekarang',
    installConfirmCancel: 'Batal',
    installConfirmContinue: 'Lanjutkan',
    reviewReward: reviewRewardCopies.idID
  },
  extensionSource: {
    primaryCta: 'Upgrade ke Unlimited',
    signedOutCta: 'Masuk untuk upgrade',
    reviewRewardTitle: 'Dapatkan Unlimited 7 hari',
    reviewRewardDescription:
      'Beri ulasan di Chrome Web Store, lalu kembali ke sini untuk verifikasi dan klaim hadiah.',
  },
  faq: {
    title: 'Ada pertanyaan sebelum membeli?',
    items: [
      {
        question: 'Pilih paket bulanan atau tahunan?',
        answer: 'Bulanan fleksibel untuk memulai. Tahunan lebih menguntungkan jika Anda memang akan terus mengunduh — per bulan jelas lebih murah daripada membayar bulanan.'
      },
      {
        question: 'Apakah langganan saya diperpanjang otomatis?',
        answer: 'Saat ini paket tidak menagih otomatis — beli lagi kapan pun ingin memperpanjang. Jika ada paket yang mendukung perpanjangan otomatis, itu ditandai jelas di kartu sebelum checkout.'
      },
      {
        question: 'Kapan pembelian saya berlaku?',
        answer: 'Segera. Setelah pembayaran selesai, Unlimited otomatis ditambahkan ke akun Anda — tanpa kode aktivasi maupun langkah manual.'
      },
      {
        question: 'Metode pembayaran apa saja yang bisa saya gunakan?',
        answer: 'PayPal, serta kartu kredit atau debit umum.'
      }
    ]
  }
}