import type { SiteContent } from '../schema'
import { koKRPricingContent } from '../pricing'

export const koKR: SiteContent = {
  site: {
    description: 'Vimeo 링크를 붙여넣으면 로그인 없이 무료로 동영상을 저장할 수 있습니다. 오디오, 자막, 커버 이미지, 다운로드 대기열이 필요하다면 Chrome 확장 프로그램을 추가하세요.'
  },
  layout: {
    nav: {
      brand: 'Vimeo Downloader',
      home: '홈',
      pricing: '요금',
    },
    footer: {
      resources: '자료',
      rights: '© 2026 Vimeo Downloader. 모든 권리 보유.'
    }
  },
  common: {
    installCta: '지금 설치'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Downloader - HD 동영상과 오디오 다운로드',
        description: 'Vimeo 링크를 붙여넣으면 로그인 없이 무료로 동영상을 저장할 수 있습니다. 오디오, 자막, 커버 이미지, 다운로드 대기열이 필요하다면 Chrome 확장 프로그램을 추가하세요.'
      },
      heroTrustPoints: [
        'HD 다운로드',
        '가입 불필요'
      ],
      workspace: {
        parse: {
          eyebrow: '빠른 링크 확인',
          titleBrand: 'Vimeo 동영상 다운로더',
          titleTagline: '공개 Vimeo 동영상 저장',
          helperText:
            '공개 Vimeo 동영상 링크를 붙여넣으면 사용 가능한 최고 화질의 MP4로 다운로드할 수 있습니다.',
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
          extensionEntryLine: '확장 프로그램으로 Vimeo에서 바로 다운로드',
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
          rateLimitExceeded: 'Too many requests. Please try again later.',
          useExtensionForResource: '이 리소스는 브라우저 확장 프로그램으로만 다운로드할 수 있습니다. 확장 프로그램을 설치한 후 계속하세요.'
        },
                anonymousQueue: {
          title: '다운로드 대기 중',
          remaining: '{seconds}초 후 다운로드가 시작됩니다.',
          close: '닫기'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    ,
      softwareApplication: {
        description: 'Vimeo를 시청하는 사용자를 위한 Chrome 확장 프로그램입니다. 보고 있는 동영상을 로컬에 저장하고, 페이지에 동영상·오디오·자막·커버 이미지 4행 패널을 표시합니다.',
        featureList: [
          '동영상, 오디오, 자막, 이미지 네 줄로 구성된 페이지 내 다운로드 패널',
          '화질 선택 또는 Best로 최고 화질 저장',
          '오디오를 M4A로 저장하거나 MP3로 변환',
          '자막을 VTT로 저장하고 적응형 동영상·오디오 자르기',
          '커버 이미지를 JPEG로 저장',
          '실시간 진행률과 속도를 보여 주는 팝업 리소스 목록',
          '모든 탭이 공유하는 전역 다운로드 대기열',
          '로컬 기록, 파일명 템플릿, 저장 하위 폴더 설정'
        ]
      },
      intro: {
        heading: 'Chrome 확장 프로그램으로 더 많이 저장하기',
        lead: '위의 온라인 도구는 링크로 Vimeo 동영상을 저장합니다. 확장 프로그램은 지금 보고 있는 Vimeo 페이지에서 바로 동작하며 오디오, 자막, 커버 이미지, 다운로드 대기열을 더해 줍니다.',
        primaryCta: 'Chrome에 추가',
        secondaryCta: '플랜 보기',
        panel: {
          ariaLabel: '페이지 내 다운로드 패널 예시 이미지',
          rows: {
            video: '동영상',
            audio: '오디오',
            subtitle: '자막',
            image: '이미지'
          }
        }
      },
      features: {
        heading: '확장 프로그램이 더해 주는 기능',
        items: [
          {
            title: '페이지 내 다운로드 패널',
            description: '동영상 옆에 동영상·오디오·자막·이미지 네 줄 패널이 표시됩니다. 다른 동영상으로 이동하면 패널이 다시 만들어집니다.'
          },
          {
            title: '화질 선택과 Best',
            description: '720p, 1080p 등 동영상이 제공하는 화질을 고르거나, Best로 가장 높은 화질을 자동 선택합니다.'
          },
          {
            title: 'M4A 또는 MP3 오디오',
            description: '오디오 트랙만 M4A로 저장하거나, 팝업에서 MP3를 선택해 변환 출력할 수 있습니다.'
          },
          {
            title: '자막과 자르기',
            description: '사용 가능한 자막을 VTT로 저장합니다. 적응형 동영상과 오디오는 동영상 트랜스코딩 없이 자를 수 있습니다.'
          },
          {
            title: '커버 이미지',
            description: '동영상 커버 이미지를 별도의 JPEG 파일로 저장합니다.'
          },
          {
            title: '팝업 목록과 대기열',
            description: '팝업에서 확인된 모든 항목을 실시간 진행률과 함께 보고, 탭에 관계없이 순서대로 내려받도록 대기열에 추가합니다.'
          },
          {
            title: '큰 파일',
            description: 'Chrome이 직접 받을 수 있는 파일은 Chrome 다운로드 관리자가 처리합니다. 적응형 스트림은 메모리 예산 안에서 백그라운드로 합칩니다.'
          },
          {
            title: '설정과 기록',
            description: '저장 하위 폴더, 파일명 템플릿, UI 언어를 정할 수 있습니다. 성공·실패한 다운로드는 로컬 기록에 남으며 CSV로 내보낼 수 있습니다.'
          }
        ]
      },
      steps: {
        heading: '사용 방법',
        items: [
          {
            title: '설치',
            description: 'Chrome 웹 스토어에서 확장 프로그램을 설치합니다.'
          },
          {
            title: '아이콘 고정',
            description: '도구 모음에 고정해 팝업을 빠르게 엽니다.'
          },
          {
            title: 'Vimeo 동영상 열기',
            description: 'vimeo.com 또는 player.vimeo.com의 지원되는 동영상 페이지를 열고 재생합니다.'
          },
          {
            title: '화질 선택',
            description: '패널에서 원하는 화질을 클릭하거나 확장 프로그램 아이콘을 열어 전체 목록을 봅니다. 파일은 브라우저가 디스크에 기록합니다.'
          }
        ]
      },
      comparison: {
        heading: '온라인 도구와 확장 프로그램 비교',
        columns: {
          dimension: '비교 항목',
          web: '온라인 도구',
          extension: 'Chrome 확장 프로그램'
        },
        rows: [
          {
            dimension: '동작 위치',
            web: '이 페이지의 브라우저 탭 어디서나 Vimeo 링크를 붙여넣어 사용합니다.',
            extension: 'Chrome 및 Chromium 기반 브라우저에서, 보고 있는 Vimeo 페이지 안에서 동작합니다.'
          },
          {
            dimension: '저장할 수 있는 항목',
            web: '동영상을 MP4 파일로 저장합니다.',
            extension: '동영상은 MP4, 오디오는 M4A 또는 MP3, 자막은 VTT, 커버 이미지는 JPEG로 저장합니다.'
          },
          {
            dimension: '일괄 처리와 대기열',
            web: '한 번에 링크 하나씩 처리합니다.',
            extension: '팝업에서 항목을 추가하면 모든 탭이 공유하는 하나의 대기열에서 순서대로 다운로드됩니다.'
          },
          {
            dimension: '큰 파일',
            web: '매우 큰 파일이나 크기를 알 수 없는 파일은 확장 프로그램 사용을 안내합니다.',
            extension: '직접 파일은 Chrome 다운로드 관리자를 사용하고, 적응형 스트림은 메모리 예산 안에서 합칩니다.'
          },
          {
            dimension: '로그인',
            web: '필요하지 않습니다.',
            extension: '필요하지 않습니다. 로그인은 선택 사항이며 일일 다운로드 한도와 구독 상태에만 영향을 줍니다.'
          },
          {
            dimension: '비용',
            web: '무료입니다.',
            extension: '일일 무료 다운로드 한도가 있고, 더 많이 쓰려면 유료 Unlimited 플랜이 있습니다.'
          }
        ]
      },
      scope: {
        heading: '할 수 있는 것과 하지 않는 것',
        worksFor: {
          heading: '할 수 있는 것',
          items: [
            'vimeo.com, www.vimeo.com, player.vimeo.com의 지원되는 최상위 동영상 페이지. 재생된다고 해서 다운로드 가능한 리소스가 보장되지는 않습니다',
            '기본 스트림이 아닌 특정 화질이나 오디오 트랙 선택',
            '커버 이미지 저장',
            '같은 페이지의 여러 항목을 대기열에 넣기'
          ]
        },
        doesNot: {
          heading: '하지 않는 것',
          items: [
            '접근 제어 우회. 비공개, 비밀번호 보호, 유료 동영상은 재생되더라도 지원을 보장하지 않습니다',
            'DRM 제거 또는 우회',
            '모든 HLS 형식, 전체 라이브 녹화, Vimeo 이외의 사이트 지원',
            'Vimeo 데스크톱 또는 모바일 앱에서의 동작'
          ]
        },
        compliance: {
          heading: '법적 고지 및 준수',
          items: [
            '독립적으로 개발된 서드파티 도구이며 Vimeo, Inc.와 제휴, 보증, 연관 관계가 없습니다. Vimeo는 Vimeo, Inc.의 상표입니다.',
            '이미 정당한 접근 권한이 있는 콘텐츠를 저장하기 위한 도구입니다. 저작권법과 Vimeo 및 원저작자의 약관을 준수할 책임은 사용자에게 있습니다.',
            '저작권이 있는 자료의 재배포나 권리가 없는 콘텐츠의 접근 제어 우회에 사용하지 마세요.'
          ]
        }
      },
      plans: {
        heading: '플랜',
        free: {
          name: 'Free',
          description: '일일 무료 다운로드 한도가 있습니다. 새 계정이나 기기는 첫날 무제한으로 시작합니다.',
          cta: '요금제 보기'
        },
        unlimited: {
          name: 'Unlimited',
          description: '확장 프로그램의 일일 한도를 없애 주는 유료 구독입니다.',
          cta: 'Unlimited 시작하기'
        }
      },
      faq: {
        heading: '자주 묻는 질문',
        items: [
          {
            question: '다운로드하려면 계정이 필요한가요?',
            answer: '아니요. 온라인 도구도 확장 프로그램도 로그인 없이 쓸 수 있습니다. 확장 프로그램의 로그인은 선택 사항이며 일일 다운로드 한도와 구독 상태에만 영향을 줍니다.'
          },
          {
            question: '무료인가요?',
            answer: '온라인 도구는 무료입니다. 확장 프로그램에는 일일 무료 다운로드 한도가 있고 유료 Unlimited 플랜도 있습니다. 최신 내용은 가격 페이지에서 확인하세요.'
          },
          {
            question: '온라인 도구와 확장 프로그램 중 무엇을 써야 하나요?',
            answer: '링크로 MP4를 빠르게 받으려면 온라인 도구를, 오디오·자막·커버 이미지·화질 선택·여러 항목 대기열이 필요하면 확장 프로그램을 사용하세요.'
          },
          {
            question: '비공개, 비밀번호 보호, 유료 Vimeo 동영상도 받을 수 있나요?',
            answer: '지원을 보장하지 않습니다. 어느 쪽도 Vimeo의 접근 제어를 해제하거나 우회하지 않으며 DRM도 제거하지 않습니다.'
          },
          {
            question: '어떤 형식으로 저장되나요?',
            answer: '온라인 도구는 MP4 동영상을 저장합니다. 확장 프로그램은 MP4 동영상, M4A 또는 MP3 오디오, VTT 자막, JPEG 커버 이미지를 저장합니다.'
          },
          {
            question: '매우 큰 파일은 어떻게 되나요?',
            answer: '온라인 도구는 매우 크거나 크기를 알 수 없는 파일에 대해 확장 프로그램 사용을 안내합니다. 확장 프로그램에서는 적응형 스트림을 메모리 예산 안에서 합치므로, 초과가 확인된 항목은 제공되지 않습니다.'
          },
          {
            question: '제 동영상이 서버를 거치나요?',
            answer: '미디어는 Vimeo 서버에서 브라우저와 디스크로 바로 이동합니다. 확장 프로그램은 계정 기능, 다운로드 한도, 구독, 원격 설정, 사용 및 오류 보고를 위해 개발자 서비스에도 연결합니다.'
          },
          {
            question: '어떤 브라우저와 사이트를 지원하나요?',
            answer: '확장 프로그램은 Chrome 및 Edge, Brave 등 Chromium 기반 브라우저에서 Vimeo 페이지에서만 동작합니다. 다른 동영상 사이트는 지원하지 않습니다.'
          }
        ]
      },
      finalCta: {
        heading: '확장 프로그램으로 Vimeo에서 더 많이 저장하세요',
        description: '한 번 설치하면 보고 있는 Vimeo 페이지에서 바로 다운로드할 수 있습니다.',
        primaryCta: 'Chrome에 추가'
      }
    },
    pricing: koKRPricingContent,
  }
}
