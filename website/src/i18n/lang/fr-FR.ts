import type { SiteContent } from '../schema'
import { frFRPricingContent } from '../pricing'

export const frFR: SiteContent = {
  site: {
    description: 'Collez un lien Vimeo pour enregistrer la vidéo dans votre navigateur, gratuitement et sans connexion. Besoin de l\'audio, des sous-titres, de l\'image de couverture ou d\'une file d\'attente ? Ajoutez l\'extension Chrome.'
  },
  layout: {
    nav: {
      brand: 'Vimeo Downloader',
      home: 'Accueil',
      pricing: 'Tarifs',
    },
    footer: {
      resources: 'Ressources',
      rights: '© 2026 Vimeo Downloader. Tous droits réservés.'
    }
  },
  common: {
    installCta: 'Installer Maintenant'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Downloader – outil en ligne gratuit et extension Chrome',
        description: 'Collez un lien Vimeo pour enregistrer la vidéo dans votre navigateur, gratuitement et sans connexion. Besoin de l\'audio, des sous-titres, de l\'image de couverture ou d\'une file d\'attente ? Ajoutez l\'extension Chrome.'
      },
      heroTrustPoints: [
        'Téléchargements HD',
        'Sans inscription'
      ],
      workspace: {
        parse: {
          eyebrow: 'Vérification rapide du lien',
          titleBrand: 'Téléchargeur de vidéos Vimeo',
          titleTagline: 'Enregistrez toute vidéo publique',
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
          extensionEntryLine: 'Téléchargez directement sur Vimeo avec l’extension',
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
          rateLimitExceeded: 'Trop de requêtes. Veuillez réessayer plus tard.',
          useExtensionForResource: 'Cette ressource ne peut être téléchargée qu’avec l’extension de navigateur. Installez-la pour continuer.'
        },
                anonymousQueue: {
          title: 'Téléchargement en attente',
          remaining: 'Le téléchargement commence dans {seconds} secondes.',
          close: 'Fermer'
        },
                downloadAll: {
          allSuccess: 'Tous les fichiers ont été téléchargés.',
          partialFailed: 'Certains fichiers ont été téléchargés. Certains ont échoué.',
          allFailed: 'Tous les téléchargements ont échoué.'
        }
      }
    ,
      softwareApplication: {
        description: 'Une extension Chrome pour les spectateurs de Vimeo qui veulent une copie locale de la vidéo qu\'ils regardent déjà, avec un panneau dans la page pour télécharger vidéo, audio, sous-titres et image de couverture.',
        featureList: [
          'Panneau de téléchargement dans la page avec les lignes Vidéo, Audio, Sous-titres et Image',
          'Choisir la qualité vidéo ou utiliser Best',
          'Enregistrer l\'audio en M4A ou le transcoder en MP3',
          'Enregistrer les sous-titres en VTT et découper la vidéo ou l\'audio adaptatifs',
          'Enregistrer l\'image de couverture en JPEG',
          'Liste des ressources dans la fenêtre contextuelle avec progression et vitesse en direct',
          'File de téléchargement globale partagée entre les onglets',
          'Historique local, modèle de nom de fichier et sous-dossier d\'enregistrement'
        ]
      },
      intro: {
        heading: 'Allez plus loin avec l\'extension Chrome',
        lead: 'L\'outil en ligne ci-dessus enregistre une vidéo Vimeo à partir d\'un lien. L\'extension fonctionne sur la page Vimeo que vous regardez déjà et ajoute l\'audio, les sous-titres, les images de couverture et une file de téléchargement.',
        primaryCta: 'Ajouter à Chrome',
        secondaryCta: 'Voir les formules',
        panel: {
          ariaLabel: 'Illustration du panneau de téléchargement dans la page',
          rows: {
            video: 'Vidéo',
            audio: 'Audio',
            subtitle: 'Sous-titres',
            image: 'Image'
          }
        }
      },
      features: {
        heading: 'Ce que l\'extension ajoute',
        items: [
          {
            title: 'Panneau de téléchargement dans la page',
            description: 'Un petit panneau près de la vidéo avec les lignes Vidéo, Audio, Sous-titres et Image. Il se reconstruit quand vous passez à une autre vidéo.'
          },
          {
            title: 'Choix de la qualité et Best',
            description: 'Choisissez 720p, 1080p ou une autre qualité proposée par la vidéo, ou laissez Best sélectionner la plus élevée.'
          },
          {
            title: 'Audio en M4A ou MP3',
            description: 'Enregistrez la piste audio seule en M4A, ou choisissez MP3 dans la fenêtre contextuelle pour une sortie transcodée.'
          },
          {
            title: 'Sous-titres et découpe',
            description: 'Enregistrez les sous-titres disponibles en VTT. La vidéo et l\'audio adaptatifs peuvent être découpés sans transcoder la vidéo.'
          },
          {
            title: 'Image de couverture',
            description: 'Enregistrez l\'image de couverture de la vidéo dans un fichier JPEG distinct.'
          },
          {
            title: 'Liste contextuelle et file d\'attente',
            description: 'Consultez tous les éléments détectés dans la fenêtre contextuelle avec la progression en direct, puis ajoutez-les à une file qui les télécharge dans l\'ordre, d\'un onglet à l\'autre.'
          },
          {
            title: 'Fichiers volumineux',
            description: 'Les fichiers que Chrome peut récupérer lui-même vont au gestionnaire de téléchargement de Chrome. Les flux adaptatifs sont assemblés en arrière-plan dans la limite d\'un budget mémoire.'
          },
          {
            title: 'Réglages et historique',
            description: 'Choisissez un sous-dossier d\'enregistrement, un modèle de nom de fichier et la langue de l\'interface. Les téléchargements terminés et échoués restent dans un historique local exportable en CSV.'
          }
        ]
      },
      steps: {
        heading: 'Comment fonctionne l\'extension',
        items: [
          {
            title: 'Installer',
            description: 'Installez l\'extension depuis le Chrome Web Store.'
          },
          {
            title: 'Épingler l\'icône',
            description: 'Épinglez-la dans la barre d\'outils pour ouvrir rapidement la fenêtre contextuelle.'
          },
          {
            title: 'Ouvrir une vidéo Vimeo',
            description: 'Allez sur une page vidéo compatible de vimeo.com ou player.vimeo.com et lancez la lecture.'
          },
          {
            title: 'Choisir une qualité',
            description: 'Cliquez sur la qualité voulue dans le panneau, ou ouvrez l\'icône de l\'extension pour la liste complète. Votre navigateur écrit le fichier sur le disque.'
          }
        ]
      },
      comparison: {
        heading: 'Outil en ligne ou extension',
        columns: {
          dimension: 'Comparer',
          web: 'Outil en ligne',
          extension: 'Extension Chrome'
        },
        rows: [
          {
            dimension: 'Où ça fonctionne',
            web: 'Dans n\'importe quel onglet du navigateur sur cette page : collez un lien Vimeo.',
            extension: 'Dans Chrome et d\'autres navigateurs basés sur Chromium, sur la page Vimeo que vous regardez.'
          },
          {
            dimension: 'Ce que vous pouvez enregistrer',
            web: 'La vidéo sous forme de fichier MP4.',
            extension: 'Vidéo en MP4, audio en M4A ou MP3, sous-titres en VTT et image de couverture en JPEG.'
          },
          {
            dimension: 'Lots et file d\'attente',
            web: 'Collez plusieurs liens et lancez-les un par un avec « Tout télécharger ».',
            extension: 'Ajoutez des éléments depuis la fenêtre contextuelle à une file partagée entre les onglets ; ils se téléchargent dans l\'ordre.'
          },
          {
            dimension: 'Fichiers volumineux',
            web: 'Les fichiers très volumineux ou de taille inconnue sont redirigés vers l\'extension.',
            extension: 'Les fichiers directs passent par le gestionnaire de téléchargement de Chrome ; les flux adaptatifs sont assemblés dans la limite d\'un budget mémoire.'
          },
          {
            dimension: 'Connexion',
            web: 'Non requise.',
            extension: 'Non requise. La connexion est facultative et n\'influe que sur votre quota quotidien et l\'état de votre abonnement.'
          },
          {
            dimension: 'Coût',
            web: 'Gratuit.',
            extension: 'Un quota quotidien gratuit, avec une formule Unlimited payante pour en avoir plus.'
          }
        ]
      },
      scope: {
        heading: 'Ce pour quoi ça fonctionne, et ce que ça ne fait pas',
        worksFor: {
          heading: 'Fonctionne pour',
          items: [
            'Les pages vidéo compatibles ouvertes comme page principale sur vimeo.com, www.vimeo.com et player.vimeo.com ; la lecture seule ne garantit pas qu\'une ressource soit téléchargeable',
            'Choisir une qualité précise ou la piste audio plutôt que le flux par défaut',
            'Enregistrer l\'image de couverture',
            'Mettre plusieurs éléments d\'une même page en file d\'attente'
          ]
        },
        doesNot: {
          heading: 'Ne fait pas',
          items: [
            'Contourner les contrôles d\'accès : les vidéos privées, protégées par mot de passe ou payantes ne sont pas garanties, même si vous pouvez les lire',
            'Supprimer ou contourner le DRM',
            'Prendre en charge tous les formats HLS, la capture complète de direct ni d\'autres sites que Vimeo',
            'Fonctionner dans les applications Vimeo de bureau ou mobiles'
          ]
        },
        compliance: {
          heading: 'Mentions légales et conformité',
          items: [
            'Outil tiers développé de façon indépendante, sans affiliation, approbation ni lien avec Vimeo, Inc. Vimeo est une marque de Vimeo, Inc.',
            'Destiné aux contenus auxquels vous avez déjà légitimement accès. Vous êtes responsable du respect du droit d\'auteur ainsi que des conditions de Vimeo et de l\'auteur d\'origine.',
            'Ne l\'utilisez pas pour redistribuer des contenus protégés par le droit d\'auteur ni pour contourner des contrôles d\'accès auxquels vous n\'avez pas droit.'
          ]
        }
      },
      plans: {
        heading: 'Formules',
        free: {
          name: 'Free',
          description: 'Un quota quotidien de téléchargements gratuit. Un nouveau compte ou appareil démarre avec une première journée illimitée.',
          cta: 'Voir les offres'
        },
        unlimited: {
          name: 'Unlimited',
          description: 'Un abonnement payant qui lève la limite quotidienne de l\'extension.',
          cta: 'Choisir Unlimited'
        }
      },
      faq: {
        heading: 'Questions fréquentes',
        items: [
          {
            question: 'Faut-il un compte pour télécharger ?',
            answer: 'Non. L\'outil en ligne ne demande aucune connexion, l\'extension non plus. Se connecter dans l\'extension est facultatif et n\'influe que sur votre quota quotidien et l\'état de votre abonnement.'
          },
          {
            question: 'Est-ce gratuit ?',
            answer: 'L\'outil en ligne est gratuit. L\'extension offre un quota quotidien gratuit, et une formule Unlimited payante est disponible. Consultez la page des tarifs pour les détails actuels.'
          },
          {
            question: 'Dois-je utiliser l\'outil en ligne ou l\'extension ?',
            answer: 'Utilisez l\'outil en ligne pour obtenir rapidement un MP4 à partir d\'un lien. Utilisez l\'extension pour l\'audio, les sous-titres, l\'image de couverture, une qualité choisie ou une file de plusieurs éléments.'
          },
          {
            question: 'Peut-il télécharger des vidéos Vimeo privées, protégées par mot de passe ou payantes ?',
            answer: 'La prise en charge n\'est pas garantie. Aucun des deux outils ne déverrouille ni ne contourne les contrôles d\'accès de Vimeo, et aucun ne supprime le DRM.'
          },
          {
            question: 'Quels formats obtiens-je ?',
            answer: 'L\'outil en ligne enregistre la vidéo en MP4. L\'extension enregistre la vidéo en MP4, l\'audio en M4A ou MP3, les sous-titres en VTT et les images de couverture en JPEG.'
          },
          {
            question: 'Que se passe-t-il avec les fichiers très volumineux ?',
            answer: 'L\'outil en ligne oriente les fichiers très volumineux ou de taille inconnue vers l\'extension. Dans l\'extension, les flux adaptatifs sont assemblés dans la limite d\'un budget mémoire ; les éléments dont la taille connue le dépasse ne sont donc pas proposés.'
          },
          {
            question: 'Ma vidéo passe-t-elle par vos serveurs ?',
            answer: 'Le média va directement des serveurs de Vimeo à votre navigateur et à votre disque. L\'extension contacte aussi les services du développeur pour les fonctions de compte, les quotas de téléchargement, les abonnements, les réglages distants et les rapports d\'usage ou d\'erreur.'
          },
          {
            question: 'Quels navigateurs et quels sites sont pris en charge ?',
            answer: 'L\'extension fonctionne dans Chrome et d\'autres navigateurs basés sur Chromium comme Edge et Brave, et uniquement sur les pages Vimeo. Les autres sites vidéo ne sont pas pris en charge.'
          }
        ]
      },
      finalCta: {
        heading: 'Enregistrez plus de Vimeo avec l\'extension',
        description: 'Installez-la une fois et téléchargez depuis la page Vimeo que vous regardez déjà.',
        primaryCta: 'Ajouter à Chrome'
      }
    },
    pricing: frFRPricingContent,
  }
}
