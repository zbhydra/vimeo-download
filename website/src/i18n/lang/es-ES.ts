import type { SiteContent } from '../schema'
import { esESPricingContent } from '../pricing'

export const esES: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — Descarga vídeos de Vimeo en HD',
    description:
      'Pega un enlace público de Vimeo y guarda el vídeo en la resolución que necesites. Sin app, sin cuenta y sin extensión para una descarga normal.',
    keywords:
      'descargar vídeos de vimeo, descargador de vimeo, vimeo hd, guardar vídeo de vimeo, vimeo a mp4, descargador vimeo online'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Inicio',
      pricing: 'Precios',
      solutions: 'Guía de descarga',
      changelog: 'Cambios'
    },
    footer: {
      resources: 'Recursos',
      rights: '© 2026 Vimeo Video Downloader. Todos los derechos reservados.'
    }
  },
  common: {
    installCta: 'Instalar Ahora'
  },
  sections: {
    features: {
      title: 'Funciones del descargador de Vimeo',
      subtitle:
        'Todo lo que hace el descargador con un enlace público de Vimeo: analizar la página, listar las resoluciones que Vimeo ofrece y guardar la que elijas.',
      metaDescription:
        'Funciones de Vimeo Video Downloader: descargas en HD, selección de resolución, salida MP4, sin cuenta y un límite claro para vídeos privados o con contraseña.',
      items: [
        {
          title: 'Selección de resolución',
          description: 'Elige la resolución que necesitas en lugar de conformarte con el archivo más pequeño de Vimeo',
          details: [
            'Elige entre las resoluciones que ofrece el vídeo',
            'Descarga la mejor calidad disponible para verlo sin conexión',
            'Conserva la relación de aspecto y la pista de audio originales',
            'Salida MP4 que se reproduce en cualquier dispositivo'
          ]
        },
        {
          title: 'Análisis por enlace',
          description: 'Pega la URL de una página de vídeo de Vimeo y el descargador lee las resoluciones disponibles',
          details: [
            'Compatible con enlaces de vimeo.com, www.vimeo.com y player.vimeo.com',
            'No necesitas cuenta ni iniciar sesión en Vimeo',
            'Aviso claro cuando el vídeo es privado o no se puede analizar',
            'Nada que instalar para una descarga normal'
          ]
        },
        {
          title: 'Archivos grandes',
          description:
            'Los vídeos largos de Vimeo siguen siendo descargables con progreso visible, y la extensión se encarga de los archivos enormes',
          details: [
            'El progreso es visible durante la descarga',
            'Las descargas interrumpidas se pueden reanudar desde el espacio de trabajo',
            'La extensión del navegador gestiona lo que el navegador no puede terminar',
            'Se comprueba el almacenamiento antes de empezar una descarga grande'
          ]
        },
        {
          title: 'Cualquier dispositivo',
          description:
            'Usa la misma página desde el móvil, la tablet o el ordenador: la descarga ocurre en el navegador',
          details: [
            'Funciona en Windows, macOS, Android, iPhone y tablets',
            'No requiere aplicación de escritorio',
            'Diseño adaptado a pantallas pequeñas',
            'El archivo se guarda en tu carpeta de descargas habitual'
          ]
        },
        {
          title: 'Límite de acceso claro',
          description: 'Los vídeos privados, con contraseña o de pago quedan fuera y se indican como tal',
          details: [
            'No intenta saltarse la privacidad ni las restricciones de acceso',
            'Nunca pide contraseña, código de verificación ni archivo de sesión de Vimeo',
            'Solo se pueden analizar páginas de vídeo públicas',
            'Sigue siendo tu responsabilidad tener derecho a guardar el vídeo'
          ]
        },
        {
          title: 'Flujo rápido sin registro',
          description: 'Copia, pega, elige y descarga; la cuenta solo es necesaria cuando se usan créditos',
          details: [
            'No hace falta registrarse para probar un enlace público',
            'Inicia sesión con Google o un código por correo solo cuando necesites créditos',
            'Los créditos no caducan',
            'Mensajes de error claros cuando un enlace no se puede procesar'
          ]
        }
      ]
    },
    steps: {
      title: 'Cómo guardar un vídeo de Vimeo',
      subtitle:
        'Todo el flujo son tres pasos: copia la URL de la página del vídeo de Vimeo, pégala arriba y elige la resolución para descargar.',
      metaDescription:
        'Guía paso a paso para guardar un vídeo de Vimeo: copia la URL de la página, pégala en Vimeo Video Downloader, elige la resolución y descarga el MP4.',
      items: [
        {
          title: 'Copia el enlace de Vimeo',
          description: 'Abre el vídeo en vimeo.com y copia la URL desde la barra de direcciones o el menú de compartir'
        },
        {
          title: 'Pégalo arriba',
          description:
            'Pon el enlace en el campo de entrada y empieza el análisis: el descargador lista lo que Vimeo ofrece'
        },
        {
          title: 'Elige la resolución',
          description: 'Selecciona la calidad que quieras entre las resoluciones disponibles'
        },
        {
          title: 'Descarga el MP4',
          description: 'Guarda el archivo en tu dispositivo; los archivos grandes pueden requerir la extensión'
        }
      ]
    },
    cta: {
      title: '¿Listo para descargar un vídeo de Vimeo?',
      description: 'Pega arriba un enlace público de Vimeo y guárdalo en la resolución que necesites.'
    },
    techSpecs: {
      title: 'Especificaciones técnicas',
      browsersLabel: 'Navegadores',
      browsers: 'Chrome, Edge, Brave y todos los navegadores basados en Chromium',
      sourceHostsLabel: 'Enlaces compatibles',
      sourceHosts: 'vimeo.com, www.vimeo.com, player.vimeo.com',
      permissionsLabel: 'Permisos',
      permissions: 'Permisos mínimos requeridos',
      updatesLabel: 'Actualizaciones',
      updates: 'Actualizaciones automáticas desde la tienda de extensiones'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: 'Descarga vídeos de Vimeo en la resolución que necesites',
        description: 'Pega un enlace público de Vimeo, elige una resolución y guarda el MP4 directamente desde el navegador.'
      },
      stats: {
        users: 'Usuarios en todo el mundo',
        downloads: 'Descargas Totales'
      },
      seo: {
        title: 'Descargador de vídeos de Vimeo: descarga vídeos de Vimeo en HD',
        description:
          'Guarda vídeos públicos de Vimeo en HD y elige la resolución. Pega el enlace, analiza las resoluciones y descarga el MP4 sin instalar nada.',
        keywords:
          'descargador de vimeo, descargar vídeos de vimeo, vimeo hd, guardar vídeo de vimeo, vimeo mp4, descargar vimeo online'
      },
      heroTrustPoints: [
        'Descargas en HD',
        'Sin registro',
        'Compatible con móvil',
        'Funciona en Windows, Mac, Android y iPhone'
      ],
      situation: {
        title: 'Empieza aquí: ¿qué enlace de Vimeo tienes?',
        intro:
          'La mayoría de quien busca un descargador de Vimeo tiene uno de estos enlaces. Encuentra el tuyo:',
        headers: ['Tu situación', 'Prueba esto primero'],
        rows: [
          {
            cells: [
              'Tienes la URL de una página pública de vídeo de Vimeo',
              'Pégala en el descargador de arriba y elige una resolución'
            ]
          },
          {
            cells: [
              'La página del vídeo no tiene botón de descarga',
              'Usa este descargador: Vimeo solo muestra su botón cuando el propietario lo permite'
            ]
          },
          {
            cells: [
              'El vídeo es privado o tiene contraseña',
              'Necesitas acceso del propietario; un descargador no puede abrirlo por ti'
            ]
          },
          {
            cells: [
              'El descargador dice que el vídeo es privado o no se puede analizar',
              'Comprueba que el enlace sea la URL de la página del vídeo y que el vídeo sea público'
            ]
          }
        ]
      },
      solutions: {
        title: '¿Qué funciona de verdad con un vídeo de Vimeo?',
        intro:
          'Vimeo aloja vídeos con reglas de acceso muy distintas. Una página pública se puede analizar con un descargador; un vídeo privado, con contraseña o de pago no se puede alcanzar desde fuera, uses la herramienta que uses.',
        quickAnswer:
          'Respuesta rápida: si la página de Vimeo es pública, pega el enlace arriba y descarga la resolución que necesites. Si Vimeo muestra su propio botón de descarga, ese es el camino más limpio. Si el vídeo es privado o tiene contraseña, pide acceso o una exportación al propietario: ningún descargador puede saltarse eso.',
        items: [
          {
            title: 'Solución 1: descargador de Vimeo online',
            description:
              'Lo mejor para una página pública de Vimeo. Pega la URL, deja que el descargador liste las resoluciones que Vimeo ofrece y guarda la que quieras.',
            useWhenLabel: 'Úsalo cuando:',
            useWhen: [
              'La página del vídeo es pública y se abre sin iniciar sesión.',
              'Quieres una resolución concreta o la mejor calidad disponible.',
              'No quieres instalar una extensión ni una aplicación de escritorio.'
            ]
          },
          {
            title: 'Solución 2: el botón de descarga de Vimeo',
            description:
              'Algunos creadores permiten descargar sus vídeos. Cuando esa opción está activada, el reproductor de Vimeo muestra un botón de descarga y es la vía más directa.',
            useWhenLabel: 'Úsalo cuando:',
            useWhen: [
              'El reproductor de Vimeo muestra una opción de descarga.',
              'Quieres exactamente el archivo que publicó el creador.',
              'Ya tienes permiso para conservar una copia.'
            ]
          },
          {
            title: 'Solución 3: extensión del navegador para archivos grandes',
            description:
              'Los vídeos largos pueden superar lo que una pestaña puede transmitir y almacenar de una vez. La extensión toma el relevo y mantiene la descarga reanudable.',
            useWhenLabel: 'Úsala cuando:',
            useWhen: [
              'La descarga es muy grande o se interrumpe continuamente.',
              'El espacio de trabajo avisa de que el navegador se quedó sin almacenamiento local.',
              'Descargas de Vimeo con frecuencia.'
            ]
          },
          {
            title: 'Solución 4: grabar la pantalla (último recurso)',
            description:
              'Si un vídeo se reproduce para ti pero no se puede descargar por ninguna vía legal, un grabador de pantalla puede capturarlo. Es un recurso de reserva, no el primer método, porque la calidad y el audio dependen de la reproducción.',
            useWhenLabel: 'Úsalo cuando:',
            useWhen: [
              'Tienes permiso para ver y conservar el vídeo.',
              'El vídeo no se puede analizar desde su enlace.',
              'Solo necesitas una copia personal sin conexión como referencia.'
            ]
          }
        ]
      },
      benefits: {
        title: '¿Por qué usar un descargador de Vimeo online?',
        intro:
          'Un buen descargador responde rápido a una pregunta: ¿se puede guardar este vídeo de Vimeo desde el enlace que tengo? La experiencia debe ser directa, honesta con los límites y clara cuando un vídeo privado no se puede procesar.',
        items: [
          {
            title: 'Guarda los vídeos en alta calidad',
            description:
              'Conserva la mejor resolución que ofrece Vimeo para que la copia sin conexión siga viéndose como la publicó el creador.'
          },
          {
            title: 'Funciona en todos los dispositivos',
            description:
              'Usa el descargador desde el navegador en Android, iPhone, Windows, Mac o tablet: el archivo lo guarda el navegador que ya tienes.'
          },
          {
            title: 'Sin iniciar sesión en Vimeo',
            description:
              'Una página pública no necesita cuenta de Vimeo. Nunca se pide contraseña, código de verificación ni archivo de sesión.'
          },
          {
            title: 'Reproducción sin conexión sencilla',
            description:
              'Las descargas salen en MP4, que se reproduce en prácticamente cualquier dispositivo y reproductor sin códecs adicionales.'
          },
          {
            title: 'Proceso rápido basado en enlaces',
            description:
              'Copia, pega, elige y descarga. Si el enlace falla, la página explica si el vídeo es privado, no está disponible o no es compatible.'
          },
          {
            title: 'Límite de permisos claro',
            description:
              'Descarga solo los vídeos que tengas derecho a conservar. Respeta los derechos del creador, los términos de Vimeo y las reglas de acceso del vídeo.'
          },
          {
            title: 'Control de la resolución',
            description:
              'Elige entre las resoluciones que ofrece el vídeo en lugar de quedarte atado a una sola calidad.'
          },
          {
            title: 'Manejo de archivos grandes',
            description:
              'Los vídeos más largos se comprueban antes de empezar y pueden continuar con la extensión del navegador cuando son demasiado grandes para una pestaña.'
          },
          {
            title: 'Precio predecible',
            description:
              'Analiza un enlace público sin cuenta. Los créditos solo son necesarios para las descargas que pasan por el espacio de trabajo y no caducan.'
          }
        ]
      },
      troubleshooting: {
        title: 'Si el enlace de Vimeo no funciona',
        intro:
          'No todos los fallos significan que el descargador esté roto. Los vídeos de Vimeo suelen fallar porque la página no es pública. Prueba esta lista:',
        items: [
          'Abre el enlace en un navegador y confirma que el vídeo se reproduce sin iniciar sesión.',
          'Asegúrate de que la URL es una página de vídeo, no un perfil, un showcase o una búsqueda.',
          'Comprueba si el vídeo tiene contraseña o está marcado como privado.',
          'Confirma que el vídeo sigue existiendo: los vídeos eliminados no se pueden analizar.',
          'Prueba otro navegador o red si la página no puede llegar a Vimeo.',
          'Evita cualquier herramienta que pida tu contraseña de Vimeo o de Google.'
        ]
      },
      permission: {
        title: 'Nota importante sobre permisos',
        note:
          'Un descargador de vídeos de Vimeo no debe usarse para saltarse la privacidad, los derechos de autor o las restricciones de acceso. Guarda vídeos solo cuando tengas permiso del titular de los derechos o cuando tu uso esté permitido por la ley y los términos de Vimeo.'
      },
      comparison: {
        title: 'Elige el método adecuado para descargar de Vimeo',
        headers: ['Situación', 'Solución recomendada', 'Ideal para', 'Qué comprobar'],
        rows: [
          {
            cells: [
              'Página pública de vídeo de Vimeo',
              'Descargador de Vimeo online',
              'Descarga rápida en HD sin aplicación',
              'La página se abre sin iniciar sesión y el vídeo es público'
            ]
          },
          {
            cells: [
              'El creador permite descargas',
              'Botón de descarga de Vimeo',
              'Obtener exactamente el archivo publicado',
              'El reproductor muestra una opción de descarga'
            ]
          },
          {
            cells: [
              'Descarga muy grande o interrumpida',
              'Extensión del navegador',
              'Transferencias reanudables más allá de la pestaña',
              'Almacenamiento local disponible y estabilidad de la red'
            ]
          },
          {
            cells: [
              'Vídeo privado o con contraseña',
              'Pide acceso o una exportación al propietario',
              'Mantenerte dentro de las reglas de Vimeo',
              'Ningún descargador alcanza un vídeo al que no tienes acceso'
            ]
          }
        ]
      },
      howTo: {
        title: 'Cómo descargar un vídeo de Vimeo en 3 pasos',
        subtitle:
          'La vía más rápida es el descargador de arriba. Funciona cuando la página del vídeo de Vimeo es pública y accesible desde tu navegador.',
        steps: [
          {
            title: 'Copia el enlace del vídeo',
            description:
              'Abre el vídeo en Vimeo y copia la URL de la página desde la barra de direcciones o el menú de compartir.'
          },
          {
            title: 'Pega y analiza',
            description:
              'Pega el enlace en el descargador de arriba. La herramienta comprueba qué resoluciones ofrece Vimeo para ese vídeo.'
          },
          {
            title: 'Elige la calidad y descarga',
            description:
              'Selecciona una resolución y guarda el MP4 en tu dispositivo. Si no aparece nada, lo más probable es que el vídeo sea privado o no esté disponible, no que esté roto.'
          }
        ]
      },
      faq: {
        title: 'Preguntas frecuentes',
        description: 'Las preguntas que se hacen antes de descargar un vídeo de Vimeo.',
        items: [
          {
            question: '¿Cómo descargo un vídeo de Vimeo?',
            answer:
              'Abre la página del vídeo en Vimeo, copia su URL, pégala en el descargador de arriba, elige una de las resoluciones disponibles y descarga el MP4.'
          },
          {
            question: '¿Puedo descargar vídeos privados o con contraseña de Vimeo?',
            answer:
              'No. Los vídeos privados, con contraseña o de pago no son accesibles desde fuera de tu sesión de Vimeo, así que el descargador no puede analizarlos. Pide al propietario acceso o una exportación del archivo.'
          },
          {
            question: '¿Por qué el descargador dice que el vídeo de Vimeo es privado?',
            answer:
              'Vimeo no devolvió resoluciones públicas para ese enlace. Las causas habituales son la configuración de privacidad, la exigencia de contraseña, un vídeo eliminado o una URL que apunta a un perfil o showcase en lugar de a una página de vídeo.'
          },
          {
            question: '¿Necesito cuenta de Vimeo o la extensión?',
            answer:
              'Para una descarga pública normal no hacen falta ni cuenta ni extensión. La extensión solo resulta útil con archivos muy grandes o cuando quieres que la transferencia continúe fuera de la pestaña.'
          },
          {
            question: '¿En qué formato y calidad se descarga?',
            answer:
              'Las descargas son archivos MP4 generados a partir de las resoluciones que Vimeo ofrece para el vídeo. Puedes elegir entre las resoluciones disponibles y la más alta suele ser la calidad que subió el creador.'
          },
          {
            question: '¿Es gratis?',
            answer:
              'Analizar un enlace público de Vimeo es gratis. Las descargas que pasan por el espacio de trabajo consumen créditos, que se compran una vez y no caducan; la extensión tiene una suscripción Unlimited aparte.'
          },
          {
            question: '¿Es seguro pegar un enlace de Vimeo aquí?',
            answer:
              'Sí. Solo se usa el enlace que pegas para localizar el vídeo. El descargador nunca pide contraseña, código de verificación ni archivo de sesión de Vimeo, y deberías salir de cualquier página que lo haga.'
          },
          {
            question: '¿Es legal descargar vídeos de Vimeo?',
            answer:
              'Depende del vídeo, de tu permiso y de tu uso previsto. Descarga solo contenido que puedas conservar y no redistribuyas material con derechos de autor o privado sin autorización.'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: 'Acceso web',
          title: 'Inicia sesión para sincronizar tus créditos',
          signedInAs: 'Sesión iniciada como',
          continueWithGoogle: 'Continuar con Google',
          googleLoading: 'Abriendo Google...',
          or: 'o',
          emailLabel: 'Correo electrónico',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: 'Continuar con email',
          sendCode: 'Enviar código',
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
          creditsLabel: 'créditos'
        },
                quota: {
          eyebrow: 'Cuota web',
          title: 'Saldo actual de créditos',
          planLabel: 'Plan',
          remainingLabel: 'Restante',
          dailyLimitLabel: 'Límite diario',
          unlimited: 'Ilimitado'
        },
                checkin: {
          creditsLoading: 'Créditos',
          creditsButtonLabel: 'Abrir check-in diario',
          accountButtonLabel: 'Abrir menú de cuenta',
          accountMenuLabel: 'Menú de cuenta',
          title: 'Tus créditos gratis de hoy están listos',
          todayRewardText: 'Recompensa de hoy: {credits} créditos',
          claimedRewardText: 'Hoy reclamaste {credits} créditos.',
          nextCountdown: 'Próxima reclamación en {time}',
          nextAt: '(Próxima actualización: {time} EST)',
          claimButton: 'Reclamar {credits} créditos',
          claimingButton: 'Reclamando...',
          notNow: 'Ahora no',
          close: 'Cerrar',
          loadFailed: 'No se pudo cargar el estado del check-in.',
          claimFailed: 'No se pudieron reclamar los créditos.'
        },
                creditPurchase: {
          installGuide: 'También puedes descargar con la extensión del navegador.',
          installExtension: 'Instalar extensión',
          title: 'Comprar créditos',
          description: 'Agrega créditos y continúa descargando desde este espacio de trabajo.',
          successTitle: 'Créditos agregados',
          successDescription: 'Tu saldo se actualizó. Cierra esta ventana e inicia la descarga de nuevo.',
          packageEyebrow: 'Paga según uses',
          cardNote: 'Usa créditos para descargas web. Los créditos no caducan.',
          creditsAmount: '{credits} créditos',
          buyNow: 'Comprar ahora',
          selectPackage: 'Seleccionar',
          paymentMethodLabel: 'Elige método de pago',
          paymentTitle: 'Elige método de pago',
          selectedPackageLabel: 'Producto seleccionado',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: 'Continuar al pago',
          backToProducts: 'Volver',
          close: 'Cerrar',
          agreementText: 'Acepto los términos de compra, los Términos y la Política de privacidad.',
          loadingConfigs: 'Cargando paquetes de créditos...',
          loadFailed: 'No se pudieron cargar los paquetes de créditos. Inténtalo de nuevo.',
          noConfigs: 'No hay paquetes de créditos disponibles ahora. Inténtalo más tarde.',
          ready: 'Elige un paquete de créditos. Los precios se muestran en USD.',
          creatingOrder: 'Creando pedido...',
          pendingPayment: 'Completa el pago en la pestaña recién abierta. Revisaremos el resultado automáticamente.',
          pendingPaymentTitle: 'Esperando pago',
          cancelPayment: 'Cancelar pago',
          supportMailPrefix: 'Reportar un problema: ',
          success: 'Pago completo. Los créditos ya están disponibles.',
          failed: 'El pago no está completo. Puedes reintentar o cerrar esta ventana.',
          successCredits: '+{credits} créditos agregados',
          successBalance: 'Saldo actual: {balance} créditos',
          createFailed: 'No se pudo crear el pedido. Inténtalo de nuevo.',
          invalidPaymentData: 'El enlace de pago no es válido. Inténtalo más tarde.',
          priceUpdated: 'El precio cambió. Revisa el precio actualizado y vuelve a comprar.',
          gatewayFailed: 'La entrada de pago no está disponible temporalmente. Inténtalo más tarde.',
          paymentCanceled: 'El pago fue cancelado. Elige un método de pago e inténtalo otra vez.',
          pollFailed: 'No se pudo actualizar el estado del pago. Inténtalo de nuevo.',
          pollTimeout: 'La actualización automática agotó el tiempo. Actualiza el resultado después del pago.',
          orderNotFound: 'El pedido ya no está disponible. Crea uno nuevo.',
          orderExpired: 'El pedido caducó. Compra de nuevo.',
          fulfillmentFailed: 'Recibimos el pago, pero los créditos aún no se agregaron. Reintenta más tarde.',
          authExpired: 'La sesión caducó. Inicia sesión de nuevo para continuar.'
        },
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
          enterEmailFirst: 'Primero introduce tu correo electrónico.',
          enterEmailAndCode: 'Introduce el correo electrónico y el código de verificación.',
          sendCodeFailed: 'No se pudo enviar el código de verificación.',
          googleSignInFailed: 'No se pudo iniciar sesión con Google.',
          googleClientMissing: 'El inicio de sesión con Google no está configurado.',
          restoreSessionFailed: 'No se pudo restaurar la sesión.',
          signInFailed: 'No se pudo iniciar sesión.',
          logoutFailed: 'No se pudo cerrar la sesión.',
          loadQuotaFailed: 'No se pudieron cargar los créditos.',
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
          quotaExceeded: 'No tienes créditos suficientes para descargar este archivo.',
          rateLimitExceeded: 'Too many requests. Please try again later.'
        },
                anonymousQueue: {
          title: 'Descarga en espera',
          remaining: 'La descarga comenzará en {seconds} segundos.',
          hint: 'Inicia sesión para descargar sin esperas.',
          login: 'Iniciar sesión',
          close: 'Cerrar'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    },
    changelog: {
      title: 'Novedades del descargador de Vimeo',
      description:
        'Sigue las actualizaciones de descarga de Vimeo, los cambios de análisis, la compatibilidad con archivos mayores y las notas de versión de Vimeo Video Downloader.',
      seoTitle: 'Novedades del descargador de Vimeo | Vimeo Video Downloader',
      seoDescription:
        'Lee las novedades de Vimeo Video Downloader: actualizaciones de análisis, gestión de resoluciones, archivos más grandes y notas de cada versión.',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: 'Mejora de rendimiento',
          description: 'Mejoras importantes de rendimiento para una mejor experiencia.',
          features: [
            'Velocidad de análisis mejorada un 50%',
            'Estabilidad optimizada en descargas grandes',
            'Mayor capacidad de respuesta de la interfaz'
          ]
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: 'Compatibilidad multiidioma',
          description: 'Se añadieron 14 idiomas.',
          features: ['Se añadieron japonés, coreano y más idiomas', 'Mejor precisión de traducción', 'Detección automática de idioma']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: 'Selección de resolución',
          description: 'Elige la resolución de Vimeo que quieras antes de que empiece la descarga.',
          features: [
            'Elige cualquier resolución que ofrezca el vídeo',
            'Conserva la mejor calidad disponible',
            'Mejor gestión de la cola de descargas'
          ]
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: 'Seguridad y privacidad',
          description: 'Mejoras de seguridad y privacidad.',
          features: [
            'Se eliminó todo el seguimiento analítico de las descargas',
            'Se añadió un modo de procesamiento solo local',
            'Cifrado de datos mejorado'
          ]
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: 'Primera versión',
          description: 'Primera versión del descargador por enlace de Vimeo.',
          features: [
            'Análisis de enlaces de Vimeo y salida MP4',
            'Compatibilidad con enlaces de vimeo.com y player.vimeo.com',
            'Gestión básica de resoluciones'
          ]
        }
      ],
      labels: {
        features: 'Nuevas funciones',
        fixes: 'Correcciones de errores'
      }
    },
    pricing: esESPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Descargador de vídeos de Vimeo HD - Varias resoluciones | Vimeo Video Downloader',
          description:
            'Descarga vídeos de Vimeo en HD con varias resoluciones gratis. Sin aplicación. Guarda al instante cualquier vídeo público de Vimeo.',
          keywords:
            'descargador de vimeo, descargar vídeos de vimeo, descargar vimeo hd, descargador vimeo gratis, guardar vídeo de vimeo, vimeo hd'
        },
        workspace: {
          title: 'Descargador de vídeos de Vimeo HD',
          helperText:
            'Pega cualquier enlace público de vídeo de Vimeo para descargarlo en HD con selección de resolución.',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: 'Por qué usar nuestro descargador de Vimeo',
          subtitle: 'Guarda vídeos de Vimeo en HD eligiendo la resolución, totalmente gratis.',
          items: [
            {
              title: 'Calidad HD original',
              description:
                'Descarga vídeos de Vimeo en su resolución Full HD. Obtienes la misma nitidez que subió el creador.'
            },
            {
              title: 'Varias resoluciones',
              description:
                'Elige entre las resoluciones disponibles (360p, 720p, 1080p y más). Selecciona la calidad que necesites.'
            },
            {
              title: 'Rápido y gratis',
              description:
                'Sin instalar aplicaciones ni crear cuenta. Pega el enlace de Vimeo, elige la resolución y descarga al instante.'
            }
          ]
        },
        howTo: {
          title: 'Cómo descargar vídeos de Vimeo en HD',
          subtitle: 'Tres pasos sencillos para guardar cualquier vídeo público de Vimeo con la resolución que prefieras.',
          steps: [
            {
              title: 'Copia el enlace del vídeo de Vimeo',
              description: 'Abre la página del vídeo en Vimeo y copia la URL de la barra de direcciones.'
            },
            {
              title: 'Pega el enlace arriba',
              description: 'Pega la URL de Vimeo en el campo de entrada y haz clic en Analizar.'
            },
            {
              title: 'Elige la resolución y descarga',
              description: 'Selecciona la resolución que prefieras y haz clic en Descargar para guardar el vídeo en HD.'
            }
          ]
        },
        faq: {
          title: 'Preguntas frecuentes del descargador de Vimeo',
          items: [
            {
              question: '¿Cómo descargo un vídeo de Vimeo?',
              answer:
                'Copia la URL de la página del vídeo de Vimeo, pégala en el campo de arriba, haz clic en Analizar y elige la resolución para descargar.'
            },
            {
              question: '¿Puedo elegir la resolución del vídeo?',
              answer:
                'Sí. Tras el análisis puedes elegir entre todas las resoluciones disponibles, incluidas 360p, 720p, 1080p y superiores cuando existan.'
            },
            {
              question: '¿Este descargador de Vimeo es gratis?',
              answer:
                'Analizar un enlace público de Vimeo es gratis y no requiere registro. Las descargas que pasan por el espacio de trabajo consumen créditos.'
            },
            {
              question: '¿Necesito cuenta de Vimeo para descargar?',
              answer: 'No hace falta cuenta. Puedes descargar cualquier vídeo público de Vimeo sin iniciar sesión.'
            },
            {
              question: '¿En qué formato se descargan los vídeos?',
              answer: 'Los vídeos de Vimeo se descargan en MP4, compatible con prácticamente todos los dispositivos y reproductores.'
            }
          ]
        }
      }
    }
  }
}
