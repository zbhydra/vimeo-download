权限理由说明：

> 逐条对应 `extension/dist/manifest.json` 的真实声明：
> `permissions` = `storage` / `identity` / `downloads`；
> `host_permissions` = `https://vimeo.com/*` / `https://www.vimeo.com/*` / `https://player.vimeo.com/*` / `https://*.vimeocdn.com/*`。
> 改 manifest 权限时必须同步本文件。

---

## 简体中文

**要求 storage 的理由**
保存扩展的设置项（远端配置的本地缓存）、界面语言偏好与登录状态，以便下次打开时沿用。

**要求 identity 的理由**
完成 Google 登录授权流程。扩展使用 Chrome 自带的授权窗口打开 Google 登录页，并通过 Chrome 为扩展生成的固定回调地址接收登录结果；`identity` 权限是调用该授权窗口与获取回调地址所必需的。

**要求 downloads 的理由**
把下载的文件写入本地磁盘。可直连的视频、音频与封面图由 Chrome 的下载管理器保存，扩展通过该权限发起下载并读取下载状态。

**要求网站存取权限的理由**
- `https://vimeo.com/*`、`https://www.vimeo.com/*`、`https://player.vimeo.com/*`
  在这三类 Vimeo 页面上注入下载按钮面板，并读取页面播放器已经加载的播放信息（视频 ID、可用画质、音频轨与封面图地址）。
- `https://*.vimeocdn.com/*`
  上述播放信息中指向 Vimeo 媒体 CDN 的视频、音频分片与封面图地址；真实采样观测到的媒体主机（`vod-progressive-ak.vimeocdn.com`、`vod-adaptive-ak.vimeocdn.com`、`skyfire.vimeocdn.com`）全部落在该域下，扩展需要访问这些主机才能获取文件内容。

---

## 繁体中文

**要求 storage 的理由**
儲存擴充功能的設定項目（遠端設定的本機快取）、介面語言偏好與登入狀態，以便下次開啟時沿用。

**要求 identity 的理由**
完成 Google 登入授權流程。擴充功能使用 Chrome 內建的授權視窗開啟 Google 登入頁，並透過 Chrome 為擴充功能產生的固定回呼位址接收登入結果；`identity` 權限是呼叫該授權視窗與取得回呼位址所必需的。

**要求 downloads 的理由**
把下載的檔案寫入本機磁碟。可直連的影片、音訊與封面圖由 Chrome 的下載管理員儲存，擴充功能透過該權限發起下載並讀取下載狀態。

**要求網站存取權限的理由**
- `https://vimeo.com/*`、`https://www.vimeo.com/*`、`https://player.vimeo.com/*`
  在這三類 Vimeo 頁面上注入下載按鈕面板，並讀取頁面播放器已經載入的播放資訊（影片 ID、可用畫質、音軌與封面圖位址）。
- `https://*.vimeocdn.com/*`
  上述播放資訊中指向 Vimeo 媒體 CDN 的影片、音訊分片與封面圖位址；真實取樣觀測到的媒體主機（`vod-progressive-ak.vimeocdn.com`、`vod-adaptive-ak.vimeocdn.com`、`skyfire.vimeocdn.com`）全部落在該網域下，擴充功能需要存取這些主機才能取得檔案內容。

---

## English

**Reason for requesting storage**
To save the extension's settings (a local cache of the remote configuration), the interface language preference and the sign-in state, so they persist the next time the extension is opened.

**Reason for requesting identity**
To complete the Google sign-in authorization flow. The extension opens Google's sign-in page in Chrome's own authorization window and receives the result on the fixed callback address that Chrome generates for the extension. The `identity` permission is what allows the extension to open that window and obtain the callback address.

**Reason for requesting downloads**
To write downloaded files to the local disk. Direct-link video, audio and cover images are saved by Chrome's download manager; this permission is what lets the extension start those downloads and read their status.

**Reason for requesting website access**
- `https://vimeo.com/*`, `https://www.vimeo.com/*`, `https://player.vimeo.com/*`
  To inject the download button panel into these Vimeo pages, and to read the playback information the page's player has already loaded (video ID, available qualities, audio tracks and cover image URL).
