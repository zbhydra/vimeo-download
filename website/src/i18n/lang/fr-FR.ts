import type { SiteContent } from '../schema'
import { frFRPricingContent } from '../pricing'

export const frFR: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — Téléchargez des vidéos Vimeo en HD',
    description:
      'Collez un lien Vimeo public et enregistrez la vidéo dans la résolution voulue. Aucune application, aucun compte et aucune extension ne sont nécessaires pour un téléchargement classique.',
    keywords:
      'télécharger vidéo vimeo, téléchargeur vimeo, vimeo hd, enregistrer vidéo vimeo, vimeo en mp4, télécharger vimeo en ligne'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Accueil',
      pricing: 'Tarifs',
      solutions: 'Guide de téléchargement',
      changelog: 'Modifications'
    },
    footer: {
      resources: 'Ressources',
      rights: '© 2026 Vimeo Video Downloader. Tous droits réservés.'
    }
  },
  common: {
    installCta: 'Installer Maintenant'
  },
  sections: {
    features: {
      title: 'Fonctions du téléchargeur Vimeo',
      subtitle:
        'Ce que fait le téléchargeur avec un lien Vimeo public : analyser la page, lister les résolutions proposées par Vimeo et enregistrer celle que vous choisissez.',
      metaDescription:
        'Fonctions de Vimeo Video Downloader : téléchargements HD, choix de la résolution, sortie MP4, aucun compte requis et une limite claire pour les vidéos privées ou protégées par mot de passe.',
      items: [
        {
          title: 'Choix de la résolution',
          description: 'Choisissez la résolution dont vous avez besoin au lieu de vous contenter du plus petit fichier proposé par Vimeo',
          details: [
            'Choisissez parmi les résolutions proposées par la vidéo',
            'Téléchargez la meilleure qualité disponible pour un visionnage hors ligne',
            'Conservez le format d’image et la piste audio d’origine',
            'Une sortie MP4 qui se lit sur n’importe quel appareil'
          ]
        },
        {
          title: 'Analyse par lien',
          description: 'Collez l’URL d’une page vidéo Vimeo et le téléchargeur lit les résolutions disponibles',
          details: [
            'Compatible avec les liens vimeo.com, www.vimeo.com et player.vimeo.com',
            'Aucun compte ni connexion Vimeo requis',
            'Message clair lorsque la vidéo est privée ou ne peut pas être analysée',
            'Rien à installer pour un téléchargement classique'
          ]
        },
        {
          title: 'Fichiers volumineux',
          description:
            'Les vidéos Vimeo longues restent téléchargeables avec un suivi de progression, et l’extension prend le relais pour les fichiers énormes',
          details: [
            'La progression reste visible pendant le téléchargement',
            'Les téléchargements interrompus peuvent reprendre depuis l’espace de travail',
            'L’extension du navigateur gère ce que le navigateur seul ne termine pas',
            'L’espace de stockage est vérifié avant un gros téléchargement'
          ]
        },
        {
          title: 'Sur tous les appareils',
          description:
            'Utilisez la même page sur téléphone, tablette ou ordinateur : le téléchargement se fait dans le navigateur',
          details: [
            'Fonctionne sous Windows, macOS, Android, iPhone et tablette',
            'Aucune application de bureau requise',
            'Mise en page adaptée aux petits écrans',
            'Le fichier arrive dans votre dossier de téléchargements habituel'
          ]
        },
        {
          title: 'Limite d’accès claire',
          description: 'Les vidéos Vimeo privées, protégées par mot de passe ou payantes sont hors périmètre et annoncées comme telles',
          details: [
            'Aucune tentative de contourner la confidentialité ou les restrictions d’accès',
            'Aucun mot de passe, code de vérification ou fichier de session Vimeo n’est demandé',
            'Seules les pages vidéo publiques peuvent être analysées',
            'Vous restez responsable du droit de conserver la vidéo'
          ]
        },
        {
          title: 'Rapide et sans inscription',
          description: 'Copier, coller, choisir, télécharger ; un compte n’est utile que pour les téléchargements avec crédits',
          details: [
            'Aucune inscription pour tester un lien public',
            'Connexion Google ou code par e-mail uniquement lorsque des crédits sont nécessaires',
            'Les crédits n’expirent pas',
            'Messages d’erreur clairs lorsqu’un lien ne peut pas être traité'
          ]
        }
      ]
    },
    steps: {
      title: 'Comment enregistrer une vidéo Vimeo',
      subtitle:
        'Tout le processus tient en trois étapes : copiez l’URL de la page vidéo Vimeo, collez-la ci-dessus, puis choisissez la résolution et téléchargez.',
      metaDescription:
        'Guide pas à pas pour enregistrer une vidéo Vimeo : copiez l’URL de la page, collez-la dans Vimeo Video Downloader, choisissez la résolution et téléchargez le MP4.',
      items: [
        {
          title: 'Copiez le lien Vimeo',
          description: 'Ouvrez la vidéo sur vimeo.com et copiez l’URL depuis la barre d’adresse ou le menu de partage'
        },
        {
          title: 'Collez-le ci-dessus',
          description:
            'Placez le lien dans le champ et lancez l’analyse : le téléchargeur liste ce que Vimeo propose'
        },
        {
          title: 'Choisissez une résolution',
          description: 'Sélectionnez la qualité souhaitée parmi les résolutions disponibles'
        },
        {
          title: 'Téléchargez le MP4',
          description: 'Enregistrez le fichier sur votre appareil ; les fichiers volumineux peuvent nécessiter l’extension'
        }
      ]
    },
    cta: {
      title: 'Prêt à télécharger une vidéo Vimeo ?',
      description: 'Collez un lien Vimeo public ci-dessus et enregistrez-le dans la résolution voulue.'
    },
    techSpecs: {
      title: 'Spécifications techniques',
      browsersLabel: 'Navigateurs',
      browsers: 'Chrome, Edge, Brave et tous les navigateurs basés sur Chromium',
      sourceHostsLabel: 'Liens pris en charge',
      sourceHosts: 'vimeo.com, www.vimeo.com, player.vimeo.com',
      permissionsLabel: 'Autorisations',
      permissions: 'Autorisations minimales requises',
      updatesLabel: 'Mises à jour',
      updates: 'Mises à jour automatiques depuis la boutique d’extensions'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: 'Téléchargez les vidéos Vimeo dans la résolution voulue',
        description: 'Collez un lien Vimeo public, choisissez une résolution et enregistrez le MP4 directement depuis le navigateur.'
      },
      stats: {
        users: 'Utilisateurs dans le Monde',
        downloads: 'Téléchargements Totaux'
      },
      seo: {
        title: 'Téléchargeur de vidéos Vimeo : téléchargez des vidéos Vimeo en HD',
        description:
          'Enregistrez des vidéos Vimeo publiques en HD et choisissez la résolution. Collez le lien, analysez les résolutions et téléchargez le MP4 sans rien installer.',
        keywords:
          'téléchargeur vimeo, télécharger vidéo vimeo, vimeo hd, enregistrer vidéo vimeo, vimeo mp4, télécharger vimeo en ligne'
      },
      heroTrustPoints: [
        'Téléchargements HD',
        'Sans inscription',
        'Compatible mobile',
        'Fonctionne sous Windows, Mac, Android et iPhone'
      ],
      situation: {
        title: 'Commencez ici : quel lien Vimeo avez-vous ?',
        intro:
          'La plupart des personnes qui cherchent un téléchargeur Vimeo ont l’un de ces liens. Trouvez le vôtre :',
        headers: ['Votre situation', 'À essayer en premier'],
        rows: [
          {
            cells: [
              'Vous avez l’URL d’une page vidéo Vimeo publique',
              'Collez-la dans le téléchargeur ci-dessus et choisissez une résolution'
            ]
          },
          {
            cells: [
              'La page vidéo n’a pas de bouton de téléchargement',
              'Utilisez ce téléchargeur : Vimeo n’affiche son bouton que si le propriétaire l’autorise'
            ]
          },
          {
            cells: [
              'La vidéo est privée ou protégée par mot de passe',
              'Il faut l’accès du propriétaire ; un téléchargeur ne peut pas l’ouvrir à votre place'
            ]
          },
          {
            cells: [
              'Le téléchargeur indique que la vidéo est privée ou impossible à analyser',
              'Vérifiez que le lien est bien l’URL d’une page vidéo et que la vidéo est publique'
            ]
          }
        ]
      },
      solutions: {
        title: 'Ce qui fonctionne vraiment avec une vidéo Vimeo',
        intro:
          'Vimeo héberge des vidéos aux règles d’accès très différentes. Une page vidéo publique peut être analysée par un téléchargeur ; une vidéo privée, protégée par mot de passe ou payante n’est pas accessible de l’extérieur, quel que soit l’outil.',
        quickAnswer:
          'Réponse rapide : si la page Vimeo est publique, collez le lien ci-dessus et téléchargez la résolution voulue. Si Vimeo affiche son propre bouton de téléchargement, c’est la voie la plus propre. Si la vidéo est privée ou protégée par mot de passe, demandez l’accès ou un export au propriétaire : aucun téléchargeur ne peut contourner cela.',
        items: [
          {
            title: 'Solution 1 : téléchargeur Vimeo en ligne',
            description:
              'Idéal pour une page vidéo Vimeo publique. Collez l’URL, laissez le téléchargeur lister les résolutions proposées par Vimeo, puis enregistrez celle que vous voulez.',
            useWhenLabel: 'À utiliser quand :',
            useWhen: [
              'La page vidéo est publique et s’ouvre sans connexion.',
              'Vous voulez une résolution précise ou la meilleure qualité disponible.',
              'Vous ne voulez installer ni extension ni application de bureau.'
            ]
          },
          {
            title: 'Solution 2 : le bouton de téléchargement de Vimeo',
            description:
              'Certains créateurs autorisent le téléchargement de leurs vidéos. Quand cette option est activée, le lecteur Vimeo affiche un bouton de téléchargement : c’est la voie la plus directe.',
            useWhenLabel: 'À utiliser quand :',
            useWhen: [
              'Le lecteur Vimeo affiche une option de téléchargement.',
              'Vous voulez exactement le fichier publié par le créateur.',
              'Vous avez déjà l’autorisation de conserver une copie.'
            ]
          },
          {
            title: 'Solution 3 : extension du navigateur pour les gros fichiers',
            description:
              'Les vidéos longues peuvent dépasser ce qu’un onglet peut transférer et stocker d’un coup. L’extension prend le relais et garde le transfert reprenable.',
            useWhenLabel: 'À utiliser quand :',
            useWhen: [
              'Le téléchargement est très volumineux ou s’interrompt sans cesse.',
              'L’espace de travail signale que le navigateur manque de stockage local.',
              'Vous téléchargez régulièrement depuis Vimeo.'
            ]
          },
          {
            title: 'Solution 4 : capture d’écran (dernier recours)',
            description:
              'Si une vidéo se lit chez vous mais ne peut être téléchargée par aucune voie légale, un enregistreur d’écran peut la capturer. C’est un recours, pas la première méthode, car la qualité et l’audio dépendent de la lecture.',
            useWhenLabel: 'À utiliser quand :',
            useWhen: [
              'Vous avez l’autorisation de regarder et de conserver la vidéo.',
              'La vidéo ne peut pas être analysée depuis son lien.',
              'Vous avez seulement besoin d’une copie personnelle hors ligne.'
            ]
          }
        ]
      },
      benefits: {
        title: 'Pourquoi utiliser un téléchargeur Vimeo en ligne ?',
        intro:
          'Un bon téléchargeur répond vite à une question : cette vidéo Vimeo peut-elle être enregistrée depuis le lien dont je dispose ? L’expérience doit être directe, honnête sur les limites et claire quand une vidéo privée ne peut pas être traitée.',
        items: [
          {
            title: 'Enregistrez en haute qualité',
            description:
              'Conservez la meilleure résolution proposée par Vimeo pour que la copie hors ligne reste conforme à ce que le créateur a publié.'
          },
          {
            title: 'Fonctionne sur tous les appareils',
            description:
              'Utilisez le téléchargeur depuis un navigateur sur Android, iPhone, Windows, Mac ou tablette : c’est le navigateur que vous avez déjà qui enregistre le fichier.'
          },
          {
            title: 'Aucune connexion Vimeo requise',
            description:
              'Une page vidéo publique n’exige aucun compte Vimeo. Aucun mot de passe, code de vérification ou fichier de session n’est jamais demandé.'
          },
          {
            title: 'Lecture hors ligne simple',
            description:
              'Les téléchargements sont au format MP4, lisible sur presque tous les appareils et lecteurs sans codec supplémentaire.'
          },
          {
            title: 'Processus rapide à partir du lien',
            description:
              'Copier, coller, choisir, télécharger. Si le lien échoue, la page explique si la vidéo est privée, supprimée ou non prise en charge.'
          },
          {
            title: 'Limite d’autorisation claire',
            description:
              'Ne téléchargez que les vidéos que vous avez le droit de conserver. Respectez les droits des créateurs, les conditions de Vimeo et les règles d’accès de la vidéo.'
          },
          {
            title: 'Résolution maîtrisée',
            description:
              'Choisissez parmi les résolutions proposées par la vidéo au lieu d’être limité à une seule qualité.'
          },
          {
            title: 'Gestion des gros fichiers',
            description:
              'Les vidéos longues sont vérifiées avant le départ et peuvent continuer via l’extension du navigateur lorsqu’elles dépassent les capacités d’un onglet.'
          },
          {
            title: 'Tarif prévisible',
            description:
              'L’analyse d’un lien public ne demande aucun compte. Les crédits ne servent qu’aux téléchargements passant par l’espace de travail, et ils n’expirent pas.'
          }
        ]
      },
      troubleshooting: {
        title: 'Si le lien Vimeo ne fonctionne pas',
        intro:
          'Tous les échecs ne signifient pas que le téléchargeur est cassé. Les vidéos Vimeo échouent souvent parce que la page n’est pas publique. Essayez cette liste :',
        items: [
          'Ouvrez le lien dans un navigateur et vérifiez que la vidéo se lit sans connexion.',
          'Assurez-vous que l’URL est une page vidéo, pas un profil, une vitrine ou une recherche.',
          'Vérifiez si la vidéo est protégée par mot de passe ou marquée comme privée.',
          'Confirmez que la vidéo existe encore — une vidéo supprimée ne peut pas être analysée.',
          'Essayez un autre navigateur ou réseau si la page ne joint pas Vimeo.',
          'Évitez tout outil qui demande votre mot de passe Vimeo ou Google.'
        ]
      },
      permission: {
        title: 'Note importante sur les autorisations',
        note:
          'Un téléchargeur de vidéos Vimeo ne doit pas servir à contourner la confidentialité, le droit d’auteur ou les restrictions d’accès. N’enregistrez des vidéos que si vous avez l’autorisation du titulaire des droits ou si votre usage est permis par la loi et les conditions de Vimeo.'
      },
      comparison: {
        title: 'Choisir la bonne méthode de téléchargement Vimeo',
        headers: ['Situation', 'Solution recommandée', 'Idéal pour', 'À vérifier'],
        rows: [
          {
            cells: [
              'Page vidéo Vimeo publique',
              'Téléchargeur Vimeo en ligne',
              'Téléchargement HD rapide sans application',
              'La page s’ouvre sans connexion et la vidéo est publique'
            ]
          },
          {
            cells: [
              'Le créateur a autorisé les téléchargements',
              'Bouton de téléchargement de Vimeo',
              'Obtenir exactement le fichier publié',
              'Le lecteur affiche une option de téléchargement'
            ]
          },
          {
            cells: [
              'Téléchargement très gros ou interrompu',
              'Extension du navigateur',
              'Transferts reprenables au-delà de l’onglet',
              'Stockage local disponible et stabilité du réseau'
            ]
          },
          {
            cells: [
              'Vidéo privée ou protégée par mot de passe',
              'Demander l’accès ou un export au propriétaire',
              'Rester dans les règles d’accès de Vimeo',
              'Aucun téléchargeur n’atteint une vidéo à laquelle vous n’avez pas accès'
            ]
          }
        ]
      },
      howTo: {
        title: 'Télécharger une vidéo Vimeo en 3 étapes',
        subtitle:
          'La voie la plus rapide est le téléchargeur ci-dessus. Il fonctionne quand la page vidéo Vimeo est publique et accessible depuis votre navigateur.',
        steps: [
          {
            title: 'Copiez le lien de la vidéo',
            description:
              'Ouvrez la vidéo sur Vimeo et copiez l’URL de la page depuis la barre d’adresse ou le menu de partage.'
          },
          {
            title: 'Collez et analysez',
            description:
              'Collez le lien dans le téléchargeur ci-dessus. L’outil vérifie quelles résolutions Vimeo propose pour cette vidéo.'
          },
          {
            title: 'Choisissez la qualité et téléchargez',
            description:
              'Sélectionnez une résolution puis enregistrez le MP4 sur votre appareil. Si rien n’apparaît, la vidéo est probablement privée ou indisponible, pas cassée.'
          }
        ]
      },
      faq: {
        title: 'Questions fréquentes',
        description: 'Les questions qui reviennent avant de télécharger une vidéo Vimeo.',
        items: [
          {
            question: 'Comment télécharger une vidéo Vimeo ?',
            answer:
              'Ouvrez la page de la vidéo sur Vimeo, copiez son URL, collez-la dans le téléchargeur ci-dessus, choisissez l’une des résolutions disponibles puis téléchargez le MP4.'
          },
          {
            question: 'Puis-je télécharger des vidéos Vimeo privées ou protégées par mot de passe ?',
            answer:
              'Non. Les vidéos privées, protégées par mot de passe ou payantes ne sont pas accessibles en dehors de votre session Vimeo : le téléchargeur ne peut donc pas les analyser. Demandez l’accès ou un export au propriétaire.'
          },
          {
            question: 'Pourquoi le téléchargeur dit-il que la vidéo Vimeo est privée ?',
            answer:
              'Vimeo n’a renvoyé aucune résolution publique pour ce lien. Les causes habituelles sont les paramètres de confidentialité, un mot de passe requis, une vidéo supprimée ou une URL pointant vers un profil ou une vitrine plutôt qu’une page vidéo.'
          },
          {
            question: 'Faut-il un compte Vimeo ou l’extension ?',
            answer:
              'Un téléchargement public classique ne demande ni compte ni extension. L’extension n’est utile que pour les fichiers très volumineux ou pour poursuivre le transfert hors de l’onglet.'
          },
          {
            question: 'Dans quel format et quelle qualité le fichier arrive-t-il ?',
            answer:
              'Les téléchargements sont des fichiers MP4 générés à partir des résolutions proposées par Vimeo. Vous choisissez parmi les résolutions disponibles, la plus haute correspondant généralement à la qualité mise en ligne par le créateur.'
          },
          {
            question: 'Est-ce gratuit ?',
            answer:
              'L’analyse d’un lien Vimeo public est gratuite. Les téléchargements passant par l’espace de travail consomment des crédits, achetés une seule fois et sans expiration ; l’extension dispose d’un abonnement Unlimited distinct.'
          },
          {
            question: 'Est-il sûr de coller un lien Vimeo ici ?',
            answer:
              'Oui. Seul le lien collé sert à retrouver la vidéo. Le téléchargeur ne demande jamais de mot de passe, de code de vérification ni de fichier de session Vimeo, et vous devez quitter toute page qui le ferait.'
          },
          {
            question: 'Télécharger des vidéos Vimeo est-il légal ?',
            answer:
              'Cela dépend de la vidéo, de votre autorisation et de votre usage. Ne téléchargez que des contenus que vous pouvez conserver et ne redistribuez pas de contenu protégé ou privé sans autorisation.'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: 'Accès web',
          title: 'Connectez-vous pour synchroniser vos crédits',
          signedInAs: 'Connecté en tant que',
          continueWithGoogle: 'Continuer avec Google',
          googleLoading: 'Ouverture de Google...',
          or: 'ou',
          emailLabel: 'E-mail',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: 'Continuer avec l’e-mail',
          sendCode: 'Envoyer le code',
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
          creditsLabel: 'crédits'
        },
                quota: {
          eyebrow: 'Quota web',
          title: 'Solde crédits actuel',
          planLabel: 'Offre',
          remainingLabel: 'Restant',
          dailyLimitLabel: 'Limite quotidienne',
          unlimited: 'Illimité'
        },
                checkin: {
          creditsLoading: 'Crédits',
          creditsButtonLabel: 'Ouvrir le check-in quotidien',
          accountButtonLabel: 'Ouvrir le menu du compte',
          accountMenuLabel: 'Menu du compte',
          title: 'Vos crédits gratuits du jour sont prêts',
          todayRewardText: 'Récompense du jour : {credits} crédits',
          claimedRewardText: 'Vous avez reçu {credits} crédits aujourd’hui.',
          nextCountdown: 'Prochaine récupération dans {time}',
          nextAt: '(Prochaine actualisation : {time} EST)',
          claimButton: 'Récupérer {credits} crédits',
          claimingButton: 'Récupération...',
          notNow: 'Pas maintenant',
          close: 'Fermer',
          loadFailed: 'Impossible de charger l’état du check-in.',
          claimFailed: 'Impossible de récupérer les crédits.'
        },
                creditPurchase: {
          installGuide: 'Vous pouvez aussi télécharger avec l’extension du navigateur.',
          installExtension: 'Installer l’extension',
          title: 'Acheter des crédits',
          description: 'Ajoutez des crédits et continuez le téléchargement depuis cet espace de travail.',
          successTitle: 'Crédits ajoutés',
          successDescription: 'Votre solde a été actualisé. Fermez cette fenêtre et relancez le téléchargement.',
          packageEyebrow: 'Payez selon vos besoins',
          cardNote: 'Utilisez les crédits pour les téléchargements web. Les crédits n’expirent pas.',
          creditsAmount: '{credits} crédits',
          buyNow: 'Acheter maintenant',
          selectPackage: 'Sélectionner',
          paymentMethodLabel: 'Choisir le moyen de paiement',
          paymentTitle: 'Choisir le moyen de paiement',
          selectedPackageLabel: 'Produit sélectionné',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: 'Continuer vers le paiement',
          backToProducts: 'Retour',
          close: 'Fermer',
          agreementText: 'J’accepte les conditions d’achat, les Conditions et la Politique de confidentialité.',
          loadingConfigs: 'Chargement des packs de crédits...',
          loadFailed: 'Impossible de charger les packs de crédits. Veuillez réessayer.',
          noConfigs: 'Aucun pack de crédits n’est disponible pour le moment. Veuillez réessayer plus tard.',
          ready: 'Choisissez un pack de crédits. Les prix sont affichés en USD.',
          creatingOrder: 'Création de la commande...',
          pendingPayment: 'Terminez le paiement dans l’onglet qui vient de s’ouvrir. Nous vérifierons le résultat automatiquement.',
          pendingPaymentTitle: 'En attente du paiement',
          cancelPayment: 'Annuler le paiement',
          supportMailPrefix: 'Signaler un problème : ',
          success: 'Paiement terminé. Les crédits sont disponibles.',
          failed: 'Le paiement n’est pas terminé. Vous pouvez réessayer ou fermer cette fenêtre.',
          successCredits: '+{credits} crédits ajoutés',
          successBalance: 'Solde actuel : {balance} crédits',
          createFailed: 'Impossible de créer la commande. Veuillez réessayer.',
          invalidPaymentData: 'Le lien de paiement est invalide. Veuillez réessayer plus tard.',
          priceUpdated: 'Le prix a changé. Vérifiez le nouveau prix puis rachetez.',
          gatewayFailed: 'L’accès au paiement est temporairement indisponible. Veuillez réessayer plus tard.',
          paymentCanceled: 'Le paiement a été annulé. Choisissez un moyen de paiement et réessayez.',
          pollFailed: 'Impossible d’actualiser l’état du paiement. Veuillez réessayer.',
          pollTimeout: 'L’actualisation automatique a expiré. Actualisez le résultat après le paiement.',
          orderNotFound: 'La commande n’est plus disponible. Créez une nouvelle commande.',
          orderExpired: 'La commande a expiré. Achetez à nouveau.',
          fulfillmentFailed: 'Le paiement a été reçu, mais les crédits n’ont pas encore été ajoutés. Réessayez plus tard.',
          authExpired: 'La connexion a expiré. Reconnectez-vous pour continuer.'
        },
        parse: {
          eyebrow: 'Vérification rapide du lien',
          title: 'Téléchargeur de vidéos Vimeo : enregistrez toute vidéo publique',
          helperText:
            'Collez un lien de vidéo Vimeo public, consultez les résolutions proposées par Vimeo et téléchargez celle qu’il vous faut.',
          linkLabel: 'Lien Vimeo',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: 'Effacer la saisie',
          submit: 'Coller le lien de la vidéo Vimeo',
          submitting: 'Analyse...',
          noResults: 'Aucun fichier téléchargeable n’a été trouvé pour cette vidéo.',
          download: 'Télécharger',
          downloading: 'Téléchargement...',
          checkingStorage: 'Vérification du stockage du navigateur...',
          unknownSize: 'Taille inconnue',
          preparingMp4: 'Préparation du MP4...',
          downloadAll: 'Tout télécharger',
          downloadingAll: 'Téléchargement de tout...',
          resumeNotice:
            'Un téléchargement inachevé « {filename} » ({progress}) a été détecté. Voulez-vous continuer ?',
          resumeAction: 'Continuer',
          pendingRestartText: 'L’enregistrement de téléchargement précédent pour "{filename}" peut être redémarré.',
          pendingRestartButton: 'Redémarrer le téléchargement',
          resumeUnavailableText: 'L’enregistrement de récupération local a expiré.',
          resumeDismiss: 'Ignorer',
          resuming: 'Reprise...',
          largeFileExtensionInlineChromeTitle: 'Extension Chrome',
          largeFileExtensionInlineChromeDescription:
            'Extension dédiée à Chrome qui maintient les gros téléchargements Vimeo hors de l’onglet.',
          largeFileExtensionInlineChromeCta: 'Installer l’extension',
          largeFileExtensionInlineEdgeTitle: 'Extension Edge',
          largeFileExtensionInlineEdgeDescription:
            'Extension dédiée à Microsoft Edge, avec le même traitement des gros téléchargements Vimeo.',
          largeFileExtensionInlineEdgeCta: 'Installer l’extension'
        },
                errors: {
          enterEmailFirst: 'Veuillez d’abord saisir votre adresse e-mail.',
          enterEmailAndCode: 'Veuillez saisir l’e-mail et le code de vérification.',
          sendCodeFailed: 'Impossible d’envoyer le code de vérification.',
          googleSignInFailed: 'Connexion Google impossible.',
          googleClientMissing: 'La connexion Google n’est pas configurée.',
          restoreSessionFailed: 'Impossible de restaurer la session.',
          signInFailed: 'Impossible de se connecter.',
          logoutFailed: 'Impossible de se déconnecter.',
          loadQuotaFailed: 'Impossible de charger les crédits.',
          enterLink: 'Veuillez saisir un lien média.',
          invalidLink: 'Ce n’est pas une URL valide.',
          parseFailed: 'Impossible d’analyser ce lien.',
          downloadFailed: 'Impossible de télécharger ce fichier.',
          unsafeFileTypeUseExtension:
            'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.',
          unsafeFileTypeConfirmTitle: 'Use the browser extension',
          unsafeFileTypeConfirmViewExtension: 'View extension download',
          unsafeFileTypeConfirmCancel: 'Cancel',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: 'Cette vidéo dépasse la limite de taille de téléchargement du navigateur.',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: "La plateforme de ce lien n'est pas prise en charge.",
          vimeoParseFailed: "Cette vidéo Vimeo est privée ou ne peut pas être analysée.",
          quotaExceeded: 'Crédits insuffisants pour télécharger ce fichier.',
          rateLimitExceeded: 'Trop de requêtes. Veuillez réessayer plus tard.'
        },
                anonymousQueue: {
          title: 'Téléchargement en attente',
          remaining: 'Le téléchargement commence dans {seconds} secondes.',
          hint: 'Connectez-vous pour télécharger sans attendre.',
          login: 'Se connecter',
          close: 'Fermer'
        },
                downloadAll: {
          allSuccess: 'Tous les fichiers ont été téléchargés.',
          partialFailed: 'Certains fichiers ont été téléchargés. Certains ont échoué.',
          allFailed: 'Tous les téléchargements ont échoué.'
        }
      }
    },
    changelog: {
      title: 'Nouveautés du téléchargeur Vimeo',
      description:
        'Suivez les mises à jour de téléchargement Vimeo, les changements d’analyse, la prise en charge des fichiers plus gros et les notes de version de Vimeo Video Downloader.',
      seoTitle: 'Nouveautés du téléchargeur Vimeo | Vimeo Video Downloader',
      seoDescription:
        'Lisez les nouveautés de Vimeo Video Downloader : mises à jour d’analyse, gestion des résolutions, fichiers plus volumineux et notes de chaque version.',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: 'Gain de performance',
          description: 'Améliorations de performance importantes pour une meilleure expérience.',
          features: [
            'Vitesse d’analyse améliorée de 50 %',
            'Stabilité optimisée des gros téléchargements',
            'Interface plus réactive'
          ]
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: 'Prise en charge multilingue',
          description: 'Ajout de 14 langues.',
          features: ['Ajout du japonais, du coréen et d’autres langues', 'Meilleure précision de traduction', 'Détection automatique de la langue']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: 'Choix de la résolution',
          description: 'Choisissez la résolution Vimeo souhaitée avant le début du téléchargement.',
          features: [
            'Choisissez n’importe quelle résolution proposée',
            'Conservez la meilleure qualité disponible',
            'Gestion améliorée de la file de téléchargements'
          ]
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: 'Sécurité et confidentialité',
          description: 'Améliorations de sécurité et de confidentialité.',
          features: [
            'Suppression de tout suivi analytique dans les téléchargements',
            'Ajout d’un mode de traitement strictement local',
            'Chiffrement des données amélioré'
          ]
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: 'Première version',
          description: 'Première version du téléchargeur par lien Vimeo.',
          features: [
            'Analyse des liens Vimeo et sortie MP4',
            'Prise en charge des liens vimeo.com et player.vimeo.com',
            'Gestion de base des résolutions'
          ]
        }
      ],
      labels: {
        features: 'Nouveautés',
        fixes: 'Corrections'
      }
    },
    pricing: frFRPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Téléchargeur de vidéos Vimeo HD - Plusieurs résolutions | Vimeo Video Downloader',
          description:
            'Téléchargez des vidéos Vimeo en HD avec plusieurs résolutions, gratuitement. Aucune application requise. Enregistrez immédiatement toute vidéo Vimeo publique.',
          keywords:
            'téléchargeur vimeo, télécharger vidéo vimeo, télécharger vimeo hd, téléchargeur vimeo gratuit, enregistrer vidéo vimeo, vimeo hd'
        },
        workspace: {
          title: 'Téléchargeur de vidéos Vimeo HD',
          helperText:
            'Collez n’importe quel lien de vidéo Vimeo public pour la télécharger en HD avec choix de la résolution.',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: 'Pourquoi utiliser notre téléchargeur Vimeo',
          subtitle: 'Enregistrez des vidéos Vimeo en HD avec la résolution de votre choix, entièrement gratuitement.',
          items: [
            {
              title: 'Qualité HD d’origine',
              description:
                'Téléchargez les vidéos Vimeo dans leur résolution Full HD. Vous obtenez la même netteté que celle mise en ligne par le créateur.'
            },
            {
              title: 'Plusieurs résolutions',
              description:
                'Choisissez parmi les résolutions disponibles (360p, 720p, 1080p et plus). Prenez la qualité qui vous convient.'
            },
            {
              title: 'Rapide et gratuit',
              description:
                'Aucune application à installer, aucun compte requis. Collez le lien Vimeo, choisissez la résolution et téléchargez immédiatement.'
            }
          ]
        },
        howTo: {
          title: 'Comment télécharger des vidéos Vimeo en HD',
          subtitle: 'Trois étapes simples pour enregistrer toute vidéo Vimeo publique dans la résolution de votre choix.',
          steps: [
            {
              title: 'Copiez le lien de la vidéo Vimeo',
              description: 'Ouvrez la page de la vidéo sur Vimeo et copiez l’URL depuis la barre d’adresse du navigateur.'
            },
            {
              title: 'Collez le lien ci-dessus',
              description: 'Collez l’URL Vimeo copiée dans le champ de saisie puis cliquez sur Analyser.'
            },
            {
              title: 'Choisissez la résolution et téléchargez',
              description: 'Sélectionnez la résolution souhaitée et cliquez sur Télécharger pour enregistrer la vidéo HD.'
            }
          ]
        },
        faq: {
          title: 'FAQ du téléchargeur Vimeo',
          items: [
            {
              question: 'Comment télécharger une vidéo depuis Vimeo ?',
              answer:
                'Copiez l’URL de la page vidéo Vimeo, collez-la dans le champ ci-dessus, cliquez sur Analyser, puis choisissez la résolution et téléchargez.'
            },
            {
              question: 'Puis-je choisir la résolution de la vidéo ?',
              answer:
                'Oui. Après l’analyse, vous pouvez choisir parmi toutes les résolutions disponibles, notamment 360p, 720p, 1080p et plus si elles existent.'
            },
            {
              question: 'Ce téléchargeur Vimeo est-il gratuit ?',
              answer:
                'L’analyse d’un lien Vimeo public est gratuite et sans inscription. Les téléchargements passant par l’espace de travail consomment des crédits.'
            },
            {
              question: 'Faut-il un compte Vimeo pour télécharger ?',
              answer: 'Aucun compte n’est nécessaire. Vous pouvez télécharger toute vidéo Vimeo publique sans vous connecter.'
            },
            {
              question: 'Quel est le format des vidéos téléchargées ?',
              answer: 'Les vidéos Vimeo sont téléchargées au format MP4, compatible avec presque tous les appareils et lecteurs.'
            }
          ]
        }
      }
    }
  }
}
