import type { SiteContent } from '../schema'
import { koKRPricingContent } from '../pricing'

export const koKR: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — Vimeo 동영상을 HD로 다운로드',
    description:
      '공개 Vimeo 링크를 붙여넣고 원하는 화질로 동영상을 저장하세요. 일반 다운로드에는 앱도, 계정도, 브라우저 확장 프로그램도 필요하지 않습니다.',
    keywords:
      'Vimeo 동영상 다운로드, Vimeo 다운로더, Vimeo 저장, Vimeo HD 다운로드, Vimeo MP4 변환, 온라인 Vimeo 다운로드'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: '홈',
      pricing: '요금',
      solutions: '다운로드 가이드',
      changelog: '변경 로그'
    },
    footer: {
      resources: '자료',
      rights: '© 2026 Vimeo Video Downloader. 모든 권리 보유.'
    }
  },
  common: {
    installCta: '지금 설치'
  },
  sections: {
    features: {
      title: 'Vimeo 다운로드 기능',
      subtitle:
        '공개 Vimeo 링크에 대해 페이지를 분석하고, Vimeo가 제공하는 화질을 나열한 뒤, 선택한 화질을 저장합니다.',
      metaDescription:
        'Vimeo Video Downloader 기능: HD 다운로드, 화질 선택, MP4 출력, 계정 불필요, 그리고 비공개·비밀번호 동영상에 대한 명확한 처리 범위.',
      items: [
        {
          title: '화질 선택',
          description: 'Vimeo가 제공하는 가장 작은 파일로 만족하지 말고 필요한 화질을 직접 고르세요',
          details: [
            '동영상이 제공하는 화질 중에서 선택',
            '오프라인 시청을 위해 사용 가능한 최고 화질 다운로드',
            '원본 화면 비율과 오디오 트랙 유지',
            '어떤 기기와 플레이어에서도 재생되는 MP4 출력'
          ]
        },
        {
          title: '링크 분석',
          description: 'Vimeo 동영상 페이지 URL을 붙여넣으면 사용 가능한 화질을 읽어옵니다',
          details: [
            'vimeo.com, www.vimeo.com, player.vimeo.com 링크 지원',
            'Vimeo 계정이나 로그인 불필요',
            '비공개이거나 분석할 수 없을 때 명확히 안내',
            '일반 다운로드에는 아무것도 설치하지 않아도 됩니다'
          ]
        },
        {
          title: '대용량 파일 지원',
          description:
            '긴 Vimeo 동영상도 진행률과 함께 다운로드할 수 있고, 너무 큰 파일은 브라우저 확장 프로그램이 이어받습니다',
          details: [
            '다운로드 중 진행 상황을 볼 수 있습니다',
            '중단된 다운로드는 작업 공간에서 이어서 받을 수 있습니다',
            '브라우저만으로 끝낼 수 없는 파일은 확장 프로그램이 처리합니다',
            '큰 다운로드를 시작하기 전에 저장 공간을 확인합니다'
          ]
        },
        {
          title: '모든 기기에서',
          description: '휴대폰, 태블릿, 컴퓨터에서 같은 페이지를 사용할 수 있고 다운로드는 브라우저에서 끝납니다',
          details: [
            'Windows, macOS, Android, iPhone, 태블릿 지원',
            '데스크톱 앱이 필요하지 않습니다',
            '작은 화면에 맞춘 반응형 레이아웃',
            '파일은 브라우저의 기본 다운로드 폴더에 저장됩니다'
          ]
        },
        {
          title: '명확한 접근 범위',
          description: '비공개·비밀번호·유료 Vimeo 동영상은 지원 범위가 아니며 그대로 안내합니다',
          details: [
            '개인정보나 접근 제한을 우회하려 하지 않습니다',
            'Vimeo 비밀번호, 인증 코드, 세션 파일을 절대 요구하지 않습니다',
            '분석할 수 있는 것은 공개된 동영상 페이지뿐입니다',
            '저장할 권리가 있는지는 이용자의 책임입니다'
          ]
        },
        {
          title: '빠르고 가입 없는 흐름',
          description: '복사, 붙여넣기, 선택, 다운로드. 계정은 크레딧이 필요할 때만 요구됩니다',
          details: [
            '공개 링크 분석에는 가입이 필요하지 않습니다',
            '크레딧이 필요할 때만 Google 또는 이메일 인증 코드로 로그인합니다',
            '크레딧은 만료되지 않습니다',
            '링크를 처리할 수 없을 때 명확한 오류를 표시합니다'
          ]
        }
      ]
    },
    steps: {
      title: 'Vimeo 동영상 저장 방법',
      subtitle:
        '전체 흐름은 세 단계입니다. Vimeo 동영상 페이지 URL을 복사해 위에 붙여넣고, 화질을 골라 다운로드하세요.',
      metaDescription:
        'Vimeo 동영상 저장 단계별 가이드: 동영상 페이지 URL 복사, Vimeo Video Downloader에 붙여넣기, 화질 선택 후 MP4 다운로드.',
      items: [
        {
          title: 'Vimeo 링크 복사',
          description: 'vimeo.com에서 동영상을 열고 주소 표시줄이나 공유 메뉴에서 URL을 복사합니다'
        },
        {
          title: '위에 붙여넣기',
          description: '입력란에 링크를 넣고 분석을 시작하면 Vimeo가 제공하는 화질이 나열됩니다'
        },
        {
          title: '화질 선택',
          description: '사용 가능한 화질 중에서 원하는 것을 고릅니다'
        },
        {
          title: 'MP4 다운로드',
          description: '기기에 저장합니다. 파일이 매우 크면 브라우저 확장 프로그램이 필요할 수 있습니다'
        }
      ]
    },
    cta: {
      title: 'Vimeo 동영상을 다운로드할 준비가 되셨나요?',
      description: '공개 Vimeo 링크를 위에 붙여넣고 필요한 화질로 저장하세요.'
    },
    techSpecs: {
      title: '기술 사양',
      browsersLabel: '브라우저',
      browsers: 'Chrome, Edge, Brave 및 모든 Chromium 기반 브라우저',
      sourceHostsLabel: '지원 링크',
      sourceHosts: 'vimeo.com, www.vimeo.com, player.vimeo.com',
      permissionsLabel: '권한',
      permissions: '최소 권한 필요',
      updatesLabel: '업데이트',
      updates: '확장 프로그램 스토어에서 자동 업데이트'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: '필요한 화질로 Vimeo 동영상 다운로드',
        description: '공개 Vimeo 링크를 붙여넣고 화질을 고른 뒤 브라우저에서 바로 MP4로 저장하세요.'
      },
      stats: {
        users: '전 세계 사용자',
        downloads: '총 다운로드'
      },
      seo: {
        title: 'Vimeo 동영상 다운로더: Vimeo 동영상을 HD로 저장',
        description:
          '공개 Vimeo 동영상을 HD로 저장하고 화질을 선택하세요. 링크를 붙여넣고 분석한 뒤 아무것도 설치하지 않고 MP4를 다운로드할 수 있습니다.',
        keywords:
          'Vimeo 동영상 다운로드, Vimeo 다운로더, Vimeo HD 저장, Vimeo 동영상 저장, Vimeo MP4, 온라인 Vimeo 다운로드'
      },
      heroTrustPoints: [
        'HD 다운로드',
        '가입 불필요',
        '모바일 친화적',
        'Windows, Mac, Android, iPhone 지원'
      ],
      situation: {
        title: '시작하기: 어떤 링크를 가지고 있나요?',
        intro: 'Vimeo 다운로더를 찾는 대부분의 사용자는 다음 중 하나의 링크를 가지고 있습니다.',
        headers: ['상황', '먼저 시도할 것'],
        rows: [
          {
            cells: [
              '공개된 Vimeo 동영상 페이지 URL이 있다',
              '위 다운로더에 붙여넣고 화질을 선택한다'
            ]
          },
          {
            cells: [
              '동영상 페이지에 다운로드 버튼이 없다',
              '이 다운로더를 사용한다(Vimeo의 버튼은 제작자가 허용한 경우에만 표시됩니다)'
            ]
          },
          {
            cells: [
              '동영상이 비공개이거나 비밀번호가 필요하다',
              '소유자의 접근 권한이 필요하며 다운로더가 대신 열 수 없습니다'
            ]
          },
          {
            cells: [
              '다운로더가 비공개이거나 분석할 수 없다고 표시한다',
              '링크가 동영상 페이지 주소이고 동영상이 공개인지 확인한다'
            ]
          }
        ]
      },
      solutions: {
        title: 'Vimeo 동영상에 실제로 통하는 방법',
        intro:
          'Vimeo의 동영상은 접근 규칙이 크게 다릅니다. 공개된 동영상 페이지는 다운로더로 분석할 수 있지만, 비공개·비밀번호·유료 동영상은 외부에서 접근할 수 없으며 어떤 도구를 써도 마찬가지입니다.',
        quickAnswer:
          '요약: Vimeo 페이지가 공개라면 위에 링크를 붙여넣고 필요한 화질을 다운로드하세요. Vimeo가 자체 다운로드 버튼을 보여준다면 그것이 가장 확실합니다. 비공개나 비밀번호 동영상이라면 소유자에게 접근 권한이나 내보내기를 요청하세요. 어떤 다운로더도 이를 우회할 수 없습니다.',
        items: [
          {
            title: '방법 1: 온라인 Vimeo 다운로더',
            description:
              '공개된 Vimeo 동영상 페이지에 가장 적합합니다. URL을 붙여넣으면 Vimeo가 제공하는 화질이 나열되고, 원하는 것을 저장하면 됩니다.',
            useWhenLabel: '적합한 경우:',
            useWhen: [
              '동영상 페이지가 공개되어 로그인 없이 열립니다.',
              '특정 화질 또는 사용 가능한 최고 화질을 원합니다.',
              '확장 프로그램이나 데스크톱 앱을 설치하고 싶지 않습니다.'
            ]
          },
          {
            title: '방법 2: Vimeo 자체 다운로드 버튼',
            description:
              '제작자가 다운로드를 허용한 동영상에는 Vimeo 플레이어에 다운로드 버튼이 표시됩니다. 가장 직접적인 방법입니다.',
            useWhenLabel: '적합한 경우:',
            useWhen: [
              'Vimeo 플레이어에 다운로드 항목이 표시됩니다.',
              '제작자가 게시한 그대로의 파일을 원합니다.',
              '이미 사본을 보관할 허가가 있습니다.'
            ]
          },
          {
            title: '방법 3: 대용량 파일은 브라우저 확장 프로그램',
            description:
              '긴 동영상은 탭 하나로 편하게 전송하고 저장할 수 있는 범위를 넘을 수 있습니다. 확장 프로그램이 전송을 이어받아 재개 가능한 상태로 유지합니다.',
            useWhenLabel: '적합한 경우:',
            useWhen: [
              '파일이 매우 크거나 다운로드가 자주 끊깁니다.',
              '작업 공간이 브라우저 로컬 저장 공간 부족을 알립니다.',
              'Vimeo에서 자주 다운로드합니다.'
            ]
          },
          {
            title: '방법 4: 화면 녹화(최후의 수단)',
            description:
              '재생은 되지만 합법적인 다운로드 경로가 없다면 화면 녹화로 기록할 수 있습니다. 화질과 음성이 재생 환경에 좌우되므로 첫 선택이 아니라 마지막 수단입니다.',
            useWhenLabel: '적합한 경우:',
            useWhen: [
              '동영상을 시청하고 보관할 권한이 있습니다.',
              '링크로는 분석할 수 없는 동영상입니다.',
              '개인적인 오프라인 참고용 사본이 필요할 뿐입니다.'
            ]
          }
        ]
      },
      benefits: {
        title: '온라인 Vimeo 다운로더를 쓰는 이유',
        intro:
          '좋은 다운로더는 "이 링크의 Vimeo 동영상을 저장할 수 있는가"라는 질문에 바로 답합니다. 제한은 솔직하게 알리고, 비공개 동영상을 처리할 수 없을 때는 이유를 분명히 설명해야 합니다.',
        items: [
          {
            title: '고화질로 저장',
            description: 'Vimeo가 제공하는 최고 화질을 유지하므로 오프라인 사본도 제작자가 게시한 모습 그대로입니다.'
          },
          {
            title: '기기를 가리지 않음',
            description:
              'Android, iPhone, Windows, Mac, 태블릿의 브라우저에서 사용할 수 있습니다. 저장은 이미 가진 브라우저가 처리합니다.'
          },
          {
            title: 'Vimeo 로그인 불필요',
            description:
              '공개 동영상 페이지에는 Vimeo 계정이 필요하지 않습니다. 비밀번호, 인증 코드, 세션 파일을 요구하지 않습니다.'
          },
          {
            title: '오프라인 재생이 간편',
            description: '다운로드 결과는 MP4이므로 추가 코덱 없이 거의 모든 기기와 플레이어에서 재생됩니다.'
          },
          {
            title: '링크 기반의 빠른 흐름',
            description:
              '복사, 붙여넣기, 선택, 다운로드. 실패하면 비공개인지, 삭제되었는지, 지원되지 않는지를 페이지가 설명합니다.'
          },
          {
            title: '명확한 권한 경계',
            description:
              '보관할 권리가 있는 동영상만 다운로드하세요. 제작자의 권리, Vimeo 약관, 동영상에 설정된 접근 규칙을 존중해야 합니다.'
          },
          {
            title: '화질 선택 가능',
            description: '하나의 화질에 묶이지 않고 동영상이 제공하는 여러 화질 중에서 고를 수 있습니다.'
          },
          {
            title: '대용량 파일 처리',
            description:
              '긴 동영상은 시작 전에 브라우저 저장 공간을 확인하고, 탭으로는 부족할 때 브라우저 확장 프로그램으로 이어서 받을 수 있습니다.'
          },
          {
            title: '예측 가능한 가격',
            description:
              '공개 링크 분석에는 계정이 필요하지 않습니다. 크레딧은 작업 공간을 거치는 다운로드에만 필요하고, 한 번 구매하면 만료되지 않습니다.'
          }
        ]
      },
      troubleshooting: {
        title: 'Vimeo 링크가 작동하지 않을 때',
        intro:
          '모든 실패가 다운로더 고장을 뜻하지는 않습니다. Vimeo 동영상은 페이지가 공개되지 않아서 실패하는 경우가 많습니다. 다음을 확인하세요.',
        items: [
          '브라우저에서 링크를 열어 로그인 없이 재생되는지 확인합니다.',
          'URL이 동영상 페이지이고 프로필, 쇼케이스, 검색 페이지가 아닌지 확인합니다.',
          '비밀번호가 필요하거나 비공개로 설정되어 있지 않은지 확인합니다.',
          '동영상이 아직 존재하는지 확인합니다(삭제된 동영상은 분석할 수 없습니다).',
          '페이지가 Vimeo에 접속하지 못한다면 다른 브라우저나 네트워크를 시도합니다.',
          'Vimeo나 Google 비밀번호를 요구하는 도구는 피하세요.'
        ]
      },
      permission: {
        title: '중요한 권한 안내',
        note:
          'Vimeo 동영상 다운로더를 개인정보, 저작권, 접근 제한을 우회하는 데 사용해서는 안 됩니다. 권리자의 허가가 있거나 법률과 Vimeo 약관이 허용하는 경우에만 동영상을 저장하세요.'
      },
      comparison: {
        title: '알맞은 Vimeo 다운로드 방법 고르기',
        headers: ['상황', '권장 방법', '가장 적합한 용도', '확인할 점'],
        rows: [
          {
            cells: [
              '공개된 Vimeo 동영상 페이지',
              '온라인 Vimeo 다운로더',
              '앱 없이 빠른 HD 다운로드',
              '로그인 없이 열리는 공개 동영상인지'
            ]
          },
          {
            cells: [
              '제작자가 다운로드를 허용',
              'Vimeo 자체 다운로드 버튼',
              '게시된 그대로의 파일 확보',
              '플레이어에 다운로드 항목이 있는지'
            ]
          },
          {
            cells: [
              '매우 크거나 끊기는 다운로드',
              '브라우저 확장 프로그램',
              '탭 한계를 넘는 재개 가능한 전송',
              '로컬 여유 공간과 네트워크 안정성'
            ]
          },
          {
            cells: [
              '비공개 또는 비밀번호 동영상',
              '소유자에게 접근 권한이나 내보내기 요청',
              'Vimeo의 접근 규칙 준수',
              '접근할 수 없는 동영상은 어떤 도구로도 받을 수 없습니다'
            ]
          }
        ]
      },
      howTo: {
        title: '3단계로 Vimeo 동영상 다운로드',
        subtitle:
          '가장 빠른 길은 위의 링크 다운로더입니다. Vimeo 동영상 페이지가 공개되어 있고 브라우저에서 접근할 수 있을 때 작동합니다.',
        steps: [
          {
            title: '동영상 링크 복사',
            description: 'Vimeo에서 동영상을 열고 주소 표시줄이나 공유 메뉴에서 페이지 URL을 복사합니다.'
          },
          {
            title: '붙여넣고 분석',
            description:
              '위 다운로더에 링크를 붙여넣습니다. Vimeo가 해당 동영상에 제공하는 화질을 확인합니다.'
          },
          {
            title: '화질 선택 후 다운로드',
            description:
              '화질을 고르고 MP4를 기기에 저장합니다. 아무것도 나오지 않으면 고장이 아니라 비공개이거나 사용할 수 없는 동영상일 가능성이 큽니다.'
          }
        ]
      },
      faq: {
        title: '자주 묻는 질문',
        description: 'Vimeo 동영상을 다운로드하기 전에 가장 많이 나오는 질문입니다.',
        items: [
          {
            question: 'Vimeo 동영상은 어떻게 다운로드하나요?',
            answer:
              'Vimeo에서 동영상 페이지를 열고 URL을 복사한 뒤 위 다운로더에 붙여넣고, 사용 가능한 화질을 선택해 MP4를 다운로드합니다.'
          },
          {
            question: '비공개 또는 비밀번호가 있는 Vimeo 동영상도 다운로드할 수 있나요?',
            answer:
              '아니요. 비공개·비밀번호·유료 동영상은 Vimeo 세션 밖에서 접근할 수 없어 분석되지 않습니다. 소유자에게 접근 권한이나 파일 내보내기를 요청하세요.'
          },
          {
            question: '다운로더가 이 Vimeo 동영상이 비공개라고 하는 이유는 무엇인가요?',
            answer:
              'Vimeo가 해당 링크에 대해 공개 화질을 반환하지 않았기 때문입니다. 보통 개인정보 설정, 비밀번호 요구, 삭제된 동영상, 또는 동영상 페이지가 아닌 프로필·쇼케이스 URL이 원인입니다.'
          },
          {
            question: 'Vimeo 계정이나 확장 프로그램이 필요한가요?',
            answer:
              '일반적인 공개 다운로드에는 계정도 확장 프로그램도 필요하지 않습니다. 확장 프로그램은 파일이 매우 크거나 탭 밖에서 전송을 이어가고 싶을 때만 유용합니다.'
          },
          {
            question: '어떤 형식과 화질로 받나요?',
            answer:
              'Vimeo가 제공하는 화질로 만든 MP4 파일입니다. 사용 가능한 화질 중에서 고를 수 있고, 보통 최상위가 제작자가 업로드한 화질입니다.'
          },
          {
            question: '무료인가요?',
            answer:
              '공개 Vimeo 링크 분석은 무료입니다. 작업 공간을 거치는 다운로드는 크레딧을 사용합니다. 크레딧은 한 번 구매하면 만료되지 않고, 확장 프로그램에는 별도의 Unlimited 구독이 있습니다.'
          },
          {
            question: 'Vimeo 링크를 여기에 붙여넣어도 안전한가요?',
            answer:
              '안전합니다. 붙여넣은 링크는 동영상 조회에만 사용됩니다. 비밀번호, 인증 코드, 세션 파일을 요구하지 않으며, 요구하는 페이지는 즉시 벗어나세요.'
          },
          {
            question: 'Vimeo 동영상 다운로드는 합법인가요?',
            answer:
              '동영상 내용, 권한, 사용 목적에 따라 다릅니다. 보관할 권리가 있는 콘텐츠만 다운로드하고, 저작권이 있거나 비공개인 자료를 무단으로 배포하지 마세요.'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: '웹 로그인',
          title: '로그인해서 크레딧 동기화',
          signedInAs: '현재 로그인 계정',
          continueWithGoogle: 'Google로 계속',
          googleLoading: 'Google 여는 중...',
          or: '또는',
          emailLabel: '이메일',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: '이메일로 계속',
          sendCode: '인증 코드 보내기',
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
          creditsLabel: '크레딧'
        },
                quota: {
          eyebrow: '웹 할당량',
          title: '현재 크레딧 잔액',
          planLabel: '플랜',
          remainingLabel: '남은 수량',
          dailyLimitLabel: '일일 한도',
          unlimited: '무제한'
        },
                checkin: {
          creditsLoading: '크레딧',
          creditsButtonLabel: '일일 체크인 열기',
          accountButtonLabel: '계정 메뉴 열기',
          accountMenuLabel: '계정 메뉴',
          title: '오늘의 무료 크레딧을 받을 수 있습니다',
          todayRewardText: '오늘의 보상: {credits} 크레딧',
          claimedRewardText: '오늘 {credits} 크레딧을 받았습니다.',
          nextCountdown: '다음 수령까지 {time}',
          nextAt: '(다음 갱신: {time} EST)',
          claimButton: '{credits} 크레딧 받기',
          claimingButton: '받는 중...',
          notNow: '나중에',
          close: '닫기',
          loadFailed: '체크인 상태를 불러오지 못했습니다.',
          claimFailed: '크레딧 수령에 실패했습니다.'
        },
                creditPurchase: {
          installGuide: '브라우저 확장 프로그램으로도 다운로드할 수 있습니다.',
          installExtension: '확장 프로그램 설치',
          title: '크레딧 구매',
          description: '크레딧을 추가하고 이 작업 공간에서 계속 다운로드하세요.',
          successTitle: '크레딧이 추가되었습니다',
          successDescription: '잔액이 새로고침되었습니다. 이 창을 닫고 다운로드를 다시 시작하세요.',
          packageEyebrow: '필요할 때 구매',
          cardNote: '크레딧은 웹 다운로드에 사용할 수 있으며 만료되지 않습니다.',
          creditsAmount: '{credits} 크레딧',
          buyNow: '지금 구매',
          selectPackage: '선택',
          paymentMethodLabel: '결제 수단 선택',
          paymentTitle: '결제 수단 선택',
          selectedPackageLabel: '선택한 상품',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: '결제 계속',
          backToProducts: '뒤로',
          close: '닫기',
          agreementText: '구매 조건, 이용 약관 및 개인정보 처리방침에 동의합니다.',
          loadingConfigs: '크레딧 패키지를 불러오는 중...',
          loadFailed: '크레딧 패키지를 불러오지 못했습니다. 다시 시도하세요.',
          noConfigs: '현재 구매 가능한 크레딧 패키지가 없습니다. 나중에 다시 시도하세요.',
          ready: '크레딧 패키지를 선택하세요. 가격은 USD로 표시됩니다.',
          creatingOrder: '주문을 생성하는 중...',
          pendingPayment: '새로 열린 탭에서 결제를 완료하세요. 결과는 자동으로 확인됩니다.',
          pendingPaymentTitle: '결제 대기 중',
          cancelPayment: '결제 취소',
          supportMailPrefix: '문제 신고: ',
          success: '결제가 완료되었습니다. 이제 크레딧을 사용할 수 있습니다.',
          failed: '결제가 아직 완료되지 않았습니다. 다시 시도하거나 이 창을 닫을 수 있습니다.',
          successCredits: '+{credits} 크레딧 추가됨',
          successBalance: '현재 잔액: {balance} 크레딧',
          createFailed: '주문 생성에 실패했습니다. 다시 시도하세요.',
          invalidPaymentData: '결제 링크가 올바르지 않습니다. 나중에 다시 시도하세요.',
          priceUpdated: '가격이 변경되었습니다. 최신 가격을 확인하고 다시 구매하세요.',
          gatewayFailed: '결제 진입점을 일시적으로 사용할 수 없습니다. 나중에 다시 시도하세요.',
          paymentCanceled: '결제가 취소되었습니다. 결제 수단을 선택하고 다시 시도하세요.',
          pollFailed: '결제 상태를 새로고침하지 못했습니다. 다시 시도하세요.',
          pollTimeout: '자동 새로고침 시간이 초과되었습니다. 결제 후 수동으로 결과를 새로고침하세요.',
          orderNotFound: '주문을 더 이상 사용할 수 없습니다. 새 주문을 생성하세요.',
          orderExpired: '주문이 만료되었습니다. 다시 구매하세요.',
          fulfillmentFailed: '결제는 수신되었지만 크레딧이 아직 추가되지 않았습니다. 나중에 다시 시도하세요.',
          authExpired: '로그인이 만료되었습니다. 다시 로그인하여 계속하세요.'
        },
        parse: {
          eyebrow: '빠른 링크 확인',
          title: 'Vimeo 동영상 다운로더: 공개 Vimeo 동영상 저장',
          helperText:
            '공개 Vimeo 동영상 링크를 붙여넣고 Vimeo가 제공하는 화질을 확인한 뒤 필요한 해상도를 다운로드하세요.',
          linkLabel: 'Vimeo 링크',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: '입력 지우기',
          submit: 'Vimeo 동영상 링크 붙여넣기',
          submitting: '파싱 중...',
          noResults: '이 동영상에서 다운로드할 수 있는 파일을 찾지 못했습니다.',
          download: '다운로드',
          downloading: '다운로드 중...',
          checkingStorage: '브라우저 저장 공간을 확인하는 중...',
          unknownSize: '크기 알 수 없음',
          preparingMp4: 'MP4 준비 중...',
          downloadAll: '모두 다운로드',
          downloadingAll: '모두 다운로드 중...',
          resumeNotice: '완료되지 않은 다운로드 "{filename}"({progress})이 있습니다. 계속할까요?',
          resumeAction: '계속',
          pendingRestartText: '"{filename}"의 다운로드 기록을 다시 시작할 수 있습니다.',
          pendingRestartButton: '다운로드 다시 시작',
          resumeUnavailableText: '로컬 복구 기록이 만료되었습니다.',
          resumeDismiss: '무시',
          resuming: '다시 시작하는 중...',
          largeFileExtensionInlineChromeTitle: 'Chrome 확장 프로그램',
          largeFileExtensionInlineChromeDescription:
            'Chrome 전용 확장 프로그램으로, 큰 Vimeo 다운로드를 탭 밖에서 계속 진행합니다.',
          largeFileExtensionInlineChromeCta: '확장 프로그램 설치',
          largeFileExtensionInlineEdgeTitle: 'Edge 확장 프로그램',
          largeFileExtensionInlineEdgeDescription:
            'Microsoft Edge 전용 확장 프로그램으로, Vimeo 대용량 다운로드를 동일하게 처리합니다.',
          largeFileExtensionInlineEdgeCta: '확장 프로그램 설치'
        },
                errors: {
          enterEmailFirst: '먼저 이메일 주소를 입력하세요.',
          enterEmailAndCode: '이메일과 인증 코드를 모두 입력하세요.',
          sendCodeFailed: '인증 코드 전송에 실패했습니다.',
          googleSignInFailed: 'Google 로그인에 실패했습니다.',
          googleClientMissing: 'Google 로그인이 설정되어 있지 않습니다.',
          restoreSessionFailed: '세션 복원에 실패했습니다.',
          signInFailed: '로그인에 실패했습니다.',
          logoutFailed: '로그아웃에 실패했습니다.',
          loadQuotaFailed: '크레딧을 불러오지 못했습니다.',
          enterLink: '미디어 링크를 입력하세요.',
          invalidLink: '올바른 URL이 아닙니다.',
          parseFailed: '이 링크를 파싱하지 못했습니다.',
          downloadFailed: '다운로드에 실패했습니다.',
          unsafeFileTypeUseExtension:
            'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.',
          unsafeFileTypeConfirmTitle: 'Use the browser extension',
          unsafeFileTypeConfirmViewExtension: 'View extension download',
          unsafeFileTypeConfirmCancel: 'Cancel',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: '이 동영상은 브라우저 다운로드 크기 제한을 초과합니다.',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: 'This link platform is not supported.',
          vimeoParseFailed: 'This Vimeo video is private or cannot be parsed.',
          quotaExceeded: '이 파일을 다운로드할 크레딧이 부족합니다.',
          rateLimitExceeded: 'Too many requests. Please try again later.'
        },
                anonymousQueue: {
          title: '다운로드 대기 중',
          remaining: '{seconds}초 후 다운로드가 시작됩니다.',
          hint: '로그인하면 대기 없이 다운로드할 수 있습니다.',
          login: '로그인',
          close: '닫기'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    },
    changelog: {
      title: 'Vimeo 다운로더 변경 내역',
      description:
        'Vimeo 다운로드 업데이트, 분석 변경, 더 큰 파일 지원, Vimeo Video Downloader 릴리스 노트를 확인하세요.',
      seoTitle: 'Vimeo 다운로더 변경 내역 | Vimeo Video Downloader',
      seoDescription:
        'Vimeo Video Downloader 변경 내역: 분석 업데이트, 화질 처리, 더 큰 파일 지원, 버전별 릴리스 노트.',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: '성능 향상',
          description: '더 나은 사용 경험을 위한 대규모 성능 개선.',
          features: ['분석 속도 50% 향상', '대용량 다운로드 안정성 최적화', 'UI 응답성 개선']
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: '다국어 지원',
          description: '전 세계 14개 언어를 지원합니다.',
          features: ['일본어, 한국어 등 추가', '번역 정확도 향상', '자동 언어 감지 추가']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: '화질 선택',
          description: '다운로드 전에 원하는 Vimeo 화질을 고를 수 있습니다.',
          features: ['동영상이 제공하는 모든 화질 선택', '사용 가능한 최고 화질 유지', '다운로드 대기열 관리 개선']
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: '보안 및 개인정보',
          description: '보안과 개인정보 보호 개선.',
          features: ['다운로드에서 분석 추적 제거', '로컬 전용 처리 모드 추가', '데이터 암호화 개선']
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: '최초 릴리스',
          description: 'Vimeo 링크 다운로더의 첫 릴리스.',
          features: ['Vimeo 링크 분석과 MP4 출력', 'vimeo.com 및 player.vimeo.com 링크 지원', '기본 화질 처리']
        }
      ],
      labels: {
        features: '새 기능',
        fixes: '버그 수정'
      }
    },
    pricing: koKRPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Vimeo 동영상 다운로더 HD - 다양한 화질 | Vimeo Video Downloader',
          description:
            'Vimeo 동영상을 HD 화질로, 여러 해상도 중에서 골라 무료로 다운로드하세요. 앱 설치 없이 공개 Vimeo 동영상을 바로 저장할 수 있습니다.',
          keywords:
            'Vimeo 다운로더, Vimeo 동영상 다운로드, Vimeo HD 다운로드, Vimeo 무료 다운로드, Vimeo 저장, Vimeo 고화질'
        },
        workspace: {
          title: 'Vimeo 동영상 다운로더 HD',
          helperText: '공개 Vimeo 동영상 링크를 붙여넣고 화질을 선택해 HD로 다운로드하세요.',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: '이 Vimeo 다운로더를 쓰는 이유',
          subtitle: '완전 무료로 Vimeo 동영상을 HD 화질로 저장하고 화질도 직접 고를 수 있습니다.',
          items: [
            {
              title: '원본 HD 화질',
              description: 'Vimeo 동영상을 전체 HD 해상도로 다운로드합니다. 제작자가 업로드한 그대로의 선명도를 얻습니다.'
            },
            {
              title: '다양한 화질',
              description: '사용 가능한 화질(360p, 720p, 1080p 등) 중에서 골라 필요에 맞는 품질을 선택하세요.'
            },
            {
              title: '빠르고 무료',
              description: '앱 설치도 계정도 필요하지 않습니다. Vimeo 링크를 붙여넣고 화질을 골라 바로 다운로드하세요.'
            }
          ]
        },
        howTo: {
          title: 'Vimeo 동영상을 HD로 다운로드하는 방법',
          subtitle: '공개 Vimeo 동영상을 원하는 화질로 저장하는 세 단계입니다.',
          steps: [
            {
              title: 'Vimeo 동영상 링크 복사',
              description: 'Vimeo 동영상 페이지를 열고 브라우저 주소 표시줄에서 URL을 복사합니다.'
            },
            {
              title: '위 입력란에 붙여넣기',
              description: '복사한 Vimeo URL을 입력란에 붙여넣고 분석을 클릭합니다.'
            },
            {
              title: '화질 선택 후 다운로드',
              description: '원하는 화질을 고르고 다운로드를 클릭해 HD 동영상을 저장합니다.'
            }
          ]
        },
        faq: {
          title: 'Vimeo 다운로더 FAQ',
          items: [
            {
              question: 'Vimeo에서 동영상을 다운로드하려면 어떻게 하나요?',
              answer:
                'Vimeo 동영상 페이지 URL을 복사해 위 입력란에 붙여넣고 분석을 클릭한 뒤, 원하는 화질을 선택해 다운로드합니다.'
            },
            {
              question: '동영상 화질을 선택할 수 있나요?',
              answer:
                '네. 분석 후 360p, 720p, 1080p를 비롯해 제공되는 더 높은 화질까지 모두 선택할 수 있습니다.'
            },
            {
              question: '이 Vimeo 다운로더는 무료인가요?',
              answer: '공개 Vimeo 링크 분석은 무료이고 가입도 필요하지 않습니다. 작업 공간을 거치는 다운로드는 크레딧을 사용합니다.'
            },
            {
              question: '다운로드에 Vimeo 계정이 필요한가요?',
              answer: '계정이 필요하지 않습니다. 로그인 없이 공개 Vimeo 동영상을 다운로드할 수 있습니다.'
            },
            {
              question: '다운로드되는 동영상 형식은 무엇인가요?',
              answer: 'Vimeo 동영상은 MP4 형식으로 다운로드되며 거의 모든 기기와 플레이어에서 재생됩니다.'
            }
          ]
        }
      }
    }
  }
}