- `https://*.vimeocdn.com/*`
  The video, audio segment and cover image URLs on Vimeo's media CDN that the playback information above points to. Every media host observed in real sampling (`vod-progressive-ak.vimeocdn.com`, `vod-adaptive-ak.vimeocdn.com`, `skyfire.vimeocdn.com`) sits under this domain, and the extension needs access to those hosts in order to fetch the file contents.

---

## 日本語

**storage が必要な理由**
拡張機能の設定（リモート設定のローカルキャッシュ）、UI 言語の設定、ログイン状態を保存し、次回起動時に引き継ぐため。

**identity が必要な理由**
Google ログインの認可フローを完了するため。拡張機能は Chrome 標準の認可ウィンドウで Google のログインページを開き、Chrome が拡張機能用に発行する固定のコールバックアドレスで結果を受け取ります。`identity` 権限は、この認可ウィンドウを開きコールバックアドレスを取得するために必要です。

**downloads が必要な理由**
ダウンロードしたファイルをローカルディスクに書き込むため。直接リンクの動画・音声・カバー画像は Chrome のダウンロードマネージャーが保存し、この権限によって拡張機能がダウンロードを開始し状態を取得します。

**ウェブサイトアクセス権限が必要な理由**
- `https://vimeo.com/*`、`https://www.vimeo.com/*`、`https://player.vimeo.com/*`
  これらの Vimeo ページにダウンロードボタンのパネルを挿入し、ページのプレーヤーがすでに読み込んだ再生情報（動画 ID、利用可能な画質、音声トラック、カバー画像の URL）を読み取るため。
- `https://*.vimeocdn.com/*`
  上記の再生情報が指す Vimeo メディア CDN 上の動画・音声セグメント・カバー画像の URL です。実際のサンプリングで観測されたメディアホスト（`vod-progressive-ak.vimeocdn.com`、`vod-adaptive-ak.vimeocdn.com`、`skyfire.vimeocdn.com`）はいずれもこのドメイン配下にあり、ファイル本体を取得するためにこれらのホストへのアクセスが必要です。

---

## 한국어

**storage가 필요한 이유**
확장 프로그램의 설정(원격 설정의 로컬 캐시), UI 언어 설정, 로그인 상태를 저장해 다음 실행 시 그대로 이어 쓰기 위함.

**identity가 필요한 이유**
Google 로그인 인증 흐름을 완료하기 위함. 확장 프로그램은 Chrome 자체 인증 창으로 Google 로그인 페이지를 열고, Chrome이 확장 프로그램용으로 발급하는 고정 콜백 주소에서 결과를 받습니다. `identity` 권한은 이 인증 창을 열고 콜백 주소를 얻기 위해 필요합니다.

**downloads가 필요한 이유**
다운로드한 파일을 로컬 디스크에 기록하기 위함. 직접 연결 파일(동영상·오디오·커버 이미지)은 Chrome 다운로드 관리자가 저장하며, 이 권한으로 확장 프로그램이 다운로드를 시작하고 상태를 읽습니다.

**웹사이트 액세스 권한이 필요한 이유**
- `https://vimeo.com/*`, `https://www.vimeo.com/*`, `https://player.vimeo.com/*`
  이 Vimeo 페이지들에 다운로드 버튼 패널을 삽입하고, 페이지 플레이어가 이미 불러온 재생 정보(동영상 ID, 사용 가능한 화질, 오디오 트랙, 커버 이미지 URL)를 읽기 위함.
- `https://*.vimeocdn.com/*`
  위 재생 정보가 가리키는 Vimeo 미디어 CDN의 동영상·오디오 세그먼트·커버 이미지 URL입니다. 실제 샘플링에서 관측된 미디어 호스트(`vod-progressive-ak.vimeocdn.com`, `vod-adaptive-ak.vimeocdn.com`, `skyfire.vimeocdn.com`)는 모두 이 도메인 아래에 있으며, 파일 본문을 가져오려면 이 호스트들에 대한 접근이 필요합니다.
