import type { SiteContent } from '../schema'
import { esESPricingContent } from '../pricing'

export const esES: SiteContent = {
  site: {
    description: 'Pega un enlace de Vimeo y guarda el vídeo en tu navegador, gratis y sin iniciar sesión. ¿Necesitas audio, subtítulos, imagen de portada o una cola? Añade la extensión de Chrome.'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Inicio',
      pricing: 'Precios',
    },
    footer: {
      resources: 'Recursos',
      rights: '© 2026 Vimeo Video Downloader. Todos los derechos reservados.'
    }
  },
  common: {
    installCta: 'Instalar Ahora'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Video Downloader – herramienta en línea gratuita y extensión de Chrome',
        description: 'Pega un enlace de Vimeo y guarda el vídeo en tu navegador, gratis y sin iniciar sesión. ¿Necesitas audio, subtítulos, imagen de portada o una cola? Añade la extensión de Chrome.'
      },
      heroTrustPoints: [
        'Descargas en HD',
        'Sin registro',
        'Compatible con móvil',
        'Funciona en Windows, Mac, Android y iPhone'
      ],
      workspace: {
        parse: {
          eyebrow: 'Comprobación rápida del enlace',
          title: 'Descargador de vídeos de Vimeo: guarda cualquier vídeo público',
          helperText:
            'Pega un enlace público de vídeo de Vimeo, revisa las resoluciones que ofrece y descarga la que necesites.',
          linkLabel: 'Enlace de Vimeo',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: 'Borrar entrada',
          submit: 'Pegar enlace de vídeo de Vimeo',
          submitting: 'Analizando...',
          noResults: 'No se encontraron archivos descargables para este vídeo.',
          download: 'Descargar',
          downloading: 'Descargando...',
          checkingStorage: 'Comprobando el almacenamiento del navegador...',
          unknownSize: 'Tamaño desconocido',
          preparingMp4: 'Preparando MP4...',
          downloadAll: 'Descargar todo',
          downloadingAll: 'Descargando todo...',
          resumeNotice:
            'Se detectó una descarga sin terminar "{filename}" ({progress}). ¿Quieres continuar?',
          resumeAction: 'Continuar',
          pendingRestartText: 'El registro de descarga anterior de "{filename}" se puede reiniciar.',
          pendingRestartButton: 'Reiniciar descarga',
          resumeUnavailableText: 'El registro de recuperación local ha caducado.',
          resumeDismiss: 'Ignorar',
          resuming: 'Reanudando...',
          largeFileExtensionInlineChromeTitle: 'Extensión para Chrome',
          largeFileExtensionInlineChromeDescription:
            'Extensión específica para Chrome que mantiene las descargas grandes de Vimeo fuera de la pestaña.',
          largeFileExtensionInlineChromeCta: 'Instalar extensión',
          largeFileExtensionInlineEdgeTitle: 'Extensión para Edge',
          largeFileExtensionInlineEdgeDescription:
            'Extensión específica para Microsoft Edge, con el mismo tratamiento de descargas grandes de Vimeo.',
          largeFileExtensionInlineEdgeCta: 'Instalar extensión'
        },
                errors: {
          enterLink: 'Introduce un enlace multimedia.',
          invalidLink: 'Esta no es una URL válida.',
          parseFailed: 'No se pudo analizar este enlace.',
          downloadFailed: 'No se pudo descargar este archivo.',
          unsafeFileTypeUseExtension:
            'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.',
          unsafeFileTypeConfirmTitle: 'Use the browser extension',
          unsafeFileTypeConfirmViewExtension: 'View extension download',
          unsafeFileTypeConfirmCancel: 'Cancel',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: 'Este vídeo supera el límite de tamaño de descarga del navegador.',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: 'This link platform is not supported.',
          vimeoParseFailed: 'This Vimeo video is private or cannot be parsed.',
          rateLimitExceeded: 'Too many requests. Please try again later.',
          useExtensionForResource: 'Este recurso solo se puede descargar con la extensión del navegador. Instálala para continuar.'
        },
                anonymousQueue: {
          title: 'Descarga en espera',
          remaining: 'La descarga comenzará en {seconds} segundos.',
          close: 'Cerrar'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    ,
      softwareApplication: {
        description: 'Una extensión de Chrome para quienes ven Vimeo y quieren una copia local del vídeo que ya están reproduciendo, con un panel en la página para descargar vídeo, audio, subtítulos e imagen de portada.',
        featureList: [
          'Panel de descarga en la página con filas de vídeo, audio, subtítulos e imagen',
          'Elegir la calidad del vídeo o usar Best',
          'Guardar audio como M4A o transcodificarlo a MP3',
          'Guardar subtítulos como VTT y recortar vídeo o audio adaptativo',
          'Guardar la imagen de portada como JPEG',
          'Lista de recursos en la ventana emergente con progreso y velocidad en vivo',
          'Cola de descargas global compartida entre pestañas',
          'Historial local, plantilla de nombre de archivo y subcarpeta de guardado'
        ]
      },
      intro: {
        heading: 'Llega más lejos con la extensión de Chrome',
        lead: 'La herramienta en línea de arriba guarda un vídeo de Vimeo a partir de un enlace. La extensión funciona en la página de Vimeo que ya estás viendo y añade audio, subtítulos, imágenes de portada y una cola de descargas.',
        primaryCta: 'Añadir a Chrome',
        secondaryCta: 'Ver planes',
        panel: {
          ariaLabel: 'Ilustración del panel de descarga en la página',
          rows: {
            video: 'Vídeo',
            audio: 'Audio',
            subtitle: 'Subtítulos',
            image: 'Imagen'
          }
        }
      },
      features: {
        heading: 'Qué añade la extensión',
        items: [
          {
            title: 'Panel de descarga en la página',
            description: 'Un pequeño panel junto al vídeo con filas de vídeo, audio, subtítulos e imagen. Se reconstruye al pasar a otro vídeo.'
          },
          {
            title: 'Selección de calidad y Best',
            description: 'Elige 720p, 1080p u otra calidad que ofrezca el vídeo, o deja que Best seleccione la más alta.'
          },
          {
            title: 'Audio en M4A o MP3',
            description: 'Guarda la pista de audio por separado como M4A, o elige MP3 en la ventana emergente para una salida transcodificada.'
          },
          {
            title: 'Subtítulos y recorte',
            description: 'Guarda los subtítulos disponibles como VTT. El vídeo y el audio adaptativos se pueden recortar sin transcodificar el vídeo.'
          },
          {
            title: 'Imagen de portada',
            description: 'Guarda la imagen de portada del vídeo como un archivo JPEG independiente.'
          },
          {
            title: 'Lista emergente y cola',
            description: 'Consulta todos los elementos detectados en la ventana emergente con progreso en vivo y añádelos a una cola que los descarga en orden entre pestañas.'
          },
          {
            title: 'Archivos grandes',
            description: 'Los archivos que Chrome puede obtener por sí mismo van al gestor de descargas de Chrome. Los flujos adaptativos se combinan en segundo plano dentro de un presupuesto de memoria.'
          },
          {
            title: 'Ajustes e historial',
            description: 'Elige subcarpeta de guardado, plantilla de nombre de archivo e idioma de la interfaz. Las descargas completadas y fallidas quedan en un historial local que puedes exportar como CSV.'
          }
        ]
      },
      steps: {
        heading: 'Cómo funciona la extensión',
        items: [
          {
            title: 'Instalar',
            description: 'Instala la extensión desde Chrome Web Store.'
          },
          {
            title: 'Fijar el icono',
            description: 'Fíjalo en la barra de herramientas para abrir la ventana emergente con rapidez.'
          },
          {
            title: 'Abrir un vídeo de Vimeo',
            description: 'Ve a una página de vídeo compatible de vimeo.com o player.vimeo.com y empieza a reproducir.'
          },
          {
            title: 'Elegir una calidad',
            description: 'Haz clic en la calidad que quieras en el panel, o abre el icono de la extensión para ver la lista completa. Tu navegador guarda el archivo en el disco.'
          }
        ]
      },
      comparison: {
        heading: 'Herramienta en línea o extensión',
        columns: {
          dimension: 'Comparar',
          web: 'Herramienta en línea',
          extension: 'Extensión de Chrome'
        },
        rows: [
          {
            dimension: 'Dónde funciona',
            web: 'En cualquier pestaña del navegador de esta página: pega un enlace de Vimeo.',
            extension: 'En Chrome y otros navegadores basados en Chromium, en la página de Vimeo que estás viendo.'
          },
          {
            dimension: 'Qué puedes guardar',
            web: 'El vídeo como archivo MP4.',
            extension: 'Vídeo como MP4, audio como M4A o MP3, subtítulos como VTT e imagen de portada como JPEG.'
          },
          {
            dimension: 'Lotes y cola',
            web: 'Pega varios enlaces y descárgalos uno a uno con «Descargar todo».',
            extension: 'Añade elementos desde la ventana emergente a una cola compartida entre pestañas; se descargan en orden.'
          },
          {
            dimension: 'Archivos grandes',
            web: 'Los archivos muy grandes o de tamaño desconocido se redirigen a la extensión.',
            extension: 'Los archivos directos usan el gestor de descargas de Chrome; los flujos adaptativos se combinan dentro de un presupuesto de memoria.'
          },
          {
            dimension: 'Inicio de sesión',
            web: 'No es necesario.',
            extension: 'No es necesario. Iniciar sesión es opcional y solo afecta a tu cuota diaria y al estado de tu suscripción.'
          },
          {
            dimension: 'Coste',
            web: 'Gratis.',
            extension: 'Una cuota diaria gratuita, con un plan Unlimited de pago para tener más.'
          }
        ]
      },
      scope: {
        heading: 'Para qué sirve y qué no hace',
        worksFor: {
          heading: 'Sirve para',
          items: [
            'Páginas de vídeo compatibles abiertas como página principal en vimeo.com, www.vimeo.com y player.vimeo.com; reproducir no garantiza que haya un recurso descargable',
            'Elegir una calidad concreta o la pista de audio en lugar del flujo predeterminado',
            'Guardar la imagen de portada',
            'Poner en cola varios elementos de la misma página'
          ]
        },
        doesNot: {
          heading: 'No hace',
          items: [
            'Eludir controles de acceso: los vídeos privados, protegidos con contraseña o de pago no tienen garantía de funcionar, aunque puedas reproducirlos',
            'Eliminar o eludir el DRM',
            'Admitir todos los formatos HLS, la captura completa de directos ni sitios distintos de Vimeo',
            'Funcionar en las aplicaciones de escritorio o móviles de Vimeo'
          ]
        },
        compliance: {
          heading: 'Aviso legal y cumplimiento',
          items: [
            'Herramienta independiente de terceros, sin afiliación, respaldo ni conexión con Vimeo, Inc. Vimeo es una marca de Vimeo, Inc.',
            'Pensada para contenido al que ya tienes acceso legítimo. Eres responsable de cumplir la ley de derechos de autor y las condiciones de Vimeo y del autor original.',
            'No la uses para redistribuir material protegido por derechos de autor ni para eludir controles de acceso a los que no tengas derecho.'
          ]
        }
      },
      plans: {
        heading: 'Planes',
        free: {
          name: 'Free',
          description: 'Una cuota diaria de descargas gratuita. Una cuenta o un dispositivo nuevos empiezan con un primer día ilimitado.',
          cta: 'Ver planes'
        },
        unlimited: {
          name: 'Unlimited',
          description: 'Una suscripción de pago que elimina el límite diario de la extensión.',
          cta: 'Obtener Unlimited'
        }
      },
      faq: {
        heading: 'Preguntas frecuentes',
        items: [
          {
            question: '¿Necesito una cuenta para descargar?',
            answer: 'No. La herramienta en línea no requiere iniciar sesión, y la extensión tampoco. Iniciar sesión en la extensión es opcional y solo afecta a tu cuota diaria y al estado de tu suscripción.'
          },
          {
            question: '¿Es gratis?',
            answer: 'La herramienta en línea es gratuita. La extensión tiene una cuota diaria gratuita y existe un plan Unlimited de pago. Consulta la página de precios para ver los detalles actuales.'
          },
          {
            question: '¿Cuál uso, la herramienta en línea o la extensión?',
            answer: 'Usa la herramienta en línea para obtener un MP4 rápido desde un enlace. Usa la extensión cuando quieras audio, subtítulos, la imagen de portada, una calidad concreta o una cola con varios elementos.'
          },
          {
            question: '¿Puede descargar vídeos de Vimeo privados, protegidos con contraseña o de pago?',
            answer: 'No hay garantía de compatibilidad. Ninguna de las dos herramientas desbloquea ni elude los controles de acceso de Vimeo, y ninguna elimina el DRM.'
          },
          {
            question: '¿Qué formatos obtengo?',
            answer: 'La herramienta en línea guarda vídeo MP4. La extensión guarda vídeo MP4, audio M4A o MP3, subtítulos VTT e imágenes de portada JPEG.'
          },
          {
            question: '¿Qué pasa con los archivos muy grandes?',
            answer: 'La herramienta en línea dirige los archivos muy grandes o de tamaño desconocido a la extensión. En la extensión, los flujos adaptativos se combinan dentro de un presupuesto de memoria, por lo que no se ofrecen los elementos que se sabe que lo superan.'
          },
          {
            question: '¿Mi vídeo pasa por vuestros servidores?',
            answer: 'El contenido va directamente de los servidores de Vimeo a tu navegador y a tu disco. La extensión también contacta con servicios del desarrollador para funciones de cuenta, cuotas de descarga, suscripciones, ajustes remotos e informes de uso o errores.'
          },
          {
            question: '¿Qué navegadores y sitios son compatibles?',
            answer: 'La extensión funciona en Chrome y otros navegadores basados en Chromium, como Edge y Brave, y solo en páginas de Vimeo. No se admiten otros sitios de vídeo.'
          }
        ]
      },
      finalCta: {
        heading: 'Guarda más de Vimeo con la extensión',
        description: 'Instálala una vez y descarga desde la página de Vimeo que ya estás viendo.',
        primaryCta: 'Añadir a Chrome'
      }
    },
    pricing: esESPricingContent,
  }
}
